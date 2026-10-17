import { z } from "zod"

const recordSchema = z.record(z.unknown()).and(z.object({ id: z.string() }))
const sourceSchema = z.object({ records: z.array(recordSchema), partial: z.boolean() })
export const reconciliationInputSchema = z.object({ storeId: z.string().min(1), inventory: sourceSchema, batches: sourceSchema, operations: sourceSchema })
const issueSchema = z.object({ code: z.string(), severity: z.enum(["error", "review"]), itemId: z.string().nullable(), itemName: z.string(), message: z.string() })
export const reconciliationReportSchema = z.object({
  schemaVersion: z.literal("1"), storeId: z.string(), generatedAt: z.string().datetime(), partial: z.boolean(),
  status: z.enum(["balanced", "needs_review", "incomplete"]),
  checked: z.object({ items: z.number().int(), batches: z.number().int(), operations: z.number().int() }),
  issues: z.array(issueSchema)
})
export type ReconciliationReport = z.infer<typeof reconciliationReportSchema>
type RecordData = Record<string, unknown>
const quantity = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER / 1000 && Math.abs(value * 1000 - Math.round(value * 1000)) < 0.00001
const revision = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const equal = (a: number, b: number) => Math.abs(a - b) < 0.0000001
const object = (value: unknown): RecordData => value && typeof value === "object" && !Array.isArray(value) ? value as RecordData : {}
function validStock(value: RecordData) { return quantity(value.frontStock) && quantity(value.backStock) && quantity(value.onHand) && equal(value.onHand, value.frontStock + value.backStock) }

/** Observes a consistent snapshot. It never reconstructs or writes a stock balance. */
export function reconcileInventory(input: z.infer<typeof reconciliationInputSchema>, generatedAt = new Date().toISOString()): ReconciliationReport {
  const data = reconciliationInputSchema.parse(input)
  const issues: ReconciliationReport["issues"] = []
  const add = (code: string, severity: "error" | "review", itemId: string | null, message: string) => issues.push({ code, severity, itemId, itemName: itemId ? String(items.get(itemId)?.name ?? "Inventory item") : "Store records", message })
  const items = new Map(data.inventory.records.map(item => [item.id, item]))
  const totals = new Map<string, { front: number; back: number }>()
  const changes = new Map<string, { operationId: string; type: string; before: RecordData; after: RecordData }[]>()
  for (const source of [data.inventory, data.batches, data.operations]) for (const record of source.records) if (record.storeId !== data.storeId) throw new Error("Reconciliation source contains records outside the selected store.")
  for (const batch of data.batches.records) {
    const id = typeof batch.itemId === "string" ? batch.itemId : null
    if (!id || (!items.has(id) && !data.inventory.partial)) add("orphan_batch", "review", id, "A batch has no matching inventory item in this store.")
    if (!quantity(batch.remainingQuantity) || !["front", "back"].includes(String(batch.area))) { add("invalid_batch", "error", id, "A batch has an invalid quantity or stock area."); continue }
    if (batch.remainingQuantity > 0 && batch.status !== "available") add("batch_status", "review", id, "A batch still has stock but is not marked available.")
    const total = totals.get(id ?? "") ?? { front: 0, back: 0 }
    total[batch.area as "front" | "back"] += batch.remainingQuantity
    totals.set(id ?? "", total)
  }
  for (const operation of data.operations.records) {
    if (!["spot_check", "restock", "waste", "receive", "transfer", "portion", "par_change"].includes(String(operation.operationType))) add("unknown_movement", "review", null, "A movement type is not supported by this review.")
    if (!Array.isArray(operation.changes) || !operation.changes.length) { add("invalid_movement", "error", null, "A stock movement has no readable changes."); continue }
    for (const raw of operation.changes) {
      const change = object(raw), before = object(change.before), after = object(change.after)
      const id = typeof change.itemId === "string" ? change.itemId : null
      if (!id || !revision(before.revision) || !revision(after.revision) || after.revision !== before.revision + 1) { add("invalid_movement", "error", id, "A stock movement has an invalid item or revision step."); continue }
      if (!items.has(id) && !data.inventory.partial) add("orphan_movement", "review", id, "Movement history refers to an inventory item no longer present in this store.")
      if (operation.operationType !== "par_change") {
        const delta = object(change.delta)
        if (!validStock(before) || !validStock(after) || !["frontStock", "backStock", "onHand"].every(k => typeof delta[k] === "number" && Number.isFinite(delta[k]) && equal(delta[k] as number, (after[k] as number) - (before[k] as number)))) add("movement_balance", "error", id, "A stock movement's quantities or recorded change do not balance.")
      } else if (![before.par, before.reorderPoint, after.par, after.reorderPoint].every(quantity)) add("invalid_policy", "error", id, "A target change has invalid saved targets.")
      const list = changes.get(id) ?? []
      list.push({ operationId: operation.id, type: String(operation.operationType), before, after }); changes.set(id, list)
    }
  }
  for (const item of data.inventory.records) {
    const id = item.id
    if (!validStock(item)) add("stock_balance", "error", id, "Front and back stock must be valid quantities and add up to the saved total.")
    if (item.revision !== undefined && !revision(item.revision)) add("invalid_revision", "error", id, "The saved stock revision is invalid.")
    const total = totals.get(id) ?? { front: 0, back: 0 }
    for (const area of ["front", "back"] as const) {
      const balance = item[area === "front" ? "frontStock" : "backStock"]
      if (!quantity(balance)) continue
      if (total[area] > balance + 0.0000001) add("batch_excess", "error", id, `Batch quantities exceed ${area === "front" ? "sales floor" : "backroom"} stock.`)
      else if (!data.batches.partial && !equal(total[area], balance)) add("batch_untracked", "review", id, `Some ${area === "front" ? "sales floor" : "backroom"} stock has no batch detail. Review it with a spot count.`)
    }
    const history = (changes.get(id) ?? []).sort((a, b) => Number(a.after.revision) - Number(b.after.revision))
    if (!history.length) { add("history_unverified", "review", id, "No movement baseline was found in the reviewed history. Saved stock has not been verified against a movement."); continue }
    let physicalBalance: RecordData | null = null
    for (let i = 0; i < history.length; i++) {
      const current = history[i], previous = history[i - 1]
      if (previous && previous.after.revision === current.after.revision) add("duplicate_revision", "error", id, "More than one movement claims the same stock revision.")
      else if (previous && previous.after.revision !== current.before.revision) add("history_gap", "review", id, "A revision is missing from the reviewed movement history.")
      if (previous && previous.after.revision !== current.before.revision) physicalBalance = null
      if (current.type !== "par_change") {
        if (physicalBalance && ["frontStock", "backStock", "onHand"].some(k => !equal(Number(physicalBalance![k]), Number(current.before[k])))) add("history_discontinuity", "error", id, "Consecutive movement balances do not agree.")
        physicalBalance = current.after
      }
    }
    const latest = history[history.length - 1]
    const savedRevision = item.revision ?? 0
    if (latest.after.revision !== savedRevision) add("history_revision", "review", id, "The saved revision does not match the latest reviewed movement. Refresh or review the missing history.")
    else {
      // Policy-only movements advance the revision without changing physical stock.
      let anchor = history.length - 1
      while (anchor >= 0 && history[anchor].type === "par_change" && (anchor === history.length - 1 || history[anchor].after.revision === history[anchor + 1].before.revision)) anchor--
      const physical = history[anchor]
      if (!physical || (anchor < history.length - 1 && physical.after.revision !== history[anchor + 1].before.revision)) add("history_unverified", "review", id, "Only target changes were found; the physical stock baseline is unverified.")
      else if (validStock(physical.after) && ["frontStock", "backStock", "onHand"].some(k => !equal(Number(physical.after[k]), Number(item[k])))) add("ledger_drift", "error", id, "Saved stock differs from the last verified movement balance.")
      if (latest.type === "par_change" && ["par", "reorderPoint"].some(k => !equal(Number(latest.after[k]), Number(item[k])))) add("policy_drift", "error", id, "Saved stock targets differ from the last target change.")
    }
  }
  const partial = data.inventory.partial || data.batches.partial || data.operations.partial
  return reconciliationReportSchema.parse({ schemaVersion: "1", storeId: data.storeId, generatedAt, partial, status: partial ? "incomplete" : issues.length ? "needs_review" : "balanced", checked: { items: items.size, batches: data.batches.records.length, operations: data.operations.records.length }, issues })
}
