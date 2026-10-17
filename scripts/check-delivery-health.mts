import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { deliveryHealth, deliveryMonitorRow } from "../src/lib/engines/events/delivery-health.ts"
import { stockCommittedEvent } from "../src/lib/engines/contracts.ts"
import { eventDocumentId } from "../src/lib/engines/events/workspace-consumer.ts"
const now = Date.now(), healthy = { pending: 0, due: 0, unscheduled: 0, deadLetters: 0, oldestDueAt: null, lastSuccessAt: now - 60_000, lastFailureAt: null, now }
assert.equal(deliveryHealth(healthy), "healthy")
assert.equal(deliveryHealth({ ...healthy, lastSuccessAt: null }), "unknown")
assert.equal(deliveryHealth({ ...healthy, lastSuccessAt: now + 120_000 }), "unknown")
assert.equal(deliveryHealth({ ...healthy, lastSuccessAt: now - 180_001 }), "attention")
assert.equal(deliveryHealth({ ...healthy, lastFailureAt: now - 1 }), "attention")
assert.equal(deliveryHealth({ ...healthy, lastFailureAt: now - 120_000 }), "healthy")
for (const patch of [{ deadLetters: 1 }, { unscheduled: 1 }, { oldestDueAt: now - 300_001 }]) assert.equal(deliveryHealth({ ...healthy, ...patch }), "attention")
assert.equal(deliveryHealth({ ...healthy, pending: 10, due: 10, oldestDueAt: now - 1000 }), "healthy")
assert.equal(deliveryHealth({ ...healthy, pending: -1 }), "unknown")
const operationId = randomUUID(), event = stockCommittedEvent({ operationId, organizationId: "org", storeId: "store", operationType: "transfer", itemIds: ["item"], occurredAt: new Date(now).toISOString() })
const raw = { event, status: "dead_letter", attempts: 6, createdAt: now, nextAttemptAt: now, lastAttemptAt: now, lastErrorCode: "delivery_failed", actor: { email: "PRIVATE_EMAIL" }, result: "PRIVATE_RESULT", notes: "PRIVATE_NOTES" }
const row = deliveryMonitorRow(eventDocumentId("org", event.eventId), raw)
assert.equal(row.scope?.organizationId, "org"); assert.equal(row.scope?.operationId, operationId); assert.equal(row.attempts, 6)
assert.ok(!JSON.stringify(row).includes("PRIVATE_")); assert.ok(!JSON.stringify(row).includes('"item"'))
const invalid = deliveryMonitorRow("invalid-id", { ...raw, event: { ...event, organizationId: "SECRET_ORGANIZATION" }, lastErrorCode: "SECRET_MESSAGE", createdAt: NaN, attempts: "5" })
assert.equal(invalid.scope, null); assert.equal(invalid.errorCode, "unknown_error"); assert.equal(invalid.createdAt, null); assert.equal(invalid.attempts, null); assert.ok(!JSON.stringify(invalid).includes("SECRET_"))
console.log("Delivery health passed: fresh/missing/stale/failed/recovered heartbeat, backlog and invalid schedules, count validation, minimal projections, hidden malformed scope and error redaction.")
