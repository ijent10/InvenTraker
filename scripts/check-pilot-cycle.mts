import assert from "node:assert/strict"

import { allocateBatches } from "../src/lib/batch-allocation.ts"
import { applyOrderReceipt, assertOrderTransition } from "../src/lib/order-contract.ts"
import { recommendOrder } from "../src/lib/ordering-engine.ts"
import { nextStockState, stockState } from "../src/lib/stock-quantities.ts"
import { generateTodayIssues, operationalObservability, reconcileIssueRecords } from "../src/lib/today-issues.ts"

const now = new Date("2026-10-01T12:00:00Z")
const item = { id: "pilot-item", storeId: "pilot-store", name: "Pilot milk", sku: "PILOT-MILK", vendor: "Pilot Dairy", unit: "eaches", onHand: 10, frontStock: 4, backStock: 6, par: 20, reorderPoint: 6, expires: true, updatedAt: now.toISOString(), lastCountedAt: now.toISOString() }
let stock = stockState({ frontStock: item.frontStock, backStock: item.backStock, revision: 1 })
let batches = [{ id: "opening", itemId: item.id, storeId: item.storeId, remainingQuantity: 10, expirationDate: "2026-10-10T12:00:00Z", receivedAt: "2026-10-01T10:00:00Z" }]

const waste = allocateBatches(batches, 2)
batches = batches.map((batch) => batch.id === waste.allocations[0].batchId ? { ...batch, remainingQuantity: waste.allocations[0].remainingQuantity } : batch)
stock = nextStockState(stock, stock.frontStock - 2, stock.backStock)
assert.equal(stock.onHand, 8)

const recommendation = recommendOrder({
  storeId: item.storeId,
  vendor: { id: "pilot-vendor", name: item.vendor, minimumAmount: 0, leadTimeDays: 1, coverageDays: 2, catalog: [item.sku], expectedArrival: "2026-10-03" },
  inventory: [{ ...item, onHand: stock.onHand }], batches, openOrders: [], costs: [{ sku: item.sku, name: item.name, unitCost: 3 }], generatedAt: now.toISOString()
})
assert.equal(recommendation.lines[0].suggestedQuantity, 12)
assertOrderTransition("Draft", "Approved")
assertOrderTransition("Approved", "Submitted")

let orderLines: Array<Record<string, unknown>> = [{ id: "pilot-line", itemId: item.id, sku: item.sku, quantity: 12, finalQuantity: 12, suggestedQuantity: 12, receivedQuantity: 0 }]
const committedOperations = new Set<string>()
function receiveWithRetry(operationId: string, quantity: number) {
  if (committedOperations.has(operationId)) return
  const receipt = applyOrderReceipt(orderLines, "pilot-line", item.id, quantity)
  orderLines = receipt.lines
  stock = nextStockState(stock, stock.frontStock, stock.backStock + quantity)
  batches.push({ id: operationId, itemId: item.id, storeId: item.storeId, remainingQuantity: quantity, expirationDate: "2026-10-12T12:00:00Z", receivedAt: now.toISOString() })
  committedOperations.add(operationId)
}

receiveWithRetry("receipt-10", 10)
receiveWithRetry("receipt-10", 10)
assert.equal(stock.onHand, 18, "a retried receipt after connection loss must add stock once")
assert.equal(orderLines[0].receivedQuantity, 10)
assert.equal(Number(orderLines[0].finalQuantity) - Number(orderLines[0].receivedQuantity), 2)
receiveWithRetry("receipt-2", 2)
assert.equal(stock.onHand, 20)
assert.equal(orderLines[0].receivedQuantity, 12)
assertOrderTransition("Received", "Reconciled")

const discrepancyOperation = { id: "variance", operationId: "variance", storeId: item.storeId, operationType: "spot_check", createdAt: "2026-10-01T12:30:00Z", changes: [{ itemId: item.id, itemName: item.name, delta: { onHand: -3 } }] }
const discrepancyIssues = generateTodayIssues({ storeId: item.storeId, inventory: [{ ...item, onHand: stock.onHand }], batches, orders: [], stockOperations: [discrepancyOperation], now: new Date("2026-10-01T13:00:00Z") })
assert(discrepancyIssues.some((issue) => issue.type === "count_variance"))
const verifiedOperation = { id: "verified", operationId: "verified", storeId: item.storeId, operationType: "spot_check", createdAt: "2026-10-01T13:15:00Z", changes: [{ itemId: item.id, itemName: item.name, delta: { onHand: 0 } }] }
const clearedIssues = generateTodayIssues({ storeId: item.storeId, inventory: [{ ...item, onHand: stock.onHand, lastCountedAt: "2026-10-01T13:15:00Z" }], batches, orders: [], stockOperations: [discrepancyOperation, verifiedOperation], now: new Date("2026-10-01T13:20:00Z") })
const lifecycle = reconcileIssueRecords(discrepancyIssues, clearedIssues, "2026-10-01T13:20:00Z")
assert(lifecycle.some((issue) => issue.id === `variance:${item.storeId}:${item.id}` && issue.status === "resolved"))

const monitor = operationalObservability({ inventory: [{ ...item, onHand: stock.onHand }], batches, orders: [{ id: "pilot-order", lines: orderLines }], stockOperations: [discrepancyOperation, verifiedOperation] })
assert.equal(monitor.balanceMismatches, 0)
assert.equal(monitor.duplicateOperationIds, 0)

console.log("Pilot cycle passed: count → waste → order → partial receipt → retry → full receipt → reconciliation → discrepancy resolution.")
