import { z } from "zod"

import { adminFieldValue } from "@/lib/firebase-admin"
import { allocateBatches } from "@/lib/batch-allocation"
import { firestoreCollections } from "@/lib/firestore-schema"
import { assertStoreAccess, MobileApiError, mobileEnvelope, mobileError, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"
import { assertInventoryItemStore, operationIdSchema, replayStockOperation, stockChange, stockOperationRecord, stockOperationSource, stockState } from "@/lib/stock-operations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  operationId: operationIdSchema,
  storeId: z.string().min(1),
  itemId: z.string().min(1),
  sourceArea: z.enum(["front", "back"]),
  sourceBatchId: z.string().min(1).optional(),
  portionWeight: z.number().positive().max(10_000),
  portionCount: z.number().int().min(1).max(200),
  expirationDate: z.string().min(1).optional(),
  packageBarcodePrefix: z.string().trim().max(64).optional()
})

function isWeighable(item: Record<string, unknown>) {
  const unit = String(item.unit ?? "").toLowerCase()
  const variable = item.variableMeasure && typeof item.variableMeasure === "object"
    ? Boolean((item.variableMeasure as Record<string, unknown>).isVariableMeasure)
    : false
  return variable || ["pounds", "pound", "lbs", "lb", "ounces", "ounce", "oz", "grams", "gram", "g", "kilograms", "kilogram", "kg"].includes(unit)
}

export async function POST(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "inventory.edit")
    const parsed = requestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return Response.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message ?? "Valid portion details are required." } }, { status: 400 })
    }
    await assertStoreAccess(principal, parsed.data.storeId)

    const FieldValue = await adminFieldValue()
    const inventory = orgCollection(principal, firestoreCollections.inventory)
    const batches = orgCollection(principal, firestoreCollections.inventoryBatches)
    const portions = orgCollection(principal, firestoreCollections.portions)
    const history = orgCollection(principal, firestoreCollections.history)
    const operations = orgCollection(principal, firestoreCollections.stockOperations)

    const result = await principal.db.runTransaction(async (transaction) => {
      const operationRef = operations.doc(parsed.data.operationId)
      const inventoryRef = inventory.doc(parsed.data.itemId)
      const [existingOperation, snapshot, batchSnapshot] = await Promise.all([
        transaction.get(operationRef),
        transaction.get(inventoryRef),
        transaction.get(batches.where("itemId", "==", parsed.data.itemId))
      ])
      if (existingOperation.exists) {
        return replayStockOperation<{
          itemId: string; itemName: string; portionCount: number; portionWeight: number; totalWeight: number; unit: string; portionIds: string[]
        }>(existingOperation.data(), principal, "portion", parsed.data.storeId)!
      }
      if (!snapshot.exists) throw new MobileApiError("This inventory item no longer exists in the portal.", 404, "inventory_not_found")

      const current = snapshot.data() ?? {}
      assertInventoryItemStore(current, parsed.data.storeId)
      if (!isWeighable(current)) throw new MobileApiError("Only weighable inventory can be cut into portions.", 400, "item_not_weighable")

      const before = stockState(current)
      const totalWeight = Math.round(parsed.data.portionWeight * parsed.data.portionCount * 1000) / 1000
      const available = parsed.data.sourceArea === "front" ? before.frontStock : before.backStock
      if (totalWeight > available) {
        throw new MobileApiError(`Only ${available} ${String(current.unit ?? "units")} are available in ${parsed.data.sourceArea === "front" ? "sales floor" : "backstock"}.`, 400, "insufficient_stock")
      }

      const eligibleBatches = batchSnapshot.docs
        .map((batch) => ({ id: batch.id, ...batch.data() }) as Record<string, unknown> & { id: string })
        .filter((batch) => batch.storeId === parsed.data.storeId && batch.area === parsed.data.sourceArea && Number(batch.remainingQuantity ?? 0) > 0)
      if (parsed.data.sourceBatchId && !eligibleBatches.some((batch) => batch.id === parsed.data.sourceBatchId)) {
        throw new MobileApiError("The selected source batch is no longer available.", 409, "batch_unavailable")
      }
      const allocatable = parsed.data.sourceBatchId
        ? eligibleBatches.filter((batch) => batch.id === parsed.data.sourceBatchId)
        : eligibleBatches
      const allocation = allocateBatches(allocatable.map((batch) => ({
        id: batch.id,
        remainingQuantity: Number(batch.remainingQuantity ?? 0),
        expirationDate: typeof batch.expirationDate === "string" ? batch.expirationDate : null,
        receivedAt: typeof batch.receivedAt === "string" ? batch.receivedAt : null
      })), totalWeight, parsed.data.sourceBatchId)
      const trackedInArea = eligibleBatches.reduce((sum, batch) => sum + Number(batch.remainingQuantity ?? 0), 0)
      const untrackedAvailable = Math.max(0, available - trackedInArea)
      if (allocation.unallocatedQuantity > untrackedAvailable) {
        throw new MobileApiError("The available weight is spread across tracked batches. Choose a source batch with enough weight or reconcile the count first.", 409, "batch_quantity_unavailable")
      }

      allocation.allocations.forEach((entry) => {
        transaction.update(batches.doc(entry.batchId), {
          remainingQuantity: entry.remainingQuantity,
          status: entry.remainingQuantity === 0 ? "depleted" : "available",
          updatedAt: FieldValue.serverTimestamp(),
          updatedByOperationId: parsed.data.operationId
        })
      })

      const portionIds: string[] = []
      for (let index = 0; index < parsed.data.portionCount; index += 1) {
        const id = `${parsed.data.operationId}-${index + 1}`
        portionIds.push(id)
        const barcodePrefix = parsed.data.packageBarcodePrefix?.trim()
        transaction.create(batches.doc(id), {
          id,
          itemId: snapshot.id,
          itemName: String(current.name ?? "Inventory item"),
          storeId: parsed.data.storeId,
          remainingQuantity: parsed.data.portionWeight,
          originalQuantity: parsed.data.portionWeight,
          unit: String(current.unit ?? "pounds"),
          area: parsed.data.sourceArea,
          receivedAt: new Date().toISOString(),
          expirationDate: parsed.data.expirationDate ?? null,
          expirationKnown: Boolean(parsed.data.expirationDate),
          packageBarcode: barcodePrefix ? `${barcodePrefix}-${String(index + 1).padStart(3, "0")}` : null,
          parentBatchIds: allocation.allocations.map((entry) => entry.batchId),
          sourceOperationId: parsed.data.operationId,
          portionIndex: index + 1,
          portionCount: parsed.data.portionCount,
          status: "available",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        })
      }

      const portionRef = portions.doc(parsed.data.operationId)
      transaction.create(portionRef, {
        id: portionRef.id,
        operationId: parsed.data.operationId,
        itemId: snapshot.id,
        itemName: String(current.name ?? "Inventory item"),
        storeId: parsed.data.storeId,
        sourceArea: parsed.data.sourceArea,
        sourceBatchId: parsed.data.sourceBatchId ?? null,
        sourceBatchIds: allocation.allocations.map((entry) => entry.batchId),
        portionWeight: parsed.data.portionWeight,
        portionCount: parsed.data.portionCount,
        totalWeight,
        unit: String(current.unit ?? "pounds"),
        expirationDate: parsed.data.expirationDate ?? null,
        portionIds,
        createdBy: principal.uid,
        createdAt: FieldValue.serverTimestamp()
      })

      transaction.update(inventoryRef, {
        lastPortionedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: principal.uid,
        updatedByOperationId: parsed.data.operationId
      })
      transaction.create(history.doc(parsed.data.operationId), {
        id: parsed.data.operationId,
        type: "portion",
        label: "Cut & portion",
        operationId: parsed.data.operationId,
        storeId: parsed.data.storeId,
        userId: principal.uid,
        userName: String(principal.member.name ?? principal.email),
        employeeId: String(principal.member.employeeId ?? ""),
        department: String(principal.member.department ?? ""),
        title: String(principal.member.jobTitle ?? principal.member.role ?? ""),
        summary: `${parsed.data.portionCount} portions at ${parsed.data.portionWeight} ${String(current.unit ?? "pounds")} each`,
        responses: [{ label: String(current.name ?? "Inventory item"), value: `${totalWeight} ${String(current.unit ?? "pounds")} portioned` }],
        createdAt: FieldValue.serverTimestamp()
      })

      const operationResult = {
        itemId: snapshot.id,
        itemName: String(current.name ?? "Inventory item"),
        portionCount: parsed.data.portionCount,
        portionWeight: parsed.data.portionWeight,
        totalWeight,
        unit: String(current.unit ?? "pounds"),
        portionIds
      }
      transaction.create(operationRef, stockOperationRecord({
        principal,
        operationId: parsed.data.operationId,
        operationType: "portion",
        storeId: parsed.data.storeId,
        changes: [stockChange(snapshot.id, operationResult.itemName, before, before, {
          unit: operationResult.unit,
          reason: "Converted weighable stock into labeled portions",
          sourceArea: parsed.data.sourceArea,
          destinationArea: parsed.data.sourceArea
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
