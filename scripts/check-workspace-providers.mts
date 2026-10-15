import assert from "node:assert/strict"
import { buildWorkspaceSummaries, requiredWorkspaceSources, selectWorkspaceCandidates, workspaceEngines, workspaceProviders, type SourceResult, type WorkspaceSource } from "../src/lib/workspace-providers.ts"

const now = "2026-10-14T16:00:00.000Z"
const sources = Object.fromEntries(requiredWorkspaceSources(() => true).map((name) => [name, { records: [], partial: false }])) as Record<WorkspaceSource, SourceResult>
sources.inventory.records = [
  { id: "b", name: "Low stock", onHand: 2, reorderPoint: 5 },
  { id: "a", name: "Empty shelf", onHand: 0, reorderPoint: 5 },
  { id: "c", name: "Archived", status: "Archived", onHand: 0, reorderPoint: 5 },
  { id: "d", name: "Missing balances" }
]
sources.inventoryBatches.records = [{ id: "batch", remainingQuantity: 3, expirationDate: "2026-10-13" }, { id: "gone", remainingQuantity: 0, expirationDate: "2026-10-13" }, { id: "later", remainingQuantity: 1, expirationDate: "2027-01-01" }]
sources.stockOperations.records = [{ operationType: "spot_check" }, { operationType: "transfer" }, { operationType: "restock" }]
sources.orders.records = [{ id: "order", status: "Ready" }, { id: "received", status: "Received" }]
sources.healthChecks.records = [{ id: "health", name: "Opening check", status: "Overdue" }]
let summaries = buildWorkspaceSummaries(sources, () => true, now)
assert.equal(summaries.inventory.value, "3")
assert.equal(summaries["low-stock"].value, "2")
assert.equal(summaries.expiration.value, "1")
assert.equal(summaries.orders.value, "1")
for (const id of ["spot-check", "restocks", "transfers"]) assert.equal(summaries[id].value, "1")
assert.equal(summaries.receiving.state, "empty")
assert.equal(summaries.assistant.candidates.length, 5)
const widget = { engineId: "inventory", size: "large", mode: "automatic" } as const
const selected = selectWorkspaceCandidates(summaries.inventory.candidates, widget, now)
assert.equal(selected[0].title, "Empty shelf", "critical candidates outrank lower priority items")
assert.equal(selectWorkspaceCandidates([...summaries.inventory.candidates].reverse(), widget, now)[0].id, selected[0].id)
assert.equal(selectWorkspaceCandidates(summaries.inventory.candidates, { ...widget, engineId: "orders" }, now).length, 0)
assert.equal(selectWorkspaceCandidates(summaries.inventory.candidates, { ...widget, mode: "fixed" }, now).length, 0)
assert.equal(selectWorkspaceCandidates(summaries.inventory.candidates, { ...widget, mode: "pinned", pinnedContentId: "missing" }, now).length, 0)
assert.equal(selectWorkspaceCandidates(summaries.inventory.candidates, { ...widget, mode: "pinned", pinnedContentId: selected[1].id }, now)[0].id, selected[1].id)
assert.equal(selectWorkspaceCandidates(summaries.inventory.candidates, widget, "2026-10-14T16:03:00.000Z").length, 0)
const onlyAssistant = (permission: string) => permission === "ai.use"
assert.deepEqual(requiredWorkspaceSources(onlyAssistant), [])
assert.deepEqual(requiredWorkspaceSources(() => true, ["inventory"]), ["inventory"])
assert.deepEqual(requiredWorkspaceSources(() => true, ["notes"]), [])
assert.deepEqual(new Set(requiredWorkspaceSources(() => true, ["assistant"])), new Set(["inventory", "inventoryBatches", "orders", "healthChecks"]))
const restricted = buildWorkspaceSummaries(sources, onlyAssistant, now)
assert.equal(restricted.inventory.state, "permission-denied")
assert.equal(restricted.assistant.candidates.length, 0, "AI permission must not expose unauthorized engine context")
assert.equal(restricted.assistant.value, "0")
sources.orders.failed = true
sources.inventory.partial = true
summaries = buildWorkspaceSummaries(sources, () => true, now)
assert.equal(summaries.orders.state, "engine-unavailable")
assert.equal(summaries.health.state, "loaded", "one provider failure does not blank unrelated engines")
assert.equal(summaries.insights.partial, true)
assert.match(summaries.inventory.detail, /loaded records only/)
assert.deepEqual(new Set(workspaceEngines), new Set(["inventory", "spot-check", "restock", "receiving", "discards", "transfers", "production", "orders", "health-checks", "assistant", "insights"]))
assert.equal(Object.keys(workspaceProviders).length, 14)
console.log("Workspace provider checks passed: permissions, source isolation, factual summaries, bounded counts, expiry, ranking, modes, failure isolation.")
