import assert from "node:assert/strict"

import {
  canonicalStockQuantity,
  derivedStockStatus,
  nextStockState,
  normalizeStockQuantity,
  stockState
} from "../src/lib/stock-quantities.ts"
import { allocateBatches, reconcileBatchTotal, summarizeBatchAvailability } from "../src/lib/batch-allocation.ts"

const counted = nextStockState(stockState({ frontStock: 0, backStock: 0, revision: 0 }), 4, 6)
const received = nextStockState(counted, counted.frontStock, counted.backStock + 5)
const wasted = nextStockState(received, received.frontStock - 2, received.backStock)
assert.equal(wasted.onHand, 13, "count 10 + receipt 5 - waste 2 must equal 13")
assert.equal(wasted.revision, 3, "each committed operation must advance the revision once")

const transferred = nextStockState(wasted, wasted.frontStock + 3, wasted.backStock - 3)
assert.equal(transferred.onHand, wasted.onHand, "front/back transfers must preserve total stock")
assert.equal(canonicalStockQuantity(2, 12), 24, "case conversion must produce canonical units")
assert.equal(normalizeStockQuantity(1.23456), 1.235, "stock quantities use three decimal places")
assert.equal(derivedStockStatus({ reorderPoint: 13 }, wasted), "Low")
assert.equal(derivedStockStatus({ reorderPoint: 12 }, wasted), "Active")
assert.throws(() => normalizeStockQuantity(-1), RangeError)
assert.throws(() => canonicalStockQuantity(1, 0), RangeError)

const batchAllocation = allocateBatches([
  { id: "later", remainingQuantity: 12, expirationDate: "2026-10-08" },
  { id: "first", remainingQuantity: 6, expirationDate: "2026-10-02" }
], 8)
assert.deepEqual(batchAllocation.allocations, [
  { batchId: "first", quantity: 6, remainingQuantity: 0 },
  { batchId: "later", quantity: 2, remainingQuantity: 10 }
], "waste must consume the earliest-expiring batch first")
assert.equal(batchAllocation.unallocatedQuantity, 0)

const legacyAllocation = allocateBatches([], 2)
assert.equal(legacyAllocation.unallocatedQuantity, 2, "legacy stock without batches must stay explicitly unallocated")

const reconciled = reconcileBatchTotal([
  { id: "tomorrow", remainingQuantity: 6, expirationDate: "2026-10-02" },
  { id: "next-week", remainingQuantity: 12, expirationDate: "2026-10-08" }
], 16)
assert.deepEqual(reconciled.allocations, [{ batchId: "tomorrow", quantity: 2, remainingQuantity: 4 }])
assert.equal(reconciled.addedUnknownQuantity, 0, "a lower count must reduce dated batches instead of creating unknown stock")

const openingBalance = reconcileBatchTotal([], 10)
assert.equal(openingBalance.addedUnknownQuantity, 10, "a count without batch detail must create an explicit unknown batch")

const preservedReceipt = [
  { id: "tomorrow", remainingQuantity: 6, expirationDate: "2026-10-02" },
  { id: "next-week", remainingQuantity: 12, expirationDate: "2026-10-08" }
]
assert.deepEqual(preservedReceipt.map((batch) => batch.remainingQuantity), [6, 12], "receiving must preserve two expiration batches")
const firstWaste = allocateBatches(preservedReceipt, 2)
assert.deepEqual(firstWaste.allocations, [{ batchId: "tomorrow", quantity: 2, remainingQuantity: 4 }], "waste 2 must leave the received batches at 4 and 12")

const humanOverride = allocateBatches(preservedReceipt, 2, "next-week")
assert.deepEqual(humanOverride.allocations, [{ batchId: "next-week", quantity: 2, remainingQuantity: 10 }], "a recorded human override must select the requested batch first")

const availability = summarizeBatchAvailability([
  { id: "expired", remainingQuantity: 2, expirationDate: "2026-09-30" },
  { id: "soon", remainingQuantity: 4, expirationDate: "2026-10-02" },
  { id: "later", remainingQuantity: 12, expirationDate: "2026-10-08" },
  { id: "unknown", remainingQuantity: 3, expirationDate: null }
], "2026-10-01T15:00:00.000Z", "Oct 3, 2026")
assert.deepEqual(availability, { totalPhysical: 21, usableDated: 16, expired: 2, unknownExpiration: 3, expiringBeforeDelivery: 4 }, "availability must expose expired, usable, unknown, and delivery-risk quantities separately")

console.log("Stock invariants passed.")
