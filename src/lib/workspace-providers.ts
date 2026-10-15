import { deterministicCandidateScore, type WidgetCandidate, type WidgetInstance } from "./workspace-contracts.ts"
import type { PermissionKey } from "./permissions"
import { engineIdSchema } from "./engines/contracts.ts"

export const workspaceEngines = engineIdSchema.options
export type WorkspaceSource = "inventory" | "inventoryBatches" | "stockOperations" | "orders" | "healthChecks" | "waste" | "receiving" | "portions"
export type SourceResult = { records: Record<string, unknown>[]; partial: boolean; failed?: boolean }
export type WidgetSummary = { state: "loaded" | "empty" | "permission-denied" | "engine-unavailable"; value: string; detail: string; partial?: boolean; candidates: WidgetCandidate[] }
export type WorkspaceData = { storeId: string; stores: { id: string; name: string }[]; generatedAt: string; widgets: Record<string, WidgetSummary> }

type Provider = { permissions: PermissionKey[]; sources: WorkspaceSource[] }
export const workspaceProviders: Record<string, Provider> = {
  inventory: { permissions: ["inventory.view"], sources: ["inventory"] },
  "low-stock": { permissions: ["inventory.view"], sources: ["inventory"] },
  expiration: { permissions: ["inventory.view"], sources: ["inventoryBatches"] },
  products: { permissions: ["inventory.view"], sources: ["inventory"] },
  orders: { permissions: ["orders.view"], sources: ["orders"] },
  health: { permissions: ["health.view"], sources: ["healthChecks"] },
  "spot-check": { permissions: ["inventory.view", "history.view"], sources: ["stockOperations"] },
  restocks: { permissions: ["inventory.view", "history.view"], sources: ["stockOperations"] },
  transfers: { permissions: ["inventory.view", "history.view"], sources: ["stockOperations"] },
  receiving: { permissions: ["inventory.view", "history.view"], sources: ["receiving"] },
  production: { permissions: ["inventory.view", "history.view"], sources: ["portions"] },
  waste: { permissions: ["insights.view", "inventory.view"], sources: ["waste"] },
  assistant: { permissions: ["ai.use"], sources: [] },
  insights: { permissions: ["insights.view"], sources: [] }
}

export function requiredWorkspaceSources(can: (permission: PermissionKey) => boolean, ids = Object.keys(workspaceProviders)) {
  const requested = new Set(ids)
  if (ids.some((id) => ["assistant", "insights"].includes(id) && workspaceProviders[id].permissions.every(can))) ["low-stock", "expiration", "orders", "health"].forEach((id) => requested.add(id))
  return [...new Set([...requested].flatMap((id) => { const provider = workspaceProviders[id]; return provider?.permissions.every(can) ? provider.sources : [] }))]
}

export function selectWorkspaceCandidates(candidates: WidgetCandidate[], widget: Pick<WidgetInstance, "engineId" | "size" | "mode" | "pinnedContentId">, now: string) {
  const eligible = candidates.filter((item) => item.engineId === widget.engineId && item.supportedSizes.includes(widget.size) && (!item.expiration || Date.parse(item.expiration) > Date.parse(now)))
  const sorted = eligible.sort((a, b) => Number(b.severity === "critical") - Number(a.severity === "critical") || deterministicCandidateScore(b) - deterministicCandidateScore(a) || a.id.localeCompare(b.id))
  if (widget.mode === "fixed") return []
  if (widget.mode === "pinned") return sorted.filter((item) => item.id === widget.pinnedContentId)
  return sorted.slice(0, widget.size === "extra-large" ? 4 : widget.size === "large" ? 2 : 1)
}

const text = (value: unknown) => typeof value === "string" ? value : ""
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null
const active = (record: Record<string, unknown>) => text(record.status).toLowerCase() !== "archived"

export function buildWorkspaceSummaries(sources: Partial<Record<WorkspaceSource, SourceResult>>, can: (permission: PermissionKey) => boolean, now: string): Record<string, WidgetSummary> {
  const result: Record<string, WidgetSummary> = {}
  const candidate = (engineId: string, record: Record<string, unknown>, summary: string, severity: WidgetCandidate["severity"] = "warning"): WidgetCandidate => ({
    id: `${engineId}:${text(record.id)}`, engineId, type: "operational-summary", title: text(record.name) || text(record.itemName) || "Item needs attention", summary, severity,
    timestamp: now, expiration: new Date(Date.parse(now) + 120_000).toISOString(), dataReference: `${engineId}/${text(record.id)}`,
    supportedSizes: ["small", "medium", "large", "extra-large"], permittedActions: ["navigate"],
    factors: { urgency: severity === "critical" ? 1 : 0.6, operationalImpact: 0.7, userRelevance: 1, actionability: 1, recency: 0.5 }
  })
  for (const [id, provider] of Object.entries(workspaceProviders)) {
    if (!provider.permissions.every(can)) { result[id] = { state: "permission-denied", value: "Access unavailable", detail: "Your role does not include this view.", candidates: [] }; continue }
    if (provider.sources.some((source) => !sources[source] || sources[source]?.failed)) { result[id] = { state: "engine-unavailable", value: "Unavailable", detail: "This source could not load. Try refreshing.", candidates: [] }; continue }
    const partial = provider.sources.some((source) => sources[source]?.partial)
    const records = provider.sources.flatMap((source) => sources[source]?.records ?? []).filter(active)
    let selected = records
    let detail = "Store records"
    let candidates: WidgetCandidate[] = []
    if (["inventory", "products", "low-stock"].includes(id)) {
      const low = records.filter((record) => number(record.onHand) !== null && number(record.reorderPoint) !== null && number(record.onHand)! < number(record.reorderPoint)!)
      selected = id === "low-stock" ? low : records
      detail = id === "low-stock" ? "Items below their reorder point" : `${low.length} below reorder point`
      candidates = low.map((record) => candidate("inventory", record, "Below reorder point", number(record.onHand) === 0 ? "critical" : "warning"))
    } else if (id === "expiration") {
      selected = records.filter((record) => { const date = Date.parse(text(record.expirationDate)); return (number(record.remainingQuantity) ?? 0) > 0 && Number.isFinite(date) && date <= Date.parse(now) + 3 * 86400_000 })
      detail = "Batches expired or expiring within 3 days"
      candidates = selected.map((record) => candidate("inventory", record, `Expires ${text(record.expirationDate).slice(0, 10)}`, Date.parse(text(record.expirationDate)) < Date.parse(now) ? "critical" : "warning"))
    } else if (id === "orders") {
      selected = records.filter((record) => ["draft", "ready", "needs review"].includes(text(record.status).toLowerCase()))
      detail = "Drafts and orders awaiting review"
      candidates = selected.map((record) => candidate("orders", { ...record, name: text(record.vendorName) || "Order" }, text(record.status)))
    } else if (id === "health") {
      selected = records.filter((record) => ["due today", "overdue"].includes(text(record.status).toLowerCase()))
      detail = "Checks marked due today or overdue"
      candidates = selected.map((record) => candidate("health-checks", record, text(record.status), text(record.status).toLowerCase() === "overdue" ? "critical" : "warning"))
    } else if (["spot-check", "restocks", "transfers"].includes(id)) {
      const type = { "spot-check": "spot_check", restocks: "restock", transfers: "transfer" }[id]
      selected = records.filter((record) => record.operationType === type)
      detail = id === "transfers" ? "Front/back transfers in the stock ledger" : id === "spot-check" ? "Spot checks in the stock ledger" : "Restocks in the stock ledger"
    } else if (id === "receiving") detail = "Recorded receiving lines"
    else if (id === "production") detail = "Recorded cut and portion operations"
    else if (id === "waste") detail = "Recorded discard entries"
    result[id] = { state: selected.length ? "loaded" : "empty", value: String(selected.length), detail: partial ? `${detail} · loaded records only` : detail, partial, candidates }
  }
  // These summaries consume only source widgets the principal may read. No model or private chat data is needed.
  for (const id of ["assistant", "insights"]) {
    if (result[id].state === "permission-denied") continue
    const inputs = ["low-stock", "expiration", "orders", "health"].map((key) => result[key]).filter((summary) => summary.state !== "permission-denied")
    const candidates = inputs.flatMap((summary) => summary.candidates).map((item) => ({ ...item, id: `${id}:${item.id}`, engineId: id }))
    const unavailable = inputs.some((summary) => summary.state === "engine-unavailable")
    const partial = unavailable || inputs.some((summary) => summary.partial)
    result[id] = { state: unavailable && !candidates.length ? "engine-unavailable" : candidates.length ? "loaded" : "empty", value: unavailable && !candidates.length ? "Unavailable" : String(candidates.length), detail: `${id === "assistant" ? "Store priorities · no AI required" : "Current operational signals"}${partial ? " · incomplete sources" : inputs.length ? "" : " · no source access"}`, partial, candidates }
  }
  return result
}
