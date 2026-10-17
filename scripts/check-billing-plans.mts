import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { billingPlans, quoteBilling, usageFromRecords } from "../src/lib/billing/plans.ts"
import { subscriptionState } from "../src/lib/billing/subscription-state.ts"
const catalog = JSON.parse(readFileSync(new URL("../src/lib/billing/stripe-sandbox-catalog.json", import.meta.url), "utf8"))
const usage = { stores: [{ id: "A" }, { id: "B" }], employees: [11, 35].flatMap((count, index) => Array.from({ length: count }, (_, employee) => ({ id: `${index}-${employee}`, storeIds: [index ? "B" : "A"], primaryStoreId: index ? "B" : "A" }))) }
assert.equal(quoteBilling("builder", usage).totalCents, 24999)
assert.equal(quoteBilling("basic", usage).totalCents, 17799)
assert.equal(quoteBilling("pro", usage).totalCents, 20999)
for (const tier of ["builder", "basic", "pro"] as const) {
  const plan = billingPlans[tier]
  assert.equal(quoteBilling(tier, { stores: [{ id: "A" }], employees: [] }).totalCents, plan.baseCents)
  assert.equal(quoteBilling(tier, usage).fingerprint, quoteBilling(tier, { stores: [...usage.stores].reverse(), employees: [...usage.employees].reverse() }).fingerprint)
}
assert.equal(billingPlans.builder.features.files, false); assert.equal(billingPlans.basic.features.files, true); assert.equal(billingPlans.basic.features.branding, false); assert.equal(billingPlans.pro.features.branding, true)
assert.notEqual(quoteBilling("builder", usage).fingerprint, quoteBilling("basic", usage).fingerprint)
assert.notEqual(quoteBilling("builder", usage).fingerprint, quoteBilling("builder", { ...usage, employees: usage.employees.slice(1) }).fingerprint)
const records = usageFromRecords([{ id: "A" }, { id: "retired", status: "Archived" }], [{ id: "owner", role: "owner", status: "Active" }, { id: "pending", status: "Invite sent" }, { id: "suspended", status: "Suspended" }, { id: "active", status: "Active", storeId: "A" }])
assert.equal(records.stores.length, 1); assert.equal(records.employees.length, 1)
assert.equal(records.employees[0].primaryStoreId, "A")
assert.throws(() => quoteBilling("builder", { stores: [{ id: "A" }], employees: [{ id: "missing", storeIds: [] }] }))
assert.throws(() => usageFromRecords([{ id: "A" }], [{ id: "bad", storeId: "removed" }]))
assert.equal(new Set(Object.values(catalog.prices).flatMap((prices) => Object.values(prices as object))).size, 9)
assert.equal(catalog.livemode, false)
const snapshot = { id: "sub_test", customer: "cus_test", status: "active", items: { data: [{ price: { id: catalog.prices.pro.base }, quantity: 1, current_period_end: 1_800_000_000 }, { price: { id: catalog.prices.pro.employee }, quantity: 3 }] }, latest_invoice: { status: "paid", amount_due: 20599 } }
assert.equal(subscriptionState(snapshot, catalog.prices).features.branding, true)
assert.equal(subscriptionState(snapshot, catalog.prices).quantities.employee, 3)
for (const status of ["past_due", "unpaid", "canceled", "incomplete", "paused"]) assert.equal(subscriptionState({ ...snapshot, status }, catalog.prices).paidAccess, false)
assert.equal(subscriptionState({ ...snapshot, status: "trialing", latest_invoice: null }, catalog.prices).paidAccess, true)
assert.equal(subscriptionState({ ...snapshot, latest_invoice: { status: "open", amount_due: 19999 } }, catalog.prices).paidAccess, false)
assert.equal(subscriptionState({ ...snapshot, cancel_at_period_end: true }, catalog.prices).paidAccess, true)
assert.throws(() => subscriptionState({ ...snapshot, items: { data: [...snapshot.items.data, snapshot.items.data[0]] } }, catalog.prices))
assert.throws(() => subscriptionState({ ...snapshot, items: { data: [{ price: { id: catalog.prices.pro.base }, quantity: 2 }] } }, catalog.prices))
assert.throws(() => subscriptionState({ ...snapshot, items: { data: [{ price: { id: catalog.prices.builder.base }, quantity: 1 }, { price: { id: catalog.prices.pro.employee }, quantity: 2 }] } }, catalog.prices))
console.log("Billing plans passed: all approved prices/allowances, primary-only seats, exact cents, stable quote fingerprints, active-member snapshots, nine sandbox price IDs, paid/trial/failed states and plan isolation.")
