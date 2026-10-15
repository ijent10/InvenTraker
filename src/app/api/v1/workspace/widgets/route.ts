import { assertStoreAccess, canAccessMobileStore, canMobile, mobileAssignedStores, mobileError, mobileRecord, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"
import { buildWorkspaceSummaries, requiredWorkspaceSources, type SourceResult, type WorkspaceSource, workspaceProviders } from "@/lib/workspace-providers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Explicit projections prevent employee identities, notes, costs, and arbitrary engine fields from entering widget context.
const fields: Record<WorkspaceSource, string[]> = {
  inventory: ["storeId", "name", "status", "onHand", "reorderPoint"],
  inventoryBatches: ["storeId", "itemName", "status", "remainingQuantity", "expirationDate"],
  stockOperations: ["storeId", "operationType"],
  orders: ["storeId", "status", "vendorName"],
  healthChecks: ["storeId", "name", "status"],
  waste: ["storeId"], receiving: ["storeId"], portions: ["storeId"]
}

export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    const query = new URL(request.url).searchParams
    const ids = query.has("widgets") ? [...new Set((query.get("widgets") || "").split(",").filter((id) => Object.hasOwn(workspaceProviders, id)))] : Object.keys(workspaceProviders)
    const directory = await orgCollection(principal, "stores").select("name", "code", "address", "location").limit(2001).get()
    const stores = directory.docs.filter((doc) => { const data = doc.data(); return canAccessMobileStore(principal, doc.id, data.name, data.code, data.address, data.location) }).map((doc) => ({ id: doc.id, name: String(doc.data().name || doc.id) }))
    if (directory.empty) stores.push(...mobileAssignedStores(principal.member).filter((store) => canAccessMobileStore(principal, store.id)))
    stores.sort((a, b) => a.name.localeCompare(b.name))
    const storeId = query.get("storeId")?.trim() || stores[0]?.id || ""
    if (!storeId) return Response.json({ storeId: "", stores, generatedAt: new Date().toISOString(), widgets: {} }, { headers: { "Cache-Control": "private, no-store" } })
    await assertStoreAccess(principal, storeId)
    const can = (permission: Parameters<typeof canMobile>[1]) => canMobile(principal, permission)
    const names = requiredWorkspaceSources(can, ids)
    const loaded = await Promise.allSettled(names.map(async (name) => {
      const snapshot = await orgCollection(principal, name).where("storeId", "==", storeId).select(...fields[name]).limit(1001).get()
      return { records: snapshot.docs.slice(0, 1000).map((doc) => mobileRecord(doc.id, doc.data())), partial: snapshot.size > 1000 } satisfies SourceResult
    }))
    const sources = Object.fromEntries(loaded.map((entry, index) => [names[index], entry.status === "fulfilled" ? entry.value : { records: [], partial: false, failed: true }]))
    const generatedAt = new Date().toISOString()
    return Response.json({ storeId, stores, generatedAt, widgets: Object.fromEntries(Object.entries(buildWorkspaceSummaries(sources, can, generatedAt)).filter(([id]) => ids.includes(id))) }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { const response = mobileError(error); response.headers.set("Cache-Control", "private, no-store"); return response }
}
