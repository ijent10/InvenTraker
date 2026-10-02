import { privacyFilterAssistantValue } from "./ai/privacy.ts"

export const OPERATIONAL_INTELLIGENCE_VERSION = "inventraker-operations/1"
export type OperationalToolName = "current_balance" | "batch_expiry" | "stock_events" | "order_explanation" | "cost_changes" | "comparable_waste" | "runout_explanation"
export type OperationalRecord = Record<string, unknown>
export type OperationalDataset = {
  storeId: string
  itemId?: string
  orderId?: string
  inventory?: OperationalRecord[]
  batches?: OperationalRecord[]
  stockOperations?: OperationalRecord[]
  orders?: OperationalRecord[]
  waste?: OperationalRecord[]
  receiving?: OperationalRecord[]
  sales?: OperationalRecord[]
  portions?: OperationalRecord[]
  now?: Date
}

type Evidence = { sourceRef: string; href: string; label: string; observedAt: string | null; freshness: "current" | "aging" | "stale" | "unknown" }
export type OperationalResult = {
  contractVersion: string
  tool: OperationalToolName
  status: "available" | "partial" | "insufficient_evidence"
  generatedAt: string
  storeId: string
  facts: Record<string, unknown>
  evidence: Evidence[]
  missingData: string[]
  findings: string[]
  inferenceLimits: string[]
  actionPolicy: { mode: "draft_only"; requiresExistingPermission: true; bypassesApproval: false }
}

const num = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const text = (value: unknown) => typeof value === "string" ? value : ""
function iso(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "object" && value && "toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString()
  const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
function freshness(at: string | null, now: Date): Evidence["freshness"] {
  if (!at) return "unknown"
  const age = now.getTime() - new Date(at).getTime()
  return age <= 24 * 3600_000 ? "current" : age <= 7 * 86400_000 ? "aging" : "stale"
}
function source(collection: string, record: OperationalRecord, now: Date, label: string): Evidence {
  const id = text(record.id) || "unknown"
  const observedAt = iso(record.updatedAt ?? record.createdAt ?? record.timestamp ?? record.date)
  const href = collection === "inventory" ? `/inventory/${encodeURIComponent(id)}`
    : collection === "inventory/batches" && text(record.itemId) ? `/inventory/${encodeURIComponent(text(record.itemId))}`
    : collection === "waste" ? `/history/waste/${encodeURIComponent(id)}`
    : collection === "orders" ? "/orders"
    : "/history"
  return { sourceRef: `${collection}/${id}`, href, label, observedAt, freshness: freshness(observedAt, now) }
}
function scoped(records: OperationalRecord[] | undefined, data: OperationalDataset) {
  return (records ?? []).filter((r) => text(r.storeId) === data.storeId && (!data.itemId || text(r.id) === data.itemId || text(r.itemId) === data.itemId || text(r.inventoryItemId) === data.itemId || Array.isArray(r.changes) && r.changes.some((c) => text((c as OperationalRecord).itemId) === data.itemId) || Array.isArray(r.lines) && r.lines.some((line) => text((line as OperationalRecord).itemId) === data.itemId)))
}
function base(data: OperationalDataset, tool: OperationalToolName): OperationalResult {
  return { contractVersion: OPERATIONAL_INTELLIGENCE_VERSION, tool, status: "available", generatedAt: new Date(data.now ?? Date.now()).toISOString(), storeId: data.storeId, facts: {}, evidence: [], missingData: [], findings: [], inferenceLimits: [], actionPolicy: { mode: "draft_only", requiresExistingPermission: true, bypassesApproval: false } }
}

export function runOperationalTool(tool: OperationalToolName, unsafeData: OperationalDataset): OperationalResult {
  const data = privacyFilterAssistantValue(unsafeData) as OperationalDataset
  const now = data.now ? new Date(data.now) : new Date()
  const out = base(data, tool)
  const inventory = scoped(data.inventory, data)
  const batches = scoped(data.batches, data)
  const events = scoped(data.stockOperations, data).sort((a, b) => (iso(b.createdAt ?? b.timestamp) ?? "").localeCompare(iso(a.createdAt ?? a.timestamp) ?? ""))
  const orders = scoped(data.orders, data).filter((r) => !data.orderId || text(r.id) === data.orderId)
  const waste = scoped(data.waste, data)
  const usage = [...scoped(data.sales, data), ...scoped(data.portions, data)]
  const item = inventory[0]

  if (tool === "current_balance" || tool === "runout_explanation") {
    if (!item) { out.status = "insufficient_evidence"; out.missingData.push("No authorized inventory snapshot exists for this item and store.") }
    else {
      out.facts.currentBalance = { itemId: item.id, itemName: item.name, onHand: num(item.onHand), frontStock: num(item.frontStock), backStock: num(item.backStock), par: num(item.par), reorderPoint: num(item.reorderPoint), revision: item.revision }
      out.evidence.push(source("inventory", item, now, "Current inventory snapshot"))
    }
    if (tool === "current_balance") return out
  }

  if (tool === "batch_expiry") {
    out.facts.batches = batches.map((b) => ({ id: b.id, itemId: b.itemId, remainingQuantity: num(b.remainingQuantity), area: b.area, expirationDate: iso(b.expirationDate)?.slice(0, 10) ?? null, expirationKnown: Boolean(b.expirationKnown), status: b.status }))
    out.evidence = batches.map((b) => source("inventory/batches", b, now, "Inventory batch"))
    if (!batches.length) { out.status = "insufficient_evidence"; out.missingData.push("No authorized batch records exist for this item and store.") }
    return out
  }

  if (tool === "stock_events" || tool === "runout_explanation") {
    const safeEvents = events.map((e) => ({ id: e.id, operationId: e.operationId, operationType: e.operationType, quantityBasis: e.quantityBasis, reason: e.reason, changes: e.changes, createdAt: iso(e.createdAt ?? e.timestamp) }))
    out.facts.stockEvents = safeEvents
    out.evidence.push(...events.map((e) => source("history", e, now, `Stock event: ${text(e.operationType) || "change"}`)))
    if (!events.length) out.missingData.push("No stock-event history is available for the selected item.")
    if (tool === "stock_events") { if (!events.length) out.status = "insufficient_evidence"; return out }
  }

  if (tool === "order_explanation") {
    const order = orders[0]
    if (!order) { out.status = "insufficient_evidence"; out.missingData.push("No authorized order record matches this request."); return out }
    out.facts.order = { id: order.id, vendor: order.vendor, status: order.status, dueAt: iso(order.dueAt), expectedArrival: iso(order.expectedArrival), lines: order.lines, recommendation: order.recommendation, sentMethod: order.sentMethod }
    out.evidence.push(source("orders", order, now, "Order and frozen recommendation inputs"))
    return out
  }

  if (tool === "cost_changes") {
    const costPoints = [...events, ...orders].flatMap((record) => {
      const lines = Array.isArray(record.lines) ? record.lines as OperationalRecord[] : []
      return lines.filter((line) => !data.itemId || text(line.itemId) === data.itemId).map((line) => ({ sourceId: record.id, at: iso(record.createdAt ?? record.updatedAt ?? record.submittedAt), unitCost: num(line.unitCostAmount ?? line.unitCost), itemId: line.itemId, itemName: line.itemName })).filter((p) => p.unitCost > 0)
    }).sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""))
    out.facts.costPoints = costPoints
    out.evidence.push(...orders.map((o) => source("orders", o, now, "Order cost record")))
    if (costPoints.length < 2) { out.status = "insufficient_evidence"; out.missingData.push("At least two dated cost records are required to explain a cost change.") }
    else out.findings.push(`Recorded unit cost changed from ${costPoints[0].unitCost} to ${costPoints.at(-1)?.unitCost}.`)
    return out
  }

  if (tool === "comparable_waste") {
    const dated = waste.map((w) => ({ ...w, at: iso(w.createdAt ?? w.timestamp ?? w.date), quantity: num(w.quantity ?? w.amount) })).filter((w) => w.at)
    const split = now.getTime() - 7 * 86400_000, prior = split - 7 * 86400_000
    const current = dated.filter((w) => new Date(w.at!).getTime() >= split).reduce((s, w) => s + w.quantity, 0)
    const previous = dated.filter((w) => { const t = new Date(w.at!).getTime(); return t >= prior && t < split }).reduce((s, w) => s + w.quantity, 0)
    out.facts.comparison = { period: "last_7_days_vs_previous_7_days", currentQuantity: current, previousQuantity: previous, difference: current - previous }
    out.evidence = dated.map((w) => source("waste", w, now, "Recorded waste event"))
    if (!dated.length) { out.status = "insufficient_evidence"; out.missingData.push("No dated waste events are available for comparison.") }
    return out
  }

  // runout_explanation: report supported contributors and explicitly reject unsupported causation.
  const parEvents = events.filter((e) => e.operationType === "par_change")
  const shortages = orders.filter((o) => ["Partially received", "Received", "Reconciled"].includes(text(o.status))).flatMap((o) => Array.isArray(o.lines) ? (o.lines as OperationalRecord[]).filter((l) => (!data.itemId || text(l.itemId) === data.itemId) && num(l.receivedQuantity) < num(l.finalQuantity ?? l.quantity)).map((l) => ({ orderId: o.id, ordered: num(l.finalQuantity ?? l.quantity), received: num(l.receivedQuantity), shortage: num(l.finalQuantity ?? l.quantity) - num(l.receivedQuantity) })) : [])
  out.facts.usageEvidence = usage.map((u) => ({ id: u.id, quantity: num(u.quantity ?? u.amount), at: iso(u.createdAt ?? u.timestamp ?? u.date), sourceType: u.sourceType ?? "recorded_usage" }))
  out.facts.parChanges = parEvents.map((e) => ({ id: e.id, changes: e.changes, at: iso(e.createdAt ?? e.timestamp) }))
  out.facts.deliveryShortages = shortages
  out.facts.recordedWasteQuantity = waste.reduce((sum, w) => sum + num(w.quantity ?? w.amount), 0)
  if (!usage.length) out.missingData.push("No verified sales or usage records are available. A falling count does not prove sales, waste, theft, or any other cause.")
  if (usage.length) out.findings.push("Verified usage records are present and may explain part of the decrease; compare their quantities and timestamps with the stock events.")
  if (waste.length) out.findings.push("Recorded waste contributes to the decrease shown in the evidence.")
  if (shortages.length) out.findings.push("A recorded delivery shortage reduced the stock received against the order.")
  if (parEvents.length) out.findings.push("The par target changed during the available event history.")
  out.inferenceLimits.push("Only recorded events are factual. Unrecorded sales, waste, theft, spoilage, or counting errors cannot be inferred from a balance decrease.")
  if (!item || (!events.length && !usage.length && !waste.length && !shortages.length)) out.status = "insufficient_evidence"
  else if (out.missingData.length) out.status = "partial"
  return out
}

export type UsageObservation = { date: string; quantity: number; source: "sale" | "usage" }
export function evaluateDemandBaseline(observations: UsageObservation[]) {
  const valid = observations.filter((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.date) && Number.isFinite(o.quantity) && o.quantity >= 0).sort((a, b) => a.date.localeCompare(b.date))
  if (valid.length < 28) return { status: "insufficient_data" as const, reason: "At least 28 dated, verified usage observations are required.", fallback: "no_demand_adjustment" as const }
  const train = valid.slice(0, -7), holdout = valid.slice(-7)
  const mean = train.slice(-7).reduce((s, o) => s + o.quantity, 0) / 7
  const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay()
  const predictions = holdout.map((o) => {
    const peers = train.filter((x) => weekday(x.date) === weekday(o.date)).slice(-4)
    return peers.length ? peers.reduce((s, x) => s + x.quantity, 0) / peers.length : mean
  })
  const mae = (values: number[]) => values.reduce((s, p, i) => s + Math.abs(p - holdout[i].quantity), 0) / values.length
  const trailingMae = mae(holdout.map(() => mean)), weekdayMae = mae(predictions)
  return { status: "validated" as const, selected: weekdayMae <= trailingMae ? "weekday_mean" as const : "trailing_7_mean" as const, heldOutDays: 7, metrics: { weekdayMae, trailingMae }, nextQuantity: weekdayMae <= trailingMae ? predictions.at(-1)! : mean, probability: null }
}
