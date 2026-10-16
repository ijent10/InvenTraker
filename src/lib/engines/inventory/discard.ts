import { createHash } from "node:crypto"
import { z } from "zod"
import { allocateBatches } from "../../batch-allocation.ts"
import { derivedStockStatus, nextStockState, normalizeStockQuantity, stockState } from "../../stock-quantities.ts"
import { engineCommandSchema, engineDocumentIdSchema, engineResultSchema, EngineError, type EnginePrincipal } from "../contracts.ts"
import type { InventoryRecord } from "./transfer.ts"

const quantitySchema = z.number().finite().positive().max(1_000_000_000).refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001, "Use at most three decimal places for stock quantities.").transform(normalizeStockQuantity).refine((value) => value > 0)
export const discardLineSchema = z.object({ itemId: engineDocumentIdSchema, quantity: quantitySchema, area: z.enum(["front", "back"]), reason: z.string().trim().min(1).max(240), batchId: engineDocumentIdSchema.optional() }).strict()
export const discardPayloadSchema = z.object({ lines: z.array(discardLineSchema).min(1).max(200) }).strict().refine((value) => new Set(value.lines.map((line) => JSON.stringify([line.itemId, line.area]))).size === value.lines.length, "Each inventory item and stock area can appear only once.")
export const discardRequestSchema = z.object({ commandId: z.string().uuid(), locationId: engineDocumentIdSchema, payload: discardPayloadSchema }).strict()
export const discardCommandSchema = engineCommandSchema.extend({ payload: discardPayloadSchema })
export const discardResultSchema = z.object({ wasteIds: z.array(engineDocumentIdSchema).min(1), humanOverrideCount: z.number().int().nonnegative() })
export const discardResponseSchema = engineResultSchema(discardResultSchema)
export type DiscardCommand = z.infer<typeof discardCommandSchema>
export type DiscardResponse = z.infer<typeof discardResponseSchema>
export type DiscardPlan = ReturnType<typeof planDiscard>
export type DiscardRepository = { runTransaction<T>(work: (transaction: {
  readOperation(id: string): Promise<Record<string, unknown> | undefined>
  readItems(ids: string[]): Promise<InventoryRecord[]>
  readBatches(ids: string[]): Promise<InventoryRecord[]>
  readWaste(ids: string[]): Promise<InventoryRecord[]>
  write(command: DiscardCommand, plans: DiscardPlan[], response: DiscardResponse, fingerprint: string): void
}) => Promise<T>): Promise<T> }

export function discardFingerprint(command: DiscardCommand) {
  // Preserve line order: waste document IDs are tied to the original line position.
  return createHash("sha256").update(JSON.stringify({ operationType: "waste", storeId: command.locationId, lines: command.payload.lines.map((line) => ({ ...line, batchId: line.batchId ?? null })) })).digest("hex")
}

export function planDiscard(command: DiscardCommand, current: InventoryRecord, batches: InventoryRecord[]) {
  if (String(current.storeId ?? "").trim() !== command.locationId) throw new EngineError("This inventory item is not assigned to the selected store.", 403, "store_access_denied")
  const itemLines = command.payload.lines.map((line, index) => ({ ...line, index })).filter((line) => line.itemId === current.id)
  if (!itemLines.length) throw new EngineError("The discard does not include this item.", 400, "invalid_request")
  let before
  try { before = stockState(current) } catch { throw new EngineError("This item has invalid stock balances. Reconcile them before recording waste.", 409, "invalid_stock_balance") }
  const front = itemLines.find((line) => line.area === "front")?.quantity ?? 0
  const back = itemLines.find((line) => line.area === "back")?.quantity ?? 0
  if (front > before.frontStock || back > before.backStock) throw new EngineError("Waste quantity is greater than available stock.", 400, "insufficient_stock")
  const after = nextStockState(before, before.frontStock - front, before.backStock - back)
  if (after.onHand !== normalizeStockQuantity(Math.max(0, before.onHand - normalizeStockQuantity(front + back)))) throw new EngineError("This discard cannot balance stock accurately.", 409, "invalid_stock_balance")
  const scoped = batches.filter((batch) => batch.storeId === command.locationId && batch.itemId === current.id)
  if (scoped.some((batch) => !Number.isFinite(Number(batch.remainingQuantity ?? 0)) || Number(batch.remainingQuantity ?? 0) < 0)) throw new EngineError("This item has invalid batch quantities. Reconcile them before recording waste.", 409, "invalid_batch_balance")
  if (scoped.some((batch) => Number(batch.remainingQuantity ?? 0) > 0 && !["front", "back"].includes(String(batch.area)))) throw new EngineError("An active batch is missing its stock area.", 409, "invalid_batch_area")
  const lines = itemLines.map((line) => {
    const eligible = scoped.filter((batch) => batch.area === line.area && Number(batch.remainingQuantity ?? 0) > 0)
    const available = line.area === "front" ? before.frontStock : before.backStock
    const tracked = normalizeStockQuantity(eligible.reduce((sum, batch) => sum + Number(batch.remainingQuantity), 0))
    if (tracked > available) throw new EngineError("Batch quantities exceed the recorded stock. Reconcile the count before recording waste.", 409, "batch_balance_mismatch")
    if (line.batchId && !eligible.some((batch) => batch.id === line.batchId)) throw new EngineError("The selected batch is no longer available in this stock area.", 409, "batch_unavailable")
    // The existing override means preferred-first, then earliest expiry for the remainder.
    const allocation = allocateBatches(eligible.map((batch) => ({ id: batch.id, remainingQuantity: Number(batch.remainingQuantity), expirationDate: typeof batch.expirationDate === "string" ? batch.expirationDate : null, receivedAt: typeof batch.receivedAt === "string" ? batch.receivedAt : null })), line.quantity, line.batchId)
    const remainingUnknown = normalizeStockQuantity(Math.max(0, available - tracked - allocation.unallocatedQuantity))
    return { line, allocation, wasteId: `${command.commandId}-${line.index + 1}`, unknownBatchId: `${command.commandId}-${line.index + 1}-undated`, remainingUnknown }
  })
  return { current, before, after, status: derivedStockStatus(current, after), lines }
}

async function replayDiscard(existing: Record<string, unknown>, command: DiscardCommand, fingerprint: string, readWaste: (ids: string[]) => Promise<InventoryRecord[]>): Promise<DiscardResponse> {
  const conflict = () => new EngineError("This operation ID was already used for different discard details.", 409, "operation_conflict")
  if (existing.operationType !== "waste" || existing.storeId !== command.locationId || (existing.actor as { uid?: string } | undefined)?.uid !== command.actorId) throw conflict()
  if (existing.commandFingerprint || existing.engineResult) {
    if (existing.commandFingerprint !== fingerprint) throw conflict()
    const saved = discardResponseSchema.safeParse({ ...(existing.engineResult as Record<string, unknown>), data: existing.result })
    if (!saved.success || saved.data.requestId !== command.commandId) throw new EngineError("The saved discard result could not be verified.", 409, "operation_result_invalid")
    return { ...saved.data, replayed: true }
  }
  const result = discardResultSchema.safeParse(existing.result)
  const ids = command.payload.lines.map((_, index) => `${command.commandId}-${index + 1}`)
  if (!result.success || result.data.wasteIds.length !== ids.length || new Set(result.data.wasteIds).size !== ids.length || ids.some((id) => !result.data.wasteIds.includes(id)) || result.data.humanOverrideCount !== command.payload.lines.filter((line) => line.batchId).length) throw conflict()
  const records = await readWaste(ids)
  for (const [index, line] of command.payload.lines.entries()) {
    const saved = records.find((record) => record.id === ids[index])
    if (!saved || saved.operationId !== command.commandId || saved.storeId !== command.locationId || saved.userId !== command.actorId || saved.itemId !== line.itemId || saved.area !== line.area || saved.quantity !== line.quantity || String(saved.reason ?? "").trim() !== line.reason || (saved.selectedBatchId ?? null) !== (line.batchId ?? null)) throw conflict()
  }
  const committedAt = z.string().datetime().safeParse(existing.createdAt)
  if (!committedAt.success) throw new EngineError("The saved discard timestamp could not be verified.", 409, "operation_result_invalid")
  return discardResponseSchema.parse({ requestId: command.commandId, schemaVersion: "1", committedAt: committedAt.data, replayed: true, data: result.data })
}

export async function executeDiscard(input: unknown, principal: EnginePrincipal, repository: DiscardRepository, authorizeStore: (storeId: string) => Promise<void>, now = () => new Date().toISOString()): Promise<DiscardResponse> {
  const parsed = discardCommandSchema.safeParse(input)
  if (!parsed.success) throw new EngineError(parsed.error.issues[0]?.message ?? "Valid waste quantities and reasons are required.", 400, "invalid_request")
  const command = parsed.data
  if (command.actorId !== principal.uid || command.organizationId !== principal.organizationId) throw new EngineError("The command does not belong to this session.", 403, "command_scope_denied")
  if (!principal.isManager && !principal.permissions.includes("*") && !principal.permissions.includes("inventory.edit")) throw new EngineError("You do not have permission to record waste.", 403, "permission_denied")
  await authorizeStore(command.locationId)
  return repository.runTransaction(async (transaction) => {
    const fingerprint = discardFingerprint(command)
    const existing = await transaction.readOperation(command.commandId)
    if (existing) return replayDiscard(existing, command, fingerprint, transaction.readWaste)
    const ids = [...new Set(command.payload.lines.map((line) => line.itemId))]
    const items = await transaction.readItems(ids)
    for (const id of ids) {
      const item = items.find((record) => record.id === id)
      if (!item) throw new EngineError(`Inventory item ${id} was not found.`, 404, "inventory_not_found")
      if (String(item.storeId ?? "").trim() !== command.locationId) throw new EngineError("This inventory item is not assigned to the selected store.", 403, "store_access_denied")
    }
    const batches = await transaction.readBatches(ids)
    const plans = items.map((item) => planDiscard(command, item, batches))
    const writes = 3 + plans.reduce((sum, plan) => sum + 1 + plan.lines.reduce((total, entry) => total + 1 + entry.allocation.allocations.length + Number(entry.remainingUnknown > 0), 0), 0)
    if (writes > 480) throw new EngineError("This discard has too many batch changes. Save fewer items at a time.", 400, "discard_too_large")
    const response = discardResponseSchema.parse({ requestId: command.commandId, schemaVersion: "1", committedAt: now(), replayed: false, data: { wasteIds: command.payload.lines.map((_, index) => `${command.commandId}-${index + 1}`), humanOverrideCount: command.payload.lines.filter((line) => Boolean(line.batchId)).length } })
    transaction.write(command, plans, response, fingerprint)
    return response
  })
}
