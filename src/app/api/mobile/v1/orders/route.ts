import { firestoreCollections } from "@/lib/firestore-schema"
import { assertStoreAccess, mobileEnvelope, mobileError, mobileRecord, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "orders.view")
    const storeId = new URL(request.url).searchParams.get("storeId")?.trim() || undefined
    await assertStoreAccess(principal, storeId)
    const snapshot = await orgCollection(principal, firestoreCollections.orders).get()
    const orders = snapshot.docs
      .map((document) => mobileRecord(document.id, document.data()))
      .filter((order) => !storeId || !order.storeId || order.storeId === storeId)
      .sort((left, right) => String(left.dueAt ?? "").localeCompare(String(right.dueAt ?? "")))
    return Response.json(mobileEnvelope({ orders }))
  } catch (error) {
    return mobileError(error)
  }
}
