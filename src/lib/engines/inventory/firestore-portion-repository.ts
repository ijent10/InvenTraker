import { adminFieldValue } from "@/lib/firebase-admin"
import { mobileRecord, orgCollection, type MobilePrincipal } from "@/lib/mobile-api"
import { stockChange, stockOperationSource } from "@/lib/stock-operations"
import { postStockOperation } from "./post-stock-operation"
import type { PortionRepository } from "./portion"

export async function firestorePortionRepository(principal: MobilePrincipal, request: Request): Promise<PortionRepository> {
  const FieldValue = await adminFieldValue()
  const inventory = orgCollection(principal, "inventory")
  const batches = orgCollection(principal, "inventoryBatches")
  const portions = orgCollection(principal, "portions")
  const operations = orgCollection(principal, "stockOperations")
  const history = orgCollection(principal, "history")
  return {
    runTransaction: (work) => principal.db.runTransaction(async (transaction) => work({
      readOperation: async (id) => { const snapshot = await transaction.get(operations.doc(id)); return snapshot.exists ? mobileRecord(snapshot.id, snapshot.data()) : undefined },
      readItem: async (id) => { const snapshot = await transaction.get(inventory.doc(id)); return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : undefined },
      readBatches: async (id) => { const snapshot = await transaction.get(batches.where("itemId", "==", id)); return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })) },
      readPortion: async (id) => { const snapshot = await transaction.get(portions.doc(id)); return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : undefined },
      readPackages: async (ids) => { const snapshots = await Promise.all(ids.map((id) => transaction.get(batches.doc(id)))); return snapshots.filter((doc) => doc.exists).map((doc) => ({ ...doc.data(), id: doc.id })) },
      write: (command, plan, response, fingerprint) => {
        const timestamp = FieldValue.serverTimestamp()
        const p = command.payload
        const itemName = response.data.itemName
        const unit = response.data.unit
        for (const entry of plan.allocation.allocations) transaction.update(batches.doc(entry.batchId), { remainingQuantity: entry.remainingQuantity, status: entry.remainingQuantity === 0 ? "depleted" : "available", updatedAt: timestamp, updatedByOperationId: command.commandId })
        if (plan.remainingUnknown > 0) transaction.create(batches.doc(plan.unknownBatchId), { id: plan.unknownBatchId, itemId: p.itemId, storeId: command.locationId, area: p.sourceArea, remainingQuantity: plan.remainingUnknown, originalQuantity: plan.remainingUnknown, unit, expirationDate: null, expirationKnown: false, receivedAt: null, source: "portion_untracked_balance", sourceOperationId: command.commandId, status: "available", createdAt: timestamp, updatedAt: timestamp })
        for (const entry of plan.packages) transaction.create(batches.doc(entry.id), { id: entry.id, itemId: p.itemId, itemName, storeId: command.locationId, remainingQuantity: p.portionWeight, originalQuantity: p.portionWeight, unit, area: p.sourceArea, receivedAt: plan.receivedAt, portionedAt: response.committedAt, expirationDate: plan.expirationDate, expirationKnown: Boolean(plan.expirationDate), expirationSource: plan.expirationSource, earliestSourceExpiration: plan.earliestSourceExpiration, unknownSourceExpiration: plan.unknownSourceExpiration, packageBarcode: entry.packageBarcode, parentBatchIds: entry.sourceAllocations.map((source) => source.batchId), sourceAllocations: entry.sourceAllocations, untrackedSourceQuantity: entry.untrackedQuantity, sourceOperationId: command.commandId, portionIndex: entry.index, portionCount: p.portionCount, status: "available", createdAt: timestamp, updatedAt: timestamp })
        transaction.create(portions.doc(command.commandId), { id: command.commandId, operationId: command.commandId, itemId: p.itemId, itemName, storeId: command.locationId, sourceArea: p.sourceArea, sourceBatchId: p.sourceBatchId ?? null, sourceBatchIds: plan.allocation.allocations.map((entry) => entry.batchId), sourceAllocations: plan.allocation.allocations, unallocatedQuantity: plan.allocation.unallocatedQuantity, portionWeight: p.portionWeight, portionCount: p.portionCount, totalWeight: plan.totalWeight, unit, expirationDate: plan.expirationDate, requestedExpirationDate: p.expirationDate ?? null, expirationSource: plan.expirationSource, earliestSourceExpiration: plan.earliestSourceExpiration, unknownSourceExpiration: plan.unknownSourceExpiration, packageBarcodePrefix: p.packageBarcodePrefix || null, portionIds: response.data.portionIds, createdBy: principal.uid, createdAt: timestamp })
        transaction.update(inventory.doc(p.itemId), { ...plan.after, lastPortionedAt: timestamp, updatedAt: timestamp, updatedBy: principal.uid, updatedByOperationId: command.commandId })
        transaction.create(history.doc(command.commandId), { id: command.commandId, type: "portion", label: "Cut & portion", operationId: command.commandId, storeId: command.locationId, userId: principal.uid, userName: String(principal.member.name ?? principal.email), employeeId: String(principal.member.employeeId ?? ""), department: String(principal.member.department ?? ""), title: String(principal.member.jobTitle ?? principal.member.role ?? ""), summary: `${p.portionCount} portions at ${p.portionWeight} ${unit} each`, responses: [{ label: itemName, value: `${plan.totalWeight} ${unit} portioned` }], createdAt: timestamp })
        const { data: _data, ...metadata } = response
        postStockOperation(transaction, operations.doc(command.commandId), { principal, operationId: command.commandId, operationType: "portion", storeId: command.locationId, changes: [stockChange(p.itemId, itemName, plan.before, plan.after, { unit, reason: "Converted weighable stock into labeled portions", sourceArea: p.sourceArea, destinationArea: p.sourceArea })], result: response.data, timestamp, source: stockOperationSource(request) }, { commandFingerprint: fingerprint, engineResult: metadata, occurredAt: response.committedAt })
      }
    }))
  }
}
