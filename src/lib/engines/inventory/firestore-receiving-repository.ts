import type { Transaction } from "firebase-admin/firestore"
import { adminFieldValue } from "@/lib/firebase-admin"
import { mobileRecord, orgCollection, type MobilePrincipal } from "@/lib/mobile-api"
import { stockChange, stockOperationSource } from "@/lib/stock-operations"
import { postStockOperation } from "./post-stock-operation"
import type { ReceivingRepository } from "./receiving"

export async function firestoreReceivingRepository(principal: MobilePrincipal, request: Request, sharedTransaction?: Transaction): Promise<ReceivingRepository> {
  const FieldValue = await adminFieldValue()
  const inventory = orgCollection(principal, "inventory")
  const receiving = orgCollection(principal, "receiving")
  const batches = orgCollection(principal, "inventoryBatches")
  const orders = orgCollection(principal, "orders")
  const operations = orgCollection(principal, "stockOperations")
  const history = orgCollection(principal, "history")
  const run = <T>(callback: (transaction: Transaction) => Promise<T>): Promise<T> => sharedTransaction ? callback(sharedTransaction) : principal.db.runTransaction(callback)
  return {
    runTransaction: (work) => run(async (transaction) => {
      const read = async (collection: typeof inventory, ids: string[]) => {
        const snapshots = await Promise.all(ids.map((id) => transaction.get(collection.doc(id))))
        return snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => ({ ...mobileRecord(snapshot.id, snapshot.data()), id: snapshot.id }))
      }
      return work({
        readOperation: async (id) => (await read(operations, [id]))[0],
        readItems: (ids) => read(inventory, ids), readOrders: (ids) => read(orders, ids), readReceipts: (ids) => read(receiving, ids),
        write: (command, plan, response, fingerprint) => {
          const timestamp = FieldValue.serverTimestamp()
          for (const receipt of plan.receipts) {
            const { current, line } = receipt
            transaction.update(inventory.doc(current.id), { ...receipt.after, status: receipt.status, lastReceivedAt: timestamp, updatedAt: timestamp, updatedBy: principal.uid, updatedByOperationId: command.commandId, ...(receipt.expirationDate ? { lastReceivedExpiration: receipt.expirationDate } : {}) })
            transaction.create(receiving.doc(receipt.id), { id: receipt.id, itemId: current.id, itemName: String(current.name ?? "Inventory item"), storeId: command.locationId, quantity: line.quantity, unit: String(current.unit ?? "eaches"), expirationDate: receipt.expirationDate, operationId: command.commandId, orderId: line.orderId ?? null, orderLineId: line.orderLineId ?? null, receivedOrderQuantity: receipt.receivedOrderQuantity, userId: principal.uid, createdAt: timestamp })
            transaction.create(batches.doc(receipt.id), { id: receipt.id, itemId: current.id, itemName: String(current.name ?? "Inventory item"), storeId: command.locationId, remainingQuantity: line.quantity, originalQuantity: line.quantity, unit: String(current.unit ?? "eaches"), area: "back", receivedAt: timestamp, expirationDate: receipt.expirationDate, expirationKnown: Boolean(receipt.expirationDate), openedAt: null, preparedAt: null, sourceOperationId: command.commandId, sourceReceiptId: receipt.id, status: "available", createdAt: timestamp, updatedAt: timestamp })
          }
          for (const order of plan.orders) transaction.update(orders.doc(order.id), { lines: order.lines, status: order.status, lastReceivedAt: timestamp, ...(order.status === "Received" ? { receivedAt: timestamp } : {}), updatedAt: timestamp, updatedByUid: principal.uid })
          transaction.set(history.doc(command.commandId), { id: command.commandId, type: "receiving", label: "Receiving", operationId: command.commandId, storeId: command.locationId, userId: principal.uid, userName: String(principal.member.name ?? principal.email), employeeId: String(principal.member.employeeId ?? ""), department: String(principal.member.department ?? ""), title: String(principal.member.jobTitle ?? principal.member.role ?? ""), summary: `${plan.receipts.reduce((total, receipt) => total + receipt.line.quantity, 0)} units received`, responses: plan.receipts.map((receipt) => ({ label: receipt.current.id, value: String(receipt.line.quantity) })), createdAt: timestamp })
          postStockOperation(transaction, operations.doc(command.commandId), { principal, operationId: command.commandId, operationType: "receive", storeId: command.locationId, changes: plan.receipts.map((receipt) => stockChange(receipt.current.id, String(receipt.current.name ?? "Inventory item"), receipt.before, receipt.after, { unit: String(receipt.current.unit ?? "eaches"), reason: "Inventory received", destinationArea: "back", expirationDate: receipt.expirationDate })), result: response.data, timestamp, source: stockOperationSource(request) }, { commandFingerprint: fingerprint, engineResult: { requestId: response.requestId, schemaVersion: response.schemaVersion, committedAt: response.committedAt, replayed: false }, occurredAt: response.committedAt })
        }
      })
    })
  }
}
