import { firestoreCollections } from "@/lib/firestore-schema"
import { assertStoreAccess, MobileApiError, mobileCapabilities, mobileEnvelope, mobileError, mobileRecord, mobileRecordMatchesStore, orgCollection, requireMobilePrincipal, requireMobileStoreId } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    if (!mobileCapabilities(principal).canViewOrders) {
      throw new MobileApiError("You do not have permission to view orders.", 403, "permission_denied")
    }
    const storeId = requireMobileStoreId(new URL(request.url).searchParams.get("storeId"))
    await assertStoreAccess(principal, storeId)
    const snapshot = await orgCollection(principal, firestoreCollections.orders).get()
    const orders = snapshot.docs
      .map((document) => mobileRecord(document.id, document.data()))
      .filter((order) => mobileRecordMatchesStore(order, storeId))
      .sort((left, right) => String(left.dueAt ?? "").localeCompare(String(right.dueAt ?? "")))
    return Response.json(mobileEnvelope({ orders }))
  } catch (error) {
    return mobileError(error)
  }
}
