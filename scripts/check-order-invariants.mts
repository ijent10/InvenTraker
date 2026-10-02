import assert from "node:assert/strict"

import { applyOrderReceipt, assertOrderTransition, calculateOrderTotal, validateOrderLines } from "../src/lib/order-contract.ts"
import { recommendOrder } from "../src/lib/ordering-engine.ts"

const baseItem = {
  id: "milk", name: "Milk", sku: "MILK-1", storeId: "store-1", vendor: "Dairy", unit: "eaches",
  onHand: 10, par: 20, reorderPoint: 8, expires: true, quantityInCase: 1, updatedAt: "2026-10-01T12:00:00Z"
}
const vendor = { id: "dairy", name: "Dairy", minimumAmount: 100, leadTimeDays: 2, coverageDays: 3, catalog: ["MILK-1"], expectedArrival: "2026-10-04" }

const covered = recommendOrder({
  storeId: "store-1", vendor, inventory: [baseItem],
  batches: [{ id: "usable", itemId: "milk", remainingQuantity: 10, expirationDate: "2026-10-10" }],
  openOrders: [{ id: "incoming", storeId: "store-1", status: "Submitted", lines: [{ sku: "MILK-1", quantity: 10 }] }],
  costs: [{ sku: "MILK-1", name: "Milk", unitCost: 4 }], generatedAt: "2026-10-01T12:00:00Z"
})
assert.equal(covered.lines[0].suggestedQuantity, 0, "sufficient usable and confirmed incoming stock must yield zero")

const draftDoesNotCount = recommendOrder({
  storeId: "store-1", vendor, inventory: [baseItem],
  batches: [{ id: "usable", itemId: "milk", remainingQuantity: 10, expirationDate: "2026-10-10" }],
  openOrders: [{ id: "draft", storeId: "store-1", status: "Draft", lines: [{ sku: "MILK-1", quantity: 10 }] }],
  costs: [{ sku: "MILK-1", name: "Milk", unitCost: 4 }], generatedAt: "2026-10-01T12:00:00Z"
})
assert.equal(draftDoesNotCount.lines[0].suggestedQuantity, 10, "an unapproved draft must not count as confirmed incoming")

const approvedButUnsent = recommendOrder({
  storeId: "store-1", vendor, inventory: [baseItem],
  batches: [{ id: "usable", itemId: "milk", remainingQuantity: 10, expirationDate: "2026-10-10" }],
  openOrders: [{ id: "approved", storeId: "store-1", status: "Approved", lines: [{ sku: "MILK-1", quantity: 10 }] }],
  costs: [{ sku: "MILK-1", name: "Milk", unitCost: 4 }], generatedAt: "2026-10-01T12:00:00Z"
})
assert.equal(approvedButUnsent.lines[0].suggestedQuantity, 10, "approval alone must not imply vendor transmission or incoming stock")

const caseOrder = recommendOrder({
  storeId: "store-1", vendor: { ...vendor, catalog: ["CASE-1"] },
  inventory: [{ ...baseItem, id: "case", sku: "CASE-1", name: "Case item", onHand: 0, par: 24, expires: false, quantityInCase: 12 }],
  batches: [], openOrders: [], costs: [{ sku: "CASE-1", name: "Case item", unitCost: 30 }], generatedAt: "2026-10-01T12:00:00Z"
})
assert.equal(caseOrder.lines[0].suggestedQuantity, 2)
assert.equal(caseOrder.lines[0].stockUnitsPerOrderUnit, 12, "case conversion must remain explicit")

const expiration = recommendOrder({
  storeId: "store-1", vendor, inventory: [{ ...baseItem, onHand: 10, par: 10 }],
  batches: [{ id: "expired", itemId: "milk", remainingQuantity: 4, expirationDate: "2026-09-30" }, { id: "good", itemId: "milk", remainingQuantity: 6, expirationDate: "2026-10-10" }],
  openOrders: [], costs: [{ sku: "MILK-1", name: "Milk", unitCost: 4 }], generatedAt: "2026-10-01T12:00:00Z"
})
assert.equal(expiration.lines[0].suggestedQuantity, 4, "expired stock must be excluded exactly once")

const expiresBeforeDelivery = recommendOrder({
  storeId: "store-1", vendor, inventory: [{ ...baseItem, onHand: 10, par: 10 }],
  batches: [{ id: "too-soon", itemId: "milk", remainingQuantity: 4, expirationDate: "2026-10-03" }, { id: "good", itemId: "milk", remainingQuantity: 6, expirationDate: "2026-10-10" }],
  openOrders: [], costs: [{ sku: "MILK-1", name: "Milk", unitCost: 4 }], generatedAt: "2026-10-01T12:00:00Z"
})
assert.equal(expiresBeforeDelivery.lines[0].suggestedQuantity, 4, "stock expiring by delivery must be excluded once from usable stock")

const partial = applyOrderReceipt([{ id: "line", itemId: "milk", quantity: 12, finalQuantity: 12, receivedQuantity: 0 }], "line", "milk", 10)
assert.equal(partial.status, "Partially received")
assert.equal(partial.lines[0].receivedQuantity, 10)
const complete = applyOrderReceipt(partial.lines, "line", "milk", 2)
assert.equal(complete.status, "Received")
assert.equal(complete.lines[0].receivedQuantity, 12, "receiving 10 of 12 must leave 2 outstanding and then close at 12")
assert.throws(() => applyOrderReceipt(complete.lines, "line", "milk", 1), /greater than/)

assert.doesNotThrow(() => assertOrderTransition("Draft", "Approved"))
assert.doesNotThrow(() => assertOrderTransition("Approved", "Submitted"))
assert.throws(() => assertOrderTransition("Draft", "Submitted"), /cannot move/)
assert.equal(calculateOrderTotal([{ finalQuantity: 2, unitCostAmount: 3.5 }]), 7)
assert.throws(() => validateOrderLines([{ id: "x", itemName: "Milk", sku: "MILK-1", vendorOffered: true, suggestedQuantity: 2, finalQuantity: 3 }]), /Explain/)

console.log("Order invariants passed.")
