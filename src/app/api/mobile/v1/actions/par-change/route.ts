import { z } from "zod"

import { adminFieldValue } from "@/lib/firebase-admin"
import { firestoreCollections } from "@/lib/firestore-schema"
import { assertStoreAccess, MobileApiError, mobileEnvelope, mobileError, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"
import { assertInventoryItemStore, derivedStockStatus, operationIdSchema, replayStockOperation, stockOperationRecord, stockOperationSource, stockState, type ParChange } from "@/lib/stock-operations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  operationId: operationIdSchema,
  storeId: z.string().min(1),
  itemId: z.string().min(1),
  expectedRevision: z.number().int().min(0),
  par: z.number().min(0),
  reorderPoint: z.number().min(0),
  reason: z.string().trim().min(1).max(240)
})

export async function POST(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "inventory.edit")
    const parsed = requestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new MobileApiError("Valid par values and a reason are required.", 400, "invalid_request")
    await assertStoreAccess(principal, parsed.data.storeId)

    const FieldValue = await adminFieldValue()
    const inventory = orgCollection(principal, firestoreCollections.inventory)
    const operations = orgCollection(principal, firestoreCollections.stockOperations)
    const history = orgCollection(principal, firestoreCollections.history)
    const result = await principal.db.runTransaction(async (transaction) => {
      const operationRef = operations.doc(parsed.data.operationId)
      const existingOperation = await transaction.get(operationRef)
      if (existingOperation.exists) {
        return replayStockOperation<{ revision: number }>(existingOperation.data(), principal, "par_change", parsed.data.storeId)!
      }

      const itemRef = inventory.doc(parsed.data.itemId)
      const snapshot = await transaction.get(itemRef)
      if (!snapshot.exists) throw new MobileApiError("This inventory item no longer exists.", 404, "inventory_not_found")
      const current = snapshot.data() ?? {}
      assertInventoryItemStore(current, parsed.data.storeId)
      const revision = stockState(current).revision
      if (revision !== parsed.data.expectedRevision) {
        throw new MobileApiError("Stock changed after this item was opened. Refresh before changing its par.", 409, "stale_inventory")
      }

      const change: ParChange = {
        itemId: snapshot.id,
        itemName: String(current.name ?? "Inventory item"),
        unit: String(current.unit ?? "eaches"),
        before: {
          par: Number(current.par ?? 0),
          reorderPoint: Number(current.reorderPoint ?? 0),
          revision
        },
        after: {
          par: parsed.data.par,
          reorderPoint: parsed.data.reorderPoint,
          revision: revision + 1
        },
        reason: parsed.data.reason
      }
      transaction.update(itemRef, {
        par: parsed.data.par,
        reorderPoint: parsed.data.reorderPoint,
        revision: revision + 1,
        status: derivedStockStatus(current, stockState(current), parsed.data.reorderPoint),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: principal.uid,
        updatedByOperationId: parsed.data.operationId
      })
      const orgProductId = String(current.orgProductId ?? "").trim()
      if (orgProductId) {
        const storeDetailRef = principal.db
          .collection(firestoreCollections.orgs)
          .doc(principal.orgId)
          .collection(firestoreCollections.stores)
          .doc(parsed.data.storeId)
          .collection(firestoreCollections.storeProductDetails)
          .doc(orgProductId)
        transaction.set(storeDetailRef, {
          par: parsed.data.par,
          reorderPoint: parsed.data.reorderPoint,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: principal.uid,
          updatedByOperationId: parsed.data.operationId
        }, { merge: true })
      }

      const historyRef = history.doc(parsed.data.operationId)
      transaction.create(historyRef, {
        id: historyRef.id,
        operationId: parsed.data.operationId,
        type: "par-changes",
        label: "Par changed",
        storeId: parsed.data.storeId,
        userId: principal.uid,
        userName: String(principal.member.name ?? principal.email),
        employeeId: String(principal.member.employeeId ?? ""),
        department: String(principal.member.department ?? ""),
        title: String(principal.member.jobTitle ?? principal.member.role ?? ""),
        summary: `${change.itemName}: par ${change.before.par} → ${change.after.par}, reorder point ${change.before.reorderPoint} → ${change.after.reorderPoint}`,
        reason: parsed.data.reason,
        createdAt: FieldValue.serverTimestamp()
      })
      const operationResult = { revision: revision + 1 }
      transaction.create(operationRef, stockOperationRecord({
        principal,
        operationId: parsed.data.operationId,
        operationType: "par_change",
        storeId: parsed.data.storeId,
        changes: [change],
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
