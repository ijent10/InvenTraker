import { createHash } from "node:crypto"
import { z } from "zod"
import { allocateBatches } from "../../batch-allocation.ts"
import { nextStockState, normalizeStockQuantity, stockState } from "../../stock-quantities.ts"
import { engineCommandSchema, engineDocumentIdSchema, engineResultSchema, EngineError, type EnginePrincipal } from "../contracts.ts"
import type { InventoryRecord } from "./transfer.ts"

const weightSchema = z.number().finite().positive().max(10_000).refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001, "Use at most three decimal places for portion weights.").transform(normalizeStockQuantity).refine((value) => value > 0, "A portion must weigh at least 0.001 stock units.")
const dateSchema = z.union([z.string().date(), z.string().datetime({ offset: true })])
export const portionPayloadSchema = z.object({ itemId: engineDocumentIdSchema, sourceArea: z.enum(["front", "back"]), sourceBatchId: engineDocumentIdSchema.optional(), portionWeight: weightSchema, portionCount: z.number().int().min(1).max(200), expirationDate: dateSchema.optional(), packageBarcodePrefix: z.string().trim().max(64).optional() }).strict()
export const portionRequestSchema = z.object({ commandId: z.string().uuid(), locationId: engineDocumentIdSchema, payload: portionPayloadSchema }).strict()
export const portionCommandSchema = engineCommandSchema.extend({ payload: portionPayloadSchema })
export const portionResultSchema = z.object({ itemId: engineDocumentIdSchema, itemName: z.string(), portionCount: z.number().int().min(1).max(200), portionWeight: z.number().finite().positive(), totalWeight: z.number().finite().positive(), unit: z.string(), portionIds: z.array(engineDocumentIdSchema).min(1).max(200) })
export const portionResponseSchema = engineResultSchema(portionResultSchema)
export type PortionCommand = z.infer<typeof portionCommandSchema>
export type PortionResponse = z.infer<typeof portionResponseSchema>
export type PortionPlan = ReturnType<typeof planPortion>
export type PortionTransaction = {
  readOperation(id: string): Promise<Record<string, unknown> | undefined>
  readItem(id: string): Promise<InventoryRecord | undefined>
  readBatches(id: string): Promise<InventoryRecord[]>
  readPortion(id: string): Promise<InventoryRecord | undefined>
  readPackages(ids: string[]): Promise<InventoryRecord[]>
  write(command: PortionCommand, plan: PortionPlan, response: PortionResponse, fingerprint: string): void
}
export type PortionRepository = { runTransaction<T>(work: (transaction: PortionTransaction) => Promise<T>): Promise<T> }

export function portionFingerprint(command: PortionCommand) {
  const p = command.payload
  return createHash("sha256").update(JSON.stringify({ operationType: "portion", storeId: command.locationId, itemId: p.itemId, sourceArea: p.sourceArea, sourceBatchId: p.sourceBatchId ?? null, portionWeight: p.portionWeight, portionCount: p.portionCount, expirationDate: p.expirationDate ?? null, packageBarcodePrefix: p.packageBarcodePrefix || null })).digest("hex")
}

export function planPortion(command: PortionCommand, current: InventoryRecord, batches: InventoryRecord[]) {
  const p = command.payload
  if (current.id !== p.itemId || String(current.storeId ?? "").trim() !== command.locationId) throw new EngineError("This inventory item is not assigned to the selected store.", 403, "store_access_denied")
  const variable = current.variableMeasure && typeof current.variableMeasure === "object" && Boolean((current.variableMeasure as Record<string, unknown>).isVariableMeasure)
  if (!variable && !["pounds", "pound", "lbs", "lb", "ounces", "ounce", "oz", "grams", "gram", "g", "kilograms", "kilogram", "kg"].includes(String(current.unit ?? "").toLowerCase())) throw new EngineError("Only weighable inventory can be cut into portions.", 400, "item_not_weighable")
  let before
  try { before = stockState(current) } catch { throw new EngineError("This item has invalid balances. Reconcile them before portioning.", 409, "invalid_stock_balance") }
  const totalWeight = normalizeStockQuantity(p.portionWeight * p.portionCount)
  const available = p.sourceArea === "front" ? before.frontStock : before.backStock
  if (totalWeight > available) throw new EngineError(`Only ${available} ${String(current.unit ?? "units")} are available in this stock area.`, 400, "insufficient_stock")
  const scoped = batches.filter((batch) => batch.storeId === command.locationId && batch.itemId === p.itemId)
  if (scoped.some((batch) => !Number.isFinite(Number(batch.remainingQuantity ?? 0)) || Number(batch.remainingQuantity ?? 0) < 0 || Math.abs(Number(batch.remainingQuantity ?? 0) * 1000 - Math.round(Number(batch.remainingQuantity ?? 0) * 1000)) >= 0.000001)) throw new EngineError("This item has invalid batch quantities. Reconcile them before portioning.", 409, "invalid_batch_balance")
  if (scoped.some((batch) => Number(batch.remainingQuantity ?? 0) > 0 && !["front", "back"].includes(String(batch.area)))) throw new EngineError("An active batch is missing its stock area.", 409, "invalid_batch_area")
  const eligible = scoped.filter((batch) => batch.area === p.sourceArea && Number(batch.remainingQuantity ?? 0) > 0)
  const tracked = normalizeStockQuantity(eligible.reduce((sum, batch) => sum + Number(batch.remainingQuantity), 0))
  if (tracked > available) throw new EngineError("Batches exceed the recorded stock. Reconcile the count before portioning.", 409, "batch_balance_mismatch")
  if (p.sourceBatchId && !eligible.some((batch) => batch.id === p.sourceBatchId)) throw new EngineError("The selected source batch is no longer available.", 409, "batch_unavailable")
  const sources = p.sourceBatchId ? eligible.filter((batch) => batch.id === p.sourceBatchId) : eligible
  const allocation = allocateBatches(sources.map((batch) => ({ id: batch.id, remainingQuantity: Number(batch.remainingQuantity), expirationDate: typeof batch.expirationDate === "string" ? batch.expirationDate : null, receivedAt: typeof batch.receivedAt === "string" ? batch.receivedAt : null })), totalWeight)
  if ((p.sourceBatchId && allocation.unallocatedQuantity > 0) || allocation.unallocatedQuantity > normalizeStockQuantity(available - tracked)) throw new EngineError("The selected source does not contain enough weight. Choose another source or reconcile the count.", 409, "batch_quantity_unavailable")
  const used = allocation.allocations.map((entry) => eligible.find((batch) => batch.id === entry.batchId)!)
  const dates = used.flatMap((batch) => {
    if (batch.expirationDate == null || batch.expirationDate === "") return []
    const parsed = dateSchema.safeParse(batch.expirationDate)
    if (!parsed.success) throw new EngineError("A source batch has an invalid expiration date. Correct it before portioning.", 409, "invalid_batch_expiration")
    return [parsed.data]
  }).sort((a, b) => a.slice(0, 10).localeCompare(b.slice(0, 10)))
  const earliest = dates[0] ?? null
  const unknownSourceExpiration = allocation.unallocatedQuantity > 0 || used.some((batch) => !batch.expirationDate)
  if (p.expirationDate && earliest && p.expirationDate.slice(0, 10) > earliest.slice(0, 10)) throw new EngineError("Portion expiration cannot be later than its source batch expiration.", 400, "expiration_exceeds_source")
  const expirationDate = p.expirationDate ?? (unknownSourceExpiration ? null : earliest)
  const receivedDates = used.map((batch) => typeof batch.receivedAt === "string" && Number.isFinite(Date.parse(batch.receivedAt)) ? batch.receivedAt : null)
  const receivedAt = allocation.unallocatedQuantity || receivedDates.some((date) => !date) ? null : receivedDates.filter((date): date is string => Boolean(date)).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null
  // Allocate each package in integer thousandths so repeated fractional cuts conserve weight exactly.
  const remaining = allocation.allocations.map((entry) => ({ batchId: entry.batchId, units: Math.round(entry.quantity * 1000) }))
  let sourceIndex = 0
  const packages = Array.from({ length: p.portionCount }, (_, index) => {
    let outstanding = Math.round(p.portionWeight * 1000)
    const sourceAllocations: { batchId: string; quantity: number }[] = []
    while (outstanding > 0 && sourceIndex < remaining.length) {
      const source = remaining[sourceIndex]
      const units = Math.min(outstanding, source.units)
      if (units > 0) sourceAllocations.push({ batchId: source.batchId, quantity: units / 1000 })
      outstanding -= units; source.units -= units
      if (!source.units) sourceIndex++
    }
    const id = `${command.commandId}-${index + 1}`
    return { id, index: index + 1, sourceAllocations, untrackedQuantity: outstanding / 1000, packageBarcode: p.packageBarcodePrefix ? `${p.packageBarcodePrefix}-${id}` : null }
  })
  if (normalizeStockQuantity(packages.reduce((sum, entry) => sum + entry.untrackedQuantity + entry.sourceAllocations.reduce((total, source) => total + source.quantity, 0), 0)) !== totalWeight) throw new EngineError("The package weights could not be balanced.", 409, "unbalanced_portion")
  const remainingUnknown = normalizeStockQuantity(Math.max(0, available - tracked - allocation.unallocatedQuantity))
  if (5 + allocation.allocations.length + packages.length + Number(remainingUnknown > 0) > 480) throw new EngineError("This cut changes too many batches. Cut fewer portions at a time.", 400, "portion_too_large")
  return { current, before, after: nextStockState(before, before.frontStock, before.backStock), totalWeight, allocation, packages, remainingUnknown, unknownBatchId: `${command.commandId}-undated`, expirationDate, earliestSourceExpiration: earliest, unknownSourceExpiration, expirationSource: p.expirationDate ? "manual" : expirationDate ? "inherited" : "unknown", receivedAt }
}

async function replayPortion(existing: Record<string, unknown>, command: PortionCommand, fingerprint: string, transaction: PortionTransaction): Promise<PortionResponse> {
  const conflict = () => new EngineError("This operation ID was already used for different portion details.", 409, "operation_conflict")
  if (existing.operationType !== "portion" || existing.storeId !== command.locationId || (existing.actor as { uid?: string } | undefined)?.uid !== command.actorId) throw conflict()
  if (existing.commandFingerprint || existing.engineResult) {
    if (existing.commandFingerprint !== fingerprint) throw conflict()
    const saved = portionResponseSchema.safeParse({ ...(existing.engineResult as Record<string, unknown>), data: existing.result })
    if (!saved.success || saved.data.requestId !== command.commandId) throw new EngineError("The saved portion result could not be verified.", 409, "operation_result_invalid")
    return { ...saved.data, replayed: true }
  }
  const result = portionResultSchema.safeParse(existing.result)
  const record = await transaction.readPortion(command.commandId)
  const p = command.payload
  const ids = Array.from({ length: p.portionCount }, (_, index) => `${command.commandId}-${index + 1}`)
  if (!result.success || result.data.itemId !== p.itemId || result.data.portionCount !== p.portionCount || result.data.portionWeight !== p.portionWeight || result.data.totalWeight !== normalizeStockQuantity(p.portionCount * p.portionWeight) || JSON.stringify(result.data.portionIds) !== JSON.stringify(ids) || !record || record.operationId !== command.commandId || record.storeId !== command.locationId || record.createdBy !== command.actorId || record.itemId !== p.itemId || record.sourceArea !== p.sourceArea || (record.sourceBatchId ?? null) !== (p.sourceBatchId ?? null) || record.portionWeight !== p.portionWeight || record.portionCount !== p.portionCount || (record.expirationDate ?? null) !== (p.expirationDate ?? null)) throw conflict()
  const packages = await transaction.readPackages(ids)
  if (packages.length !== ids.length || ids.some((id, index) => { const saved = packages.find((batch) => batch.id === id); return !saved || saved.storeId !== command.locationId || saved.itemId !== p.itemId || saved.sourceOperationId !== command.commandId || saved.packageBarcode !== (p.packageBarcodePrefix ? `${p.packageBarcodePrefix}-${String(index + 1).padStart(3, "0")}` : null) })) throw conflict()
  const committedAt = z.string().datetime().safeParse(existing.createdAt)
  if (!committedAt.success) throw new EngineError("The saved portion timestamp could not be verified.", 409, "operation_result_invalid")
  return portionResponseSchema.parse({ requestId: command.commandId, schemaVersion: "1", committedAt: committedAt.data, replayed: true, data: result.data })
}

export async function executePortion(input: unknown, principal: EnginePrincipal, repository: PortionRepository, authorizeStore: (storeId: string) => Promise<void>, now = () => new Date().toISOString()): Promise<PortionResponse> {
  const parsed = portionCommandSchema.safeParse(input)
  if (!parsed.success) throw new EngineError(parsed.error.issues[0]?.message ?? "Valid portion details are required.", 400, "invalid_request")
  const command = parsed.data
  if (command.actorId !== principal.uid || command.organizationId !== principal.organizationId) throw new EngineError("The command does not belong to this session.", 403, "command_scope_denied")
  if (!principal.isManager && !principal.permissions.includes("*") && !principal.permissions.includes("inventory.edit")) throw new EngineError("You do not have permission to portion inventory.", 403, "permission_denied")
  await authorizeStore(command.locationId)
  return repository.runTransaction(async (transaction) => {
    const fingerprint = portionFingerprint(command)
    const existing = await transaction.readOperation(command.commandId)
    if (existing) return replayPortion(existing, command, fingerprint, transaction)
    const current = await transaction.readItem(command.payload.itemId)
    if (!current) throw new EngineError("This inventory item no longer exists in the portal.", 404, "inventory_not_found")
    if (String(current.storeId ?? "").trim() !== command.locationId) throw new EngineError("This inventory item is not assigned to the selected store.", 403, "store_access_denied")
    const batches = await transaction.readBatches(current.id)
    const plan = planPortion(command, current, batches)
    const response = portionResponseSchema.parse({ requestId: command.commandId, schemaVersion: "1", committedAt: now(), replayed: false, data: { itemId: current.id, itemName: String(current.name ?? "Inventory item"), portionCount: command.payload.portionCount, portionWeight: command.payload.portionWeight, totalWeight: plan.totalWeight, unit: String(current.unit ?? "pounds"), portionIds: plan.packages.map((entry) => entry.id) } })
    transaction.write(command, plan, response, fingerprint)
    return response
  })
}
