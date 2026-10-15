import { createHash } from "node:crypto"
import { z } from "zod"
import { allocateBatches } from "../../batch-allocation.ts"
import { derivedStockStatus, nextStockState, normalizeStockQuantity, stockState } from "../../stock-quantities.ts"
import { engineCommandSchema, engineDocumentIdSchema, engineResultSchema, EngineError, type EnginePrincipal } from "../contracts.ts"

const quantitySchema = z.number().finite().positive().max(1_000_000_000).refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001, "Use at most three decimal places for stock quantities.").transform(normalizeStockQuantity).refine((value) => value > 0, "Transfer at least 0.001 units.")
export const transferPayloadSchema = z.object({ itemId: engineDocumentIdSchema, quantity: quantitySchema, source: z.enum(["front", "back"]), destination: z.enum(["front", "back"]), batchId: engineDocumentIdSchema.optional() }).strict().refine((value) => value.source !== value.destination, "Choose two different stock areas.")
export const transferRequestSchema = z.object({ commandId: z.string().uuid(), locationId: engineDocumentIdSchema, payload: transferPayloadSchema }).strict()
export const transferCommandSchema = engineCommandSchema.extend({ payload: transferPayloadSchema })
export const transferResultSchema = z.object({
  itemId: engineDocumentIdSchema, itemName: z.string(), frontStock: z.number().finite().nonnegative(), backStock: z.number().finite().nonnegative(), onHand: z.number().finite().nonnegative(),
  batchAllocations: z.array(z.object({ batchId: engineDocumentIdSchema, quantity: z.number().finite().nonnegative(), remainingQuantity: z.number().finite().nonnegative() })).optional(),
  unallocatedQuantity: z.number().finite().nonnegative().optional(), allocationMethod: z.enum(["human_override", "earliest_expiring_first"]).optional(), selectedBatchId: z.string().nullable().optional()
})
export const transferResponseSchema = engineResultSchema(transferResultSchema)
export type TransferCommand = z.infer<typeof transferCommandSchema>
export type TransferResponse = z.infer<typeof transferResponseSchema>
export type InventoryRecord = Record<string, unknown> & { id: string }
export type TransferPlan = ReturnType<typeof planStockTransfer>
export type TransferTransaction = {
  readOperation(id: string): Promise<Record<string, unknown> | undefined>
  readItem(id: string): Promise<InventoryRecord | undefined>
  readBatches(itemId: string): Promise<InventoryRecord[]>
  write(command: TransferCommand, plan: TransferPlan, response: TransferResponse, fingerprint: string): void
}
export type TransferRepository = { runTransaction<T>(work: (transaction: TransferTransaction) => Promise<T>): Promise<T> }

export function transferFingerprint(command: TransferCommand) {
  return createHash("sha256").update(JSON.stringify({ operationType: "transfer", storeId: command.locationId, itemId: command.payload.itemId, quantity: command.payload.quantity, source: command.payload.source, destination: command.payload.destination, batchId: command.payload.batchId ?? null })).digest("hex")
}

export function planStockTransfer(command: TransferCommand, current: InventoryRecord, batches: InventoryRecord[]) {
  const { payload, locationId, commandId } = command
  if (current.id !== payload.itemId || String(current.storeId ?? "").trim() !== locationId) throw new EngineError("This inventory item is not assigned to the selected store.", 403, "store_access_denied")
  let before
  try { before = stockState(current) } catch { throw new EngineError("This item has invalid stock balances. Correct the balances before transferring.", 409, "invalid_stock_balance") }
  const available = payload.source === "front" ? before.frontStock : before.backStock
  if (payload.quantity > available) throw new EngineError(`Only ${available} units are available in ${payload.source === "front" ? "sales floor" : "backstock"}.`, 400, "insufficient_stock")
  const after = nextStockState(before, before.frontStock + (payload.source === "front" ? -payload.quantity : payload.quantity), before.backStock + (payload.source === "back" ? -payload.quantity : payload.quantity))
  if (after.onHand !== before.onHand) throw new EngineError("A transfer must preserve total stock.", 409, "unbalanced_transfer")
  const eligible = batches.filter((batch) => batch.storeId === locationId && batch.itemId === payload.itemId && batch.area === payload.source && Number(batch.remainingQuantity ?? 0) > 0)
  if (payload.batchId && !eligible.some((batch) => batch.id === payload.batchId)) throw new EngineError("The selected batch is no longer available in this stock area.", 409, "batch_unavailable")
  const allocation = allocateBatches(eligible.map((batch) => ({ id: batch.id, remainingQuantity: Number(batch.remainingQuantity), expirationDate: typeof batch.expirationDate === "string" ? batch.expirationDate : null, receivedAt: typeof batch.receivedAt === "string" ? batch.receivedAt : null })), payload.quantity, payload.batchId)
  const result = transferResultSchema.parse({ itemId: current.id, itemName: String(current.name ?? "Inventory item"), frontStock: after.frontStock, backStock: after.backStock, onHand: after.onHand, batchAllocations: allocation.allocations, unallocatedQuantity: allocation.unallocatedQuantity, allocationMethod: payload.batchId ? "human_override" : "earliest_expiring_first", selectedBatchId: payload.batchId ?? null })
  return { before, after, status: derivedStockStatus(current, after), unit: String(current.unit ?? "eaches"), result,
    batchMoves: allocation.allocations.map((entry, index) => ({ source: eligible.find((batch) => batch.id === entry.batchId)!, allocation: entry, destinationId: `${commandId}-${index + 1}` })) }
}

function replayTransfer(existing: Record<string, unknown>, command: TransferCommand, fingerprint: string): TransferResponse {
  const actor = existing.actor as { uid?: string } | undefined
  if (existing.operationType !== "transfer" || existing.storeId !== command.locationId || actor?.uid !== command.actorId || (existing.commandFingerprint && existing.commandFingerprint !== fingerprint)) throw new EngineError("This operation ID was already used for a different stock change.", 409, "operation_conflict")
  if (existing.engineResult) {
    const previous = transferResponseSchema.safeParse(existing.engineResult)
    if (!previous.success || previous.data.requestId !== command.commandId) throw new EngineError("The previous transfer result could not be verified.", 409, "operation_result_invalid")
    return { ...previous.data, replayed: true }
  }
  // Compatibility records predate fingerprints. Verify their ledger movement before replaying.
  const previous = transferResultSchema.safeParse(existing.result)
  const changes = existing.changes as { itemId?: string; sourceArea?: string; destinationArea?: string; delta?: { frontStock?: number; backStock?: number } }[] | undefined
  const change = changes?.[0]
  const delta = command.payload.source === "front" ? change?.delta?.frontStock : change?.delta?.backStock
  if (!previous.success || previous.data.itemId !== command.payload.itemId || change?.itemId !== command.payload.itemId || change.sourceArea !== command.payload.source || change.destinationArea !== command.payload.destination || typeof delta !== "number" || normalizeStockQuantity(Math.abs(delta)) !== command.payload.quantity || (previous.data.selectedBatchId ?? null) !== (command.payload.batchId ?? null)) throw new EngineError("This operation ID belongs to different or unverifiable transfer details.", 409, "operation_conflict")
  const committedAt = z.string().datetime().safeParse(existing.createdAt)
  if (!committedAt.success) throw new EngineError("The previous transfer timestamp could not be verified.", 409, "operation_result_invalid")
  return transferResponseSchema.parse({ requestId: command.commandId, schemaVersion: "1", committedAt: committedAt.data, replayed: true, data: previous.data })
}

export async function executeStockTransfer(input: unknown, principal: EnginePrincipal, repository: TransferRepository, authorizeStore: (storeId: string) => Promise<void>, now = () => new Date().toISOString()): Promise<TransferResponse> {
  const parsed = transferCommandSchema.safeParse(input)
  if (!parsed.success) throw new EngineError(parsed.error.issues[0]?.message ?? "Valid transfer details are required.", 400, "invalid_request")
  const command = parsed.data
  if (command.actorId !== principal.uid || command.organizationId !== principal.organizationId) throw new EngineError("The command does not belong to this session.", 403, "command_scope_denied")
  if (!principal.isManager && !principal.permissions.includes("*") && !principal.permissions.includes("inventory.edit")) throw new EngineError("You do not have permission to transfer stock.", 403, "permission_denied")
  await authorizeStore(command.locationId)
  const fingerprint = transferFingerprint(command)
  return repository.runTransaction(async (transaction) => {
    const existing = await transaction.readOperation(command.commandId)
    if (existing) return replayTransfer(existing, command, fingerprint)
    const item = await transaction.readItem(command.payload.itemId)
    if (!item) throw new EngineError("This inventory item no longer exists in the portal.", 404, "inventory_not_found")
    if (String(item.storeId ?? "").trim() !== command.locationId) throw new EngineError("This inventory item is not assigned to the selected store.", 403, "store_access_denied")
    const batches = await transaction.readBatches(command.payload.itemId)
    const plan = planStockTransfer(command, item, batches)
    const response = transferResponseSchema.parse({ requestId: command.commandId, schemaVersion: "1", committedAt: now(), replayed: false, data: plan.result })
    transaction.write(command, plan, response, fingerprint)
    return response
  })
}
