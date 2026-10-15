import { createHash } from "node:crypto"
import { z } from "zod"
import { reconcileBatchTotal } from "../../batch-allocation.ts"
import { derivedStockStatus, nextStockState, normalizeStockQuantity, stockState } from "../../stock-quantities.ts"
import { engineCommandSchema, engineDocumentIdSchema, engineResultSchema, EngineError, type EnginePrincipal } from "../contracts.ts"
import type { InventoryRecord } from "./transfer.ts"

const countSchema = z.number().finite().nonnegative().max(1_000_000_000).refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001, "Use at most three decimal places for stock counts.").transform(normalizeStockQuantity)
export const spotCheckLineSchema = z.object({ itemId: engineDocumentIdSchema, expectedRevision: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(240).optional(), frontStock: countSchema, backStock: countSchema, expirationDate: z.string().datetime().optional() }).strict()
export const spotCheckPayloadSchema = z.object({ lines: z.array(spotCheckLineSchema).min(1).max(477, "Save fewer items at a time to keep the count within the transaction limit.") }).strict().refine((value) => new Set(value.lines.map((line) => line.itemId)).size === value.lines.length, "Each inventory item can appear only once in an operation.")
export const spotCheckRequestSchema = z.object({ commandId: z.string().uuid(), locationId: engineDocumentIdSchema, payload: spotCheckPayloadSchema }).strict()
export const spotCheckCommandSchema = engineCommandSchema.extend({ payload: spotCheckPayloadSchema })
export const spotCheckResultSchema = z.object({ updated: z.array(z.object({ id: engineDocumentIdSchema, frontStock: z.number().finite().nonnegative(), backStock: z.number().finite().nonnegative(), onHand: z.number().finite().nonnegative(), revision: z.number().int().nonnegative() }).passthrough()).min(1), historyId: z.string().uuid() })
export const spotCheckResponseSchema = engineResultSchema(spotCheckResultSchema)
export type SpotCheckCommand = z.infer<typeof spotCheckCommandSchema>
export type SpotCheckResponse = z.infer<typeof spotCheckResponseSchema>
export type SpotCheckPlan = ReturnType<typeof planSpotCheck>
export type SpotCheckTransaction = {
  readOperation(id: string): Promise<Record<string, unknown> | undefined>
  readItems(ids: string[]): Promise<InventoryRecord[]>
  readBatches(ids: string[]): Promise<InventoryRecord[]>
  write(command: SpotCheckCommand, plans: SpotCheckPlan[], response: SpotCheckResponse, fingerprint: string): void
}
export type SpotCheckRepository = { runTransaction<T>(work: (transaction: SpotCheckTransaction) => Promise<T>): Promise<T> }

export function spotCheckFingerprint(command: SpotCheckCommand) {
  // Line order is presentation, so reordering otherwise identical counts does not change the command.
  const lines = [...command.payload.lines].sort((a, b) => a.itemId.localeCompare(b.itemId)).map((line) => ({ itemId: line.itemId, expectedRevision: line.expectedRevision, frontStock: line.frontStock, backStock: line.backStock, reason: line.reason ?? null, expirationDate: line.expirationDate ?? null }))
  return createHash("sha256").update(JSON.stringify({ operationType: "spot_check", storeId: command.locationId, lines })).digest("hex")
}

export function planSpotCheck(command: SpotCheckCommand, line: SpotCheckCommand["payload"]["lines"][number], current: InventoryRecord, batches: InventoryRecord[], index: number) {
  if (current.id !== line.itemId || String(current.storeId ?? "").trim() !== command.locationId) throw new EngineError("This inventory item is not assigned to the selected store.", 403, "store_access_denied")
  let before
  try { before = stockState(current) } catch { throw new EngineError("This item has invalid stock balances. Correct them before counting.", 409, "invalid_stock_balance") }
  if (before.revision !== line.expectedRevision) throw new EngineError("Stock changed after this count was opened. Refresh and count again.", 409, "stale_count")
  const after = nextStockState(before, line.frontStock, line.backStock)
  const areas = (["front", "back"] as const).map((area) => {
    const relevant = batches.filter((batch) => batch.storeId === command.locationId && batch.itemId === line.itemId && batch.area === area)
    if (relevant.some((batch) => !Number.isFinite(Number(batch.remainingQuantity ?? 0)) || Number(batch.remainingQuantity ?? 0) < 0)) throw new EngineError("This item has invalid batch quantities. Correct the batches before counting.", 409, "invalid_batch_balance")
    const eligible = relevant.filter((batch) => Number(batch.remainingQuantity ?? 0) > 0)
    const reconciliation = reconcileBatchTotal(eligible.map((batch) => ({ id: batch.id, remainingQuantity: Number(batch.remainingQuantity), expirationDate: typeof batch.expirationDate === "string" ? batch.expirationDate : null, receivedAt: typeof batch.receivedAt === "string" ? batch.receivedAt : null })), area === "front" ? line.frontStock : line.backStock)
    return { area, ...reconciliation, unknownBatchId: `${command.commandId}-${index + 1}-${area}` }
  })
  return { current, line, before, after, status: derivedStockStatus(current, after), areas,
    reason: `${line.reason ?? "Verified spot count"}; batch detail reconciled from front ${areas[0].previousKnownQuantity} and back ${areas[1].previousKnownQuantity}` }
}

function replaySpotCheck(existing: Record<string, unknown>, command: SpotCheckCommand, fingerprint: string): SpotCheckResponse {
  const conflict = () => new EngineError("This operation ID was already used for different count details.", 409, "operation_conflict")
  const actor = existing.actor as { uid?: string } | undefined
  if (existing.operationType !== "spot_check" || existing.storeId !== command.locationId || actor?.uid !== command.actorId) throw conflict()
  if (existing.commandFingerprint || existing.engineResult) {
    if (existing.commandFingerprint !== fingerprint) throw conflict()
    const response = spotCheckResponseSchema.safeParse({ ...(existing.engineResult as Record<string, unknown>), data: existing.result })
    if (!response.success || response.data.requestId !== command.commandId) throw new EngineError("The previous count result could not be verified.", 409, "operation_result_invalid")
    return { ...response.data, replayed: true }
  }
  const result = spotCheckResultSchema.safeParse(existing.result)
  const changes = z.array(z.object({ itemId: z.string(), before: z.object({ revision: z.number() }), after: z.object({ frontStock: z.number(), backStock: z.number(), revision: z.number() }), reason: z.string() })).safeParse(existing.changes)
  if (!result.success || !changes.success || result.data.updated.length !== command.payload.lines.length || changes.data.length !== command.payload.lines.length || new Set(changes.data.map((change) => change.itemId)).size !== command.payload.lines.length || new Set(result.data.updated.map((item) => item.id)).size !== command.payload.lines.length) throw conflict()
  for (const line of command.payload.lines) {
    const change = changes.data.find((entry) => entry.itemId === line.itemId)
    const item = result.data.updated.find((entry) => entry.id === line.itemId)
    if (!change || !item || change.before.revision !== line.expectedRevision || change.after.revision !== line.expectedRevision + 1 || change.after.frontStock !== line.frontStock || change.after.backStock !== line.backStock || item.frontStock !== line.frontStock || item.backStock !== line.backStock || !change.reason.startsWith(`${line.reason ?? "Verified spot count"}; batch detail reconciled from front `) || (item.expires && line.expirationDate && item.lastVerifiedExpiration !== line.expirationDate)) throw conflict()
  }
  const committedAt = z.string().datetime().safeParse(existing.createdAt)
  if (!committedAt.success) throw new EngineError("The previous count timestamp could not be verified.", 409, "operation_result_invalid")
  return spotCheckResponseSchema.parse({ requestId: command.commandId, schemaVersion: "1", committedAt: committedAt.data, replayed: true, data: result.data })
}

export async function executeSpotCheck(input: unknown, principal: EnginePrincipal, repository: SpotCheckRepository, authorizeStore: (storeId: string) => Promise<void>, now = () => new Date().toISOString()): Promise<SpotCheckResponse> {
  const parsed = spotCheckCommandSchema.safeParse(input)
  if (!parsed.success) throw new EngineError(parsed.error.issues[0]?.message ?? "Valid spot-check counts are required.", 400, "invalid_request")
  const command = parsed.data
  if (command.actorId !== principal.uid || command.organizationId !== principal.organizationId) throw new EngineError("The command does not belong to this session.", 403, "command_scope_denied")
  if (!principal.isManager && !principal.permissions.includes("*") && !principal.permissions.includes("inventory.edit")) throw new EngineError("You do not have permission to count stock.", 403, "permission_denied")
  await authorizeStore(command.locationId)
  return repository.runTransaction(async (transaction) => {
    const fingerprint = spotCheckFingerprint(command)
    const existing = await transaction.readOperation(command.commandId)
    if (existing) return replaySpotCheck(existing, command, fingerprint)
    const ids = command.payload.lines.map((line) => line.itemId)
    const items = await transaction.readItems(ids)
    for (const id of ids) {
      const item = items.find((entry) => entry.id === id)
      if (!item) throw new EngineError(`Inventory item ${id} was not found.`, 404, "inventory_not_found")
      if (String(item.storeId ?? "").trim() !== command.locationId) throw new EngineError("This inventory item is not assigned to the selected store.", 403, "store_access_denied")
    }
    const batches = await transaction.readBatches(ids)
    const plans = command.payload.lines.map((line, index) => planSpotCheck(command, line, items.find((item) => item.id === line.itemId)!, batches, index))
    const writeCount = 3 + plans.reduce((total, plan) => total + 1 + plan.areas.reduce((sum, area) => sum + area.allocations.length + Number(area.addedUnknownQuantity > 0), 0), 0)
    if (writeCount > 480) throw new EngineError("This count has too many batch changes for one save. Save fewer items at a time.", 400, "count_too_large")
    const committedAt = now()
    const data = { historyId: command.commandId, updated: plans.map((plan) => ({ ...plan.current, ...plan.after, status: plan.status, lastCountedAt: committedAt, updatedAt: committedAt, updatedBy: principal.uid, updatedByOperationId: command.commandId, ...(plan.current.expires && plan.line.expirationDate ? { lastVerifiedExpiration: plan.line.expirationDate } : {}) })) }
    const response = spotCheckResponseSchema.parse({ requestId: command.commandId, schemaVersion: "1", committedAt, replayed: false, data })
    transaction.write(command, plans, response, fingerprint)
    return response
  })
}
