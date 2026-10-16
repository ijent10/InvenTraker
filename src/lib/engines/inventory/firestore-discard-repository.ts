import { adminFieldValue } from "@/lib/firebase-admin"
import { mobileRecord, orgCollection, type MobilePrincipal } from "@/lib/mobile-api"
import { stockChange, stockOperationSource } from "@/lib/stock-operations"
import { postStockOperation } from "./post-stock-operation"
import type { DiscardRepository } from "./discard"

export async function firestoreDiscardRepository(principal: MobilePrincipal, request: Request): Promise<DiscardRepository> {
  const FieldValue = await adminFieldValue()
  const inventory = orgCollection(principal, "inventory")
  const batches = orgCollection(principal, "inventoryBatches")
  const waste = orgCollection(principal, "waste")
  const operations = orgCollection(principal, "stockOperations")
  const history = orgCollection(principal, "history")
  return {
    runTransaction: (work) => principal.db.runTransaction(async (transaction) => work({
      readOperation: async (id) => { const snapshot = await transaction.get(operations.doc(id)); return snapshot.exists ? mobileRecord(snapshot.id, snapshot.data()) : undefined },
      readItems: async (ids) => { const snapshots = await Promise.all(ids.map((id) => transaction.get(inventory.doc(id)))); return snapshots.filter((doc) => doc.exists).map((doc) => ({ ...doc.data(), id: doc.id })) },
      readBatches: async (ids) => { const snapshots = await Promise.all(ids.map((id) => transaction.get(batches.where("itemId", "==", id)))); return snapshots.flatMap((snapshot) => snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }))) },
      readWaste: async (ids) => { const snapshots = await Promise.all(ids.map((id) => transaction.get(waste.doc(id)))); return snapshots.filter((doc) => doc.exists).map((doc) => ({ ...doc.data(), id: doc.id })) },
      write: (command, plans, response, fingerprint) => {
        const timestamp = FieldValue.serverTimestamp()
        for (const plan of plans) {
          transaction.update(inventory.doc(plan.current.id), { ...plan.after, status: plan.status, updatedAt: timestamp, updatedBy: principal.uid, updatedByOperationId: command.commandId })
          for (const entry of plan.lines) {
            for (const allocation of entry.allocation.allocations) transaction.update(batches.doc(allocation.batchId), { remainingQuantity: allocation.remainingQuantity, status: allocation.remainingQuantity === 0 ? "depleted" : "available", updatedAt: timestamp, updatedByOperationId: command.commandId })
            if (entry.remainingUnknown > 0) transaction.create(batches.doc(entry.unknownBatchId), { id: entry.unknownBatchId, itemId: plan.current.id, storeId: command.locationId, area: entry.line.area, remainingQuantity: entry.remainingUnknown, originalQuantity: entry.remainingUnknown, unit: String(plan.current.unit ?? "eaches"), expirationDate: null, expirationKnown: false, receivedAt: null, source: "discard_untracked_balance", sourceOperationId: command.commandId, status: "available", createdAt: timestamp, updatedAt: timestamp })
            transaction.create(waste.doc(entry.wasteId), { id: entry.wasteId, operationId: command.commandId, itemId: plan.current.id, itemName: String(plan.current.name ?? "Inventory item"), storeId: command.locationId, quantity: entry.line.quantity, unit: String(plan.current.unit ?? "eaches"), area: entry.line.area, reason: entry.line.reason, batchAllocations: entry.allocation.allocations, unallocatedQuantity: entry.allocation.unallocatedQuantity, allocationMethod: entry.line.batchId ? "human_override" : "earliest_expiring_first", selectedBatchId: entry.line.batchId ?? null, userId: principal.uid, createdAt: timestamp })
          }
        }
        transaction.set(history.doc(command.commandId), { id: command.commandId, type: "waste", label: "Waste", operationId: command.commandId, storeId: command.locationId, userId: principal.uid, userName: String(principal.member.name ?? principal.email), employeeId: String(principal.member.employeeId ?? ""), department: String(principal.member.department ?? ""), title: String(principal.member.jobTitle ?? principal.member.role ?? ""), summary: `${command.payload.lines.length} waste entr${command.payload.lines.length === 1 ? "y" : "ies"} recorded`, createdAt: timestamp })
        const { data: _data, ...metadata } = response
        postStockOperation(transaction, operations.doc(command.commandId), { principal, operationId: command.commandId, operationType: "waste", storeId: command.locationId, changes: plans.map((plan) => stockChange(plan.current.id, String(plan.current.name ?? "Inventory item"), plan.before, plan.after, { unit: String(plan.current.unit ?? "eaches"), reason: plan.lines.map((entry) => entry.line.reason).join("; ") })), result: response.data, timestamp, source: stockOperationSource(request) }, { commandFingerprint: fingerprint, engineResult: metadata, occurredAt: response.committedAt })
      }
    }))
  }
}
