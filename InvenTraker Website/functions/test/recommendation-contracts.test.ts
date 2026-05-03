import { describe, expect, it } from "vitest"
import {
  getStoreRecommendationsRequestSchema,
  getStoreRecommendationsResponseSchema,
  commitOrderRecommendationsRequestSchema,
  commitOrderRecommendationsResponseSchema
} from "@inventracker/shared"

describe("recommendation callable contracts", () => {
  it("parses getStoreRecommendations request and applies defaults", () => {
    const parsed = getStoreRecommendationsRequestSchema.parse({
      orgId: "org-1",
      storeId: "store-1",
      productionPlanOptions: {
        businessFactor: 1.2,
        includeNonFrozen: true
      }
    })

    expect(parsed.domains).toEqual(["orders", "production"])
    expect(parsed.forceRefresh).toBe(false)
    expect(parsed.productionPlanOptions?.businessFactor).toBe(1.2)
    expect(parsed.productionPlanOptions?.includeNonFrozen).toBe(true)
  })

  it("parses versioned getStoreRecommendations response contract", () => {
    const parsed = getStoreRecommendationsResponseSchema.parse({
      meta: {
        runId: "run-1",
        engineVersion: "rules_v1",
        schemaVersion: "recommendations_v2",
        generatedAt: "2026-03-11T00:00:00.000Z",
        domains: ["orders"],
        rulePathUsed: "rules_v1:order_optimizer",
        sourceRefs: ["organizations/org-1/items"],
        degraded: false,
        fallbackUsed: false,
        fallbackSource: "server",
        fallbackTrigger: "degraded_mode",
        inputHash: "hash-1"
      },
      orderRecommendations: [
        {
          itemId: "item-1",
          itemName: "Cheddar",
          unit: "each",
          qtyPerCase: 12,
          caseInterpretation: "case_rounded",
          recommendedQuantity: 24,
          onHand: 2,
          minQuantity: 20,
          predictedDemand: {
            value: 10,
            unit: "each",
            horizonHours: 24
          },
          predictedWasteRisk: {
            probability: 0.15,
            expectedLossValue: 6
          },
          confidence: 0.83,
          topContributingFactors: [],
          rationaleSummary: "Projected below min; rounded to case.",
          degraded: false,
          fallbackUsed: false,
          questions: []
        }
      ],
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
      productionRecommendations: [],
      questions: []
    })

    expect(parsed.meta.engineVersion).toBe("rules_v1")
    expect(parsed.meta.schemaVersion).toBe("recommendations_v2")
    expect(parsed.meta.rulePathUsed).toContain("rules_v1")
    expect(parsed.meta.fallbackSource).toBe("server")
    expect(parsed.meta.fallbackTrigger).toBe("degraded_mode")
    expect(parsed.orderRecommendations).toHaveLength(1)
  })

  it("parses commitOrderRecommendations request/response contracts", () => {
    const req = commitOrderRecommendationsRequestSchema.parse({
      orgId: "org-1",
      storeId: "store-1",
      runId: "run-1",
      selectedLines: [
        {
          itemId: "item-1",
          finalQuantity: 24,
          unit: "each",
          rationaleSummary: "Approved by manager"
        }
      ]
    })

    const res = commitOrderRecommendationsResponseSchema.parse({
      orderId: "order-1",
      lineCount: 1,
      todosCreated: 2,
      runId: "run-1",
      engineVersion: "rules_v1",
      appliedFromRun: true
    })

    expect(req.selectedLines).toHaveLength(1)
    expect(res.engineVersion).toBe("rules_v1")
    expect(res.appliedFromRun).toBe(true)
  })
})
