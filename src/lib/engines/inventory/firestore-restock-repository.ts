import { adminFieldValue } from "@/lib/firebase-admin"
import { mobileRecord, orgCollection, type MobilePrincipal } from "@/lib/mobile-api"
import { stockChange, stockOperationSource } from "@/lib/stock-operations"
import { postStockOperation } from "./post-stock-operation"
import type { RestockRepository } from "./restock"

export async function firestoreRestockRepository(principal: MobilePrincipal, request: Request): Promise<RestockRepository> {
  const FieldValue = await adminFieldValue()
  const inventory = orgCollection(principal, "inventory")
  const batches = orgCollection(principal, "inventoryBatches")
  const operations = orgCollection(principal, "stockOperations")
  const history = orgCollection(principal, "history")
  return { runTransaction: (work) => principal.db.runTransaction(async (transaction) => work({
    readOperation: async (id) => { const snapshot = await transaction.get(operations.doc(id)); return snapshot.exists ? mobileRecord(snapshot.id, snapshot.data()) : undefined },
    readItems: async (ids) => { const snapshots = await Promise.all(ids.map((id) => transaction.get(inventory.doc(id)))); return snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => ({ ...mobileRecord(snapshot.id, snapshot.data()), id: snapshot.id })) },
    readBatches: async (ids) => { const snapshots = await Promise.all(ids.map((id) => transaction.get(batches.where("itemId", "==", id)))); return snapshots.flatMap((snapshot) => snapshot.docs.map((doc) => ({ ...mobileRecord(doc.id, doc.data()), id: doc.id }))) },
    write: (command, plans, response, fingerprint) => {
      const timestamp = FieldValue.serverTimestamp()
      for (const plan of plans) {
        transaction.update(inventory.doc(plan.current.id), { ...plan.after, status: plan.status, lastRestockedAt: timestamp, updatedAt: timestamp, updatedBy: principal.uid, updatedByOperationId: command.commandId })
        for (const entry of plan.reconciliation.allocations) transaction.update(batches.doc(entry.batchId), { remainingQuantity: entry.remainingQuantity, status: entry.remainingQuantity === 0 ? "depleted" : "available", updatedAt: timestamp, updatedByOperationId: command.commandId })
        const unknown = (id: string, quantity: number, source: string, area: "front" | "back" = "front") => transaction.create(batches.doc(id), { id, itemId: plan.current.id, itemName: plan.recommendation.name, storeId: command.locationId, remainingQuantity: quantity, originalQuantity: quantity, unit: String(plan.current.unit ?? "eaches"), area, receivedAt: null, expirationDate: null, expirationKnown: false, openedAt: null, preparedAt: null, sourceOperationId: command.commandId, source, status: "available", createdAt: timestamp, updatedAt: timestamp })
        if (plan.reconciliation.addedUnknownQuantity > 0) unknown(plan.unknownCountId, plan.reconciliation.addedUnknownQuantity, "restock_count_reconciliation")
        if (plan.allocation.unallocatedQuantity > 0) unknown(plan.unknownPullId, plan.allocation.unallocatedQuantity, "restock_untracked_backstock")
        if (plan.remainingUnknownBack > 0) unknown(plan.unknownBackId, plan.remainingUnknownBack, "restock_backstock_reconciliation", "back")
        for (const move of plan.moves) {
          transaction.update(batches.doc(move.source.id), { remainingQuantity: move.allocation.remainingQuantity, status: move.allocation.remainingQuantity === 0 ? "depleted" : "available", updatedAt: timestamp, updatedByOperationId: command.commandId })
          transaction.create(batches.doc(move.destinationId), { ...move.source, id: move.destinationId, remainingQuantity: move.allocation.quantity, originalQuantity: move.allocation.quantity, area: "front", parentBatchId: move.source.id, sourceOperationId: command.commandId, status: "available", createdAt: timestamp, updatedAt: timestamp })
        }
      }
      transaction.set(history.doc(command.commandId), { id: command.commandId, type: "restocks", label: "Restock", operationId: command.commandId, storeId: command.locationId, userId: principal.uid, userName: String(principal.member.name ?? principal.email), employeeId: String(principal.member.employeeId ?? ""), department: String(principal.member.department ?? ""), title: String(principal.member.jobTitle ?? principal.member.role ?? ""), summary: `${plans.reduce((total, plan) => total + plan.recommendation.pullQuantity, 0)} units moved to the sales floor`, responses: plans.map((plan) => ({ label: plan.recommendation.name, value: `Pull ${plan.recommendation.pullQuantity}` })), createdAt: timestamp })
      postStockOperation(transaction, operations.doc(command.commandId), { principal, operationId: command.commandId, operationType: "restock", storeId: command.locationId, changes: plans.map((plan) => stockChange(plan.current.id, plan.recommendation.name, plan.before, plan.after, { unit: String(plan.current.unit ?? "eaches"), reason: "Replenished sales floor", sourceArea: "back", destinationArea: "front" })), result: response.data, timestamp, source: stockOperationSource(request) }, { commandFingerprint: fingerprint, engineResult: { requestId: response.requestId, schemaVersion: response.schemaVersion, committedAt: response.committedAt, replayed: false }, occurredAt: response.committedAt })
    }
  })) }
}
