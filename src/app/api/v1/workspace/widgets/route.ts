import { assertStoreAccess, canAccessMobileStore, canMobile, mobileAssignedStores, mobileError, mobileRecord, MobileApiError, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"
import { buildWorkspaceSummaries, requiredWorkspaceSources, type SourceResult, type WorkspaceSource, workspaceProviders } from "@/lib/workspace-providers"

import { readWorkspaceStockRevision } from "@/lib/engines/events/workspace-revision"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Explicit projections prevent employee identities, notes, costs, and arbitrary engine fields from entering widget context.
const fields: Record<WorkspaceSource, string[]> = {
  operationSessions: ["storeId", "kind", "status"],
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
    if (String(principal.member.status ?? "active").toLowerCase() !== "active") throw new MobileApiError("An active membership is required.", 403, "account_inactive")
    const query = new URL(request.url).searchParams
    const ids = query.has("widgets") ? [...new Set((query.get("widgets") || "").split(",").filter((id) => Object.hasOwn(workspaceProviders, id)))] : Object.keys(workspaceProviders)
    const directory = await orgCollection(principal, "stores").select("name", "code", "address", "location").limit(2001).get()
    const stores = directory.docs.filter((doc) => { const data = doc.data(); return canAccessMobileStore(principal, doc.id, data.name, data.code, data.address, data.location) }).map((doc) => ({ id: doc.id, name: String(doc.data().name || doc.id) }))
    if (directory.empty) stores.push(...mobileAssignedStores(principal.member).filter((store) => canAccessMobileStore(principal, store.id)))
    stores.sort((a, b) => a.name.localeCompare(b.name))
    const storeId = query.get("storeId")?.trim() || stores[0]?.id || ""
    if (!storeId) return Response.json({ storeId: "", stores, generatedAt: new Date().toISOString(), widgets: {} }, { headers: { "Cache-Control": "private, no-store" } })
    await assertStoreAccess(principal, storeId)
    // Capture before loading facts, so a concurrent delivery is detected by the next probe.
    const stockRevision = await readWorkspaceStockRevision(principal, storeId).catch(() => undefined)
    const can = (permission: Parameters<typeof canMobile>[1]) => canMobile(principal, permission)
    const names = requiredWorkspaceSources(can, ids)
    const loaded = await Promise.allSettled(names.map(async (name) => {
      if (name === "operationSessions" && !principal.isManager) {
        const source = orgCollection(principal, name).where("storeId", "==", storeId)
        const pages = await Promise.all(["createdBy", "assignedTo"].map(field => source.where(field, "==", principal.uid).select(...fields[name]).limit(1001).get()))
        const records = [...new Map(pages.flatMap(page => page.docs.map(doc => [doc.id, mobileRecord(doc.id, doc.data())] as const))).values()]
        return { records: records.slice(0, 1000), partial: records.length > 1000 || pages.some(page => page.size > 1000) } satisfies SourceResult
      }
      const snapshot = await orgCollection(principal, name).where("storeId", "==", storeId).select(...fields[name]).limit(1001).get()
      return { records: snapshot.docs.slice(0, 1000).map((doc) => mobileRecord(doc.id, doc.data())), partial: snapshot.size > 1000 } satisfies SourceResult
    }))
    const sources = Object.fromEntries(loaded.map((entry, index) => [names[index], entry.status === "fulfilled" ? entry.value : { records: [], partial: false, failed: true }]))
    const generatedAt = new Date().toISOString()
    return Response.json({ storeId, stores, generatedAt, stockRevision, widgets: Object.fromEntries(Object.entries(buildWorkspaceSummaries(sources, can, generatedAt)).filter(([id]) => ids.includes(id))) }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { const response = mobileError(error); response.headers.set("Cache-Control", "private, no-store"); return response }
}
