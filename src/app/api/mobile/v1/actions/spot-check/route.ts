import { z } from "zod"

import { adminFieldValue } from "@/lib/firebase-admin"
import { reconcileBatchTotal } from "@/lib/batch-allocation"
import { firestoreCollections } from "@/lib/firestore-schema"
import { assertStoreAccess, MobileApiError, mobileEnvelope, mobileError, mobileRecord, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"
import { assertInventoryItemStore, assertUniqueItemLines, derivedStockStatus, nextStockState, operationIdSchema, replayStockOperation, stockChange, stockOperationRecord, stockOperationSource, stockState, type StockChange } from "@/lib/stock-operations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  operationId: operationIdSchema,
  storeId: z.string().min(1),
  lines: z.array(
    z.object({
      itemId: z.string().min(1),
      expectedRevision: z.number().int().min(0),
      reason: z.string().trim().min(1).max(240).optional(),
      frontStock: z.number().min(0),
      backStock: z.number().min(0),
      expirationDate: z.string().datetime().optional()
    })
  ).min(1)
})

export async function POST(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "inventory.edit")
    const parsed = requestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: { code: "invalid_request", message: "Valid spot-check counts are required." } }, { status: 400 })
    await assertStoreAccess(principal, parsed.data.storeId)
    assertUniqueItemLines(parsed.data.lines)

    const FieldValue = await adminFieldValue()
    const inventory = orgCollection(principal, firestoreCollections.inventory)
    const history = orgCollection(principal, firestoreCollections.history)
    const batches = orgCollection(principal, firestoreCollections.inventoryBatches)
    const operations = orgCollection(principal, firestoreCollections.stockOperations)
    const result = await principal.db.runTransaction(async (transaction) => {
      const operationRef = operations.doc(parsed.data.operationId)
      const existingOperation = await transaction.get(operationRef)
      if (existingOperation.exists) return replayStockOperation<{ updated: Record<string, unknown>[]; historyId: string }>(existingOperation.data(), principal, "spot_check", parsed.data.storeId)!

      const refs = parsed.data.lines.map((line) => inventory.doc(line.itemId))
      const snapshots = await Promise.all(refs.map((reference) => transaction.get(reference)))
      const batchSnapshots = await Promise.all(parsed.data.lines.map((line) => transaction.get(batches.where("itemId", "==", line.itemId))))
      const updated: Record<string, unknown>[] = []
      const changes: StockChange[] = []

      parsed.data.lines.forEach((line, index) => {
        const snapshot = snapshots[index]
        if (!snapshot.exists) throw new Error(`Inventory item ${line.itemId} was not found.`)
        const current = snapshot.data() ?? {}
        assertInventoryItemStore(current, parsed.data.storeId)
        const before = stockState(current)
        if (line.expectedRevision !== before.revision) {
          throw new MobileApiError("Stock changed after this count was opened. Refresh and count again.", 409, "stale_count")
        }
        const after = nextStockState(before, line.frontStock, line.backStock)
        const next = {
          ...after,
          status: derivedStockStatus(current, after),
          lastCountedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: principal.uid,
          updatedByOperationId: parsed.data.operationId,
          ...(current.expires && line.expirationDate ? { lastVerifiedExpiration: line.expirationDate } : {})
        }
        transaction.update(snapshot.ref, next)
        const itemBatches = batchSnapshots[index].docs
          .map((batch) => ({ id: batch.id, ...batch.data() }) as Record<string, unknown> & { id: string })
          .filter((batch) => batch.storeId === parsed.data.storeId && Number(batch.remainingQuantity ?? 0) > 0)
        const reconcileArea = (area: "front" | "back", countedQuantity: number) => {
          const areaBatches = itemBatches.filter((batch) => batch.area === area)
          const reconciliation = reconcileBatchTotal(areaBatches.map((batch) => ({
            id: batch.id,
            remainingQuantity: Number(batch.remainingQuantity ?? 0),
            expirationDate: typeof batch.expirationDate === "string" ? batch.expirationDate : null,
            receivedAt: typeof batch.receivedAt === "string" ? batch.receivedAt : null
          })), countedQuantity)
          reconciliation.allocations.forEach((entry) => {
            transaction.update(batches.doc(entry.batchId), {
              remainingQuantity: entry.remainingQuantity,
              status: entry.remainingQuantity === 0 ? "depleted" : "available",
              updatedAt: FieldValue.serverTimestamp(),
              updatedByOperationId: parsed.data.operationId
            })
          })
          if (reconciliation.addedUnknownQuantity > 0) {
            const unknownBatchRef = batches.doc(`${parsed.data.operationId}-${index + 1}-${area}`)
            transaction.create(unknownBatchRef, {
              id: unknownBatchRef.id,
              itemId: snapshot.id,
              itemName: String(current.name ?? "Inventory item"),
              storeId: parsed.data.storeId,
              remainingQuantity: reconciliation.addedUnknownQuantity,
              originalQuantity: reconciliation.addedUnknownQuantity,
              unit: String(current.unit ?? "eaches"),
              area,
              receivedAt: null,
              expirationDate: null,
              expirationKnown: false,
              openedAt: null,
              preparedAt: null,
              sourceOperationId: parsed.data.operationId,
              source: "count_reconciliation",
              status: "available",
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp()
            })
          }
          return reconciliation
        }
        const frontReconciliation = reconcileArea("front", line.frontStock)
        const backReconciliation = reconcileArea("back", line.backStock)
        updated.push(mobileRecord(snapshot.id, { ...current, ...next, lastCountedAt: new Date(), updatedAt: new Date() }))
        changes.push(stockChange(snapshot.id, String(current.name ?? "Inventory item"), before, after, {
          unit: String(current.unit ?? "eaches"),
          reason: `${line.reason ?? "Verified spot count"}; batch detail reconciled from front ${frontReconciliation.previousKnownQuantity} and back ${backReconciliation.previousKnownQuantity}`
        }))
      })

      const historyRef = history.doc(parsed.data.operationId)
      transaction.set(historyRef, {
        id: historyRef.id,
        type: "spot-checks",
        label: "Spot check",
        operationId: parsed.data.operationId,
        storeId: parsed.data.storeId,
        userId: principal.uid,
        userName: String(principal.member.name ?? principal.email),
        employeeId: String(principal.member.employeeId ?? ""),
        department: String(principal.member.department ?? ""),
        title: String(principal.member.jobTitle ?? principal.member.role ?? ""),
        summary: `${parsed.data.lines.length} item${parsed.data.lines.length === 1 ? "" : "s"} counted`,
        responses: parsed.data.lines.map((line) => ({ label: line.itemId, value: `${line.frontStock + line.backStock}` })),
        createdAt: FieldValue.serverTimestamp()
      })
      const operationResult = { updated, historyId: historyRef.id }
      transaction.create(operationRef, stockOperationRecord({
        principal,
        operationId: parsed.data.operationId,
        operationType: "spot_check",
        storeId: parsed.data.storeId,
        changes,
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
