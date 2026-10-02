import { summarizeBatchAvailability } from "./batch-allocation.ts"

export const TODAY_ENGINE_VERSION = "2026-10-01.1"

export type TodayIssueType = "stockout_risk" | "imminent_expiry" | "overdue_count" | "count_variance" | "order_cutoff"
export type TodayIssueSeverity = "critical" | "high" | "medium" | "low"

export type TodayIssue = {
  id: string
  type: TodayIssueType
  title: string
  detail: string
  evidence: Array<{ label: string; value: string; sourceRef: string }>
  severity: TodayIssueSeverity
  priorityScore: number
  deadline: string | null
  storeId: string
  itemId?: string
  orderId?: string
  suggestedAction: string
  action: { kind: "inventory" | "spot_check" | "orders" | "waste"; href: string }
  status: "open" | "resolved"
  freshness: { asOf: string | null; state: "fresh" | "stale" | "unknown" }
  engineVersion: string
}

type Inventory = {
  id: string; storeId?: string; name?: string; sku?: string; unit?: string; onHand?: number; par?: number; reorderPoint?: number
  expires?: boolean; updatedAt?: unknown; lastCountedAt?: unknown
}
type Batch = { id: string; itemId?: string; storeId?: string; remainingQuantity?: number; expirationDate?: string | null; receivedAt?: string | null }
type OrderLine = { itemId?: string; sku?: string; quantity?: number; finalQuantity?: number; receivedQuantity?: number; stockUnitsPerOrderUnit?: number; overrideReason?: string | null; suggestedQuantity?: number }
type Order = { id: string; storeId?: string; vendor?: string; status?: string; dueAt?: string; expectedArrival?: string; updatedAt?: unknown; lines?: OrderLine[] }
type StockOperation = { id: string; operationId?: string; storeId?: string; operationType?: string; createdAt?: unknown; timestamp?: unknown; result?: { allocationMethod?: string; humanOverrideCount?: number }; changes?: Array<{ itemId?: string; itemName?: string; delta?: { onHand?: number } }> }

function dateValue(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString()
  const string = typeof value === "string" ? value : ""
  return string && !Number.isNaN(Date.parse(string)) ? new Date(string).toISOString() : null
}

function freshness(value: unknown, now: Date) {
  const asOf = dateValue(value)
  if (!asOf) return { asOf: null, state: "unknown" as const }
  return { asOf, state: now.getTime() - Date.parse(asOf) > 7 * 86_400_000 ? "stale" as const : "fresh" as const }
}

function severityScore(severity: TodayIssueSeverity) {
  return { critical: 400, high: 300, medium: 200, low: 100 }[severity]
}

function issue(input: Omit<TodayIssue, "status" | "engineVersion" | "priorityScore"> & { impact: number }): TodayIssue {
  return {
    ...input,
    priorityScore: severityScore(input.severity) + Math.min(99, Math.max(0, Math.round(input.impact))),
    status: "open",
    engineVersion: TODAY_ENGINE_VERSION
  }
}

export function generateTodayIssues({
  storeId, inventory, batches, orders, stockOperations, now = new Date()
}: {
  storeId: string
  inventory: Inventory[]
  batches: Batch[]
  orders: Order[]
  stockOperations: StockOperation[]
  now?: Date
}) {
  const nowIso = now.toISOString()
  const issues: TodayIssue[] = []
  const activeOrders = orders.filter((order) => order.storeId === storeId && ["Submitted", "Auto-submitted", "Partially received"].includes(String(order.status)))
  for (const item of inventory.filter((entry) => entry.storeId === storeId)) {
    const itemBatches = batches.filter((batch) => batch.storeId === storeId && batch.itemId === item.id && Number(batch.remainingQuantity ?? 0) > 0)
    const nextDelivery = activeOrders
      .filter((order) => order.lines?.some((line) => line.itemId === item.id || line.sku === item.sku))
      .map((order) => order.expectedArrival ?? "").filter((value) => !Number.isNaN(Date.parse(value))).sort((a, b) => Date.parse(a) - Date.parse(b))[0]
    const availability = summarizeBatchAvailability(itemBatches.map((batch) => ({
      id: batch.id, remainingQuantity: Number(batch.remainingQuantity ?? 0), expirationDate: batch.expirationDate, receivedAt: batch.receivedAt
    })), nowIso, nextDelivery)
    const usable = item.expires ? Math.max(0, availability.usableDated - availability.expiringBeforeDelivery) : Math.max(0, Number(item.onHand ?? 0))
    const incoming = activeOrders.reduce((total, order) => total + (order.lines ?? [])
      .filter((line) => line.itemId === item.id || line.sku === item.sku)
      .reduce((sum, line) => sum + Math.max(0, Number(line.finalQuantity ?? line.quantity ?? 0) - Number(line.receivedQuantity ?? 0)) * Math.max(1, Number(line.stockUnitsPerOrderUnit ?? 1)), 0), 0)
    const reorderPoint = Math.max(0, Number(item.reorderPoint ?? 0))
    const target = Math.max(reorderPoint, Number(item.par ?? 0))
    if (usable <= reorderPoint && usable + incoming < target) {
      const missing = Math.max(0, target - usable - incoming)
      const severity: TodayIssueSeverity = usable <= 0 ? "critical" : usable + incoming <= reorderPoint ? "high" : "medium"
      issues.push(issue({
        id: `stockout:${storeId}:${item.id}`, type: "stockout_risk", severity, impact: missing,
        title: `${item.name ?? "Inventory item"} may run short`,
        detail: `${usable} ${item.unit ?? "units"} usable plus ${incoming} confirmed incoming remains below the ${target} target.`,
        evidence: [
          { label: "Usable now", value: String(usable), sourceRef: `inventory/${item.id}` },
          { label: "Confirmed incoming", value: String(incoming), sourceRef: `orders?item=${item.id}` },
          { label: "Target", value: String(target), sourceRef: `inventory/${item.id}` }
        ], deadline: nextDelivery ?? nowIso, storeId, itemId: item.id,
        suggestedAction: incoming > 0 ? "Review the remaining gap and submitted delivery." : "Review or create the vendor order.",
        action: { kind: "inventory", href: `/inventory/${item.id}` }, freshness: freshness(item.updatedAt, now)
      }))
    }
    const expiring = itemBatches.filter((batch) => {
      if (!batch.expirationDate || Number.isNaN(Date.parse(batch.expirationDate))) return false
      const days = (Date.parse(batch.expirationDate) - now.getTime()) / 86_400_000
      return days >= 0 && days <= 3
    })
    const expiringQuantity = expiring.reduce((sum, batch) => sum + Number(batch.remainingQuantity ?? 0), 0)
    if (expiringQuantity > 0) {
      const deadline = expiring.map((batch) => batch.expirationDate!).sort()[0]
      issues.push(issue({
        id: `expiry:${storeId}:${item.id}`, type: "imminent_expiry", severity: deadline.slice(0, 10) === nowIso.slice(0, 10) ? "critical" : "high", impact: expiringQuantity,
        title: `${item.name ?? "Inventory item"} expires soon`, detail: `${expiringQuantity} ${item.unit ?? "units"} expire within three days.`,
        evidence: expiring.map((batch) => ({ label: `Batch ${batch.id}`, value: `${batch.remainingQuantity ?? 0} expires ${batch.expirationDate?.slice(0, 10)}`, sourceRef: `inventoryBatches/${batch.id}` })),
        deadline, storeId, itemId: item.id, suggestedAction: "Use the earliest batch first or record discard if it is no longer usable.",
        action: { kind: "inventory", href: `/inventory/${item.id}` }, freshness: freshness(item.updatedAt, now)
      }))
    }
    const countFreshness = freshness(item.lastCountedAt, now)
    if (countFreshness.state !== "fresh") {
      issues.push(issue({
        id: `count:${storeId}:${item.id}`, type: "overdue_count", severity: countFreshness.state === "unknown" ? "medium" : "low", impact: reorderPoint > 0 && Number(item.onHand ?? 0) <= reorderPoint ? 30 : 1,
        title: `${item.name ?? "Inventory item"} needs a count`, detail: countFreshness.state === "unknown" ? "No completed count timestamp is available." : `Last count was ${countFreshness.asOf?.slice(0, 10)}.`,
        evidence: [{ label: "Count freshness", value: countFreshness.state, sourceRef: `inventory/${item.id}` }], deadline: nowIso, storeId, itemId: item.id,
        suggestedAction: "Complete a floor and backstock spot count.", action: { kind: "spot_check", href: `/inventory/${item.id}` }, freshness: countFreshness
      }))
    }
  }
  for (const order of orders.filter((entry) => entry.storeId === storeId && ["Draft", "Needs review", "Approved", "Ready"].includes(String(entry.status)))) {
    const due = dateValue(order.dueAt)
    if (!due || Date.parse(due) - now.getTime() > 24 * 3_600_000) continue
    const overdue = Date.parse(due) <= now.getTime()
    issues.push(issue({
      id: `cutoff:${storeId}:${order.id}`, type: "order_cutoff", severity: overdue ? "critical" : "high", impact: overdue ? 90 : 50,
      title: `${order.vendor ?? "Vendor"} order ${overdue ? "missed its cutoff" : "is due soon"}`,
      detail: `${order.status ?? "Draft"} order is due ${due}.`, evidence: [{ label: "Order status", value: String(order.status ?? "Draft"), sourceRef: `orders/${order.id}` }],
      deadline: due, storeId, orderId: order.id, suggestedAction: order.status === "Approved" ? "Record how the order was submitted." : "Review and approve the order before cutoff.",
      action: { kind: "orders", href: `/orders?draft=${order.id}#generate-order` }, freshness: freshness(order.updatedAt, now)
    }))
  }
  const latestCounts = new Map<string, { operation: StockOperation; change: NonNullable<StockOperation["changes"]>[number] }>()
  const sortedOperations = stockOperations
    .filter((entry) => entry.storeId === storeId && entry.operationType === "spot_check")
    .sort((left, right) => String(dateValue(right.createdAt ?? right.timestamp) ?? "").localeCompare(String(dateValue(left.createdAt ?? left.timestamp) ?? "")))
  for (const operation of sortedOperations) {
    for (const change of operation.changes ?? []) {
      if (!change.itemId || latestCounts.has(change.itemId)) continue
      latestCounts.set(change.itemId, { operation, change })
    }
  }
  for (const [itemId, { operation, change }] of latestCounts) {
    const delta = Number(change.delta?.onHand ?? 0)
    const occurredAt = dateValue(operation.createdAt ?? operation.timestamp)
    if (Math.abs(delta) < 1 || !occurredAt) continue
    issues.push(issue({
      id: `variance:${storeId}:${itemId}`, type: "count_variance", severity: Math.abs(delta) >= 10 ? "high" : "medium", impact: Math.abs(delta),
      title: `${change.itemName ?? "Inventory item"} count changed by ${delta}`, detail: "A recent spot count changed the recorded on-hand balance and needs review.",
      evidence: [{ label: "Count variance", value: String(delta), sourceRef: `stockOperations/${operation.id}` }], deadline: new Date(Date.parse(occurredAt) + 24 * 3_600_000).toISOString(),
      storeId, itemId, suggestedAction: "Review the count evidence and recount if the variance is unexplained.", action: { kind: "spot_check", href: `/inventory/${itemId}` },
      freshness: { asOf: occurredAt, state: "fresh" }
    }))
  }
  return issues.sort((left, right) => right.priorityScore - left.priorityScore || String(left.deadline ?? "").localeCompare(String(right.deadline ?? "")) || left.id.localeCompare(right.id))
}

export function reconcileIssueRecords(previous: TodayIssue[], current: TodayIssue[], resolvedAt: string) {
  const activeIds = new Set(current.map((entry) => entry.id))
  return [
    ...current,
    ...previous.filter((entry) => entry.status === "open" && !activeIds.has(entry.id)).map((entry) => ({ ...entry, status: "resolved" as const, resolvedAt }))
  ]
}

export function operationalObservability({ inventory, batches, orders, stockOperations }: { inventory: Inventory[]; batches: Batch[]; orders: Order[]; stockOperations: StockOperation[] }) {
  const batchTotals = new Map<string, number>()
  for (const batch of batches) batchTotals.set(String(batch.itemId), (batchTotals.get(String(batch.itemId)) ?? 0) + Math.max(0, Number(batch.remainingQuantity ?? 0)))
  const balanceMismatches = inventory.filter((item) => Math.abs(Number(item.onHand ?? 0) - (batchTotals.get(item.id) ?? 0)) > 0.001).length
  const ids = stockOperations.map((operation) => operation.operationId ?? operation.id)
  const duplicateOperationIds = ids.length - new Set(ids).size
  const orderOverrides = orders.reduce((count, order) => count + (order.lines ?? []).filter((line) => Number(line.finalQuantity ?? line.quantity ?? 0) !== Number(line.suggestedQuantity ?? line.quantity ?? 0) && Boolean(line.overrideReason)).length, 0)
  const operationOverrides = stockOperations.reduce((count, operation) => count + Number(operation.result?.humanOverrideCount ?? (operation.result?.allocationMethod === "human_override" ? 1 : 0)), 0)
  const managerOverrides = orderOverrides + operationOverrides
  return { balanceMismatches, duplicateOperationIds, managerOverrides }
}
