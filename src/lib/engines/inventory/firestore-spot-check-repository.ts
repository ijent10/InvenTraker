import { adminFieldValue } from "@/lib/firebase-admin"
import { mobileRecord, orgCollection, type MobilePrincipal } from "@/lib/mobile-api"
import { stockChange, stockOperationSource } from "@/lib/stock-operations"
import { postStockOperation } from "./post-stock-operation"
import type { SpotCheckRepository } from "./spot-check"

export async function firestoreSpotCheckRepository(principal: MobilePrincipal, request: Request): Promise<SpotCheckRepository> {
  const FieldValue = await adminFieldValue()
  const inventory = orgCollection(principal, "inventory")
  const batches = orgCollection(principal, "inventoryBatches")
  const operations = orgCollection(principal, "stockOperations")
  const history = orgCollection(principal, "history")
  return {
    runTransaction: (work) => principal.db.runTransaction(async (transaction) => work({
      readOperation: async (id) => { const snapshot = await transaction.get(operations.doc(id)); return snapshot.exists ? mobileRecord(snapshot.id, snapshot.data()) : undefined },
      readItems: async (ids) => { const snapshots = await Promise.all(ids.map((id) => transaction.get(inventory.doc(id)))); return snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => ({ ...mobileRecord(snapshot.id, snapshot.data()), id: snapshot.id })) },
      readBatches: async (ids) => { const snapshots = await Promise.all(ids.map((id) => transaction.get(batches.where("itemId", "==", id)))); return snapshots.flatMap((snapshot) => snapshot.docs.map((doc) => ({ ...mobileRecord(doc.id, doc.data()), id: doc.id }))) },
      write: (command, plans, response, fingerprint) => {
        const timestamp = FieldValue.serverTimestamp()
        for (const plan of plans) {
          transaction.update(inventory.doc(plan.current.id), { ...plan.after, status: plan.status, lastCountedAt: timestamp, updatedAt: timestamp, updatedBy: principal.uid, updatedByOperationId: command.commandId, ...(plan.current.expires && plan.line.expirationDate ? { lastVerifiedExpiration: plan.line.expirationDate } : {}) })
          for (const area of plan.areas) {
            for (const allocation of area.allocations) transaction.update(batches.doc(allocation.batchId), { remainingQuantity: allocation.remainingQuantity, status: allocation.remainingQuantity === 0 ? "depleted" : "available", updatedAt: timestamp, updatedByOperationId: command.commandId })
            if (area.addedUnknownQuantity > 0) transaction.create(batches.doc(area.unknownBatchId), { id: area.unknownBatchId, itemId: plan.current.id, itemName: String(plan.current.name ?? "Inventory item"), storeId: command.locationId, remainingQuantity: area.addedUnknownQuantity, originalQuantity: area.addedUnknownQuantity, unit: String(plan.current.unit ?? "eaches"), area: area.area, receivedAt: null, expirationDate: null, expirationKnown: false, openedAt: null, preparedAt: null, sourceOperationId: command.commandId, source: "count_reconciliation", status: "available", createdAt: timestamp, updatedAt: timestamp })
          }
        }
        transaction.set(history.doc(command.commandId), { id: command.commandId, type: "spot-checks", label: "Spot check", operationId: command.commandId, storeId: command.locationId, userId: principal.uid, userName: String(principal.member.name ?? principal.email), employeeId: String(principal.member.employeeId ?? ""), department: String(principal.member.department ?? ""), title: String(principal.member.jobTitle ?? principal.member.role ?? ""), summary: `${plans.length} item${plans.length === 1 ? "" : "s"} counted`, responses: plans.map((plan) => ({ label: plan.current.id, value: String(plan.after.onHand) })), createdAt: timestamp })
        postStockOperation(transaction, operations.doc(command.commandId), { principal, operationId: command.commandId, operationType: "spot_check", storeId: command.locationId, changes: plans.map((plan) => stockChange(plan.current.id, String(plan.current.name ?? "Inventory item"), plan.before, plan.after, { unit: String(plan.current.unit ?? "eaches"), reason: plan.reason })), result: response.data, timestamp, source: stockOperationSource(request) }, { commandFingerprint: fingerprint, engineResult: { requestId: response.requestId, schemaVersion: response.schemaVersion, committedAt: response.committedAt, replayed: false }, occurredAt: response.committedAt })
      }
    }))
  }
}
