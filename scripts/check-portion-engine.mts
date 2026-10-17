import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { EngineError } from "../src/lib/engines/contracts.ts"
import { executePortion, planPortion, portionPayloadSchema, portionResponseSchema, type PortionCommand, type PortionRepository } from "../src/lib/engines/inventory/portion.ts"

const principal = { uid: "owner", organizationId: "org", permissions: ["inventory.edit"], isManager: false }
const now = "2026-10-16T12:00:00.000Z"
const command: PortionCommand = { commandId: randomUUID(), actorId: "owner", organizationId: "org", locationId: "store", payload: { itemId: "cheese", sourceArea: "back", portionWeight: 0.75, portionCount: 4, packageBarcodePrefix: "CHEESE" } }
const item = { id: "cheese", name: "Cheese", storeId: "store", unit: "pounds", frontStock: 2, backStock: 5, revision: 3 }
const batches = [
  { id: "first", itemId: "cheese", storeId: "store", area: "back", remainingQuantity: 1, expirationDate: "2026-10-20", receivedAt: "2026-10-10T12:00:00.000Z" },
  { id: "later", itemId: "cheese", storeId: "store", area: "back", remainingQuantity: 3, expirationDate: "2026-10-25", receivedAt: "2026-10-11T12:00:00.000Z" },
  { id: "foreign", itemId: "cheese", storeId: "other", area: "back", remainingQuantity: 100 }
]
const code = (value: string) => (error: unknown) => error instanceof EngineError && error.code === value
const plan = planPortion(command, item, batches)
assert.deepEqual(plan.after, { frontStock: 2, backStock: 5, onHand: 7, revision: 4 })
assert.equal(plan.totalWeight, 3); assert.equal(plan.remainingUnknown, 1)
assert.equal(plan.expirationDate, "2026-10-20"); assert.equal(plan.expirationSource, "inherited")
assert.equal(plan.receivedAt, "2026-10-10T12:00:00.000Z")
assert.deepEqual(plan.packages[0].sourceAllocations, [{ batchId: "first", quantity: 0.75 }])
assert.deepEqual(plan.packages[1].sourceAllocations, [{ batchId: "first", quantity: 0.25 }, { batchId: "later", quantity: 0.5 }])
for (const entry of plan.packages) assert.equal(entry.sourceAllocations.reduce((sum, source) => sum + source.quantity, entry.untrackedQuantity), 0.75)
assert.notEqual(plan.packages[0].packageBarcode, planPortion({ ...command, commandId: randomUUID() }, item, batches).packages[0].packageBarcode)
const allUnknown = planPortion(command, item, [])
assert.equal(allUnknown.expirationDate, null); assert.equal(allUnknown.remainingUnknown, 2)
assert.equal(allUnknown.packages.reduce((sum, entry) => sum + entry.untrackedQuantity, 0), 3)
const mixed = planPortion({ ...command, payload: { ...command.payload, portionCount: 6 } }, item, batches)
assert.equal(mixed.allocation.unallocatedQuantity, 0.5); assert.equal(mixed.expirationDate, null); assert.equal(mixed.earliestSourceExpiration, "2026-10-20")
assert.throws(() => planPortion({ ...command, payload: { ...command.payload, expirationDate: "2026-10-21" } }, item, batches), code("expiration_exceeds_source"))
assert.equal(planPortion({ ...command, payload: { ...command.payload, expirationDate: "2026-10-19" } }, item, batches).expirationSource, "manual")
assert.throws(() => planPortion({ ...command, payload: { ...command.payload, sourceBatchId: "first" } }, item, batches), code("batch_quantity_unavailable"))
assert.throws(() => planPortion({ ...command, payload: { ...command.payload, sourceBatchId: "missing" } }, item, batches), code("batch_unavailable"))
assert.throws(() => planPortion(command, { ...item, unit: "eaches" }, batches), code("item_not_weighable"))
assert.throws(() => planPortion(command, { ...item, backStock: 2 }, []), code("insufficient_stock"))
assert.throws(() => planPortion(command, { ...item, storeId: "other" }, batches), code("store_access_denied"))
assert.throws(() => planPortion(command, item, [{ ...batches[0], remainingQuantity: 6 }]), code("batch_balance_mismatch"))
for (const remainingQuantity of [NaN, -1, 0.0004]) assert.throws(() => planPortion(command, item, [{ ...batches[0], remainingQuantity }]), code("invalid_batch_balance"))
assert.throws(() => planPortion(command, item, [{ ...batches[0], expirationDate: "bad date" }]), code("invalid_batch_expiration"))
assert.throws(() => planPortion(command, item, [{ ...batches[0], area: "unknown" }]), code("invalid_batch_area"))
for (const portionWeight of [0, -1, Infinity, 0.0004, 1.2345]) assert.equal(portionPayloadSchema.safeParse({ ...command.payload, portionWeight }).success, false)
for (const expirationDate of ["bad", "2026-02-30", "2026-13-01"]) assert.equal(portionPayloadSchema.safeParse({ ...command.payload, expirationDate }).success, false)
assert.equal(portionPayloadSchema.safeParse({ ...command.payload, portionCount: 201 }).success, false)
const fractional = planPortion({ ...command, payload: { ...command.payload, portionWeight: 0.001, portionCount: 200 } }, { ...item, backStock: 0.2 }, [])
assert.equal(fractional.totalWeight, 0.2)
assert.equal(fractional.packages.length, 200)
let existing: Record<string, unknown> | undefined
let writes = 0, entered = 0, batchReads = 0, authorized = 0
let historicalPortion: Record<string, unknown> = { id: command.commandId, operationId: command.commandId, itemId: "cheese", storeId: "store", sourceArea: "back", sourceBatchId: null, portionCount: 4, portionWeight: 0.75, expirationDate: null, createdBy: "owner" }
const repository: PortionRepository = { runTransaction: async (work) => { entered++; return work({ readOperation: async () => existing, readItem: async () => item, readBatches: async () => { batchReads++; return batches }, readPortion: async () => historicalPortion as typeof item, readPackages: async (ids) => ids.map((id, index) => ({ id, itemId: "cheese", storeId: "store", sourceOperationId: command.commandId, packageBarcode: `CHEESE-${String(index + 1).padStart(3, "0")}` })), write: (_, plan, response, fingerprint) => { writes++; assert.equal(plan.after.revision, 4); existing = { operationType: "portion", storeId: "store", actor: { uid: "owner" }, commandFingerprint: fingerprint, engineResult: { requestId: response.requestId, schemaVersion: "1", committedAt: response.committedAt, replayed: false }, result: response.data } } }) } }
const authorize = async () => { authorized++ }
const first = await executePortion(command, principal, repository, authorize, () => now)
const repeated = await executePortion(command, principal, repository, authorize)
assert.equal(repeated.replayed, true); assert.deepEqual(repeated.data, first.data); assert.equal(writes, 1); assert.equal(batchReads, 1); assert.equal(authorized, 2)
for (const payload of [{ ...command.payload, portionWeight: 1 }, { ...command.payload, packageBarcodePrefix: "OTHER" }, { ...command.payload, expirationDate: "2026-10-19" }]) await assert.rejects(() => executePortion({ ...command, payload }, principal, repository, authorize), code("operation_conflict"))
const deniedBefore = entered
for (const denied of [{ ...principal, uid: "other" }, { ...principal, organizationId: "other" }, { ...principal, permissions: [] }]) await assert.rejects(() => executePortion(command, denied, repository, authorize), (error) => error instanceof EngineError && error.status === 403)
await assert.rejects(() => executePortion(command, principal, repository, async () => { throw new EngineError("Denied", 403, "store_access_denied") }), code("store_access_denied"))
assert.equal(entered, deniedBefore)
existing = { operationType: "portion", storeId: "store", actor: { uid: "owner" }, createdAt: now, result: first.data }
assert.equal((await executePortion(command, principal, repository, authorize)).replayed, true)
historicalPortion = { ...historicalPortion, sourceArea: "front" }
await assert.rejects(() => executePortion(command, principal, repository, authorize), code("operation_conflict"))
const fragmented = Array.from({ length: 300 }, (_, index) => ({ id: `batch-${index}`, itemId: "cheese", storeId: "store", area: "back", remainingQuantity: 0.001 }))
assert.throws(() => planPortion({ ...command, payload: { ...command.payload, portionWeight: 0.002, portionCount: 200 } }, item, fragmented), code("portion_too_large"))
const fixture = JSON.parse(readFileSync(new URL("../fixtures/engine-contracts/portion-v1.json", import.meta.url), "utf8"))
portionResponseSchema.parse(fixture.response); assert.deepEqual(fixture.response.data, fixture.mobileResponse.data)
console.log("Portion checks passed: stock conservation, revision advance, per-package lineage, fractional precision, expiry inheritance/limits, strict batch selection, retry conflicts, verified historical replay, permissions and write limits.")
