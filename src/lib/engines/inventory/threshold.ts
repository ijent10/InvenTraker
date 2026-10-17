import { createHash } from "node:crypto"
import { z } from "zod"
import { normalizeStockQuantity, stockState, derivedStockStatus } from "../../stock-quantities.ts"
import { engineCommandSchema, engineDocumentIdSchema, engineResultSchema, EngineError, type EnginePrincipal } from "../contracts.ts"
import type { InventoryRecord } from "./transfer.ts"

const quantitySchema = z.number().finite().nonnegative().max(1_000_000_000).refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001, "Use at most three decimal places for stock targets.").transform(normalizeStockQuantity)
export const thresholdPayloadSchema = z.object({ itemId: engineDocumentIdSchema, expectedRevision: z.number().int().nonnegative(), par: quantitySchema, reorderPoint: quantitySchema, reason: z.string().trim().min(1).max(240) }).strict()
export const thresholdRequestSchema = z.object({ commandId: z.string().uuid(), locationId: engineDocumentIdSchema, payload: thresholdPayloadSchema }).strict()
export const thresholdCommandSchema = engineCommandSchema.extend({ payload: thresholdPayloadSchema })
export const thresholdResultSchema = z.object({ revision: z.number().int().nonnegative() }).strict()
export const thresholdResponseSchema = engineResultSchema(thresholdResultSchema)
export type ThresholdCommand = z.infer<typeof thresholdCommandSchema>
export type ThresholdResponse = z.infer<typeof thresholdResponseSchema>
export type ThresholdPlan = ReturnType<typeof planThresholdChange>
export type ThresholdRepository = { runTransaction<T>(work: (transaction: {
  readOperation(id: string): Promise<Record<string, unknown> | undefined>
  readItem(id: string): Promise<InventoryRecord | undefined>
  write(command: ThresholdCommand, plan: ThresholdPlan, response: ThresholdResponse, fingerprint: string): void
}) => Promise<T>): Promise<T> }

export function thresholdFingerprint(command: ThresholdCommand) {
  return createHash("sha256").update(JSON.stringify({ operationType: "par_change", storeId: command.locationId, ...command.payload })).digest("hex")
}

export function planThresholdChange(command: ThresholdCommand, current: InventoryRecord) {
  const p = command.payload
  if (current.id !== p.itemId || String(current.storeId ?? "").trim() !== command.locationId) throw new EngineError("This inventory item is not assigned to the selected store.", 403, "store_access_denied")
  let stock
  try { stock = stockState(current) } catch { throw new EngineError("This item has invalid stock balances. Reconcile them before changing targets.", 409, "invalid_stock_balance") }
  if (stock.revision !== p.expectedRevision) throw new EngineError("Stock changed after this item was opened. Refresh before changing its targets.", 409, "stale_inventory")
  const before = { par: Number(current.par ?? 0), reorderPoint: Number(current.reorderPoint ?? 0), revision: stock.revision }
  if (![before.par, before.reorderPoint].every((value) => Number.isFinite(value) && value >= 0)) throw new EngineError("This item has invalid saved targets. Correct its settings before changing targets.", 409, "invalid_inventory_policy")
  const orgProductId = String(current.orgProductId ?? "").trim()
  if (orgProductId && !engineDocumentIdSchema.safeParse(orgProductId).success) throw new EngineError("This item's product link is invalid. Correct it before changing targets.", 409, "invalid_product_link")
  const after = { par: p.par, reorderPoint: p.reorderPoint, revision: stock.revision + 1 }
  // Targets are policy: they never move stock or reconcile batches.
  return { stock, status: derivedStockStatus(current, stock, p.reorderPoint), orgProductId: orgProductId || null, change: { itemId: current.id, itemName: String(current.name ?? "Inventory item"), unit: String(current.unit ?? "eaches"), before, after, reason: p.reason } }
}

function replayThreshold(existing: Record<string, unknown>, command: ThresholdCommand, fingerprint: string): ThresholdResponse {
  const conflict = () => new EngineError("This operation ID was already used for different target changes.", 409, "operation_conflict")
  if (existing.operationType !== "par_change" || existing.storeId !== command.locationId || (existing.actor as { uid?: string } | undefined)?.uid !== command.actorId) throw conflict()
  if (existing.commandFingerprint || existing.engineResult) {
    if (existing.commandFingerprint !== fingerprint) throw conflict()
    const saved = thresholdResponseSchema.safeParse({ ...(existing.engineResult as Record<string, unknown>), data: existing.result })
    if (!saved.success || saved.data.requestId !== command.commandId) throw new EngineError("The saved target result could not be verified.", 409, "operation_result_invalid")
    return { ...saved.data, replayed: true }
  }
  const changes = existing.changes as { itemId?: string; before?: { revision?: number }; after?: { par?: number; reorderPoint?: number; revision?: number }; reason?: string }[] | undefined
  const change = changes?.[0]
  const p = command.payload
  const result = thresholdResultSchema.safeParse(existing.result)
  if (changes?.length !== 1 || change?.itemId !== p.itemId || change.before?.revision !== p.expectedRevision || change.after?.par !== p.par || change.after?.reorderPoint !== p.reorderPoint || change.after?.revision !== p.expectedRevision + 1 || String(change.reason ?? "").trim() !== p.reason || !result.success || result.data.revision !== p.expectedRevision + 1) throw conflict()
  const committedAt = z.string().datetime().safeParse(existing.createdAt)
  if (!committedAt.success) throw new EngineError("The saved target timestamp could not be verified.", 409, "operation_result_invalid")
  return thresholdResponseSchema.parse({ requestId: command.commandId, schemaVersion: "1", committedAt: committedAt.data, replayed: true, data: result.data })
}

export async function executeThresholdChange(input: unknown, principal: EnginePrincipal, repository: ThresholdRepository, authorizeStore: (storeId: string) => Promise<void>, now = () => new Date().toISOString()): Promise<ThresholdResponse> {
  const parsed = thresholdCommandSchema.safeParse(input)
  if (!parsed.success) throw new EngineError(parsed.error.issues[0]?.message ?? "Valid targets and a reason are required.", 400, "invalid_request")
  const command = parsed.data
  if (command.actorId !== principal.uid || command.organizationId !== principal.organizationId) throw new EngineError("The command does not belong to this session.", 403, "command_scope_denied")
  if (!principal.isManager && !principal.permissions.includes("*") && !principal.permissions.includes("inventory.edit")) throw new EngineError("You do not have permission to change inventory targets.", 403, "permission_denied")
  await authorizeStore(command.locationId)
  return repository.runTransaction(async (transaction) => {
    const fingerprint = thresholdFingerprint(command)
    const existing = await transaction.readOperation(command.commandId)
    if (existing) return replayThreshold(existing, command, fingerprint)
    const current = await transaction.readItem(command.payload.itemId)
    if (!current) throw new EngineError("This inventory item no longer exists.", 404, "inventory_not_found")
    const plan = planThresholdChange(command, current)
    const response = thresholdResponseSchema.parse({ requestId: command.commandId, schemaVersion: "1", committedAt: now(), replayed: false, data: { revision: plan.change.after.revision } })
    transaction.write(command, plan, response, fingerprint)
    return response
  })
}
