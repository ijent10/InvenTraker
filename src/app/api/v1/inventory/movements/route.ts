import { FieldPath } from "firebase-admin/firestore"
import { assertStoreAccess, canMobile, mobileError, mobileRecord, orgCollection, requireMobilePrincipal, MobileApiError } from "@/lib/mobile-api"
import { engineDocumentIdSchema } from "@/lib/engines/contracts"
import { decodeMovementCursor, encodeMovementCursor, projectItemMovement } from "@/lib/engines/inventory/movements"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "inventory.view")
    if ((!canMobile(principal, "history.view") && !canMobile(principal, "history.viewAll"))) throw new MobileApiError("Active inventory and movement-history access is required.", 403, "history_access_required")
    const query = new URL(request.url).searchParams
    const store = engineDocumentIdSchema.safeParse(query.get("storeId")), item = engineDocumentIdSchema.safeParse(query.get("itemId"))
    if (!store.success || !item.success) throw new MobileApiError("Choose a valid store and inventory item.", 400, "invalid_request")
    const storeId = store.data, itemId = item.data, scope = { organizationId: principal.orgId, storeId, itemId }
    let cursor
    try { cursor = query.get("cursor") ? decodeMovementCursor(query.get("cursor")!, scope) : null } catch { throw new MobileApiError("This history page is invalid. Start a fresh review.", 400, "invalid_cursor") }
    await assertStoreAccess(principal, storeId)
    const page = await principal.db.runTransaction(async tx => {
      const item = await tx.get(orgCollection(principal, "inventory").doc(itemId))
      if (!item.exists || item.data()?.storeId !== storeId) throw new MobileApiError("This item was not found in the selected store.", 404, "item_not_found")
      const data = item.data()!, revision = Number.isSafeInteger(data.revision ?? 0) && (data.revision ?? 0) >= 0 ? Number(data.revision ?? 0) : null
      if (cursor && cursor.revision !== revision) throw new MobileApiError("Stock changed during this review. Start again to use a consistent item revision.", 409, "history_changed")
      let records = orgCollection(principal, "stockOperations").where("storeId", "==", storeId).orderBy(FieldPath.documentId()).select("operationType", "movementType", "changes", "createdAt").limit(101)
      if (cursor) records = records.startAfter(cursor.after)
      const result = await tx.get(records), scanned = result.docs.slice(0, 100)
      return { revision, itemName: String(data.name ?? "Inventory item"), rows: scanned.map(doc => projectItemMovement(doc.id, mobileRecord(doc.id, doc.data()), itemId)).filter(row => row !== null), scannedCount: scanned.length,
        nextCursor: result.size > 100 ? encodeMovementCursor({ ...scope, revision, after: scanned[scanned.length - 1].id }) : null }
    }, { readOnly: true })
    return Response.json({ schemaVersion: "1", generatedAt: new Date().toISOString(), storeId, itemId, ...page, order: "document_id", complete: page.nextCursor === null }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { const response = mobileError(error); response.headers.set("Cache-Control", "private, no-store"); return response }
}
