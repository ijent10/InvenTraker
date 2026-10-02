import { z } from "zod"

import { adminFieldValue } from "@/lib/firebase-admin"
import { allocateBatches, reconcileBatchTotal } from "@/lib/batch-allocation"
import { firestoreCollections } from "@/lib/firestore-schema"
import { assertStoreAccess, mobileEnvelope, mobileError, mobileRecord, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"
import { assertInventoryItemStore, assertUniqueItemLines, derivedStockStatus, nextStockState, operationIdSchema, replayStockOperation, stockChange, stockOperationRecord, stockOperationSource, stockState, type StockChange } from "@/lib/stock-operations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  operationId: operationIdSchema,
  storeId: z.string().min(1),
  commit: z.boolean().default(false),
  lines: z.array(z.object({ itemId: z.string().min(1), countedFrontStock: z.number().min(0) })).min(1)
})

export async function POST(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "inventory.edit")
    const parsed = requestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: { code: "invalid_request", message: "Valid restock counts are required." } }, { status: 400 })
    await assertStoreAccess(principal, parsed.data.storeId)
    assertUniqueItemLines(parsed.data.lines)

    const FieldValue = await adminFieldValue()
    const inventory = orgCollection(principal, firestoreCollections.inventory)
    const batches = orgCollection(principal, firestoreCollections.inventoryBatches)
    const history = orgCollection(principal, firestoreCollections.history)
    const operations = orgCollection(principal, firestoreCollections.stockOperations)
    const result = await principal.db.runTransaction(async (transaction) => {
      const operationRef = operations.doc(parsed.data.operationId)
      if (parsed.data.commit) {
        const existingOperation = await transaction.get(operationRef)
        if (existingOperation.exists) return replayStockOperation<Record<string, unknown>>(existingOperation.data(), principal, "restock", parsed.data.storeId)!
      }
      const refs = parsed.data.lines.map((line) => inventory.doc(line.itemId))
      const snapshots = await Promise.all(refs.map((reference) => transaction.get(reference)))
      const batchSnapshots = parsed.data.commit
        ? await Promise.all(parsed.data.lines.map((line) => transaction.get(batches.where("itemId", "==", line.itemId))))
        : []
      const recommendations = parsed.data.lines.map((line, index) => {
        const snapshot = snapshots[index]
        if (!snapshot.exists) throw new Error(`Inventory item ${line.itemId} was not found.`)
        const current = snapshot.data() ?? {}
        assertInventoryItemStore(current, parsed.data.storeId)
        const before = stockState(current)
        const targetFront = Math.max(0, Number(current.frontCapacity ?? current.frontPar ?? current.par ?? 0))
        const availableBack = Math.max(0, Number(current.backStock ?? 0))
        const pullQuantity = Math.min(Math.max(0, targetFront - line.countedFrontStock), availableBack)
        return {
          itemId: snapshot.id,
          name: String(current.name ?? "Inventory item"),
          countedFrontStock: line.countedFrontStock,
          previousBackStock: availableBack,
          targetFrontStock: targetFront,
          pullQuantity,
          resultingFrontStock: line.countedFrontStock + pullQuantity,
          resultingBackStock: availableBack - pullQuantity,
          current
        }
      })

      if (parsed.data.commit) {
        const changes: StockChange[] = []
        recommendations.forEach((recommendation, index) => {
          const snapshot = snapshots[index]
          const before = stockState(recommendation.current)
          const after = nextStockState(before, recommendation.resultingFrontStock, recommendation.resultingBackStock)
          transaction.update(snapshot.ref, {
            ...after,
            status: derivedStockStatus(recommendation.current, after),
            lastRestockedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: principal.uid,
            updatedByOperationId: parsed.data.operationId
          })
          const itemBatches = batchSnapshots[index].docs
            .map((batch) => ({ id: batch.id, ...batch.data() }) as Record<string, unknown> & { id: string })
            .filter((batch) => batch.storeId === parsed.data.storeId && Number(batch.remainingQuantity ?? 0) > 0)
          const frontBatches = itemBatches.filter((batch) => batch.area === "front")
          const frontReconciliation = reconcileBatchTotal(frontBatches.map((batch) => ({
            id: batch.id,
            remainingQuantity: Number(batch.remainingQuantity ?? 0),
            expirationDate: typeof batch.expirationDate === "string" ? batch.expirationDate : null,
            receivedAt: typeof batch.receivedAt === "string" ? batch.receivedAt : null
          })), recommendation.countedFrontStock)
          frontReconciliation.allocations.forEach((entry) => {
            transaction.update(batches.doc(entry.batchId), {
              remainingQuantity: entry.remainingQuantity,
              status: entry.remainingQuantity === 0 ? "depleted" : "available",
              updatedAt: FieldValue.serverTimestamp(),
              updatedByOperationId: parsed.data.operationId
            })
          })
          if (frontReconciliation.addedUnknownQuantity > 0) {
            const unknownRef = batches.doc(`${parsed.data.operationId}-${index + 1}-front`)
            transaction.create(unknownRef, {
              id: unknownRef.id,
              itemId: snapshot.id,
              itemName: recommendation.name,
              storeId: parsed.data.storeId,
              remainingQuantity: frontReconciliation.addedUnknownQuantity,
              originalQuantity: frontReconciliation.addedUnknownQuantity,
              unit: String(recommendation.current.unit ?? "eaches"),
              area: "front",
              receivedAt: null,
              expirationDate: null,
              expirationKnown: false,
              openedAt: null,
              preparedAt: null,
              sourceOperationId: parsed.data.operationId,
              source: "restock_count_reconciliation",
              status: "available",
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp()
            })
          }
          const eligibleBatches = itemBatches.filter((batch) => batch.area === "back")
          const allocation = allocateBatches(eligibleBatches.map((batch) => ({
            id: batch.id,
            remainingQuantity: Number(batch.remainingQuantity ?? 0),
            expirationDate: typeof batch.expirationDate === "string" ? batch.expirationDate : null,
            receivedAt: typeof batch.receivedAt === "string" ? batch.receivedAt : null
          })), recommendation.pullQuantity)
          allocation.allocations.forEach((entry, allocationIndex) => {
            const sourceBatch = eligibleBatches.find((batch) => batch.id === entry.batchId)!
            transaction.update(batches.doc(entry.batchId), {
              remainingQuantity: entry.remainingQuantity,
              status: entry.remainingQuantity === 0 ? "depleted" : "available",
              updatedAt: FieldValue.serverTimestamp(),
              updatedByOperationId: parsed.data.operationId
            })
            const destinationRef = batches.doc(`${parsed.data.operationId}-${index + 1}-${allocationIndex + 1}`)
            transaction.create(destinationRef, {
              ...sourceBatch,
              id: destinationRef.id,
              remainingQuantity: entry.quantity,
              originalQuantity: entry.quantity,
              area: "front",
              parentBatchId: entry.batchId,
              sourceOperationId: parsed.data.operationId,
              status: "available",
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp()
            })
          })
          changes.push(stockChange(snapshot.id, recommendation.name, before, after, {
            unit: String(recommendation.current.unit ?? "eaches"),
            reason: "Replenished sales floor",
            sourceArea: "back",
            destinationArea: "front"
          }))
        })
        const historyRef = history.doc(parsed.data.operationId)
        transaction.set(historyRef, {
          id: historyRef.id,
          type: "restocks",
          label: "Restock",
          operationId: parsed.data.operationId,
          storeId: parsed.data.storeId,
          userId: principal.uid,
          userName: String(principal.member.name ?? principal.email),
          employeeId: String(principal.member.employeeId ?? ""),
          department: String(principal.member.department ?? ""),
          title: String(principal.member.jobTitle ?? principal.member.role ?? ""),
          summary: `${recommendations.reduce((total, item) => total + item.pullQuantity, 0)} units moved to the sales floor`,
          responses: recommendations.map((item) => ({ label: item.name, value: `Pull ${item.pullQuantity}` })),
          createdAt: FieldValue.serverTimestamp()
        })

        const operationResult = {
          committed: true,
          recommendations: recommendations.map(({ current, ...recommendation }) => ({
            ...recommendation,
            item: mobileRecord(recommendation.itemId, current)
          }))
        }
        transaction.create(operationRef, stockOperationRecord({
          principal,
          operationId: parsed.data.operationId,
          operationType: "restock",
          storeId: parsed.data.storeId,
          changes,
          result: operationResult,
          timestamp: FieldValue.serverTimestamp(),
          source: stockOperationSource(request)
        }))
        return operationResult
      }

      return {
        committed: parsed.data.commit,
        recommendations: recommendations.map(({ current, ...recommendation }) => ({
          ...recommendation,
          item: mobileRecord(recommendation.itemId, current)
        }))
      }
    })

    return Response.json(mobileEnvelope(result))
  } catch (error) {
    return mobileError(error)
  }
}
