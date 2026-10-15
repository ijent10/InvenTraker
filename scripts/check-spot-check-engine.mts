import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { EngineError } from "../src/lib/engines/contracts.ts"
import { executeSpotCheck, planSpotCheck, spotCheckCommandSchema, spotCheckFingerprint, spotCheckPayloadSchema, spotCheckRequestSchema, spotCheckResponseSchema, type SpotCheckCommand, type SpotCheckRepository } from "../src/lib/engines/inventory/spot-check.ts"

const now = "2026-10-15T02:30:00.000Z"
const principal = { uid: "owner", organizationId: "org", permissions: ["inventory.edit"], isManager: false }
const line = { itemId: "cheese", expectedRevision: 2, frontStock: 2, backStock: 10, reason: "Physical count" }
const command: SpotCheckCommand = { commandId: randomUUID(), actorId: "owner", organizationId: "org", locationId: "store", payload: { lines: [line] } }
const item = { id: "cheese", storeId: "store", name: "Cheese", frontStock: 5, backStock: 8, revision: 2, unit: "pounds", expires: true }
const batches = [
  { id: "first", itemId: "cheese", storeId: "store", area: "front", remainingQuantity: 3, expirationDate: "2026-10-16" },
  { id: "later", itemId: "cheese", storeId: "store", area: "front", remainingQuantity: 2, expirationDate: "2026-10-18" },
  { id: "back", itemId: "cheese", storeId: "store", area: "back", remainingQuantity: 8 },
  { id: "foreign", itemId: "cheese", storeId: "other", area: "front", remainingQuantity: 100 },
  { id: "different", itemId: "other-item", storeId: "store", area: "front", remainingQuantity: 100 }
]
const plan = planSpotCheck(command, line, item, batches, 0)
assert.deepEqual(plan.after, { frontStock: 2, backStock: 10, onHand: 12, revision: 3 })
assert.deepEqual(plan.areas[0].allocations, [{ batchId: "first", quantity: 3, remainingQuantity: 0 }])
assert.equal(plan.areas[1].addedUnknownQuantity, 2)
assert.equal(plan.areas[0].addedUnknownQuantity, 0)
assert.throws(() => planSpotCheck(command, line, item, [...batches, { id: "invalid", itemId: "cheese", storeId: "store", area: "front", remainingQuantity: Infinity }], 0), (error) => error instanceof EngineError && error.code === "invalid_batch_balance")
assert.equal(planSpotCheck(command, { ...line, frontStock: 0 }, item, batches, 0).areas[0].allocations.length, 2)
assert.throws(() => planSpotCheck(command, { ...line, expectedRevision: 1 }, item, batches, 0), (error) => error instanceof EngineError && error.code === "stale_count")
assert.throws(() => planSpotCheck(command, line, { ...item, storeId: "other" }, batches, 0), (error) => error instanceof EngineError && error.status === 403)
for (const frontStock of [-1, Infinity, NaN, 0.0001, 1.2345]) assert.equal(spotCheckPayloadSchema.safeParse({ lines: [{ ...line, frontStock }] }).success, false)
assert.equal(spotCheckPayloadSchema.safeParse({ lines: [line, line] }).success, false)
assert.equal(spotCheckPayloadSchema.safeParse({ lines: Array.from({ length: 478 }, (_, index) => ({ ...line, itemId: `item-${index}` })) }).success, false)
assert.equal(spotCheckRequestSchema.safeParse({ commandId: command.commandId, locationId: "store", payload: { lines: [line] }, actorId: "spoof" }).success, false)
const two = { ...command, payload: { lines: [line, { ...line, itemId: "other-item" }] } }
assert.equal(spotCheckFingerprint(two), spotCheckFingerprint({ ...two, payload: { lines: [...two.payload.lines].reverse() } }))

let existing: Record<string, unknown> | undefined
let writes = 0
let entered = 0
let authorized = 0
const repository: SpotCheckRepository = { runTransaction: async (work) => { entered++; return work({ readOperation: async () => existing, readItems: async () => [item], readBatches: async () => batches, write: (input, plans, response, fingerprint) => { writes++; existing = { operationType: "spot_check", storeId: "store", actor: { uid: "owner" }, commandFingerprint: fingerprint, engineResult: { requestId: response.requestId, schemaVersion: "1", committedAt: response.committedAt, replayed: false }, result: response.data } } }) } }
const authorize = async () => { authorized++ }
const first = await executeSpotCheck(command, principal, repository, authorize, () => now)
assert.equal(first.data.updated[0].name, "Cheese", "mobile compatibility preserves inventory fields")
assert.equal((await executeSpotCheck(command, principal, repository, authorize)).replayed, true)
assert.equal(writes, 1)
assert.equal(authorized, 2, "replays recheck active store authorization")
for (const changed of [{ ...line, frontStock: 1 }, { ...line, reason: "Different reason" }, { ...line, expectedRevision: 3 }, { ...line, expirationDate: "2026-12-01T00:00:00.000Z" }]) await assert.rejects(() => executeSpotCheck({ ...command, payload: { lines: [changed] } }, principal, repository, authorize), (error) => error instanceof EngineError && error.code === "operation_conflict")
const beforeDenied = entered
for (const denied of [{ ...principal, uid: "other" }, { ...principal, organizationId: "other" }, { ...principal, permissions: [] }]) await assert.rejects(() => executeSpotCheck(command, denied, repository, authorize), (error) => error instanceof EngineError && error.status === 403)
await assert.rejects(() => executeSpotCheck(command, principal, repository, async () => { throw new EngineError("Denied", 403, "store_access_denied") }), EngineError)
assert.equal(entered, beforeDenied)
existing = { operationType: "spot_check", storeId: "store", actor: { uid: "owner" }, createdAt: now, result: first.data, changes: [{ itemId: "cheese", before: plan.before, after: plan.after, reason: plan.reason }] }
assert.equal((await executeSpotCheck(command, principal, repository, authorize)).replayed, true)
await assert.rejects(() => executeSpotCheck({ ...command, payload: { lines: [{ ...line, backStock: 11 }] } }, principal, repository, authorize), (error) => error instanceof EngineError && error.code === "operation_conflict")
assert.equal(writes, 1)
existing = undefined
const staleRepository: SpotCheckRepository = { runTransaction: async (work) => work({ readOperation: async () => undefined, readItems: async () => [item, { ...item, id: "other-item", revision: 3 }], readBatches: async () => batches, write: () => { throw new Error("A partially stale count must not write") } }) }
await assert.rejects(() => executeSpotCheck(two, principal, staleRepository, authorize), (error) => error instanceof EngineError && error.code === "stale_count")
const largeRepository: SpotCheckRepository = { runTransaction: async (work) => work({ readOperation: async () => undefined, readItems: async () => [item], readBatches: async () => Array.from({ length: 480 }, (_, index) => ({ id: `batch-${index}`, itemId: "cheese", storeId: "store", area: "front", remainingQuantity: 1 })), write: () => { throw new Error("Oversized batch changes must not write") } }) }
await assert.rejects(() => executeSpotCheck({ ...command, payload: { lines: [{ ...line, frontStock: 0, backStock: 0 }] } }, principal, largeRepository, authorize), (error) => error instanceof EngineError && error.code === "count_too_large")
const fixture = JSON.parse(readFileSync(new URL("../fixtures/engine-contracts/spot-check-v1.json", import.meta.url), "utf8"))
spotCheckRequestSchema.parse(fixture.request)
spotCheckResponseSchema.parse(fixture.response)
assert.deepEqual(fixture.response.data, fixture.mobileResponse.data)
console.log("Spot-check engine checks passed: revision conflicts, batch reconciliation, scoped sources, precision, retries, legacy replay, permissions, atomic multi-item validation and response fixtures.")
