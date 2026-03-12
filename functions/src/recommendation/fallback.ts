import { randomUUID } from "node:crypto"
import type { RecommendationDomain, RecommendationEngineVersion } from "@inventracker/shared"
import type {
  GetStoreRecommendationsResponse,
  RecommendationResponseMeta,
  OrderRecommendation,
  ProductionRecommendation
} from "@inventracker/shared"

export function degradedRecommendationResponse(input: {
  domains: RecommendationDomain[]
  reason: string
  runId?: string
  engineVersion?: RecommendationEngineVersion
  orderRecommendations?: OrderRecommendation[]
  productionRecommendations?: ProductionRecommendation[]
  inputHash: string
  sourceRefs?: string[]
  fallbackSource?: "server" | "client"
  fallbackTrigger?: "backend_unavailable" | "input_incomplete" | "degraded_mode"
}): GetStoreRecommendationsResponse {
  const runId = input.runId ?? randomUUID()
  const engineVersion = input.engineVersion ?? "rules_v1"

  const meta: RecommendationResponseMeta = {
    runId,
    engineVersion,
    schemaVersion: "recommendations_v2",
    generatedAt: new Date().toISOString(),
    domains: input.domains,
    rulePathUsed: "rules_v1:degraded_fallback",
    sourceRefs: input.sourceRefs ?? [],
    degraded: true,
    fallbackUsed: true,
    fallbackReason: input.reason,
    fallbackSource: input.fallbackSource ?? "server",
    fallbackTrigger: input.fallbackTrigger ?? "backend_unavailable",
    inputHash: input.inputHash
  }

  return {
    meta,
    orderRecommendations: (input.orderRecommendations ?? []).map((row) => ({
      ...row,
      degraded: true,
      fallbackUsed: true,
      fallbackReason: input.reason
    })),
    productionRecommendations: (input.productionRecommendations ?? []).map((row) => ({
      ...row,
      degraded: true,
      fallbackUsed: true,
      fallbackReason: input.reason
    })),
    productionPlan: {
      ingredientDemandRows: [],
      frozenPullForecastRows: [],
      factors: {
        businessFactor: 1,
        weatherFactor: 1,
        holidayFactor: 1,
        trendFactor: 1
      }
    },
    questions: [input.reason]
  }
}
