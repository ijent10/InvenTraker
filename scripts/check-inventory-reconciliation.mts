import assert from "node:assert/strict"
import { reconcileInventory, type ReconciliationReport } from "../src/lib/engines/inventory/reconciliation.ts"
const stock = (frontStock: number, backStock: number, revision: number) => ({ frontStock, backStock, onHand: frontStock + backStock, revision })
const state = stock(3, 7, 1)
const item = { id: "item", name: "Test cheese", storeId: "store", ...state, par: 10, reorderPoint: 2 }
const movement = { id: "op", storeId: "store", operationType: "receive", changes: [{ itemId: "item", before: stock(0, 0, 0), after: state, delta: { frontStock: 3, backStock: 7, onHand: 10 } }] }
function fixture() { return { storeId: "store", inventory: { records: [structuredClone(item)] as Record<string, unknown>[] & { id: string }[], partial: false }, batches: { records: [{ id: "front", storeId: "store", itemId: "item", area: "front", remainingQuantity: 3, status: "available" }, { id: "back", storeId: "store", itemId: "item", area: "back", remainingQuantity: 7, status: "available" }] as (Record<string, unknown> & { id: string })[], partial: false }, operations: { records: [structuredClone(movement)] as (Record<string, unknown> & { id: string })[], partial: false } } }
function check(change: (data: ReturnType<typeof fixture>) => void, code: string) { const data = fixture(); change(data); const report = reconcileInventory(data); assert.ok(report.issues.some(issue => issue.code === code), code); assert.notEqual(report.status, "balanced"); return report }
const original = fixture(), copy = structuredClone(original)
assert.equal(reconcileInventory(original).status, "balanced"); assert.deepEqual(original, copy, "Review must not mutate its snapshot")
check(d => d.inventory.records[0].onHand = 999, "stock_balance")
check(d => d.inventory.records[0].frontStock = -1, "stock_balance")
check(d => d.inventory.records[0].revision = 1.5, "invalid_revision")
check(d => d.inventory.records[0].frontStock = 0.0001, "stock_balance")
check(d => d.batches.records[0].remainingQuantity = 4, "batch_excess")
check(d => d.batches.records[0].remainingQuantity = 2, "batch_untracked")
check(d => d.batches.records[0].remainingQuantity = NaN, "invalid_batch")
check(d => d.batches.records[0].area = "elsewhere", "invalid_batch")
check(d => d.batches.records[0].status = "depleted", "batch_status")
check(d => d.batches.records[0].itemId = "missing", "orphan_batch")
check(d => d.operations.records[0].changes = [], "invalid_movement")
check(d => (d.operations.records[0].changes as typeof movement.changes)[0].after.revision = 2, "invalid_movement")
check(d => (d.operations.records[0].changes as typeof movement.changes)[0].delta.onHand = 4, "movement_balance")
check(d => d.operations.records.push({ ...structuredClone(movement), id: "duplicate" }), "duplicate_revision")
check(d => d.inventory.records[0].revision = 2, "history_revision")
check(d => { d.inventory.records[0].frontStock = 4; d.inventory.records[0].onHand = 11 }, "ledger_drift")
check(d => d.operations.records = [], "history_unverified")
check(d => d.operations.records[0].operationType = "unknown", "unknown_movement")
const partial = fixture(); partial.batches.partial = true; partial.batches.records = []; const partialReport = reconcileInventory(partial); assert.equal(partialReport.status, "incomplete"); assert.ok(!partialReport.issues.some(x => x.code === "batch_untracked"), "Truncated batches must not imply missing batch coverage")
const outside = fixture(); outside.batches.records[0].storeId = "other"; assert.throws(() => reconcileInventory(outside), /outside/)
const policy = { id: "policy", storeId: "store", operationType: "par_change", changes: [{ itemId: "item", before: { par: 10, reorderPoint: 2, revision: 1 }, after: { par: 12, reorderPoint: 3, revision: 2 } }] }
const withPolicy = fixture(); withPolicy.inventory.records[0] = { ...item, revision: 2, par: 12, reorderPoint: 3 }; withPolicy.operations.records.push(policy); assert.equal(reconcileInventory(withPolicy).status, "balanced", "Target changes preserve physical baseline")
withPolicy.inventory.records[0].par = 99; assert.ok(reconcileInventory(withPolicy).issues.some(x => x.code === "policy_drift"))
const onlyPolicy = fixture(); onlyPolicy.inventory.records[0].revision = 2; onlyPolicy.operations.records = [policy]; assert.ok(reconcileInventory(onlyPolicy).issues.some(x => x.code === "history_unverified"))
const discontinuity = fixture(); discontinuity.inventory.records[0] = { ...item, revision: 3, par: 12, reorderPoint: 3 }; discontinuity.operations.records.push(policy, { ...structuredClone(movement), id: "third", changes: [{ itemId: "item", before: stock(2, 7, 2), after: stock(3, 7, 3), delta: { frontStock: 1, backStock: 0, onHand: 1 } }] }); assert.ok(reconcileInventory(discontinuity).issues.some(x => x.code === "history_discontinuity"), "Policy changes must not hide balance discontinuity")
const gap = structuredClone(discontinuity); (gap.operations.records[2].changes as typeof movement.changes)[0].before.revision = 4; (gap.operations.records[2].changes as typeof movement.changes)[0].after.revision = 5; assert.ok(reconcileInventory(gap).issues.some(x => x.code === "history_gap"))
for (const operationType of ["spot_check", "restock", "waste", "receive", "transfer", "portion"]) { const d = fixture(); d.operations.records[0].operationType = operationType; assert.equal(reconcileInventory(d).status, "balanced") }
console.log("Inventory reconciliation passed: stock/batch balance, movement continuity, policy revisions, duplicate/gap detection, tenant guard, partial coverage, all stock movement types and no input mutation.")
