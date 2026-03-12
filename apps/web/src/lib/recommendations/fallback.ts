import type {
  ItemRecord,
  ProductionIngredientRecord,
  ProductionProductRecord,
  ProductionRunRecord,
  ProductionSpotCheckRecord
} from "@/lib/data/firestore"
import {
  generateFrozenPullRows,
  makeTodaySuggestions,
  type FrozenPullRow,
  type PullFactorSummary,
  type ProductionSuggestionRow
} from "@/lib/production/planning"

export type ProductionFallbackResult = {
  suggestions: ProductionSuggestionRow[]
  frozenPullRows: FrozenPullRow[]
  factors: PullFactorSummary
  meta: {
    engineVersion: "local_fallback_rules_v1"
    degraded: true
    fallbackUsed: true
    fallbackReason: string
  }
}

export function buildProductionFallback(input: {
  products: ProductionProductRecord[]
  ingredients: ProductionIngredientRecord[]
  items: ItemRecord[]
  runs: ProductionRunRecord[]
  spotChecks: ProductionSpotCheckRecord[]
  businessFactor: number
  includeNonFrozen: boolean
  fallbackReason?: string
}): ProductionFallbackResult {
  const suggestions = makeTodaySuggestions({
    products: input.products,
    spotChecks: input.spotChecks,
    runs: input.runs
  })

  const pull = generateFrozenPullRows({
    products: input.products,
    ingredients: input.ingredients,
    items: input.items,
    runs: input.runs,
    spotChecks: input.spotChecks,
    businessFactor: input.businessFactor,
    includeNonFrozen: input.includeNonFrozen
  })

  return {
    suggestions,
    frozenPullRows: pull.rows,
    factors: pull.factors,
    meta: {
      engineVersion: "local_fallback_rules_v1",
      degraded: true,
      fallbackUsed: true,
      fallbackReason: input.fallbackReason ?? "Backend unavailable. Using emergency local fallback."
    }
  }
}
