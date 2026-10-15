import { createHash } from "node:crypto"
import { z } from "zod"
import { allocateBatches, reconcileBatchTotal } from "../../batch-allocation.ts"
import { derivedStockStatus, nextStockState, normalizeStockQuantity, stockState } from "../../stock-quantities.ts"
import { engineCommandSchema, engineDocumentIdSchema, engineResultSchema, EngineError, type EnginePrincipal } from "../contracts.ts"
import type { InventoryRecord } from "./transfer.ts"

const countSchema = z.number().finite().nonnegative().max(1_000_000_000).refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001, "Use at most three decimal places for stock counts.").transform(normalizeStockQuantity)
export const restockLineSchema = z.object({ itemId: engineDocumentIdSchema, countedFrontStock: countSchema, expectedRevision: z.number().int().nonnegative().optional() }).strict()
export const restockPayloadSchema = z.object({ commit: z.boolean().default(false), lines: z.array(restockLineSchema).min(1).max(477) }).strict().refine((value) => new Set(value.lines.map((line) => line.itemId)).size === value.lines.length, "Each inventory item can appear only once in an operation.")
export const restockRequestSchema = z.object({ commandId: z.string().uuid(), locationId: engineDocumentIdSchema, payload: restockPayloadSchema }).strict()
export const restockEngineRequestSchema = restockRequestSchema.refine((value) => !value.payload.commit || value.payload.lines.every((line) => line.expectedRevision !== undefined), "Calculate a current preview and include its revision before completing restock.")
export const restockCommandSchema = engineCommandSchema.extend({ payload: restockPayloadSchema })
const recommendationSchema = z.object({ itemId: engineDocumentIdSchema, name: z.string(), countedFrontStock: z.number().finite().nonnegative(), previousBackStock: z.number().finite().nonnegative(), targetFrontStock: z.number().finite().nonnegative(), pullQuantity: z.number().finite().nonnegative(), resultingFrontStock: z.number().finite().nonnegative(), resultingBackStock: z.number().finite().nonnegative(), expectedRevision: z.number().int().nonnegative().optional(), unallocatedQuantity: z.number().finite().nonnegative().optional(), item: z.record(z.unknown()).optional() })
export const restockResultSchema = z.object({ committed: z.boolean(), recommendations: z.array(recommendationSchema).min(1) })
export const restockCommitResponseSchema = engineResultSchema(restockResultSchema.extend({ committed: z.literal(true) }))
export const restockPreviewResponseSchema = z.object({ requestId: z.string().uuid(), schemaVersion: z.literal("1"), generatedAt: z.string().datetime(), data: restockResultSchema.extend({ committed: z.literal(false) }) }).strict()
export const restockResponseSchema = z.union([restockCommitResponseSchema, restockPreviewResponseSchema])
export type RestockCommand = z.infer<typeof restockCommandSchema>
export type RestockCommitResponse = z.infer<typeof restockCommitResponseSchema>
export type RestockPlan = ReturnType<typeof planRestock>
export type RestockRepository = { runTransaction<T>(work: (transaction: {
  readOperation(id: string): Promise<Record<string, unknown> | undefined>
  readItems(ids: string[]): Promise<InventoryRecord[]>
  readBatches(ids: string[]): Promise<InventoryRecord[]>
  write(command: RestockCommand, plans: RestockPlan[], response: RestockCommitResponse, fingerprint: string): void
}) => Promise<T>): Promise<T> }

export function restockFingerprint(command: RestockCommand) {
  const lines = [...command.payload.lines].sort((a, b) => a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0).map((line) => ({ itemId: line.itemId, countedFrontStock: line.countedFrontStock, expectedRevision: line.expectedRevision ?? null }))
  return createHash("sha256").update(JSON.stringify({ operationType: "restock", storeId: command.locationId, lines })).digest("hex")
}

export function planRestock(command: RestockCommand, line: RestockCommand["payload"]["lines"][number], current: InventoryRecord, batches: InventoryRecord[], index: number) {
  if (current.id !== line.itemId || String(current.storeId ?? "").trim() !== command.locationId) throw new EngineError("This inventory item is not assigned to the selected store.", 403, "store_access_denied")
  let before
  try { before = stockState(current) } catch { throw new EngineError("This item has invalid balances. Correct them before restocking.", 409, "invalid_stock_balance") }
  if (command.payload.commit && line.expectedRevision !== undefined && line.expectedRevision !== before.revision) throw new EngineError("Stock changed after this restock was calculated. Refresh and recount before completing it.", 409, "stale_count")
  const rawTarget = Number(current.frontCapacity ?? current.frontPar ?? current.par ?? 0)
  if (!Number.isFinite(rawTarget) || rawTarget > 1_000_000_000) throw new EngineError("This item has an invalid floor target. Correct it before restocking.", 409, "invalid_restock_target")
  const target = normalizeStockQuantity(Math.max(0, rawTarget))
  const pull = normalizeStockQuantity(Math.min(Math.max(0, target - line.countedFrontStock), before.backStock))
  const after = nextStockState(before, line.countedFrontStock + pull, before.backStock - pull)
  if (after.onHand !== normalizeStockQuantity(line.countedFrontStock + before.backStock)) throw new EngineError("This restock cannot preserve the counted stock accurately.", 409, "invalid_stock_balance")
  const scopedBatches = batches.filter((batch) => batch.storeId === command.locationId && batch.itemId === line.itemId)
  if (scopedBatches.some((batch) => Number(batch.remainingQuantity ?? 0) > 0 && !["front", "back"].includes(String(batch.area)))) throw new EngineError("An active batch is missing a valid stock area. Correct its location before restocking.", 409, "invalid_batch_area")
  const relevant = scopedBatches.filter((batch) => ["front", "back"].includes(String(batch.area)))
  if (relevant.some((batch) => !Number.isFinite(Number(batch.remainingQuantity ?? 0)) || Number(batch.remainingQuantity ?? 0) < 0)) throw new EngineError("This item has invalid batch quantities. Correct them before restocking.", 409, "invalid_batch_balance")
  const details = (batch: InventoryRecord) => ({ id: batch.id, remainingQuantity: Number(batch.remainingQuantity ?? 0), expirationDate: typeof batch.expirationDate === "string" ? batch.expirationDate : null, receivedAt: typeof batch.receivedAt === "string" ? batch.receivedAt : null })
  const front = relevant.filter((batch) => batch.area === "front" && Number(batch.remainingQuantity ?? 0) > 0)
  const back = relevant.filter((batch) => batch.area === "back" && Number(batch.remainingQuantity ?? 0) > 0)
  if (command.payload.commit && normalizeStockQuantity(back.reduce((total, batch) => total + Number(batch.remainingQuantity), 0)) > before.backStock) throw new EngineError("Backstock batches exceed the recorded balance. Reconcile the count before restocking.", 409, "batch_balance_mismatch")
  const trackedBack = normalizeStockQuantity(back.reduce((total, batch) => total + Number(batch.remainingQuantity), 0))
  const reconciliation = reconcileBatchTotal(front.map(details), line.countedFrontStock)
  const allocation = allocateBatches(back.map(details), pull)
  return { current, line, before, after, status: derivedStockStatus(current, after), reconciliation, allocation,
    unknownCountId: `${command.commandId}-${index + 1}-front`, unknownPullId: `${command.commandId}-${index + 1}-untracked-pull`, unknownBackId: `${command.commandId}-${index + 1}-back`, remainingUnknownBack: normalizeStockQuantity(Math.max(0, before.backStock - trackedBack - allocation.unallocatedQuantity)),
    moves: allocation.allocations.map((entry, allocationIndex) => ({ source: back.find((batch) => batch.id === entry.batchId)!, allocation: entry, destinationId: `${command.commandId}-${index + 1}-${allocationIndex + 1}` })),
    recommendation: recommendationSchema.parse({ itemId: current.id, name: String(current.name ?? "Inventory item"), countedFrontStock: line.countedFrontStock, previousBackStock: before.backStock, targetFrontStock: target, pullQuantity: pull, resultingFrontStock: after.frontStock, resultingBackStock: after.backStock, expectedRevision: before.revision, ...(command.payload.commit ? { unallocatedQuantity: allocation.unallocatedQuantity } : {}), item: current }) }
}

async function replayRestock(existing: Record<string, unknown>, command: RestockCommand, fingerprint: string): Promise<RestockCommitResponse> {
  const conflict = () => new EngineError("This operation ID was already used for different restock details.", 409, "operation_conflict")
  if (existing.operationType !== "restock" || existing.storeId !== command.locationId || (existing.actor as { uid?: string } | undefined)?.uid !== command.actorId) throw conflict()
  if (existing.commandFingerprint || existing.engineResult) {
    if (existing.commandFingerprint !== fingerprint) throw conflict()
    const response = restockCommitResponseSchema.safeParse({ ...(existing.engineResult as Record<string, unknown>), data: existing.result })
    if (!response.success || response.data.requestId !== command.commandId) throw new EngineError("The saved restock result could not be verified.", 409, "operation_result_invalid")
    return { ...response.data, replayed: true }
  }
  const result = restockResultSchema.safeParse(existing.result)
  if (!result.success || !result.data.committed || result.data.recommendations.length !== command.payload.lines.length || new Set(result.data.recommendations.map((item) => item.itemId)).size !== command.payload.lines.length) throw conflict()
  for (const line of command.payload.lines) {
    const previous = result.data.recommendations.find((item) => item.itemId === line.itemId)
    const changes = existing.changes as { itemId?: string; before?: { revision?: number } }[] | undefined
    const previousRevision = previous?.item?.revision ?? changes?.find((change) => change.itemId === line.itemId)?.before?.revision
    if (!previous || previous.countedFrontStock !== line.countedFrontStock || (line.expectedRevision !== undefined && Number(previousRevision ?? -1) !== line.expectedRevision)) throw conflict()
  }
  const committedAt = z.string().datetime().safeParse(existing.createdAt)
  if (!committedAt.success) throw new EngineError("The saved restock timestamp could not be verified.", 409, "operation_result_invalid")
  return restockCommitResponseSchema.parse({ requestId: command.commandId, schemaVersion: "1", committedAt: committedAt.data, replayed: true, data: result.data })
}

export async function executeRestock(input: unknown, principal: EnginePrincipal, repository: RestockRepository, authorizeStore: (storeId: string) => Promise<void>, now = () => new Date().toISOString()) {
  const parsed = restockCommandSchema.safeParse(input)
  if (!parsed.success) throw new EngineError(parsed.error.issues[0]?.message ?? "Valid restock counts are required.", 400, "invalid_request")
  const command = parsed.data
  if (command.actorId !== principal.uid || command.organizationId !== principal.organizationId) throw new EngineError("The command does not belong to this session.", 403, "command_scope_denied")
  if (!principal.isManager && !principal.permissions.includes("*") && !principal.permissions.includes("inventory.edit")) throw new EngineError("You do not have permission to restock inventory.", 403, "permission_denied")
  await authorizeStore(command.locationId)
  return repository.runTransaction(async (transaction) => {
    const fingerprint = restockFingerprint(command)
    if (command.payload.commit) {
      const existing = await transaction.readOperation(command.commandId)
      if (existing) return replayRestock(existing, command, fingerprint)
    }
    const ids = command.payload.lines.map((line) => line.itemId)
    const items = await transaction.readItems(ids)
    for (const id of ids) {
      const item = items.find((entry) => entry.id === id)
      if (!item) throw new EngineError(`Inventory item ${id} was not found.`, 404, "inventory_not_found")
      if (String(item.storeId ?? "").trim() !== command.locationId) throw new EngineError("This inventory item is not assigned to the selected store.", 403, "store_access_denied")
    }
    const batches = command.payload.commit ? await transaction.readBatches(ids) : []
    const plans = command.payload.lines.map((line, index) => planRestock(command, line, items.find((item) => item.id === line.itemId)!, batches, index))
    if (!command.payload.commit) return restockPreviewResponseSchema.parse({ requestId: command.commandId, schemaVersion: "1", generatedAt: now(), data: { committed: false, recommendations: plans.map((plan) => plan.recommendation) } })
    const writes = 3 + plans.reduce((total, plan) => total + 1 + plan.reconciliation.allocations.length + Number(plan.reconciliation.addedUnknownQuantity > 0) + 2 * plan.moves.length + Number(plan.allocation.unallocatedQuantity > 0) + Number(plan.remainingUnknownBack > 0), 0)
    if (writes > 480) throw new EngineError("This restock has too many batch changes. Save fewer items at a time.", 400, "restock_too_large")
    const response = restockCommitResponseSchema.parse({ requestId: command.commandId, schemaVersion: "1", committedAt: now(), replayed: false, data: { committed: true, recommendations: plans.map((plan) => plan.recommendation) } })
    transaction.write(command, plans, response, fingerprint)
    return response
  })
}
