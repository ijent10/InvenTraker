import { z } from "zod"

import { adminFieldValue } from "@/lib/firebase-admin"
import { allocateBatches } from "@/lib/batch-allocation"
import { firestoreCollections } from "@/lib/firestore-schema"
import { assertStoreAccess, MobileApiError, mobileEnvelope, mobileError, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"
import { assertInventoryItemStore, derivedStockStatus, nextStockState, operationIdSchema, replayStockOperation, stockChange, stockOperationRecord, stockOperationSource, stockState } from "@/lib/stock-operations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  operationId: operationIdSchema,
  storeId: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number().positive(),
  source: z.enum(["front", "back"]),
  destination: z.enum(["front", "back"]),
  batchId: z.string().min(1).optional()
}).refine((value) => value.source !== value.destination, {
  message: "Choose two different stock areas."
})

export async function POST(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "inventory.edit")
    const parsed = requestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return Response.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message ?? "Valid transfer details are required." } }, { status: 400 })
    }
    await assertStoreAccess(principal, parsed.data.storeId)

    const FieldValue = await adminFieldValue()
    const inventory = orgCollection(principal, firestoreCollections.inventory)
    const batches = orgCollection(principal, firestoreCollections.inventoryBatches)
    const history = orgCollection(principal, firestoreCollections.history)
    const operations = orgCollection(principal, firestoreCollections.stockOperations)
    const result = await principal.db.runTransaction(async (transaction) => {
      const operationRef = operations.doc(parsed.data.operationId)
      const existingOperation = await transaction.get(operationRef)
      if (existingOperation.exists) return replayStockOperation<{
        itemId: string; itemName: string; frontStock: number; backStock: number; onHand: number
      }>(existingOperation.data(), principal, "transfer", parsed.data.storeId)!

      const inventoryRef = inventory.doc(parsed.data.itemId)
      const snapshot = await transaction.get(inventoryRef)
      if (!snapshot.exists) throw new MobileApiError("This inventory item no longer exists in the portal.", 404, "inventory_not_found")

      const current = snapshot.data() ?? {}
      assertInventoryItemStore(current, parsed.data.storeId)
      const batchSnapshot = await transaction.get(batches.where("itemId", "==", parsed.data.itemId))

      const before = stockState(current)
      const available = parsed.data.source === "front" ? before.frontStock : before.backStock
      if (parsed.data.quantity > available) {
        throw new MobileApiError(`Only ${available} units are available in ${parsed.data.source === "front" ? "sales floor" : "backstock"}.`, 400, "insufficient_stock")
      }

      const nextFrontStock = parsed.data.source === "front"
        ? before.frontStock - parsed.data.quantity
        : before.frontStock + parsed.data.quantity
      const nextBackStock = parsed.data.source === "back"
        ? before.backStock - parsed.data.quantity
        : before.backStock + parsed.data.quantity
      const after = nextStockState(before, nextFrontStock, nextBackStock)
      const eligibleBatches = batchSnapshot.docs
        .map((batch) => ({ id: batch.id, ...batch.data() }) as Record<string, unknown> & { id: string })
        .filter((batch) => batch.storeId === parsed.data.storeId && batch.area === parsed.data.source && Number(batch.remainingQuantity ?? 0) > 0)
      if (parsed.data.batchId && !eligibleBatches.some((batch) => batch.id === parsed.data.batchId)) {
        throw new MobileApiError("The selected batch is no longer available in this stock area.", 409, "batch_unavailable")
      }
      const batchAllocation = allocateBatches(eligibleBatches.map((batch) => ({
        id: batch.id,
        remainingQuantity: Number(batch.remainingQuantity ?? 0),
        expirationDate: typeof batch.expirationDate === "string" ? batch.expirationDate : null,
        receivedAt: typeof batch.receivedAt === "string" ? batch.receivedAt : null
      })), parsed.data.quantity, parsed.data.batchId)

      transaction.update(inventoryRef, {
        ...after,
        status: derivedStockStatus(current, after),
        lastTransferredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: principal.uid,
        updatedByOperationId: parsed.data.operationId
      })
      batchAllocation.allocations.forEach((entry, index) => {
        const sourceBatch = eligibleBatches.find((batch) => batch.id === entry.batchId)!
        transaction.update(batches.doc(entry.batchId), {
          remainingQuantity: entry.remainingQuantity,
          status: entry.remainingQuantity === 0 ? "depleted" : "available",
          updatedAt: FieldValue.serverTimestamp(),
          updatedByOperationId: parsed.data.operationId
        })
        const destinationBatchRef = batches.doc(`${parsed.data.operationId}-${index + 1}`)
        transaction.create(destinationBatchRef, {
          ...sourceBatch,
          id: destinationBatchRef.id,
          remainingQuantity: entry.quantity,
          originalQuantity: entry.quantity,
          area: parsed.data.destination,
          parentBatchId: entry.batchId,
          sourceOperationId: parsed.data.operationId,
          status: "available",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        })
      })

      const historyRef = history.doc(parsed.data.operationId)
      transaction.set(historyRef, {
        id: historyRef.id,
        type: "transfers",
        label: "Stock transfer",
        operationId: parsed.data.operationId,
        storeId: parsed.data.storeId,
        userId: principal.uid,
        userName: String(principal.member.name ?? principal.email),
        employeeId: String(principal.member.employeeId ?? ""),
        department: String(principal.member.department ?? ""),
        title: String(principal.member.jobTitle ?? principal.member.role ?? ""),
        summary: `${parsed.data.quantity} units moved from ${parsed.data.source === "front" ? "sales floor" : "backstock"} to ${parsed.data.destination === "front" ? "sales floor" : "backstock"}`,
        responses: [{
          label: String(current.name ?? "Inventory item"),
          value: `${parsed.data.quantity} moved; ${batchAllocation.unallocatedQuantity} without batch detail`
        }],
        createdAt: FieldValue.serverTimestamp()
      })

      const operationResult = {
        itemId: snapshot.id,
        itemName: String(current.name ?? "Inventory item"),
        frontStock: after.frontStock,
        backStock: after.backStock,
        onHand: after.onHand,
        batchAllocations: batchAllocation.allocations,
        unallocatedQuantity: batchAllocation.unallocatedQuantity,
        allocationMethod: parsed.data.batchId ? "human_override" : "earliest_expiring_first",
        selectedBatchId: parsed.data.batchId ?? null
      }
      transaction.create(operationRef, stockOperationRecord({
        principal,
        operationId: parsed.data.operationId,
        operationType: "transfer",
        storeId: parsed.data.storeId,
        changes: [stockChange(snapshot.id, operationResult.itemName, before, after, {
          unit: String(current.unit ?? "eaches"),
          reason: "Stock area transfer",
          sourceArea: parsed.data.source,
          destinationArea: parsed.data.destination
        })],
        result: operationResult,
        timestamp: FieldValue.serverTimestamp(),
        source: stockOperationSource(request)
      }))
      return operationResult
    })

    return Response.json(mobileEnvelope(result))
  } catch (error) {
    return mobileError(error)
  }
}
