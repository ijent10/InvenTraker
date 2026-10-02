import assert from "node:assert/strict"
import { privacyFilterAssistantValue } from "../src/lib/ai/privacy.ts"
import { inventrakerProductAdapter } from "../src/lib/intelligence/inventraker-product-adapter.ts"
import { evaluateDemandBaseline, runOperationalTool } from "../src/lib/operational-intelligence.ts"

const now = new Date("2026-10-01T12:00:00.000Z")
const data = {
  storeId: "store-a", itemId: "milk", now,
  inventory: [{ id: "milk", storeId: "store-a", name: "Whole Milk", onHand: 0, frontStock: 0, backStock: 0, par: 12, updatedAt: "2026-10-01T11:00:00Z", actor: { uid: "secret", email: "person@example.com" } }, { id: "other", storeId: "store-b", onHand: 99 }],
  stockOperations: [
    { id: "count-1", storeId: "store-a", operationType: "spot_check", createdAt: "2026-09-30T15:00:00Z", actor: { uid: "secret", name: "Private Person" }, changes: [{ itemId: "milk", itemName: "Whole Milk", before: { onHand: 5 }, after: { onHand: 2 }, delta: { onHand: -3 } }] },
    { id: "par-1", storeId: "store-a", operationType: "par_change", createdAt: "2026-09-29T15:00:00Z", changes: [{ itemId: "milk", before: { par: 8 }, after: { par: 12 } }] }
  ],
  waste: [{ id: "waste-1", storeId: "store-a", itemId: "milk", quantity: 2, createdAt: "2026-09-30T16:00:00Z", submittedBy: "secret" }],
  orders: [{ id: "order-1", storeId: "store-a", status: "Partially received", updatedAt: "2026-09-30T18:00:00Z", approvedBy: "secret", lines: [{ itemId: "milk", finalQuantity: 10, receivedQuantity: 6, unitCostAmount: 2.5 }] }],
  sales: [], portions: []
}

const explanation = runOperationalTool("runout_explanation", data)
assert.equal(explanation.status, "partial")
assert.equal((explanation.facts.currentBalance as { onHand: number }).onHand, 0)
assert.deepEqual(explanation.facts.deliveryShortages, [{ orderId: "order-1", ordered: 10, received: 6, shortage: 4 }])
assert.match(explanation.missingData.join(" "), /does not prove sales, waste, theft/i)
assert.ok(explanation.evidence.every((e) => e.sourceRef && e.href && e.observedAt))
assert.equal(JSON.stringify(explanation).includes("person@example.com"), false)
assert.equal(JSON.stringify(explanation).includes("Private Person"), false)
assert.equal(JSON.stringify(explanation).includes("store-b"), false)

const filtered = privacyFilterAssistantValue({ name: "Whole Milk", actor: { name: "Person" }, employee_id: "42", nested: { submittedBy: "u", value: 3 } }) as Record<string, unknown>
assert.equal(filtered.name, "Whole Milk")
assert.equal("actor" in filtered, false)
assert.equal("employee_id" in filtered, false)
assert.deepEqual(filtered.nested, { value: 3 })

assert.equal(inventrakerProductAdapter.mutationPolicy.mode, "draft_only")
assert.equal(inventrakerProductAdapter.draftAction({ label: "Review order", href: "/orders/1", reason: "shortage" }).executable, false)
assert.equal(evaluateDemandBaseline(Array.from({ length: 27 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, quantity: 2, source: "usage" as const }))).status, "insufficient_data")
const observations = Array.from({ length: 35 }, (_, i) => ({ date: new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10), quantity: (i % 7) + 1, source: "sale" as const }))
const baseline = evaluateDemandBaseline(observations)
assert.equal(baseline.status, "validated")
assert.equal(baseline.probability, null)
assert.equal(baseline.heldOutDays, 7)

console.log("Operational intelligence checks passed: scoped evidence, privacy, missing-data semantics, draft-only actions, and held-out baseline gating.")
