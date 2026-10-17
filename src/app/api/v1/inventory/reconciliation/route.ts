import { assertStoreAccess, canAccessMobileStore, mobileError, orgCollection, requireMobilePrincipal, MobileApiError } from "@/lib/mobile-api"
import { engineDocumentIdSchema } from "@/lib/engines/contracts"
import { reconcileInventory } from "@/lib/engines/inventory/reconciliation"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const limit = 1000
export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "inventory.edit")
    if (String(principal.member.status ?? "active").toLowerCase() !== "active") throw new MobileApiError("An active membership is required.", 403, "account_inactive")
    const directory = await orgCollection(principal, "stores").select("name", "code", "address", "location").limit(2001).get()
    const stores = directory.docs.filter(doc => { const d = doc.data(); return canAccessMobileStore(principal, doc.id, d.name, d.code, d.address, d.location) }).map(doc => ({ id: doc.id, name: String(doc.data().name || doc.id) })).sort((a, b) => a.name.localeCompare(b.name))
    const requested = new URL(request.url).searchParams.get("storeId")
    const storeId = engineDocumentIdSchema.parse(requested ?? stores[0]?.id ?? "")
    await assertStoreAccess(principal, storeId)
    if (!stores.some(store => store.id === storeId)) throw new MobileApiError("Choose an available store.", 404, "store_not_found")
    const fields = { inventory: ["storeId", "name", "frontStock", "backStock", "onHand", "revision", "par", "reorderPoint"], inventoryBatches: ["storeId", "itemId", "area", "remainingQuantity", "status"], stockOperations: ["storeId", "operationType", "changes"] }
    const snapshot = await principal.db.runTransaction(async transaction => {
      const sources = await Promise.all(Object.entries(fields).map(async ([name, projection]) => {
        const result = await transaction.get(orgCollection(principal, name).where("storeId", "==", storeId).select(...projection).limit(limit + 1))
        return { records: result.docs.slice(0, limit).map(doc => ({ ...doc.data(), id: doc.id })), partial: result.size > limit }
      }))
      return { inventory: sources[0], batches: sources[1], operations: sources[2] }
    }, { readOnly: true })
    return Response.json({ ...reconcileInventory({ storeId, ...snapshot }), stores, storesPartial: directory.size > 2000 }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    const response = mobileError(error instanceof Error && error.name === "ZodError" ? new MobileApiError("Choose a valid store.", 400, "invalid_request") : error)
    response.headers.set("Cache-Control", "private, no-store"); return response
  }
}
