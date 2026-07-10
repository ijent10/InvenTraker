import { firestoreCollections } from "@/lib/firestore-schema"
import {
  assertStoreAccess,
  canAccessMobileStore,
  canMobile,
  mobileEnvelope,
  mobileError,
  mobileRecord,
  orgCollection,
  requireMobilePrincipal
} from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    const url = new URL(request.url)
    const requestedStoreId = url.searchParams.get("storeId")?.trim() || undefined
    await assertStoreAccess(principal, requestedStoreId)

    const orgRef = principal.db.collection(firestoreCollections.orgs).doc(principal.orgId)
    const [organization, stores, inventory, orders, healthChecks, notifications] = await Promise.all([
      orgRef.get(),
      orgCollection(principal, firestoreCollections.stores).get(),
      canMobile(principal, "inventory.view") ? orgCollection(principal, firestoreCollections.inventory).get() : null,
      canMobile(principal, "orders.view") ? orgCollection(principal, firestoreCollections.orders).get() : null,
      canMobile(principal, "health.view") ? orgCollection(principal, firestoreCollections.healthChecks).get() : null,
      orgCollection(principal, firestoreCollections.notifications).get()
    ])

    const storeRecords = stores.docs
      .map((document) => mobileRecord(document.id, document.data()))
      .filter((store) => canAccessMobileStore(principal, String(store.id), String(store.name ?? "")))
    const selectedStoreId = requestedStoreId || String(principal.member.storeId ?? storeRecords[0]?.id ?? "")
    await assertStoreAccess(principal, selectedStoreId)
    const matchesStore = (record: Record<string, unknown>) => !selectedStoreId || !record.storeId || record.storeId === selectedStoreId
    const inventoryRecords = (inventory?.docs ?? []).map((document) => mobileRecord(document.id, document.data())).filter(matchesStore)
    const orderRecords = (orders?.docs ?? []).map((document) => mobileRecord(document.id, document.data())).filter(matchesStore)
    const healthRecords = (healthChecks?.docs ?? []).map((document) => mobileRecord(document.id, document.data())).filter(matchesStore)
    const notificationRecords = notifications.docs.map((document) => mobileRecord(document.id, document.data()))

    return Response.json(
      mobileEnvelope({
        session: {
          uid: principal.uid,
          email: principal.email,
          orgId: principal.orgId,
          member: principal.member,
          permissions: principal.permissions
        },
        organization: mobileRecord(organization.id, organization.data()),
        stores: storeRecords,
        selectedStoreId,
        dashboard: {
          activeItems: inventoryRecords.filter((item) => item.status !== "Archived").length,
          lowStockItems: inventoryRecords.filter((item) => item.status === "Low" || Number(item.onHand ?? 0) <= Number(item.reorderPoint ?? 0)).length,
          openOrders: orderRecords.filter((order) => !["Submitted", "Auto-submitted"].includes(String(order.status))).length,
          dueHealthChecks: healthRecords.filter((check) => ["Due today", "Overdue"].includes(String(check.status))).length,
          unreadNotifications: notificationRecords.filter((notification) => !notification.read).length
        },
        inventory: inventoryRecords,
        orders: orderRecords,
        healthChecks: healthRecords,
        notifications: notificationRecords
      })
    )
  } catch (error) {
    return mobileError(error)
  }
}
