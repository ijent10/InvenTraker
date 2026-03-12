import { describe, expect, it } from "vitest"
import { runDemandRulesV1 } from "../src/recommendation/demand-rules-v1.js"
import { runWasteRiskRulesV1 } from "../src/recommendation/waste-risk-rules-v1.js"
import { runOrderOptimizerRulesV1 } from "../src/recommendation/order-optimizer-rules-v1.js"
import { runProductionOptimizerRulesV1 } from "../src/recommendation/production-optimizer-rules-v1.js"
import { degradedRecommendationResponse } from "../src/recommendation/fallback.js"
import type { CollectedRecommendationFeatures, ItemFeature } from "../src/recommendation/types.js"

function makeBaseItem(overrides: Partial<ItemFeature> = {}): ItemFeature {
  return {
    itemId: "item-1",
    itemName: "Item 1",
    unit: "each",
    qtyPerCase: 12,
    caseSize: 12,
    minQuantity: 24,
    weeklyUsage: 28,
    price: 4,
    archived: false,
    onHand: 4,
    incomingBeforeLead: 0,
    wasteAffectingOrders: 1,
    expiringBeforeLead: 0,
    productionDemand: 0,
    leadDays: 2,
    nextOrderInDays: 1,
    ...overrides
  }
}

describe("recommendation engine rules_v1", () => {
  it("rounds each-unit recommendations to case packs", () => {
    const item = makeBaseItem()
    const demand = runDemandRulesV1(item)
    const wasteRisk = runWasteRiskRulesV1(item)
    const rec = runOrderOptimizerRulesV1({
      items: [item],
      demandByItem: new Map([[item.itemId, demand]]),
      wasteRiskByItem: new Map([[item.itemId, wasteRisk]])
    })[0]

    expect(rec).toBeDefined()
    if (!rec) return
    expect(rec.caseInterpretation).toBe("case_rounded")
    expect(rec.recommendedQuantity % item.qtyPerCase).toBe(0)
    expect(rec.recommendedQuantity).toBeGreaterThan(0)
  })

  it("keeps lbs ordering in direct units when caseSize is 1", () => {
    const item = makeBaseItem({
      itemId: "item-lbs",
      unit: "lbs",
      qtyPerCase: 10,
      caseSize: 1,
      minQuantity: 18,
      onHand: 2,
      weeklyUsage: 21
    })
    const demand = runDemandRulesV1(item)
    const wasteRisk = runWasteRiskRulesV1(item)
    const rec = runOrderOptimizerRulesV1({
      items: [item],
      demandByItem: new Map([[item.itemId, demand]]),
      wasteRiskByItem: new Map([[item.itemId, wasteRisk]])
    })[0]

    expect(rec).toBeDefined()
    if (!rec) return
    expect(rec.caseInterpretation).toBe("direct_units")
    expect(rec.unit).toBe("lbs")
    expect(Number.isInteger(rec.recommendedQuantity)).toBe(false)
  })

  it("returns production recommendations and a production-demand map for order phase", () => {
    const features: CollectedRecommendationFeatures = {
      input: {
        orgId: "org-1",
        storeId: "store-1",
        domains: ["production"],
        window: { start: new Date("2026-01-01T00:00:00.000Z"), end: new Date("2026-01-08T00:00:00.000Z") },
        actorUid: "uid-1"
      },
      storePath: { mode: "root", path: "organizations/org-1/stores/store-1", storeId: "store-1" },
      sourceRefs: ["organizations/org-1/items"],
      items: [
        makeBaseItem({
          itemId: "ingredient-1",
          itemName: "Mozzarella",
          unit: "each",
          qtyPerCase: 1,
          caseSize: 1
        })
      ],
      productionProducts: [
        {
          productId: "prod-1",
          productName: "Pizza",
          outputUnitRaw: "pieces",
          defaultBatchYield: 6,
          targetDaysOnHand: 1.5,
          lastSpotCheckQuantity: 0,
          isActive: true
        }
      ],
      productionIngredients: [
        {
          productionProductID: "prod-1",
          inventoryItemID: "ingredient-1",
          inventoryItemNameSnapshot: "Mozzarella",
          quantityPerBatch: 2,
          unitRaw: "pieces",
          needsConversion: false
        }
      ],
      productionSpotChecks: [],
      productionRuns: [
        {
          productionProductID: "prod-1",
          quantityMade: 8,
          madeAt: new Date("2025-12-30T12:00:00.000Z")
        }
      ]
    }

    const result = runProductionOptimizerRulesV1(features)
    expect(result.recommendations.length).toBe(1)
    expect(result.productionDemandByItem.get("ingredient-1") ?? 0).toBeGreaterThan(0)
  })

  it("marks degraded responses and fallback metadata consistently", () => {
    const degraded = degradedRecommendationResponse({
      domains: ["orders"],
      reason: "backend unavailable",
      inputHash: "abc123",
      orderRecommendations: [
        {
          itemId: "item-1",
          itemName: "Item 1",
          unit: "each",
          qtyPerCase: 12,
          caseInterpretation: "case_rounded",
          recommendedQuantity: 24,
          onHand: 2,
          minQuantity: 24,
          predictedDemand: { value: 10, unit: "each", horizonHours: 24 },
          predictedWasteRisk: { probability: 0.15, expectedLossValue: 0 },
          confidence: 0.7,
          topContributingFactors: [],
          rationaleSummary: "fallback line",
          degraded: false,
          fallbackUsed: false,
          questions: []
        }
      ]
    })

    expect(degraded.meta.degraded).toBe(true)
    expect(degraded.meta.fallbackUsed).toBe(true)
    expect(degraded.meta.schemaVersion).toBe("recommendations_v2")
    expect(degraded.meta.fallbackReason).toBe("backend unavailable")
    expect(degraded.meta.fallbackSource).toBe("server")
    expect(degraded.meta.fallbackTrigger).toBe("backend_unavailable")
    expect(degraded.orderRecommendations[0]?.degraded).toBe(true)
    expect(degraded.orderRecommendations[0]?.fallbackUsed).toBe(true)
    expect(degraded.orderRecommendations[0]?.fallbackReason).toBe("backend unavailable")
  })
})
