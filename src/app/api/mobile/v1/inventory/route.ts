import { firestoreCollections } from "@/lib/firestore-schema"
import { assertStoreAccess, mobileEnvelope, mobileError, mobileRecord, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "inventory.view")
    const url = new URL(request.url)
    const storeId = url.searchParams.get("storeId")?.trim() || undefined
    await assertStoreAccess(principal, storeId)

    const snapshot = await orgCollection(principal, firestoreCollections.inventory).get()
    const items = snapshot.docs
      .map((document) => mobileRecord(document.id, document.data()))
      .filter((item) => !storeId || !item.storeId || item.storeId === storeId)
      .sort((left, right) => String(left.name ?? "").localeCompare(String(right.name ?? "")))

    return Response.json(mobileEnvelope({ items }))
  } catch (error) {
    return mobileError(error)
  }
}
