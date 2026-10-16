import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { EngineError } from "../src/lib/engines/contracts.ts"
import { executeDiscard, planDiscard, discardPayloadSchema, discardResponseSchema, type DiscardCommand, type DiscardRepository } from "../src/lib/engines/inventory/discard.ts"

const now = "2026-10-15T12:00:00.000Z"
const principal = { uid: "owner", organizationId: "org", permissions: ["inventory.edit"], isManager: false }
const command: DiscardCommand = { commandId: randomUUID(), actorId: "owner", organizationId: "org", locationId: "store", payload: { lines: [{ itemId: "cheese", area: "front", quantity: 3, reason: "Damaged" }, { itemId: "cheese", area: "back", quantity: 1, reason: "Expired", batchId: "later" }] } }
const item = { id: "cheese", storeId: "store", name: "Cheese", unit: "pounds", frontStock: 6, backStock: 5, revision: 2, par: 8 }
const batches = [
  { id: "floor", itemId: "cheese", storeId: "store", area: "front", remainingQuantity: 2, expirationDate: "2026-10-16" },
  { id: "early", itemId: "cheese", storeId: "store", area: "back", remainingQuantity: 2, expirationDate: "2026-10-16" },
  { id: "later", itemId: "cheese", storeId: "store", area: "back", remainingQuantity: 3, expirationDate: "2026-10-20" },
  { id: "foreign", itemId: "cheese", storeId: "other", area: "front", remainingQuantity: 200 }
]
const errorCode = (code: string) => (error: unknown) => error instanceof EngineError && error.code === code
const plan = planDiscard(command, item, batches)
assert.deepEqual(plan.after, { frontStock: 3, backStock: 4, onHand: 7, revision: 3 })
assert.equal(plan.lines[0].allocation.unallocatedQuantity, 1)
assert.equal(plan.lines[0].remainingUnknown, 3)
assert.equal(plan.lines[1].allocation.allocations[0].batchId, "later")
assert.equal(plan.lines[1].remainingUnknown, 0)
const fractional = planDiscard({ ...command, payload: { lines: [{ itemId: "cheese", area: "front", quantity: 0.3, reason: "Damaged" }, { itemId: "cheese", area: "back", quantity: 0.6, reason: "Expired" }] } }, { ...item, frontStock: 0.3, backStock: 0.6 }, [])
assert.equal(fractional.after.onHand, 0, "full fractional discard must not fail from floating point subtraction")
const automatic = planDiscard({ ...command, payload: { lines: [{ itemId: "cheese", area: "back", quantity: 4, reason: "Expired" }] } }, item, batches)
assert.deepEqual(automatic.lines[0].allocation.allocations.map((entry) => entry.batchId), ["early", "later"])
assert.equal(planDiscard({ ...command, payload: { lines: [command.payload.lines[0]] } }, item, []).lines[0].remainingUnknown, 3)
assert.throws(() => planDiscard(command, { ...item, frontStock: 2 }, batches), errorCode("insufficient_stock"))
assert.throws(() => planDiscard(command, { ...item, storeId: "other" }, batches), errorCode("store_access_denied"))
assert.throws(() => planDiscard(command, item, batches.filter((batch) => batch.id !== "later")), errorCode("batch_unavailable"))
assert.throws(() => planDiscard(command, item, [...batches, { id: "excess", itemId: "cheese", storeId: "store", area: "back", remainingQuantity: 1 }]), errorCode("batch_balance_mismatch"))
assert.throws(() => planDiscard(command, item, [{ ...batches[0], remainingQuantity: NaN }]), errorCode("invalid_batch_balance"))
assert.throws(() => planDiscard(command, item, [{ ...batches[0], area: "unknown" }]), errorCode("invalid_batch_area"))
for (const quantity of [0, -1, Infinity, 1.2345]) assert.equal(discardPayloadSchema.safeParse({ lines: [{ ...command.payload.lines[0], quantity }] }).success, false)
assert.equal(discardPayloadSchema.safeParse({ lines: [command.payload.lines[0], command.payload.lines[0]] }).success, false)
assert.equal(discardPayloadSchema.safeParse({ lines: [{ ...command.payload.lines[0], reason: "   " }] }).success, false)
let existing: Record<string, unknown> | undefined
let writes = 0, entered = 0, authorized = 0, batchReads = 0
let legacyRecords = command.payload.lines.map((line, index) => ({ ...line, id: `${command.commandId}-${index + 1}`, operationId: command.commandId, storeId: "store", userId: "owner", selectedBatchId: line.batchId ?? null }))
const repository: DiscardRepository = { runTransaction: async (work) => { entered++; return work({ readOperation: async () => existing, readItems: async () => [item], readBatches: async () => { batchReads++; return batches }, readWaste: async () => legacyRecords, write: (_, plans, response, fingerprint) => { writes++; assert.equal(plans.length, 1); existing = { operationType: "waste", storeId: "store", actor: { uid: "owner" }, commandFingerprint: fingerprint, engineResult: { requestId: response.requestId, schemaVersion: "1", committedAt: response.committedAt, replayed: false }, result: response.data } } }) } }
const authorize = async () => { authorized++ }
const first = await executeDiscard(command, principal, repository, authorize, () => now)
const repeat = await executeDiscard(command, principal, repository, authorize)
assert.equal(repeat.replayed, true); assert.deepEqual(repeat.data, first.data); assert.equal(writes, 1); assert.equal(batchReads, 1); assert.equal(authorized, 2)
for (const line of [{ ...command.payload.lines[0], reason: "Different" }, { ...command.payload.lines[0], quantity: 2 }]) await assert.rejects(() => executeDiscard({ ...command, payload: { lines: [line, command.payload.lines[1]] } }, principal, repository, authorize), errorCode("operation_conflict"))
const deniedBefore = entered
for (const denied of [{ ...principal, uid: "other" }, { ...principal, organizationId: "other" }, { ...principal, permissions: [] }]) await assert.rejects(() => executeDiscard(command, denied, repository, authorize), (error) => error instanceof EngineError && error.status === 403)
await assert.rejects(() => executeDiscard(command, principal, repository, async () => { throw new EngineError("Denied", 403, "store_access_denied") }), errorCode("store_access_denied"))
assert.equal(entered, deniedBefore)
existing = { operationType: "waste", storeId: "store", actor: { uid: "owner" }, createdAt: now, result: first.data }
assert.equal((await executeDiscard(command, principal, repository, authorize)).replayed, true)
legacyRecords = legacyRecords.map((record) => ({ ...record, reason: "Changed" }))
await assert.rejects(() => executeDiscard(command, principal, repository, authorize), errorCode("operation_conflict"))
existing = undefined
const fragmented = Array.from({ length: 478 }, (_, index) => ({ id: `batch-${index}`, itemId: "cheese", storeId: "store", area: "front", remainingQuantity: 0.001 }))
const oversized: DiscardRepository = { runTransaction: (work) => work({ readOperation: async () => undefined, readItems: async () => [{ ...item, frontStock: 0.478 }], readBatches: async () => fragmented, readWaste: async () => [], write: () => { throw new Error("Oversized transaction must not write") } }) }
await assert.rejects(() => executeDiscard({ ...command, payload: { lines: [{ itemId: "cheese", quantity: 0.478, area: "front", reason: "Expired" }] } }, principal, oversized, authorize), errorCode("discard_too_large"))
const fixture = JSON.parse(readFileSync(new URL("../fixtures/engine-contracts/discard-v1.json", import.meta.url), "utf8"))
discardResponseSchema.parse(fixture.response); assert.deepEqual(fixture.response.data, fixture.mobileResponse.data)
console.log("Discard checks passed: two-area conservation, expiry/preferred allocation, missing batch coverage, invalid balances, permission scope, replay conflicts, legacy verification and transaction limits.")
