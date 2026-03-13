import fs from "node:fs"
import { describe, expect, it } from "vitest"
import { runDemandRulesV1 } from "../src/recommendation/demand-rules-v1.js"
import { runWasteRiskRulesV1 } from "../src/recommendation/waste-risk-rules-v1.js"
import { runOrderOptimizerRulesV1 } from "../src/recommendation/order-optimizer-rules-v1.js"
import { runProductionOptimizerRulesV1 } from "../src/recommendation/production-optimizer-rules-v1.js"
import type {
  CollectedRecommendationFeatures,
  ItemFeature,
  ProductionRunFeature,
  ProductionSpotCheckFeature
} from "../src/recommendation/types.js"

type OrderFixtureScenario = {
  id: string
  item: ItemFeature
  expected: {
    caseInterpretation: "direct_units" | "case_rounded"
    recommendedQuantity: number
    confidence: number
    demandValue: number
  }
}

type ProductionFixture = {
  features: {
    input: {
      orgId: string
      storeId: string
      domains: ["production"]
      actorUid: string
      window: { start: string; end: string }
      productionPlanOptions?: {
        businessFactor?: number
        includeNonFrozen?: boolean
      }
    }
    storePath: {
      mode: "root"
      path: string
      storeId: string
    }
    sourceRefs: string[]
    items: ItemFeature[]
    productionProducts: CollectedRecommendationFeatures["productionProducts"]
    productionIngredients: CollectedRecommendationFeatures["productionIngredients"]
    productionSpotChecks: Array<Omit<ProductionSpotCheckFeature, "checkedAt"> & { checkedAt: string }>
    productionRuns: Array<Omit<ProductionRunFeature, "madeAt"> & { madeAt: string }>
  }
  expected: {
    recommendedMakeQuantity: number
    expectedUsageToday: number
    ingredientDemandQuantity: number
    frozenPullQuantity: number
    trendFactor: number
  }
}

type RecommendationParityFixture = {
  orderScenarios: OrderFixtureScenario[]
  productionScenario: ProductionFixture
}

function loadFixture(): RecommendationParityFixture {
  const fixturePath = new URL("./fixtures/recommendations/rules-v1-baseline.json", import.meta.url)
  const text = fs.readFileSync(fixturePath, "utf8")
  return JSON.parse(text) as RecommendationParityFixture
}

describe("recommendation parity baseline (rules_v1)", () => {
  const fixture = loadFixture()

  it("matches order quantity and interpretation baseline fixtures", () => {
    for (const scenario of fixture.orderScenarios) {
      const demand = runDemandRulesV1(scenario.item)
      const waste = runWasteRiskRulesV1(scenario.item)
      const [line] = runOrderOptimizerRulesV1({
        items: [scenario.item],
        demandByItem: new Map([[scenario.item.itemId, demand]]),
        wasteRiskByItem: new Map([[scenario.item.itemId, waste]])
      })

      expect(line, `missing recommendation for ${scenario.id}`).toBeDefined()
      if (!line) continue

      expect(line.caseInterpretation).toBe(scenario.expected.caseInterpretation)
      expect(Math.abs(line.recommendedQuantity - scenario.expected.recommendedQuantity)).toBeLessThanOrEqual(0.001)
      expect(Math.abs(line.confidence - scenario.expected.confidence)).toBeLessThanOrEqual(0.001)
      expect(Math.abs(line.predictedDemand.value - scenario.expected.demandValue)).toBeLessThanOrEqual(0.001)
    }
  })

  it("matches production output and pull forecast baseline fixture", () => {
    const raw = fixture.productionScenario
    const features: CollectedRecommendationFeatures = {
      input: {
        ...raw.features.input,
        window: {
          start: new Date(raw.features.input.window.start),
          end: new Date(raw.features.input.window.end)
        }
      },
      storePath: raw.features.storePath,
      sourceRefs: raw.features.sourceRefs,
      items: raw.features.items,
      productionProducts: raw.features.productionProducts,
      productionIngredients: raw.features.productionIngredients,
      productionSpotChecks: raw.features.productionSpotChecks.map((row) => ({
        ...row,
        checkedAt: new Date(row.checkedAt)
      })),
      productionRuns: raw.features.productionRuns.map((row) => ({
        ...row,
        madeAt: new Date(row.madeAt)
      }))
    }

    const output = runProductionOptimizerRulesV1(features)
    const rec = output.recommendations[0]
    expect(rec).toBeDefined()
    if (!rec) return

    expect(Math.abs(rec.recommendedMakeQuantity - raw.expected.recommendedMakeQuantity)).toBeLessThanOrEqual(0.001)
    expect(Math.abs(rec.expectedUsageToday - raw.expected.expectedUsageToday)).toBeLessThanOrEqual(0.001)

    const ingredientRow = output.productionPlan.ingredientDemandRows[0]
    expect(ingredientRow).toBeDefined()
    if (!ingredientRow) return
    expect(Math.abs(ingredientRow.requiredQuantity - raw.expected.ingredientDemandQuantity)).toBeLessThanOrEqual(0.001)

    const pullRow = output.productionPlan.frozenPullForecastRows[0]
    expect(pullRow).toBeDefined()
    if (!pullRow) return
    expect(Math.abs(pullRow.recommendedPullQuantity - raw.expected.frozenPullQuantity)).toBeLessThanOrEqual(0.001)
    expect(Math.abs(output.productionPlan.factors.trendFactor - raw.expected.trendFactor)).toBeLessThanOrEqual(0.001)
  })
})
