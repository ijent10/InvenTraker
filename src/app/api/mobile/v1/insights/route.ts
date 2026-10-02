import { firestoreCollections } from "@/lib/firestore-schema"
import { assertStoreAccess, mobileCapabilities, mobileEnvelope, mobileError, mobileRecordMatchesStore, orgCollection, requireMobilePrincipal, requireMobileStoreId } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function numeric(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function occurredAfter(value: unknown, cutoff: Date) {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate() >= cutoff
  }
  const date = typeof value === "string" ? new Date(value) : null
  return Boolean(date && !Number.isNaN(date.getTime()) && date >= cutoff)
}

export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    if (!mobileCapabilities(principal).canViewInsights) {
      return Response.json({ error: { code: "permission_denied", message: "You do not have permission to view insights." } }, { status: 403 })
    }

    const storeId = requireMobileStoreId(new URL(request.url).searchParams.get("storeId"))
    await assertStoreAccess(principal, storeId)

    const [inventorySnapshot, wasteSnapshot, orderSnapshot] = await Promise.all([
      orgCollection(principal, firestoreCollections.inventory).get(),
      orgCollection(principal, firestoreCollections.waste).get(),
      orgCollection(principal, firestoreCollections.orders).get()
    ])
    const inventory = inventorySnapshot.docs
      .map((document) => ({ id: document.id, ...(document.data() ?? {}) }) as Record<string, unknown> & { id: string })
      .filter((item) => mobileRecordMatchesStore(item, storeId))
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const recentWaste = wasteSnapshot.docs
      .map((document) => (document.data() ?? {}) as Record<string, unknown>)
      .filter((item) => mobileRecordMatchesStore(item, storeId) && occurredAfter(item.createdAt, cutoff))
    const orders = orderSnapshot.docs
      .map((document) => (document.data() ?? {}) as Record<string, unknown>)
      .filter((item) => mobileRecordMatchesStore(item, storeId) && !["Reconciled", "Cancelled", "Closed"].includes(String(item.status)))

    const lowStock = inventory
      .filter((item) => {
        const onHand = numeric(item.onHand)
        return String(item.status) === "Low" || onHand <= numeric(item.reorderPoint)
      })
      .sort((left, right) => numeric(left.onHand) - numeric(right.onHand))
    const totalUnits = inventory.reduce((total, item) => total + numeric(item.onHand), 0)
    const backstockUnits = inventory.reduce((total, item) => total + numeric(item.backStock), 0)
    const wasteUnits = recentWaste.reduce((total, item) => total + numeric(item.quantity), 0)

    return Response.json(mobileEnvelope({
      storeId,
      period: "Last 30 days",
      activeItems: inventory.filter((item) => String(item.status) !== "Archived").length,
      lowStockItems: lowStock.length,
      lowStockRatio: inventory.length ? lowStock.length / inventory.length : 0,
      totalUnits,
      backstockUnits,
      wasteEvents: recentWaste.length,
      wasteUnits,
      openOrders: orders.length,
      attention: lowStock.slice(0, 5).map((item) => ({
        itemId: item.id,
        name: String(item.name ?? "Inventory item"),
        onHand: numeric(item.onHand),
        reorderPoint: numeric(item.reorderPoint),
        unit: String(item.unit ?? "eaches")
      }))
    }))
  } catch (error) {
    return mobileError(error)
  }
}
