import assert from "node:assert/strict"
import { calculateBillingQuantities } from "../src/lib/billing/quantities.ts"
const input = { allowances: { includedStores: 2, includedEmployeesPerStore: 5 }, seatPolicy: "primary_store", stores: [{ id: "A" }, { id: "B" }, { id: "C" }], employees: [4, 8, 6].flatMap((count, index) => Array.from({ length: count }, (_, employee) => ({ id: `${index}-${employee}`, storeIds: [String.fromCharCode(65 + index)], primaryStoreId: String.fromCharCode(65 + index) }))) }
const result = calculateBillingQuantities(input)
assert.equal(result.baseQuantity, 1)
assert.equal(result.additionalStoreQuantity, 1)
assert.equal(result.additionalEmployeeQuantity, 4, "Unused employee allowances cannot be pooled across stores")
assert.deepEqual(result.stores.map((store) => store.additionalEmployees), [0, 3, 1])
const multiStore = { ...input, allowances: { includedStores: 2, includedEmployeesPerStore: 0 }, employees: [{ id: "shared", storeIds: ["A", "B"], primaryStoreId: "A" }] }
assert.equal(calculateBillingQuantities(multiStore).additionalEmployeeQuantity, 1)
assert.throws(() => calculateBillingQuantities({ ...multiStore, seatPolicy: "every_store" }))
assert.equal(calculateBillingQuantities({ ...input, employees: [] }).additionalEmployeeQuantity, 0)
assert.equal(calculateBillingQuantities({ ...input, stores: [], employees: [] }).additionalStoreQuantity, 0)
assert.equal(calculateBillingQuantities({ ...input, employees: [{ id: "unassigned", storeIds: [] }] }).unassignedEmployees, 1)
for (const changed of [
  { ...input, employees: [input.employees[0], input.employees[0]] },
  { ...input, stores: [input.stores[0], input.stores[0]] },
  { ...input, employees: [{ id: "e", storeIds: ["A", "A"], primaryStoreId: "A" }] },
  { ...input, employees: [{ id: "e", storeIds: ["missing"], primaryStoreId: "missing" }] },
  { ...input, employees: [{ id: "e", storeIds: ["A"], primaryStoreId: "B" }] },
  { ...input, employees: [{ id: "e", storeIds: ["A"] }] },
  { ...input, allowances: { includedStores: -1, includedEmployeesPerStore: 5 } }
]) assert.throws(() => calculateBillingQuantities(changed))
console.log("Billing quantity checks passed: included stores, per-store employee allowances, independent overages, primary-store-only accounting, missing assignments and duplicate rejection. No prices or charges created.")
