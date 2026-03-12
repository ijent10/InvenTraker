import type { RecommendationDomain, RecommendationEngineVersion } from "@inventracker/shared"

export type RecommendationWindow = {
  start: Date
  end: Date
}

export type RecommendationInput = {
  orgId: string
  storeId: string
  vendorId?: string
  domains: RecommendationDomain[]
  window: RecommendationWindow
  productionPlanOptions?: {
    businessFactor?: number
    includeNonFrozen?: boolean
  }
  actorUid: string
}

export type StorePathResolution =
  | { mode: "nested"; path: string; regionId: string; districtId: string; storeId: string }
  | { mode: "root"; path: string; storeId: string }

export type ItemFeature = {
  itemId: string
  itemName: string
  unit: "each" | "lbs"
  qtyPerCase: number
  caseSize: number
  minQuantity: number
  weeklyUsage: number
  price: number
  vendorId?: string
  archived: boolean
  onHand: number
  incomingBeforeLead: number
  wasteAffectingOrders: number
  expiringBeforeLead: number
  productionDemand: number
  leadDays: number
  nextOrderInDays: number
}

export type ProductionProductFeature = {
  productId: string
  productName: string
  outputItemId?: string
  outputUnitRaw: string
  defaultBatchYield: number
  targetDaysOnHand: number
  lastSpotCheckQuantity: number
  isActive: boolean
}

export type ProductionIngredientFeature = {
  productionProductID: string
  inventoryItemID?: string
  inventoryItemNameSnapshot: string
  quantityPerBatch: number
  unitRaw: string
  needsConversion: boolean
  convertToUnitRaw?: string
}

export type ProductionSpotCheckFeature = {
  productionProductID: string
  usageObserved: number
  checkedAt: Date
}

export type ProductionRunFeature = {
  productionProductID: string
  quantityMade: number
  madeAt: Date
}

export type CollectedRecommendationFeatures = {
  input: RecommendationInput
  storePath: StorePathResolution
  sourceRefs: string[]
  items: ItemFeature[]
  productionProducts: ProductionProductFeature[]
  productionIngredients: ProductionIngredientFeature[]
  productionSpotChecks: ProductionSpotCheckFeature[]
  productionRuns: ProductionRunFeature[]
}

export type EngineRunMeta = {
  runId: string
  engineVersion: RecommendationEngineVersion
  schemaVersion: "recommendations_v2"
  generatedAt: string
  rulePathUsed: string
  sourceRefs: string[]
  degraded: boolean
  fallbackUsed: boolean
  fallbackReason?: string
  fallbackSource?: "server" | "client"
  fallbackTrigger?: "backend_unavailable" | "input_incomplete" | "degraded_mode"
  inputHash: string
}
