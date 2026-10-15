import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { applyStockOrderReceipt } from "../src/lib/order-contract.ts"
import type { InventoryRecord } from "../src/lib/engines/inventory/transfer.ts"
import { EngineError } from "../src/lib/engines/contracts.ts"
import { executeReceiving, planReceiving, receivingCommandSchema, receivingFingerprint, receivingPayloadSchema, receivingRequestSchema, receivingResponseSchema, type ReceivingCommand, type ReceivingRepository } from "../src/lib/engines/inventory/receiving.ts"

const now = "2026-10-15T12:00:00.000Z"
const principal = { uid: "owner", organizationId: "org", permissions: ["inventory.edit"], isManager: false }
const line = { itemId: "cheese", quantity: 1, expirationDate: "2027-01-01T00:00:00.000Z", orderId: "order", orderLineId: "line", receivedOrderQuantity: 1 / 6 }
const command: ReceivingCommand = { commandId: randomUUID(), organizationId: "org", actorId: "owner", locationId: "store", payload: { lines: [line] } }
const item = { id: "cheese", storeId: "store", name: "Cheese", unit: "eaches", frontStock: 2, backStock: 4, revision: 2, expires: true }
const order = { id: "order", storeId: "store", status: "Submitted", lines: [{ id: "line", itemId: "cheese", finalQuantity: 1, stockUnitsPerOrderUnit: 6, receivedQuantity: 0 }] }
const plan = planReceiving(command, [item], [order])
assert.equal(plan.receipts[0].after.onHand, 7)
assert.throws(() => planReceiving(command, [{ ...item, backStock: 1e20 }], [order]), (error) => error instanceof EngineError && error.code === "invalid_stock_balance")
assert.equal(plan.receipts[0].after.revision, 3)
assert.equal(plan.receipts[0].expirationDate, line.expirationDate)
assert.equal(plan.orders[0].status, "Partially received")
assert.equal(plan.orders[0].lines[0].receivedQuantity, 1 / 6)
assert.equal(plan.orders[0].lines[0].receivedStockQuantity, 1)
let lines: Record<string, unknown>[] = order.lines
for (let index = 1; index <= 6; index++) {
  const receipt = applyStockOrderReceipt(lines, "line", "cheese", 1, 1 / 6)
  lines = receipt.lines
  assert.equal(lines[0].receivedStockQuantity, index)
  assert.equal(receipt.status, index === 6 ? "Received" : "Partially received")
}
assert.equal(lines[0].receivedQuantity, 1)
assert.throws(() => applyStockOrderReceipt(lines, "line", "cheese", 1), /greater than/)
assert.throws(() => applyStockOrderReceipt(order.lines, "line", "cheese", 1, 1), /do not match/)
assert.throws(() => applyStockOrderReceipt(order.lines, "line", "wrong", 1), /does not match/)
assert.throws(() => applyStockOrderReceipt([{ ...order.lines[0], stockUnitsPerOrderUnit: Infinity }], "line", "cheese", 1), /invalid/)
assert.throws(() => applyStockOrderReceipt([{ ...order.lines[0], receivedQuantity: 0, receivedStockQuantity: 1 }], "line", "cheese", 1), /inconsistent/)
for (const status of ["Draft", "Approved", "Received", "Cancelled"]) assert.throws(() => planReceiving(command, [item], [{ ...order, status }]), (error) => error instanceof EngineError && error.code === "order_not_receivable")
assert.throws(() => planReceiving(command, [item], [{ ...order, storeId: "other" }]), (error) => error instanceof EngineError && error.status === 403)
assert.throws(() => planReceiving(command, [{ ...item, storeId: "other" }], [order]), (error) => error instanceof EngineError && error.status === 403)
for (const quantity of [0, -1, Infinity, NaN, 0.0001, 1.2345]) assert.equal(receivingPayloadSchema.safeParse({ lines: [{ ...line, quantity }] }).success, false)
assert.equal(receivingPayloadSchema.safeParse({ lines: [line, line] }).success, false)
assert.equal(receivingPayloadSchema.safeParse({ lines: [{ itemId: "cheese", quantity: 1, receivedOrderQuantity: 1 }] }).success, false)
assert.equal(receivingRequestSchema.safeParse({ commandId: command.commandId, locationId: "store", payload: command.payload, actorId: "spoof" }).success, false)
const two = { ...command, payload: { lines: [line, { itemId: "other", quantity: 1 }] } }
assert.equal(receivingFingerprint(two), receivingFingerprint({ ...two, payload: { lines: [...two.payload.lines].reverse() } }))

let existing: Record<string, unknown> | undefined
let writes = 0
let entered = 0
let authorized = 0
let records: InventoryRecord[] = []
const repository: ReceivingRepository = { runTransaction: async (work) => { entered++; return work({ readOperation: async () => existing, readItems: async () => [item], readOrders: async () => [order], readReceipts: async () => records, write: (input, result, response, fingerprint) => { writes++; existing = { operationType: "receive", storeId: "store", actor: { uid: "owner" }, commandFingerprint: fingerprint, engineResult: { requestId: response.requestId, schemaVersion: "1", committedAt: response.committedAt, replayed: false }, result: response.data } } }) } }
const authorize = async () => { authorized++ }
const first = await executeReceiving(command, principal, repository, authorize, () => now)
assert.equal((await executeReceiving(command, principal, repository, authorize)).replayed, true)
assert.equal(writes, 1)
assert.equal(authorized, 2)
for (const changed of [{ ...line, quantity: 2 }, { ...line, orderLineId: "other" }, { ...line, receivedOrderQuantity: 0.5 }, { ...line, expirationDate: "2028-01-01T00:00:00.000Z" }]) await assert.rejects(() => executeReceiving({ ...command, payload: { lines: [changed] } }, principal, repository, authorize), (error) => error instanceof EngineError && error.code === "operation_conflict")
const beforeDenied = entered
for (const denied of [{ ...principal, uid: "other" }, { ...principal, organizationId: "other" }, { ...principal, permissions: [] }]) await assert.rejects(() => executeReceiving(command, denied, repository, authorize), (error) => error instanceof EngineError && error.status === 403)
await assert.rejects(() => executeReceiving(command, principal, repository, async () => { throw new EngineError("Denied", 403, "store_access_denied") }), EngineError)
assert.equal(entered, beforeDenied)
records = [{ id: first.data.receivedIds[0], itemId: "cheese", operationId: command.commandId, userId: "owner", storeId: "store", quantity: 1, expirationDate: line.expirationDate, orderId: "order", orderLineId: "line", receivedOrderQuantity: 1 / 6 }]
existing = { operationType: "receive", storeId: "store", actor: { uid: "owner" }, result: first.data, createdAt: now }
assert.equal((await executeReceiving(command, principal, repository, authorize)).replayed, true)
await assert.rejects(() => executeReceiving({ ...command, payload: { lines: [{ ...line, quantity: 2 }] } }, principal, repository, authorize), (error) => error instanceof EngineError && error.code === "operation_conflict")
assert.equal(writes, 1)
const fixture = JSON.parse(readFileSync(new URL("../fixtures/engine-contracts/receiving-v1.json", import.meta.url), "utf8"))
receivingRequestSchema.parse(fixture.request); receivingResponseSchema.parse(fixture.response)
assert.deepEqual(fixture.response.data, fixture.mobileResponse.data)
console.log("Receiving engine checks passed: pack conversion, partial receipts without drift, over-receipt rejection, scope, statuses, precision, replay conflicts, legacy replay and fixtures.")
