import type { AiConfidence, ExternalProductMatch, NutritionFacts, ProductImageCandidate, ProductNutritionSnapshot } from "@/lib/ai/types"

export type IntelligenceProvenance = "internal" | "learned_mapping" | "external_enrichment" | "operations" | "forecast"

export type RetrievalStage =
  | "exact_match"
  | "alias_synonym_match"
  | "fuzzy_search"
  | "semantic_search"
  | "vector_similarity"
  | "barcode_lookup"
  | "recipe_ingredient_relationship"
  | "approved_external_lookup"

export type RetrievalStageResult = {
  stage: RetrievalStage
  attempted: boolean
  matched: boolean
  confidenceScore: number
  reason: string
}

export type IntelligenceSource = {
  id: string
  label: string
  provenance: IntelligenceProvenance
  detail: string
  url?: string
}

export type ProductLookupRecord = {
  productId: string
  centralProductId?: string
  name: string
  sku?: string
  barcode?: string
  department?: string
  category?: string
  description?: string
  ingredientsText?: string
  nutrition?: ProductNutritionSnapshot
  aliases: string[]
  source: "central_catalog" | "organization_product" | "inventory" | "product_evidence" | "learned_mapping" | "recipe_knowledge" | "external"
}

export type ProductLookupCandidate = {
  productId: string
  centralProductId?: string
  name: string
  sku?: string
  barcode?: string
  department?: string
  category?: string
  nutrition?: ProductNutritionSnapshot
  confidenceScore: number
  stage: RetrievalStage
  provenance: IntelligenceProvenance
  reason: string
}

export type ProductLookupResult = {
  query: string
  normalizedQuery: string
  status: "resolved" | "needs_clarification" | "unresolved"
  resolvedProduct?: ProductLookupCandidate
  candidates: ProductLookupCandidate[]
  pipeline: RetrievalStageResult[]
  confidenceScore: number
  sourceUsed: string
  provenance: IntelligenceProvenance
  suggestedFollowUp?: string
  externalProducts?: ExternalProductMatch[]
}

export type ProductEnrichmentSuggestion = {
  id: string
  productId?: string
  productName: string
  sku?: string
  proposedField: string
  proposedValue: string
  currentValue?: string
  sourceUrl?: string
  sourceLabel: string
  confidenceScore: number
  status: "pending" | "approved" | "rejected"
  createdAt: string
  retrievedAt: string
  approvedBy?: string
  approvedAt?: string
  supersededBy?: string
}

export type BusinessRecommendation = {
  id: string
  type:
    | "increase_production"
    | "reduce_ordering"
    | "waste_risk"
    | "markdown"
    | "cost_change"
    | "abnormal_movement"
    | "stockout_risk"
  title: string
  detail: string
  confidenceScore: number
  severity: "low" | "medium" | "high"
  productName?: string
  evidence: string[]
  suggestedAction: string
}

export type RetailIntelligenceAnswer = {
  answer: string
  confidence: AiConfidence
  confidenceScore: number
  sourceUsed: string
  provenance: IntelligenceProvenance
  facts: string[]
  sources: IntelligenceSource[]
  suggestedFollowUp?: string
  retrieval?: ProductLookupResult
  recommendations?: BusinessRecommendation[]
  enrichmentSuggestions?: ProductEnrichmentSuggestion[]
  imageCandidates?: ProductImageCandidate[]
  nutritionCandidates?: NutritionFacts[]
  externalProducts?: ExternalProductMatch[]
  audit: {
    engine: "retail_product_intelligence"
    version: "2026-06-29"
    generatedAt: string
    requiresHumanApproval: boolean
    unsupportedClaimsAvoided: boolean
  }
}

export type VerifiedLearningInput = {
  query: string
  resolvedProductId?: string
  resolvedProductName?: string
  answer: string
  confidenceScore: number
  accepted: boolean
  correctedAnswer?: string
  verifiedByUser?: boolean
  sourceRoute?: string
}

export type VerifiedLearningResult = {
  attempted: boolean
  persisted: boolean
  orgId: string
  recordIds: string[]
  error?: string
}

export type LearnedPhraseMapping = {
  id: string
  phrase: string
  resolvedProductId?: string
  resolvedProductName?: string
  confidenceScore: number
  verifiedByUser: boolean
}

export type ProductAliasRecord = {
  id: string
  productId?: string
  productName: string
  alias: string
  confidenceScore: number
  verifiedByUser: boolean
}

export type IntentPatternRecord = {
  id: string
  pattern: string
  intent: "product_lookup" | "inventory_reasoning" | "ordering_reasoning" | "product_enrichment" | "business_recommendation"
  confidenceScore: number
}

export type RejectedAliasRecord = {
  id: string
  productId?: string
  productName?: string
  alias: string
  reason?: string
  confidenceScore: number
}

export type TerminologyRecord = {
  id: string
  term: string
  meaning?: string
  resolvedProductId?: string
  resolvedProductName?: string
  confidenceScore: number
}

export type ProductFactNoteRecord = {
  id: string
  productId?: string
  productName?: string
  factType?: string
  fact: string
  sourceLabel?: string
  confidenceScore: number
  approvalStatus?: "pending" | "approved" | "rejected"
}

export type AcceptedAnswerRecord = {
  id: string
  query: string
  answer: string
  resolvedProductId?: string
  resolvedProductName?: string
  confidenceScore: number
}

export type RejectedAnswerRecord = {
  id: string
  query: string
  answer: string
  correctedAnswer?: string
  resolvedProductId?: string
  resolvedProductName?: string
  confidenceScore: number
}

export type VerifiedCorrectionRecord = {
  id: string
  query: string
  correctedAnswer: string
  originalAnswer?: string
  resolvedProductId?: string
  resolvedProductName?: string
  confidenceScore: number
}

export type VerifiedLearningRecords = {
  userPhraseMappings: LearnedPhraseMapping[]
  productAliases: ProductAliasRecord[]
  rejectedAliases: RejectedAliasRecord[]
  intentPatterns: IntentPatternRecord[]
  acceptedAnswers: AcceptedAnswerRecord[]
  rejectedAnswers: RejectedAnswerRecord[]
  verifiedCorrections: VerifiedCorrectionRecord[]
  storeSpecificTerminology: TerminologyRecord[]
  organizationSpecificTerminology: TerminologyRecord[]
  productFactNotes: ProductFactNoteRecord[]
  operationalNotes: TerminologyRecord[]
  ambiguousPhraseHistory: TerminologyRecord[]
}
