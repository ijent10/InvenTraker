import { adminFieldValue } from "@/lib/firebase-admin"
import { mobileRecord, orgCollection, type MobilePrincipal } from "@/lib/mobile-api"
import { stockChange, stockOperationSource } from "@/lib/stock-operations"
import { postStockOperation } from "./post-stock-operation"
import type { TransferRepository } from "./transfer"

export async function firestoreTransferRepository(principal: MobilePrincipal, request: Request): Promise<TransferRepository> {
  const FieldValue = await adminFieldValue()
  const inventory = orgCollection(principal, "inventory")
  const batches = orgCollection(principal, "inventoryBatches")
  const operations = orgCollection(principal, "stockOperations")
  const history = orgCollection(principal, "history")
  return {
    runTransaction: (work) => principal.db.runTransaction(async (transaction) => work({
      readOperation: async (id) => { const snapshot = await transaction.get(operations.doc(id)); return snapshot.exists ? mobileRecord(snapshot.id, snapshot.data()) : undefined },
      readItem: async (id) => { const snapshot = await transaction.get(inventory.doc(id)); return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : undefined },
      readBatches: async (itemId) => { const snapshot = await transaction.get(batches.where("itemId", "==", itemId)); return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })) },
      write: (command, plan, response, fingerprint) => {
        const timestamp = FieldValue.serverTimestamp()
        transaction.update(inventory.doc(command.payload.itemId), { ...plan.after, status: plan.status, lastTransferredAt: timestamp, updatedAt: timestamp, updatedBy: principal.uid, updatedByOperationId: command.commandId })
        for (const move of plan.batchMoves) {
          transaction.update(batches.doc(move.source.id), { remainingQuantity: move.allocation.remainingQuantity, status: move.allocation.remainingQuantity === 0 ? "depleted" : "available", updatedAt: timestamp, updatedByOperationId: command.commandId })
          transaction.create(batches.doc(move.destinationId), { ...move.source, id: move.destinationId, remainingQuantity: move.allocation.quantity, originalQuantity: move.allocation.quantity, area: command.payload.destination, parentBatchId: move.source.id, sourceOperationId: command.commandId, status: "available", createdAt: timestamp, updatedAt: timestamp })
        }
        transaction.set(history.doc(command.commandId), {
          id: command.commandId, type: "transfers", label: "Stock transfer", operationId: command.commandId, storeId: command.locationId,
          userId: principal.uid, userName: String(principal.member.name ?? principal.email), employeeId: String(principal.member.employeeId ?? ""), department: String(principal.member.department ?? ""), title: String(principal.member.jobTitle ?? principal.member.role ?? ""),
          summary: `${command.payload.quantity} units moved from ${command.payload.source === "front" ? "sales floor" : "backstock"} to ${command.payload.destination === "front" ? "sales floor" : "backstock"}`,
          responses: [{ label: plan.result.itemName, value: `${command.payload.quantity} moved; ${plan.result.unallocatedQuantity} without batch detail` }], createdAt: timestamp
        })
        postStockOperation(transaction, operations.doc(command.commandId), {
          principal, operationId: command.commandId, operationType: "transfer", storeId: command.locationId,
          changes: [stockChange(command.payload.itemId, plan.result.itemName, plan.before, plan.after, { unit: plan.unit, reason: "Stock area transfer", sourceArea: command.payload.source, destinationArea: command.payload.destination })],
          result: response.data, timestamp, source: stockOperationSource(request)
        }, { commandFingerprint: fingerprint, engineResult: response, occurredAt: response.committedAt })
      }
    }))
  }
}
