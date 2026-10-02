import { z } from "zod"

import { adminFieldValue } from "@/lib/firebase-admin"
import { allocateBatches } from "@/lib/batch-allocation"
import { firestoreCollections } from "@/lib/firestore-schema"
import { assertStoreAccess, MobileApiError, mobileEnvelope, mobileError, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"
import { assertInventoryItemStore, derivedStockStatus, nextStockState, operationIdSchema, replayStockOperation, stockChange, stockOperationRecord, stockOperationSource, stockState, type StockChange } from "@/lib/stock-operations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  operationId: operationIdSchema,
  storeId: z.string().min(1),
  lines: z.array(z.object({
    itemId: z.string().min(1),
    quantity: z.number().positive(),
    area: z.enum(["front", "back"]),
    reason: z.string().min(1).max(240),
    batchId: z.string().min(1).optional()
  })).min(1)
})

export async function POST(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "inventory.edit")
    const parsed = requestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: { code: "invalid_request", message: "Valid waste quantities and reasons are required." } }, { status: 400 })
    await assertStoreAccess(principal, parsed.data.storeId)
    const lineKeys = parsed.data.lines.map((line) => `${line.itemId}:${line.area}`)
    if (new Set(lineKeys).size !== lineKeys.length) {
      return Response.json({ error: { code: "duplicate_item_area", message: "Each inventory item and stock area can appear only once." } }, { status: 400 })
    }

    const FieldValue = await adminFieldValue()
    const inventory = orgCollection(principal, firestoreCollections.inventory)
    const waste = orgCollection(principal, firestoreCollections.waste)
    const batches = orgCollection(principal, firestoreCollections.inventoryBatches)
    const history = orgCollection(principal, firestoreCollections.history)
    const operations = orgCollection(principal, firestoreCollections.stockOperations)
    const wasteIds = await principal.db.runTransaction(async (transaction) => {
      const operationRef = operations.doc(parsed.data.operationId)
      const existingOperation = await transaction.get(operationRef)
      if (existingOperation.exists) return replayStockOperation<{ wasteIds: string[] }>(existingOperation.data(), principal, "waste", parsed.data.storeId)!

      const itemIds = [...new Set(parsed.data.lines.map((line) => line.itemId))]
      const refs = itemIds.map((itemId) => inventory.doc(itemId))
      const snapshots = await Promise.all(refs.map((reference) => transaction.get(reference)))
      const batchSnapshots = await Promise.all(itemIds.map((itemId) => transaction.get(batches.where("itemId", "==", itemId))))
      const ids: string[] = []
      const changes: StockChange[] = []

      snapshots.forEach((snapshot, snapshotIndex) => {
        const itemLines = parsed.data.lines.filter((line) => line.itemId === snapshot.id)
        if (!snapshot.exists) throw new Error(`Inventory item ${snapshot.id} was not found.`)
        const current = snapshot.data() ?? {}
        assertInventoryItemStore(current, parsed.data.storeId)
        const before = stockState(current)
        const frontWaste = itemLines.filter((line) => line.area === "front").reduce((total, line) => total + line.quantity, 0)
        const backWaste = itemLines.filter((line) => line.area === "back").reduce((total, line) => total + line.quantity, 0)
        if (frontWaste > before.frontStock || backWaste > before.backStock) throw new Error("Waste quantity is greater than available stock.")
        const after = nextStockState(before, before.frontStock - frontWaste, before.backStock - backWaste)
        transaction.update(snapshot.ref, {
          ...after,
          status: derivedStockStatus(current, after),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: principal.uid,
          updatedByOperationId: parsed.data.operationId
        })
        itemLines.forEach((line) => {
          const lineIndex = parsed.data.lines.indexOf(line)
          const eligibleBatches = batchSnapshots[snapshotIndex].docs
            .map((batch) => ({ id: batch.id, ...batch.data() }) as Record<string, unknown> & { id: string })
            .filter((batch) => batch.storeId === parsed.data.storeId && batch.area === line.area && Number(batch.remainingQuantity ?? 0) > 0)
          if (line.batchId && !eligibleBatches.some((batch) => batch.id === line.batchId)) {
            throw new MobileApiError("The selected batch is no longer available in this stock area.", 409, "batch_unavailable")
          }
          const allocation = allocateBatches(eligibleBatches.map((batch) => ({
            id: batch.id,
            remainingQuantity: Number(batch.remainingQuantity ?? 0),
            expirationDate: typeof batch.expirationDate === "string" ? batch.expirationDate : null,
            receivedAt: typeof batch.receivedAt === "string" ? batch.receivedAt : null
          })), line.quantity, line.batchId)
          allocation.allocations.forEach((entry) => {
            transaction.update(batches.doc(entry.batchId), {
              remainingQuantity: entry.remainingQuantity,
              status: entry.remainingQuantity === 0 ? "depleted" : "available",
              updatedAt: FieldValue.serverTimestamp(),
              updatedByOperationId: parsed.data.operationId
            })
          })
          const wasteRef = waste.doc(`${parsed.data.operationId}-${lineIndex + 1}`)
          ids.push(wasteRef.id)
          transaction.set(wasteRef, {
            id: wasteRef.id,
            operationId: parsed.data.operationId,
            itemId: snapshot.id,
            itemName: String(current.name ?? "Inventory item"),
            storeId: parsed.data.storeId,
            quantity: line.quantity,
            unit: String(current.unit ?? "eaches"),
            area: line.area,
            reason: line.reason,
            batchAllocations: allocation.allocations,
            unallocatedQuantity: allocation.unallocatedQuantity,
            allocationMethod: line.batchId ? "human_override" : "earliest_expiring_first",
            selectedBatchId: line.batchId ?? null,
            userId: principal.uid,
            createdAt: FieldValue.serverTimestamp()
          })
        })
        changes.push(stockChange(snapshot.id, String(current.name ?? "Inventory item"), before, after, {
          unit: String(current.unit ?? "eaches"),
          reason: itemLines.map((line) => line.reason).join("; ")
        }))
      })

      const historyRef = history.doc(parsed.data.operationId)
      transaction.set(historyRef, {
        id: historyRef.id,
        type: "waste",
        label: "Waste",
        operationId: parsed.data.operationId,
        storeId: parsed.data.storeId,
        userId: principal.uid,
        userName: String(principal.member.name ?? principal.email),
        employeeId: String(principal.member.employeeId ?? ""),
        department: String(principal.member.department ?? ""),
        title: String(principal.member.jobTitle ?? principal.member.role ?? ""),
        summary: `${parsed.data.lines.length} waste entr${parsed.data.lines.length === 1 ? "y" : "ies"} recorded`,
        createdAt: FieldValue.serverTimestamp()
      })
      const operationResult = { wasteIds: ids, humanOverrideCount: parsed.data.lines.filter((line) => Boolean(line.batchId)).length }
      transaction.create(operationRef, stockOperationRecord({
        principal,
        operationId: parsed.data.operationId,
        operationType: "waste",
        storeId: parsed.data.storeId,
        changes,
        result: operationResult,
        timestamp: FieldValue.serverTimestamp(),
        source: stockOperationSource(request)
      }))
      return operationResult
    })

    return Response.json(mobileEnvelope(wasteIds))
  } catch (error) {
    return mobileError(error)
  }
}
