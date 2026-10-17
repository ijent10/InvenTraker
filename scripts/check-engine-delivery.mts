import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { stockCommittedEvent } from "../src/lib/engines/contracts.ts"
import { consumeWorkspaceEvent, DeliveryError, deliveryFailure, eventDocumentId, nextWorkspaceRevision, validateStockEvent, verifyMovement, workspaceCursorId } from "../src/lib/engines/events/workspace-consumer.ts"
const operationId = randomUUID(), now = Date.now()
let event = stockCommittedEvent({ operationId, organizationId: "org", storeId: "store", operationType: "transfer", itemIds: ["item"], occurredAt: new Date(now).toISOString() })
let id = eventDocumentId("org", event.eventId)
let movement = { operationId, storeId: "store", operationType: "transfer", changes: [{ itemId: "item" }] }
assert.equal(validateStockEvent(id, event).eventId, event.eventId)
assert.throws(() => validateStockEvent("other", event), DeliveryError)
for (const change of [{ organizationId: "other" }, { locationId: "other", payload: { ...event.payload, movementRef: "wrong" } }, { sourceEngine: "assistant" }, { aggregateId: "wrong" }, { eventType: "unknown" }, { payload: { ...event.payload, itemIds: ["item", "item"] } }]) assert.throws(() => validateStockEvent(id, { ...event, ...change }), DeliveryError)
assert.throws(() => verifyMovement(event, { ...movement, storeId: "other" }), DeliveryError)
assert.throws(() => verifyMovement(event, { ...movement, changes: [{ itemId: "other" }] }), DeliveryError)
assert.throws(() => verifyMovement(event, undefined), /movement_unavailable/)
assert.notEqual(workspaceCursorId("a:b", "c"), workspaceCursorId("a", "b:c"))
assert.notEqual(workspaceCursorId("org", "store"), workspaceCursorId("other", "store"))
for (const bad of [-1, 1.5, "1", NaN, Number.MAX_SAFE_INTEGER]) assert.throws(() => nextWorkspaceRevision(bad))
assert.equal(nextWorkspaceRevision(undefined), 1)
assert.deepEqual(deliveryFailure(0, now, false), { attempts: 1, status: "pending", nextAttemptAt: now + 30_000 })
assert.equal(deliveryFailure(5, now, false).status, "dead_letter")
assert.equal(deliveryFailure(0, now, true).status, "dead_letter")
let record: Record<string, unknown> = { event, status: "pending", attempts: 0, nextAttemptAt: now }, cursor = 0, receipt = false
async function deliver(fail = false) {
  const pending = structuredClone(record), previousCursor = cursor, previousReceipt = receipt
  try {
    return await consumeWorkspaceEvent(id, {
      readOutbox: async () => pending,
      readMovement: async () => movement,
      readReceipt: async () => previousReceipt,
      readCursor: async () => previousCursor ? { revision: previousCursor } : undefined,
      complete: (_event, revision, attempts) => { if (fail) throw new Error("injected_transaction_failure"); record = { ...pending, status: "delivered", attempts }; if (revision !== null) { cursor = revision; receipt = true } }
    }, now)
  } catch (error) { record = pending; cursor = previousCursor; receipt = previousReceipt; throw error }
}
await assert.rejects(deliver(true), /injected_transaction_failure/); assert.equal(cursor, 0); assert.equal(receipt, false); assert.equal(record.status, "pending")
assert.equal(await deliver(), "delivered"); assert.equal(cursor, 1); assert.equal(receipt, true)
assert.equal(await deliver(), "skipped"); assert.equal(cursor, 1)
record.status = "pending"; assert.equal(await deliver(), "replayed"); assert.equal(cursor, 1)
record.status = "pending"; record.nextAttemptAt = now + 1; assert.equal(await deliver(), "skipped")
record.nextAttemptAt = "bad"; await assert.rejects(deliver(), DeliveryError)
// Delivery order is deliberately independent of the event's occurredAt timestamp.
event = stockCommittedEvent({ operationId: randomUUID(), organizationId: "org", storeId: "store", operationType: "transfer", itemIds: ["item"], occurredAt: "2020-01-01T00:00:00.000Z" })
id = eventDocumentId("org", event.eventId); movement = { ...movement, operationId: event.aggregateId }
record = { event, status: "pending", attempts: 0, nextAttemptAt: now }; receipt = false
assert.equal(await deliver(), "delivered"); assert.equal(cursor, 2)
console.log("Engine delivery passed: canonical event/ledger scope, collision-free keys, receipt idempotency, transaction failure, due-time gating, bounded retries/dead letters and out-of-order invalidation.")
