import assert from "node:assert/strict"

import { generateTodayIssues, operationalObservability, reconcileIssueRecords } from "../src/lib/today-issues.ts"

const now = new Date("2026-10-01T12:00:00Z")
const inventory = [{ id: "milk", storeId: "store-1", name: "Milk", sku: "MILK", unit: "eaches", onHand: 2, par: 10, reorderPoint: 4, expires: true, updatedAt: "2026-10-01T11:00:00Z", lastCountedAt: "2026-09-20T12:00:00Z" }]
const batches = [
  { id: "soon", itemId: "milk", storeId: "store-1", remainingQuantity: 2, expirationDate: "2026-10-02T23:00:00Z", receivedAt: "2026-09-29T12:00:00Z" }
]

const baseIssues = generateTodayIssues({ storeId: "store-1", inventory, batches, orders: [], stockOperations: [], now })
assert(baseIssues.some((issue) => issue.id === "stockout:store-1:milk"), "stockout risk must be generated")
assert(baseIssues.some((issue) => issue.id === "expiry:store-1:milk"), "imminent expiration must be generated")
assert(baseIssues.some((issue) => issue.id === "count:store-1:milk"), "overdue count must be generated")

const protectedByIncoming = generateTodayIssues({
  storeId: "store-1", inventory, batches,
  orders: [{ id: "sent", storeId: "store-1", status: "Submitted", expectedArrival: "2026-10-02", lines: [{ itemId: "milk", sku: "MILK", finalQuantity: 10, receivedQuantity: 0 }] }],
  stockOperations: [], now
})
assert(!protectedByIncoming.some((issue) => issue.type === "stockout_risk"), "confirmed incoming must suppress a resolved stockout risk")

const draftIsNotIncoming = generateTodayIssues({
  storeId: "store-1", inventory, batches,
  orders: [{ id: "draft", storeId: "store-1", status: "Draft", dueAt: "2026-10-01T16:00:00Z", lines: [{ itemId: "milk", sku: "MILK", finalQuantity: 10 }] }],
  stockOperations: [], now
})
assert(draftIsNotIncoming.some((issue) => issue.type === "stockout_risk"), "draft stock must not suppress risk")
assert(draftIsNotIncoming.some((issue) => issue.id === "cutoff:store-1:draft"), "near order cutoff must be actionable")

const varianceIssues = generateTodayIssues({
  storeId: "store-1", inventory, batches, orders: [],
  stockOperations: [{ id: "count-op", operationId: "count-op", storeId: "store-1", operationType: "spot_check", createdAt: "2026-10-01T11:30:00Z", changes: [{ itemId: "milk", itemName: "Milk", delta: { onHand: -5 } }] }], now
})
assert(varianceIssues.some((issue) => issue.id === "variance:store-1:milk"), "recent count variance must remain open for review")

const reconciled = reconcileIssueRecords(baseIssues, protectedByIncoming, now.toISOString())
assert(reconciled.some((issue) => issue.id === "stockout:store-1:milk" && issue.status === "resolved"), "issues must resolve when their underlying condition clears")
assert.equal(new Set(baseIssues.map((issue) => issue.id)).size, baseIssues.length, "issue IDs must deduplicate repeated signals")

const monitor = operationalObservability({
  inventory, batches: [],
  orders: [{ id: "order", lines: [{ quantity: 3, finalQuantity: 3, suggestedQuantity: 2, overrideReason: "Manager adjusted for event" }] }],
  stockOperations: [{ id: "one", operationId: "same" }, { id: "two", operationId: "same" }]
})
assert.equal(monitor.balanceMismatches, 1)
assert.equal(monitor.duplicateOperationIds, 1)
assert.equal(monitor.managerOverrides, 1)

console.log("Today issue invariants passed.")
