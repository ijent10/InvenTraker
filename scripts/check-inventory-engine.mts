import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { EngineError, domainEventSchema, engineErrorResponseSchema, stockCommittedEvent } from "../src/lib/engines/contracts.ts"
import { executeStockTransfer, planStockTransfer, transferCommandSchema, transferPayloadSchema, transferRequestSchema, transferResponseSchema, type InventoryRecord, type TransferCommand, type TransferRepository } from "../src/lib/engines/inventory/transfer.ts"

const now = "2026-10-15T01:30:00.000Z"
const principal = { uid: "owner", organizationId: "org", isManager: false, permissions: ["inventory.edit"] }
const command: TransferCommand = { commandId: randomUUID(), organizationId: "org", locationId: "store", actorId: "owner", payload: { itemId: "cheese", quantity: 3, source: "back", destination: "front" } }
const item: InventoryRecord = { id: "cheese", storeId: "store", name: "Cheese", frontStock: 2, backStock: 8, onHand: 10, revision: 4 }
const batches: InventoryRecord[] = [
  { id: "later", itemId: "cheese", storeId: "store", area: "back", remainingQuantity: 6, expirationDate: "2026-11-03" },
  { id: "first", itemId: "cheese", storeId: "store", area: "back", remainingQuantity: 2, expirationDate: "2026-10-19" },
  { id: "other-store", itemId: "cheese", storeId: "other-store", area: "back", remainingQuantity: 100, expirationDate: "2026-10-01" },
  { id: "other-item", itemId: "other-item", storeId: "store", area: "back", remainingQuantity: 100, expirationDate: "2026-10-01" }
]
const plan = planStockTransfer(command, item, batches)
assert.deepEqual(plan.after, { frontStock: 5, backStock: 5, onHand: 10, revision: 5 })
assert.deepEqual(plan.result.batchAllocations, [{ batchId: "first", quantity: 2, remainingQuantity: 0 }, { batchId: "later", quantity: 1, remainingQuantity: 5 }])
assert.equal(planStockTransfer({ ...command, payload: { ...command.payload, batchId: "later" } }, item, batches).result.batchAllocations?.[0].batchId, "later")
assert.equal(planStockTransfer(command, item, []).result.unallocatedQuantity, 3)
assert.throws(() => planStockTransfer({ ...command, payload: { ...command.payload, batchId: "other-store" } }, item, batches), (error) => error instanceof EngineError && error.code === "batch_unavailable")
for (const quantity of [0, -1, Infinity, NaN, 0.0001, 1.2345]) assert.equal(transferPayloadSchema.safeParse({ ...command.payload, quantity }).success, false)
assert.equal(transferPayloadSchema.parse({ ...command.payload, quantity: 0.1 + 0.2 }).quantity, 0.3)
assert.equal(transferPayloadSchema.safeParse({ ...command.payload, destination: "back" }).success, false)
assert.equal(transferPayloadSchema.safeParse({ ...command.payload, itemId: "nested/path" }).success, false)
assert.equal(transferRequestSchema.safeParse({ commandId: command.commandId, locationId: "store", payload: command.payload, actorId: "spoof" }).success, false)

let writes = 0
let readCount = 0
let authorized = 0
let stored: Record<string, unknown> | undefined
const repository: TransferRepository = { runTransaction: async (work) => work({
  readOperation: async () => { readCount++; return stored }, readItem: async () => item, readBatches: async () => batches,
  write: (input, result, response, fingerprint) => { writes++; stored = { operationType: "transfer", storeId: "store", actor: { uid: "owner" }, result: result.result, engineResult: response, commandFingerprint: fingerprint } }
}) }
const authorize = async (id: string) => { authorized++; assert.equal(id, "store") }
const first = await executeStockTransfer(command, principal, repository, authorize, () => now)
const replayed = await executeStockTransfer(command, principal, repository, authorize, () => "2026-10-16T00:00:00.000Z")
assert.equal(writes, 1)
assert.equal(replayed.replayed, true)
assert.deepEqual(replayed.data, first.data)
assert.equal(replayed.committedAt, now)
assert.equal(authorized, 2, "replays must recheck current store access")
await assert.rejects(() => executeStockTransfer({ ...command, payload: { ...command.payload, quantity: 4 } }, principal, repository, authorize), (error) => error instanceof EngineError && error.code === "operation_conflict")
const readsBeforeDenied = readCount
await assert.rejects(() => executeStockTransfer(command, { ...principal, permissions: [] }, repository, authorize), (error) => error instanceof EngineError && error.status === 403)
await assert.rejects(() => executeStockTransfer({ ...command, actorId: "other" }, principal, repository, authorize), (error) => error instanceof EngineError && error.code === "command_scope_denied")
await assert.rejects(() => executeStockTransfer({ ...command, organizationId: "other" }, principal, repository, authorize), (error) => error instanceof EngineError && error.code === "command_scope_denied")
await assert.rejects(() => executeStockTransfer(command, principal, repository, async () => { throw new EngineError("Store denied", 403, "store_access_denied") }), (error) => error instanceof EngineError && error.status === 403)
assert.equal(readCount, readsBeforeDenied, "denied commands must not enter repository transactions")
stored = { operationType: "transfer", storeId: "store", actor: { uid: "owner" }, result: first.data, createdAt: now, changes: [{ itemId: "cheese", sourceArea: "back", destinationArea: "front", delta: { frontStock: 3, backStock: -3 } }] }
assert.equal((await executeStockTransfer(command, principal, repository, authorize)).replayed, true)
await assert.rejects(() => executeStockTransfer({ ...command, payload: { ...command.payload, quantity: 4 } }, principal, repository, authorize), (error) => error instanceof EngineError && error.code === "operation_conflict")
assert.equal(writes, 1, "legacy replays must not fabricate an outbox event")

for (let index = 1; index <= 100; index++) {
  const quantity = index / 1000
  const moved = planStockTransfer(transferCommandSchema.parse({ ...command, payload: { ...command.payload, quantity } }), item, batches)
  assert.equal(moved.after.onHand, 10)
  assert.equal(moved.after.revision, 5)
}
const event = stockCommittedEvent({ operationId: command.commandId, organizationId: "org", storeId: "store", operationType: "transfer", itemIds: ["cheese", "cheese"], occurredAt: now })
assert.deepEqual(event.payload.itemIds, ["cheese"])
assert.equal(event.actorAuditRef, `orgs/org/stockOperations/${command.commandId}`)
assert.equal(domainEventSchema.safeParse({ ...event, actor: { email: "private@example.com" } }).success, false)
assert.equal(stockCommittedEvent({ operationId: command.commandId, organizationId: "org", storeId: "store", operationType: "transfer", itemIds: ["cheese"], occurredAt: now }).eventId, event.eventId)
const fixture = JSON.parse(readFileSync(new URL("../fixtures/engine-contracts/transfer-v1.json", import.meta.url), "utf8"))
transferRequestSchema.parse(fixture.request)
transferResponseSchema.parse(fixture.response)
assert.deepEqual(fixture.mobileResponse.data, fixture.response.data)
engineErrorResponseSchema.parse({ requestId: null, schemaVersion: "1", serverTime: now, error: { code: "unauthenticated", message: "Sign in is required." } })
console.log("Inventory engine checks passed: conservation, batch scope/order, precision, permissions, replay conflicts, legacy replay, event contracts and shared fixtures.")
