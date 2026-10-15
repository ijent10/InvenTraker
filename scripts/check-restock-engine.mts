import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { EngineError } from "../src/lib/engines/contracts.ts"
import { executeRestock, planRestock, restockEngineRequestSchema, restockPayloadSchema, restockResponseSchema, type RestockCommand, type RestockRepository } from "../src/lib/engines/inventory/restock.ts"

const now = "2026-10-15T12:00:00.000Z"
const principal = { uid: "owner", organizationId: "org", permissions: ["inventory.edit"], isManager: false }
const line = { itemId: "cheese", countedFrontStock: 2, expectedRevision: 3 }
const command: RestockCommand = { commandId: randomUUID(), actorId: "owner", organizationId: "org", locationId: "store", payload: { commit: true, lines: [line] } }
const item = { id: "cheese", name: "Cheese", storeId: "store", frontStock: 4, backStock: 8, revision: 3, par: 7 }
const batches = [
  { id: "front", itemId: "cheese", storeId: "store", area: "front", remainingQuantity: 4, expirationDate: "2026-10-20" },
  { id: "first", itemId: "cheese", storeId: "store", area: "back", remainingQuantity: 3, expirationDate: "2026-10-16" },
  { id: "later", itemId: "cheese", storeId: "store", area: "back", remainingQuantity: 5, expirationDate: "2026-10-19" },
  { id: "foreign", itemId: "cheese", storeId: "other", area: "back", remainingQuantity: 100 }
]
const plan = planRestock(command, line, item, batches, 0)
assert.equal(plan.recommendation.pullQuantity, 5)
assert.deepEqual(plan.after, { frontStock: 7, backStock: 3, onHand: 10, revision: 4 }, "count variance changes total; the pull itself conserves counted stock")
assert.deepEqual(plan.reconciliation.allocations, [{ batchId: "front", quantity: 2, remainingQuantity: 2 }])
assert.equal(plan.moves[0].source.id, "first")
assert.equal(plan.moves[0].allocation.quantity, 3)
assert.equal(plan.moves[1].allocation.quantity, 2)
assert.equal(planRestock(command, line, item, [], 0).allocation.unallocatedQuantity, 5)
assert.equal(planRestock(command, line, item, [], 0).remainingUnknownBack, 3)
assert.throws(() => planRestock(command, line, item, [{ id: "invalid-area", itemId: "cheese", storeId: "store", area: "unknown", remainingQuantity: 1 }], 0), (error) => error instanceof EngineError && error.code === "invalid_batch_area")
assert.equal(planRestock(command, { ...line, countedFrontStock: 9 }, item, batches, 0).recommendation.pullQuantity, 0)
assert.equal(planRestock(command, line, { ...item, backStock: 0 }, [], 0).recommendation.pullQuantity, 0)
assert.equal(planRestock(command, line, { ...item, frontCapacity: 4 }, batches, 0).recommendation.pullQuantity, 2)
assert.throws(() => planRestock(command, { ...line, expectedRevision: 2 }, item, batches, 0), (error) => error instanceof EngineError && error.code === "stale_count")
assert.throws(() => planRestock(command, line, item, [...batches, { id: "excess", itemId: "cheese", storeId: "store", area: "back", remainingQuantity: 1 }], 0), (error) => error instanceof EngineError && error.code === "batch_balance_mismatch")
assert.throws(() => planRestock(command, line, { ...item, par: Infinity }, batches, 0), (error) => error instanceof EngineError && error.code === "invalid_restock_target")
assert.equal(restockEngineRequestSchema.safeParse({ commandId: command.commandId, locationId: "store", payload: { commit: true, lines: [{ itemId: "cheese", countedFrontStock: 2 }] } }).success, false)
assert.equal(restockPayloadSchema.safeParse({ lines: [line, line], commit: false }).success, false)
for (const count of [-1, Infinity, 1.2345]) assert.equal(restockPayloadSchema.safeParse({ lines: [{ ...line, countedFrontStock: count }] }).success, false)
let existing: Record<string, unknown> | undefined
let writes = 0
let batchReads = 0
let entered = 0
let authorized = 0
const repository: RestockRepository = { runTransaction: async (work) => { entered++; return work({ readOperation: async () => existing, readItems: async () => [item], readBatches: async () => { batchReads++; return batches }, write: (input, plans, response, fingerprint) => { writes++; existing = { operationType: "restock", storeId: "store", actor: { uid: "owner" }, commandFingerprint: fingerprint, engineResult: { requestId: response.requestId, schemaVersion: "1", committedAt: response.committedAt, replayed: false }, result: response.data } } }) } }
const authorize = async () => { authorized++ }
const preview = await executeRestock({ ...command, payload: { ...command.payload, commit: false } }, principal, repository, authorize, () => now)
assert.equal(preview.data.committed, false)
assert.ok("generatedAt" in preview && !("committedAt" in preview))
assert.equal(writes, 0); assert.equal(batchReads, 0)
const first = await executeRestock(command, principal, repository, authorize, () => now)
const repeated = await executeRestock(command, principal, repository, authorize)
assert.ok("replayed" in repeated && repeated.replayed)
assert.deepEqual(repeated.data, first.data)
assert.equal(writes, 1)
assert.equal(authorized, 3)
await assert.rejects(() => executeRestock({ ...command, payload: { ...command.payload, lines: [{ ...line, countedFrontStock: 1 }] } }, principal, repository, authorize), (error) => error instanceof EngineError && error.code === "operation_conflict")
const beforeDenied = entered
for (const denied of [{ ...principal, uid: "other" }, { ...principal, organizationId: "other" }, { ...principal, permissions: [] }]) await assert.rejects(() => executeRestock(command, denied, repository, authorize), (error) => error instanceof EngineError && error.status === 403)
assert.equal(entered, beforeDenied)
existing = { operationType: "restock", storeId: "store", actor: { uid: "owner" }, createdAt: now, result: first.data }
const legacy = await executeRestock(command, principal, repository, authorize)
assert.ok("replayed" in legacy && legacy.replayed)
assert.equal(writes, 1)
const fixture = JSON.parse(readFileSync(new URL("../fixtures/engine-contracts/restock-v1.json", import.meta.url), "utf8"))
restockResponseSchema.parse(fixture.response); restockResponseSchema.parse(fixture.preview)
assert.deepEqual(fixture.response.data, fixture.mobileResponse.data)
console.log("Restock checks passed: pull bounds, count variance, batch order/coverage, stale revisions, read-only previews, permission scope, idempotency, legacy replay and fixtures.")
