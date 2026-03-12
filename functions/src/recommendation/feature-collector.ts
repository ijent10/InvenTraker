import type { RecommendationDomain } from "@inventracker/shared"
import { adminDb } from "../lib/firebase.js"
import { findStorePath } from "../utils/store-path.js"
import type {
  CollectedRecommendationFeatures,
  RecommendationInput,
  RecommendationWindow,
  StorePathResolution,
  ItemFeature,
  ProductionProductFeature,
  ProductionIngredientFeature,
  ProductionSpotCheckFeature,
  ProductionRunFeature
} from "./types.js"

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (value && typeof value === "object" && "toDate" in value) {
    try {
      const date = (value as { toDate?: () => Date }).toDate?.()
      return date instanceof Date ? date : null
    } catch {
      return null
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

function normalizeWindow(window: RecommendationWindow | undefined): RecommendationWindow {
  const now = new Date()
  if (!window) {
    const end = new Date(now)
    end.setDate(end.getDate() + 7)
    return { start: now, end }
  }
  return window
}

export function daysUntilNextOrder(orderingDays: number[] | undefined, now: Date): number {
  if (!orderingDays || orderingDays.length === 0) return 0
  const today = now.getDay()
  const sorted = [...orderingDays].sort((a, b) => a - b)
  const next = sorted.find((day) => day >= today)
  if (next !== undefined) return next - today
  const first = sorted[0]
  return first === undefined ? 0 : 7 - today + first
}

async function resolveStorePath(orgId: string, storeId: string): Promise<StorePathResolution> {
  const nested = await findStorePath(orgId, storeId)
  if (nested) {
    return {
      mode: "nested",
      path: `organizations/${orgId}/regions/${nested.regionId}/districts/${nested.districtId}/stores/${nested.storeId}`,
      regionId: nested.regionId,
      districtId: nested.districtId,
      storeId: nested.storeId
    }
  }

  const rootRef = adminDb.doc(`organizations/${orgId}/stores/${storeId}`)
  const rootSnap = await rootRef.get()
  if (rootSnap.exists) {
    return {
      mode: "root",
      path: rootRef.path,
      storeId
    }
  }

  return {
    mode: "root",
    path: rootRef.path,
    storeId
  }
}

function normalizeDomainSet(domains: RecommendationDomain[] | undefined): RecommendationDomain[] {
  if (!domains || domains.length === 0) return ["orders", "production"]
  const unique = [...new Set(domains.filter((domain): domain is RecommendationDomain => domain === "orders" || domain === "production"))]
  return unique.length ? unique : ["orders", "production"]
}

type IncomingLine = {
  itemId: string
  units: number
  expectedDate: Date | null
}

export async function collectRecommendationFeatures(params: {
  orgId: string
  storeId: string
  vendorId?: string
  domains?: RecommendationDomain[]
  productionPlanOptions?: {
    businessFactor?: number
    includeNonFrozen?: boolean
  }
  window?: RecommendationWindow
  actorUid: string
}): Promise<CollectedRecommendationFeatures> {
  const now = new Date()
  const input: RecommendationInput = {
    orgId: params.orgId,
    storeId: params.storeId,
    vendorId: params.vendorId,
    domains: normalizeDomainSet(params.domains),
    window: normalizeWindow(params.window),
    productionPlanOptions: params.productionPlanOptions,
    actorUid: params.actorUid
  }

  const storePath = await resolveStorePath(params.orgId, params.storeId)
  const sourceRefs = [
    storePath.path,
    `organizations/${params.orgId}/items`,
    `organizations/${params.orgId}/vendors`,
    "collectionGroup:inventoryBatches",
    "collectionGroup:wasteRecords",
    "collectionGroup:orders",
    `organizations/${params.orgId}/productionProducts`,
    `organizations/${params.orgId}/productionIngredients`,
    `organizations/${params.orgId}/productionSpotChecks`,
    `organizations/${params.orgId}/productionRuns`
  ]

  const [itemsSnap, vendorsSnap, batchesSnap, wasteSnap, ordersSnap, productsSnap, ingredientsSnap, spotChecksSnap, runsSnap] =
    await Promise.all([
      adminDb.collection(`organizations/${params.orgId}/items`).get(),
      adminDb.collection(`organizations/${params.orgId}/vendors`).get(),
      adminDb
        .collectionGroup("inventoryBatches")
        .where("organizationId", "==", params.orgId)
        .where("storeId", "==", params.storeId)
        .get(),
      adminDb
        .collectionGroup("wasteRecords")
        .where("organizationId", "==", params.orgId)
        .where("storeId", "==", params.storeId)
        .get(),
      adminDb
        .collectionGroup("orders")
        .where("organizationId", "==", params.orgId)
        .where("storeId", "==", params.storeId)
        .get(),
      adminDb.collection(`organizations/${params.orgId}/productionProducts`).get().catch(() => null),
      adminDb.collection(`organizations/${params.orgId}/productionIngredients`).get().catch(() => null),
      adminDb.collection(`organizations/${params.orgId}/productionSpotChecks`).get().catch(() => null),
      adminDb.collection(`organizations/${params.orgId}/productionRuns`).get().catch(() => null)
    ])

  const vendorMap = new Map<
    string,
    {
      orderingDays: number[]
      leadDays: number
    }
  >()
  for (const vendor of vendorsSnap.docs) {
    const data = vendor.data() as Record<string, unknown>
    vendorMap.set(vendor.id, {
      orderingDays: Array.isArray(data.orderingDays)
        ? data.orderingDays.map((value) => asNumber(value)).filter((value) => Number.isFinite(value))
        : [],
      leadDays: Math.max(0, asNumber(data.leadDays, 0))
    })
  }

  const onHandByItem = new Map<string, number>()
  const expiringByItemByLead = new Map<string, number>()
  for (const batch of batchesSnap.docs) {
    const data = batch.data() as Record<string, unknown>
    const itemId = asString(data.itemId)
    if (!itemId) continue
    const quantity = Math.max(0, asNumber(data.quantity, 0))
    onHandByItem.set(itemId, (onHandByItem.get(itemId) ?? 0) + quantity)

    const expiresAt = asDate(data.expiresAt)
    if (!expiresAt) continue
    const daysUntilExpiry = Math.floor((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    if (daysUntilExpiry <= 7) {
      expiringByItemByLead.set(itemId, (expiringByItemByLead.get(itemId) ?? 0) + quantity)
    }
  }

  const wasteByItem = new Map<string, number>()
  for (const waste of wasteSnap.docs) {
    const data = waste.data() as Record<string, unknown>
    const itemId = asString(data.itemId)
    if (!itemId) continue
    const affectsOrdersRaw = data.affectsOrders ?? data.wasteTypeAffectsOrders
    const affectsOrders = typeof affectsOrdersRaw === "boolean" ? affectsOrdersRaw : true
    if (!affectsOrders) continue
    wasteByItem.set(itemId, (wasteByItem.get(itemId) ?? 0) + Math.max(0, asNumber(data.quantity, 0)))
  }

  const incomingLines: IncomingLine[] = []
  for (const order of ordersSnap.docs) {
    const orderData = order.data() as Record<string, unknown>
    const status = (asString(orderData.status) ?? "suggested").toLowerCase()
    if (status === "received" || status === "closed") continue
    if (params.vendorId) {
      const orderVendorId = asString(orderData.vendorId)
      if (orderVendorId && orderVendorId !== params.vendorId) continue
    }
    const expectedDeliveryDate = asDate(orderData.expectedDeliveryDate) ?? asDate(orderData.vendorCutoffAt)

    const linesSnap = await order.ref.collection("lines").get().catch(() => null)
    for (const line of linesSnap?.docs ?? []) {
      const lineData = line.data() as Record<string, unknown>
      const itemId = asString(lineData.itemId)
      if (!itemId) continue
      const finalQty = asNumber(lineData.finalQty, Number.NaN)
      const suggestedQty = asNumber(lineData.suggestedQty, 0)
      const units = Number.isFinite(finalQty) ? Math.max(0, finalQty) : Math.max(0, suggestedQty)
      incomingLines.push({
        itemId,
        units,
        expectedDate: expectedDeliveryDate
      })
    }
  }

  const items: ItemFeature[] = []
  for (const itemDoc of itemsSnap.docs) {
    const data = itemDoc.data() as Record<string, unknown>
    const unitRaw = (asString(data.unit) ?? "each").toLowerCase()
    const unit: "each" | "lbs" = unitRaw === "lbs" ? "lbs" : "each"
    const vendorId = asString(data.vendorId)
    if (params.vendorId && vendorId !== params.vendorId) continue

    const vendorMeta = vendorMap.get(vendorId ?? "")
    const leadDays = Math.max(0, vendorMeta?.leadDays ?? 0)
    const nextOrderInDays = daysUntilNextOrder(vendorMeta?.orderingDays, now)
    const incomingBeforeLead = incomingLines
      .filter((line) => line.itemId === itemDoc.id)
      .filter((line) => {
        if (!line.expectedDate) return true
        const threshold = new Date(now)
        threshold.setDate(threshold.getDate() + Math.max(1, leadDays))
        return line.expectedDate <= threshold
      })
      .reduce((sum, line) => sum + line.units, 0)

    const item: ItemFeature = {
      itemId: itemDoc.id,
      itemName: asString(data.name) ?? itemDoc.id,
      unit,
      qtyPerCase: Math.max(1, asNumber(data.qtyPerCase, 1)),
      caseSize: Math.max(1, asNumber(data.caseSize, 1)),
      minQuantity: Math.max(0, asNumber(data.minQuantity, 0)),
      weeklyUsage: Math.max(0, asNumber(data.weeklyUsage, 0)),
      price: Math.max(0, asNumber(data.price, 0)),
      archived: Boolean(data.archived),
      onHand: Math.max(0, onHandByItem.get(itemDoc.id) ?? 0),
      incomingBeforeLead: Math.max(0, incomingBeforeLead),
      wasteAffectingOrders: Math.max(0, wasteByItem.get(itemDoc.id) ?? 0),
      expiringBeforeLead: Math.max(0, expiringByItemByLead.get(itemDoc.id) ?? 0),
      productionDemand: 0,
      leadDays,
      nextOrderInDays
    }
    if (vendorId) {
      item.vendorId = vendorId
    }
    items.push(item)
  }

  const normalizedStore = params.storeId.trim()
  const productionProducts: ProductionProductFeature[] = []
  for (const doc of productsSnap?.docs ?? []) {
    const row = doc.data() as Record<string, unknown>
    const rowStoreId = asString(row.storeId) ?? ""
    if (rowStoreId.length > 0 && rowStoreId !== normalizedStore) continue
    const productId = doc.id
    if (!productId) continue
    productionProducts.push({
      productId,
      productName: asString(row.name) ?? "Production Product",
      outputItemId: asString(row.outputItemID) ?? undefined,
      outputUnitRaw: asString(row.outputUnitRaw) ?? "pieces",
      defaultBatchYield: Math.max(0.001, asNumber(row.defaultBatchYield, 1)),
      targetDaysOnHand: Math.max(0.25, asNumber(row.targetDaysOnHand, 1.5)),
      lastSpotCheckQuantity: Math.max(0, asNumber(row.lastSpotCheckQuantity, 0)),
      isActive: row.isActive === undefined ? true : Boolean(row.isActive)
    })
  }

  const productionIngredients: ProductionIngredientFeature[] = []
  for (const doc of ingredientsSnap?.docs ?? []) {
    const row = doc.data() as Record<string, unknown>
    const rowStoreId = asString(row.storeId) ?? ""
    if (rowStoreId.length > 0 && rowStoreId !== normalizedStore) continue
    const productionProductID = asString(row.productionProductID) ?? ""
    const quantityPerBatch = Math.max(0, asNumber(row.quantityPerBatch, 0))
    if (!productionProductID || quantityPerBatch <= 0) continue
    productionIngredients.push({
      productionProductID,
      inventoryItemID: asString(row.inventoryItemID),
      inventoryItemNameSnapshot: asString(row.inventoryItemNameSnapshot) ?? "Ingredient",
      quantityPerBatch,
      unitRaw: asString(row.unitRaw) ?? "pieces",
      needsConversion: Boolean(row.needsConversion),
      convertToUnitRaw: asString(row.convertToUnitRaw)
    })
  }

  const productionSpotChecks: ProductionSpotCheckFeature[] = []
  for (const doc of spotChecksSnap?.docs ?? []) {
    const row = doc.data() as Record<string, unknown>
    const rowStoreId = asString(row.storeId) ?? ""
    if (rowStoreId.length > 0 && rowStoreId !== normalizedStore) continue
    const productionProductID = asString(row.productionProductID) ?? ""
    const usageObserved = Math.max(0, asNumber(row.usageObserved, 0))
    if (!productionProductID || usageObserved <= 0) continue
    productionSpotChecks.push({
      productionProductID,
      usageObserved,
      checkedAt: asDate(row.checkedAt) ?? now
    })
  }

  const productionRuns: ProductionRunFeature[] = []
  for (const doc of runsSnap?.docs ?? []) {
    const row = doc.data() as Record<string, unknown>
    const rowStoreId = asString(row.storeId) ?? ""
    if (rowStoreId.length > 0 && rowStoreId !== normalizedStore) continue
    const productionProductID = asString(row.productionProductID) ?? ""
    const quantityMade = Math.max(0, asNumber(row.quantityMade, 0))
    if (!productionProductID || quantityMade <= 0) continue
    productionRuns.push({
      productionProductID,
      quantityMade,
      madeAt: asDate(row.madeAt) ?? now
    })
  }

  return {
    input,
    storePath,
    sourceRefs,
    items,
    productionProducts,
    productionIngredients,
    productionSpotChecks,
    productionRuns
  }
}
