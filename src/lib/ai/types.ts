export type AiSourceType = "local_inventory" | "product_profile" | "compliance" | "operations" | "external_search" | "national_signal" | "document"

export type AiSource = {
  id: string
  label: string
  type: AiSourceType
  detail: string
  url?: string
}

export type AiConfidence = "high" | "medium" | "low"

export type RetailAssistantIntent =
  | "product_lookup"
  | "barcode_lookup"
  | "inventory_lookup"
  | "vendor_lookup"
  | "nutrition_lookup"
  | "allergen_lookup"
  | "recipe_ingredient_lookup"
  | "stock_risk_analysis"
  | "reorder_recommendation"
  | "waste_risk_analysis"
  | "markdown_recommendation"
  | "external_enrichment"
  | "event_demand_analysis"
  | "memory_lookup"
  | "document_lookup"
  | "document_summary"
  | "document_reword"
  | "document_simplify"
  | "document_checklist"
  | "document_compare"
  | "document_citation_lookup"
  | "off_topic"
  | "unsafe"
  | "unknown"

export type AssistantAnswerMode =
  | "direct_answer"
  | "simplified_explanation"
  | "rewritten_policy"
  | "summary"
  | "checklist"
  | "comparison"
  | "clarification"
  | "rejection"

export type DocumentCitation = {
  sourceId: string
  type: "document"
  documentId: string
  documentTitle: string
  fileName: string
  documentType: string
  sectionTitle?: string
  pageStart?: number
  pageEnd?: number
  chunkId: string
  quotePreview: string
  viewerUrl?: string
  downloadUrl?: string
  confidence: number
  approvedStatus: "draft" | "approved" | "archived" | "expired" | "superseded"
  effectiveDate?: string
  version?: string
}

export type DocumentCandidate = {
  documentId: string
  documentTitle: string
  fileName: string
  documentType: string
  sectionTitle?: string
  confidence: number
  reason: string
  approvedStatus: "draft" | "approved" | "archived" | "expired" | "superseded"
  viewerUrl?: string
}

export type ProductEvidence = {
  productId: string
  productName: string
  sku?: string
  kosherStatus: "verified" | "not_verified" | "not_recorded" | "not_applicable"
  allergens: string[]
  dietaryNotes: string[]
  handlingNotes: string[]
  nutrition?: NutritionFacts
  imageHints: string[]
  sources: AiSource[]
}

export type WasteSignal = {
  productName: string
  quantity: number
  unit: string
  reason: string
  recordedAt: string
}

export type NationalSignal = {
  title: string
  detail: string
  sourceLabel: string
  url?: string
}

export type WeatherDailySignal = {
  date: string
  temperatureMaxF?: number
  temperatureMinF?: number
  precipitationIn?: number
  windSpeedMph?: number
  weatherCode?: number
}

export type HolidaySignal = {
  date: string
  localName: string
  name: string
}

export type OrderingAwareness = {
  storeName: string
  storeAddress?: string
  deliveryDate: string
  forecastWindow: {
    start: string
    end: string
  }
  weather: WeatherDailySignal[]
  holidays: HolidaySignal[]
  trafficHeuristics: string[]
  eventSignals: NationalSignal[]
  sourceSummary: string[]
}

export type ProductImageCandidate = {
  title: string
  query: string
  reason: string
  source: "local_hint" | "external_search_ready" | "open_food_facts"
  imageUrl?: string
  sourceUrl?: string
}

export type NutritionValues = {
  caloriesKcal?: number
  fatG?: number
  saturatedFatG?: number
  carbohydratesG?: number
  sugarsG?: number
  fiberG?: number
  proteinG?: number
  sodiumMg?: number
  saltG?: number
}

export type NutritionFacts = {
  servingSize?: string
  perServing?: NutritionValues
  per100g?: NutritionValues
  nutriScoreGrade?: string
  novaGroup?: number
  sourceLabel: string
  sourceUrl?: string
}

export type ProductNutritionSnapshot = NutritionValues & {
  servingSize?: string
  ingredientsText?: string
  allergens?: string
  labels?: string
  imageUrl?: string
  sourceSummary?: string
}

export type ExternalProductMatch = {
  source: "open_food_facts"
  name: string
  brand?: string
  barcode?: string
  imageUrl?: string
  sourceUrl?: string
  labels: string[]
  allergens: string[]
  categories: string[]
  ingredientsText?: string
  nutritionGrade?: string
  novaGroup?: number
  nutrition?: NutritionFacts
}

export type RecallMatch = {
  source: "open_fda"
  productDescription: string
  recallingFirm?: string
  reason?: string
  classification?: string
  status?: string
  reportDate?: string
  sourceUrl: string
}

export type AssistantProductMemory = {
  id: string
  orgId: string
  centralProductId?: string
  productName: string
  sku?: string
  department?: string
  category?: string
  factType:
    | "kosher_status"
    | "dietary_status"
    | "nutrition"
    | "image"
    | "recall"
    | "ordering_hint"
    | "product_note"
  value: string
  normalizedValue: string
  confidence: AiConfidence
  summary: string
  evidence: string[]
  sourceLabels: string[]
  sourceUrls: string[]
  visibility: "assistant_only"
  createdAt?: unknown
  updatedAt?: unknown
  lastUsedAt?: unknown
  useCount?: number
}

export type ProductCandidate = {
  id: string
  name: string
  sku?: string
  department?: string
  category?: string
  source: "central_catalog" | "organization_product" | "local_catalog" | "local_inventory" | "external_product"
  confidence: number
  reason: string
}

export type ProductResolution =
  | {
      status: "resolved"
      productName: string
      sku?: string
      confidence: number
      candidates: ProductCandidate[]
    }
  | {
      status: "needs_clarification"
      question: string
      candidates: ProductCandidate[]
    }
  | {
      status: "unresolved"
      question: string
      candidates: ProductCandidate[]
    }

export type PendingAutofillField = {
  field: string
  label: string
  proposedValue: string
  currentValue?: string
  sourceLabel: string
  sourceUrl?: string
  confidence: AiConfidence
}

export type PendingAutofillBatch = {
  id: string
  productId?: string
  productName: string
  sku?: string
  createdAt: string
  createdBy: "assistant"
  status: "pending" | "approved" | "rejected"
  reason: string
  sourceSummary: string
  fields: PendingAutofillField[]
}

export type AiOperationalContext = {
  generatedAt: string
  storeName: string
  centralCatalog: Array<{
    centralProductId: string
    name: string
    sku?: string
    nutrition?: ProductNutritionSnapshot
    averagePrice?: number
    averageExpirationDays?: number
    averageQuantityInCase?: number
    images: string[]
  }>
  organizationProducts: Array<{
    productId: string
    centralProductId?: string
    name: string
    sku?: string
    department: string
    category: string
    defaultUnit: string
    expires: boolean
    nutrition?: ProductNutritionSnapshot
  }>
  inventory: Array<{
    productId?: string
    centralProductId?: string
    orgProductId?: string
    storeId?: string
    name: string
    sku: string
    department: string
    category: string
    onHand: number
    frontStock: number
    backStock: number
    par: number
    reorderPoint: number
    unit: string
    vendor: string
    price?: number
    quantityInCase?: number
    expires: boolean
    status: string
  }>
  products: ProductEvidence[]
  assistantMemory: AssistantProductMemory[]
  waste: WasteSignal[]
  nationalSignals: NationalSignal[]
  orderingAwareness?: OrderingAwareness
  approvedDocuments?: DocumentCandidate[]
  documentCitations?: DocumentCitation[]
}

export type AiAnswer = {
  mode: "local" | "openai"
  answer: string
  confidence: AiConfidence
  confidenceScore?: number
  intent?: RetailAssistantIntent
  answerMode?: AssistantAnswerMode
  productName?: string
  quickFacts: string[]
  recommendedActions: string[]
  sources: AiSource[]
  imageCandidates: ProductImageCandidate[]
  externalProducts?: ExternalProductMatch[]
  recallMatches?: RecallMatch[]
  documentCitations?: DocumentCitation[]
  documentCandidates?: DocumentCandidate[]
  transformedAnswer?: string
  citedQuotes?: string[]
  missingInformation?: string[]
  conflictWarnings?: string[]
  pendingEnrichmentSuggestions?: Array<{
    productId?: string
    productName: string
    proposedField: string
    proposedValue: string
    sourceLabel: string
    sourceUrl?: string
    confidenceScore: number
    status: "pending" | "approved" | "rejected"
  }>
  learningCandidates?: Array<{
    type:
      | "verified_phrase_mapping"
      | "product_alias"
      | "rejected_alias"
      | "accepted_answer"
      | "rejected_answer"
      | "correction"
      | "store_specific_term"
      | "organization_specific_term"
      | "product_fact_note"
      | "operational_note"
      | "intent_pattern"
      | "ambiguous_phrase"
    phrase?: string
    resolvedProductId?: string
    resolvedProductName?: string
    reason: string
    confidenceScore: number
    approvalStatus: "pending" | "approved" | "rejected"
  }>
  rejectedReason?: string
  productResolution?: ProductResolution
  needsClarification?: boolean
  clarificationQuestion?: string
  productCandidates?: ProductCandidate[]
  toolResults?: Array<{
    toolName: string
    status: "used" | "skipped" | "failed"
    summary: string
    confidenceScore?: number
    sources: AiSource[]
  }>
}
