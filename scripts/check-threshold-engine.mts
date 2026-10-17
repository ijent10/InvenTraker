import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { EngineError } from "../src/lib/engines/contracts.ts"
import { executeThresholdChange, planThresholdChange, thresholdPayloadSchema, thresholdResponseSchema, type ThresholdCommand, type ThresholdRepository } from "../src/lib/engines/inventory/threshold.ts"

const principal = { uid: "owner", organizationId: "org", permissions: ["inventory.edit"], isManager: false }
const now = "2026-10-17T12:00:00.000Z"
const command: ThresholdCommand = { commandId: randomUUID(), actorId: "owner", organizationId: "org", locationId: "store", payload: { itemId: "cheese", expectedRevision: 3, par: 10.125, reorderPoint: 5, reason: "Updated demand" } }
const item = { id: "cheese", storeId: "store", name: "Cheese", unit: "pounds", frontStock: 2, backStock: 3, onHand: 5, revision: 3, par: 8, reorderPoint: 2, orgProductId: "product" }
const code = (value: string) => (error: unknown) => error instanceof EngineError && error.code === value
const plan = planThresholdChange(command, item)
assert.deepEqual(plan.stock, { frontStock: 2, backStock: 3, onHand: 5, revision: 3 })
assert.deepEqual(plan.change.after, { par: 10.125, reorderPoint: 5, revision: 4 })
assert.equal(plan.status, "Low"); assert.equal(plan.orgProductId, "product")
assert.equal(planThresholdChange(command, { ...item, status: "Archived" }).status, "Archived")
assert.equal(planThresholdChange({ ...command, payload: { ...command.payload, reorderPoint: 4.999 } }, item).status, "Active")
assert.equal(planThresholdChange(command, { ...item, orgProductId: "" }).orgProductId, null)
assert.throws(() => planThresholdChange(command, { ...item, storeId: "other" }), code("store_access_denied"))
assert.throws(() => planThresholdChange(command, { ...item, revision: 4 }), code("stale_inventory"))
assert.throws(() => planThresholdChange(command, { ...item, backStock: NaN }), code("invalid_stock_balance"))
assert.throws(() => planThresholdChange(command, { ...item, reorderPoint: -1 }), code("invalid_inventory_policy"))
assert.throws(() => planThresholdChange(command, { ...item, orgProductId: "invalid/path" }), code("invalid_product_link"))
for (const value of [-1, Infinity, 0.0001, 1_000_000_001]) for (const field of ["par", "reorderPoint"]) assert.equal(thresholdPayloadSchema.safeParse({ ...command.payload, [field]: value }).success, false)
assert.equal(thresholdPayloadSchema.safeParse({ ...command.payload, par: 0, reorderPoint: 0 }).success, true)
assert.equal(thresholdPayloadSchema.safeParse({ ...command.payload, reason: "  " }).success, false)
// Keep existing policy flexibility: a reorder point above par is not silently changed.
assert.equal(thresholdPayloadSchema.parse({ ...command.payload, par: 0, reorderPoint: 5 }).reorderPoint, 5)
let existing: Record<string, unknown> | undefined
let writes = 0, reads = 0, entered = 0, authorized = 0
const repository: ThresholdRepository = { runTransaction: async (work) => { entered++; return work({ readOperation: async () => existing, readItem: async () => { reads++; return item }, write: (_, plan, response, fingerprint) => { writes++; assert.equal(plan.stock.onHand, 5); existing = { operationType: "par_change", storeId: "store", actor: { uid: "owner" }, commandFingerprint: fingerprint, engineResult: { requestId: response.requestId, schemaVersion: "1", committedAt: response.committedAt, replayed: false }, result: response.data } } }) } }
const authorize = async () => { authorized++ }
const first = await executeThresholdChange(command, principal, repository, authorize, () => now)
const repeated = await executeThresholdChange(command, principal, repository, authorize)
assert.equal(first.data.revision, 4); assert.equal(repeated.replayed, true); assert.deepEqual(first.data, repeated.data)
assert.equal(writes, 1); assert.equal(reads, 1); assert.equal(authorized, 2)
for (const payload of [{ ...command.payload, reason: "Changed" }, { ...command.payload, par: 11 }, { ...command.payload, reorderPoint: 1 }, { ...command.payload, expectedRevision: 4 }]) await assert.rejects(() => executeThresholdChange({ ...command, payload }, principal, repository, authorize), code("operation_conflict"))
const deniedBefore = entered
for (const denied of [{ ...principal, uid: "other" }, { ...principal, organizationId: "other" }, { ...principal, permissions: [] }]) await assert.rejects(() => executeThresholdChange(command, denied, repository, authorize), (error) => error instanceof EngineError && error.status === 403)
await assert.rejects(() => executeThresholdChange(command, principal, repository, async () => { throw new EngineError("Denied", 403, "store_access_denied") }), code("store_access_denied"))
assert.equal(entered, deniedBefore)
existing = { operationType: "par_change", storeId: "store", actor: { uid: "owner" }, createdAt: now, result: first.data, changes: [plan.change] }
assert.equal((await executeThresholdChange(command, principal, repository, authorize)).replayed, true)
existing = { ...existing, changes: [{ ...plan.change, reason: "Different reason" }] }
await assert.rejects(() => executeThresholdChange(command, principal, repository, authorize), code("operation_conflict"))
existing = undefined
const staleRepository: ThresholdRepository = { runTransaction: (work) => work({ readOperation: async () => undefined, readItem: async () => ({ ...item, revision: 4 }), write: () => { throw new Error("Stale changes must not write") } }) }
await assert.rejects(() => executeThresholdChange(command, principal, staleRepository, authorize), code("stale_inventory"))
const fixture = JSON.parse(readFileSync(new URL("../fixtures/engine-contracts/threshold-v1.json", import.meta.url), "utf8"))
thresholdResponseSchema.parse(fixture.response); assert.deepEqual(fixture.response.data, fixture.mobileResponse.data)
console.log("Threshold checks passed: unchanged stock, canonical targets, status boundaries, revision conflicts, product links, permission scope, retry conflicts and verified historical replay.")
