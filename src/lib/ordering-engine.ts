import { summarizeBatchAvailability, type AllocatableBatch } from "./batch-allocation.ts"

export const ORDER_ENGINE_VERSION = "2026-10-01.1"
export const ORDER_SCHEMA_VERSION = 1

export type OrderingInventoryItem = {
  id: string
  name: string
  sku: string
  storeId: string
  vendor: string
  unit: string
  onHand: number
  par: number
  reorderPoint: number
  expires: boolean
  quantityInCase?: number
  price?: number
  updatedAt?: string
}

export type OrderingVendor = {
  id: string
  name: string
  minimumAmount: number
  leadTimeDays: number
  coverageDays: number
  catalog?: string[]
  orderDueAt?: string
  expectedArrival?: string
  deliveryDays?: number[]
  products?: Array<{ sku: string; orderUnit: string; packSize: number; minimumOrderQuantity?: number; orderIncrement?: number; unitCostAmount?: number }>
}

export type OrderingIncomingLine = {
  sku: string
  quantity: number
  stockUnitsPerOrderUnit?: number
  receivedQuantity?: number
}

export type OrderingOrder = {
  id: string
  status: string
  storeId?: string
  lines: OrderingIncomingLine[]
}

export type OrderingProductCost = { sku?: string; name: string; unitCost: number }

export type OrderRecommendationLine = {
  id: string
  itemId: string
  itemName: string
  sku: string
  unit: string
  orderUnit: string
  stockUnitsPerOrderUnit: number
  unitCostAmount: number
  usableOnHand: number
  physicalOnHand: number
  expiredQuantity: number
  unknownExpirationQuantity: number
  confirmedIncoming: number
  projectedDemand: number
  targetEndingStock: number
  suggestedQuantity: number
  finalQuantity: number
  overrideReason: string | null
  calculation: string
  sourceRefs: string[]
  dataFreshness: string | null
  degradedFlags: string[]
  vendorOffered: boolean
}

export type OrderRecommendationRun = {
  runId: string
  generatedAt: string
  engineVersion: string
  schemaVersion: number
  rulePath: string
  storeId: string
  vendorId: string
  coverageWindow: { leadTimeDays: number; coverageDays: number }
  lines: OrderRecommendationLine[]
  subtotalAmount: number
  minimumAmount: number
  minimumGapAmount: number
  degradedFlags: string[]
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}

function deterministicRunId(storeId: string, vendorId: string, generatedAt: string) {
  return `order-${storeId}-${vendorId}-${generatedAt.replace(/[^0-9]/g, "").slice(0, 14)}`
}

export function recommendOrder({
  storeId,
  vendor,
  inventory,
  batches,
  openOrders,
  costs,
  generatedAt = new Date().toISOString(),
  runId
}: {
  storeId: string
  vendor: OrderingVendor
  inventory: OrderingInventoryItem[]
  batches: Array<AllocatableBatch & { itemId: string }>
  openOrders: OrderingOrder[]
  costs: OrderingProductCost[]
  generatedAt?: string
  runId?: string
}): OrderRecommendationRun {
  const catalog = new Set((vendor.catalog ?? []).map((sku) => sku.toLowerCase()))
  const productRuleBySku = new Map((vendor.products ?? []).map((product) => [product.sku.toLowerCase(), product]))
  const costByKey = new Map<string, number>()
  for (const cost of costs) {
    costByKey.set(cost.name.toLowerCase(), cost.unitCost)
    if (cost.sku) costByKey.set(cost.sku.toLowerCase(), cost.unitCost)
  }
  const confirmedOrders = openOrders.filter((order) => order.storeId === storeId && ["Submitted", "Auto-submitted", "Partially received"].includes(order.status))
  const globalFlags = ["sales_velocity_unavailable"]
  const lines = inventory
    .filter((item) => item.storeId === storeId && item.vendor === vendor.name)
    .filter((item) => (catalog.size === 0 && productRuleBySku.size === 0) || catalog.has(item.sku.toLowerCase()) || productRuleBySku.has(item.sku.toLowerCase()))
    .map<OrderRecommendationLine>((item) => {
      const itemBatches = batches.filter((batch) => batch.itemId === item.id)
      const availability = summarizeBatchAvailability(itemBatches, generatedAt, vendor.expectedArrival)
      const batchCoverageKnown = itemBatches.length > 0
      const usableOnHand = item.expires
        ? Math.max(0, availability.usableDated - availability.expiringBeforeDelivery)
        : batchCoverageKnown ? availability.totalPhysical : Math.max(0, item.onHand)
      const matchingConfirmedOrders = confirmedOrders.filter((order) => order.lines.some((line) => line.sku === item.sku))
      const confirmedIncoming = matchingConfirmedOrders.reduce((total, order) => total + order.lines
        .filter((line) => line.sku === item.sku)
        .reduce((lineTotal, line) => lineTotal + Math.max(0, line.quantity - (line.receivedQuantity ?? 0)) * (line.stockUnitsPerOrderUnit ?? 1), 0), 0)
      const targetEndingStock = Math.max(0, item.par)
      const projectedDemand = 0
      const requiredStockUnits = Math.max(0, targetEndingStock + projectedDemand - usableOnHand - confirmedIncoming)
      const productRule = productRuleBySku.get(item.sku.toLowerCase())
      const stockUnitsPerOrderUnit = Math.max(1, Number(productRule?.packSize ?? item.quantityInCase ?? 1))
      const rawOrderQuantity = Math.ceil(requiredStockUnits / stockUnitsPerOrderUnit)
      const minimumOrderQuantity = rawOrderQuantity > 0 ? Math.max(0, Number(productRule?.minimumOrderQuantity ?? 0)) : 0
      const increment = Math.max(1, Number(productRule?.orderIncrement ?? 1))
      const suggestedQuantity = rawOrderQuantity === 0 ? 0 : Math.ceil(Math.max(rawOrderQuantity, minimumOrderQuantity) / increment) * increment
      const unitCostAmount = Math.max(0, productRule?.unitCostAmount ?? costByKey.get(item.sku.toLowerCase()) ?? costByKey.get(item.name.toLowerCase()) ?? item.price ?? 0)
      const degradedFlags = [
        "sales_velocity_unavailable",
        ...(!batchCoverageKnown && item.expires ? ["batch_detail_unavailable"] : []),
        ...(availability.unknownExpiration > 0 && item.expires ? ["unknown_expiration_excluded"] : []),
        ...(availability.expiringBeforeDelivery > 0 && item.expires ? ["expires_before_delivery_excluded"] : []),
        ...(!productRule && stockUnitsPerOrderUnit > 1 ? ["vendor_pack_cost_rule_unavailable"] : []),
        ...(unitCostAmount === 0 ? ["unit_cost_unavailable"] : [])
      ]
      return {
        id: `${vendor.id}-${item.id}`,
        itemId: item.id,
        itemName: item.name,
        sku: item.sku,
        unit: item.unit,
        orderUnit: productRule?.orderUnit ?? (stockUnitsPerOrderUnit > 1 ? "case" : item.unit),
        stockUnitsPerOrderUnit,
        unitCostAmount,
        usableOnHand: round(usableOnHand),
        physicalOnHand: round(batchCoverageKnown ? availability.totalPhysical : item.onHand),
        expiredQuantity: round(availability.expired),
        unknownExpirationQuantity: round(availability.unknownExpiration),
        confirmedIncoming: round(confirmedIncoming),
        projectedDemand,
        targetEndingStock,
        suggestedQuantity,
        finalQuantity: suggestedQuantity,
        overrideReason: null,
        calculation: `ceil(max(0, ${targetEndingStock} target + ${projectedDemand} projected demand - ${round(usableOnHand)} usable - ${round(confirmedIncoming)} confirmed incoming) / ${stockUnitsPerOrderUnit} per order unit), then minimum ${minimumOrderQuantity} and increment ${increment} = ${suggestedQuantity}`,
        sourceRefs: [`inventory/${item.id}`, ...itemBatches.map((batch) => `inventoryBatches/${batch.id}`), ...matchingConfirmedOrders.map((order) => `orders/${order.id}`)],
        dataFreshness: item.updatedAt ?? null,
        degradedFlags,
        vendorOffered: true
      }
    })
  const subtotalAmount = round(lines.reduce((total, line) => total + line.finalQuantity * line.unitCostAmount, 0))
  return {
    runId: runId ?? deterministicRunId(storeId, vendor.id, generatedAt),
    generatedAt,
    engineVersion: ORDER_ENGINE_VERSION,
    schemaVersion: ORDER_SCHEMA_VERSION,
    rulePath: "par_target_minus_usable_and_confirmed_incoming",
    storeId,
    vendorId: vendor.id,
    coverageWindow: { leadTimeDays: vendor.leadTimeDays, coverageDays: vendor.coverageDays },
    lines,
    subtotalAmount,
    minimumAmount: vendor.minimumAmount,
    minimumGapAmount: round(Math.max(0, vendor.minimumAmount - subtotalAmount)),
    degradedFlags: [...new Set([...globalFlags, ...lines.flatMap((line) => line.degradedFlags)])]
  }
}
