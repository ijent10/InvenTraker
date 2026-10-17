import { adminFieldValue } from "@/lib/firebase-admin"
import { mobileRecord, orgCollection, type MobilePrincipal } from "@/lib/mobile-api"
import { stockOperationSource } from "@/lib/stock-operations"
import { postStockOperation } from "./post-stock-operation"
import type { ThresholdRepository } from "./threshold"

export async function firestoreThresholdRepository(principal: MobilePrincipal, request: Request): Promise<ThresholdRepository> {
  const FieldValue = await adminFieldValue()
  const inventory = orgCollection(principal, "inventory")
  const operations = orgCollection(principal, "stockOperations")
  const history = orgCollection(principal, "history")
  return {
    runTransaction: (work) => principal.db.runTransaction(async (transaction) => work({
      readOperation: async (id) => { const snapshot = await transaction.get(operations.doc(id)); return snapshot.exists ? mobileRecord(snapshot.id, snapshot.data()) : undefined },
      readItem: async (id) => { const snapshot = await transaction.get(inventory.doc(id)); return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : undefined },
      write: (command, plan, response, fingerprint) => {
        const timestamp = FieldValue.serverTimestamp()
        const update = { ...plan.change.after, updatedAt: timestamp, updatedBy: principal.uid, updatedByOperationId: command.commandId }
        transaction.update(inventory.doc(command.payload.itemId), { ...update, status: plan.status })
        if (plan.orgProductId) transaction.set(principal.db.collection("orgs").doc(principal.orgId).collection("stores").doc(command.locationId).collection("storeProductDetails").doc(plan.orgProductId), { par: command.payload.par, reorderPoint: command.payload.reorderPoint, updatedAt: timestamp, updatedBy: principal.uid, updatedByOperationId: command.commandId }, { merge: true })
        transaction.create(history.doc(command.commandId), { id: command.commandId, operationId: command.commandId, type: "par-changes", label: "Par changed", storeId: command.locationId, userId: principal.uid, userName: String(principal.member.name ?? principal.email), employeeId: String(principal.member.employeeId ?? ""), department: String(principal.member.department ?? ""), title: String(principal.member.jobTitle ?? principal.member.role ?? ""), summary: `${plan.change.itemName}: par ${plan.change.before.par} → ${plan.change.after.par}, reorder point ${plan.change.before.reorderPoint} → ${plan.change.after.reorderPoint}`, reason: command.payload.reason, createdAt: timestamp })
        const { data: _data, ...metadata } = response
        postStockOperation(transaction, operations.doc(command.commandId), { principal, operationId: command.commandId, operationType: "par_change", storeId: command.locationId, changes: [plan.change], result: response.data, timestamp, source: stockOperationSource(request) }, { commandFingerprint: fingerprint, engineResult: metadata, occurredAt: response.committedAt })
      }
    }))
  }
}
