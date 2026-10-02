import { firestoreCollections } from "@/lib/firestore-schema"
import { assertStoreAccess, MobileApiError, mobileCapabilities, mobileEnvelope, mobileError, mobileRecord, mobileRecordMatchesStore, orgCollection, requireMobilePrincipal, requireMobileStoreId } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    if (!mobileCapabilities(principal).canViewInventory) {
      throw new MobileApiError("You do not have permission to view inventory.", 403, "permission_denied")
    }
    const storeId = requireMobileStoreId(new URL(request.url).searchParams.get("storeId"))
    await assertStoreAccess(principal, storeId)

    const snapshot = await orgCollection(principal, firestoreCollections.inventory).get()
    const items = snapshot.docs
      .map((document) => mobileRecord(document.id, document.data()))
      .filter((item) => mobileRecordMatchesStore(item, storeId))
      .sort((left, right) => String(left.name ?? "").localeCompare(String(right.name ?? "")))

    return Response.json(mobileEnvelope({ items }))
  } catch (error) {
    return mobileError(error)
  }
}
