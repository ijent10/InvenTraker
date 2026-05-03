import { z } from "zod";
import {
  recommendationDomains,
  recommendationEngineVersions,
  recommendationFallbackSources,
  recommendationFallbackTriggers
} from "../enums.js";

export const recommendationDriverSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.string().optional(),
  impact: z.number().min(0).max(1),
  direction: z.enum(["up", "down", "neutral"]).default("neutral")
});

export const demandPredictionSchema = z.object({
  value: z.number().min(0),
  unit: z.enum(["each", "lbs", "pieces", "custom"]).default("each"),
  horizonHours: z.number().int().positive().default(24)
});

export const wasteRiskPredictionSchema = z.object({
  probability: z.number().min(0).max(1),
  expectedLossValue: z.number().min(0).default(0)
});

export const orderCaseInterpretationSchema = z.enum(["direct_units", "case_rounded"]);

export const orderRecommendationSchema = z.object({
  itemId: z.string().min(1),
  itemName: z.string().min(1).optional(),
  unit: z.enum(["each", "lbs"]),
  qtyPerCase: z.number().positive().default(1),
  caseInterpretation: orderCaseInterpretationSchema,
  recommendedQuantity: z.number().min(0),
  onHand: z.number().min(0),
  minQuantity: z.number().min(0),
  predictedDemand: demandPredictionSchema,
  predictedWasteRisk: wasteRiskPredictionSchema,
  confidence: z.number().min(0).max(1),
  topContributingFactors: z.array(recommendationDriverSchema).default([]),
  rationaleSummary: z.string().min(1),
  degraded: z.boolean().default(false),
  fallbackUsed: z.boolean().default(false),
  fallbackReason: z.string().optional(),
  questions: z.array(z.string()).default([])
});

export const productionRecommendationSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1),
  outputUnitRaw: z.string().min(1),
  recommendedMakeQuantity: z.number().min(0),
  expectedUsageToday: z.number().min(0),
  onHandQuantity: z.number().min(0),
  predictedDemand: demandPredictionSchema,
  predictedWasteRisk: wasteRiskPredictionSchema,
  confidence: z.number().min(0).max(1),
  topContributingFactors: z.array(recommendationDriverSchema).default([]),
  rationaleSummary: z.string().min(1),
  degraded: z.boolean().default(false),
  fallbackUsed: z.boolean().default(false),
  fallbackReason: z.string().optional(),
  questions: z.array(z.string()).default([])
});

export const ingredientDemandRowSchema = z.object({
  itemId: z.string().min(1),
  itemName: z.string().min(1),
  unitRaw: z.string().min(1),
  requiredQuantity: z.number().min(0)
});

export const frozenPullForecastRowSchema = z.object({
  itemId: z.string().min(1),
  itemName: z.string().min(1),
  unitRaw: z.string().min(1),
  requiredQuantity: z.number().min(0),
  recommendedPullQuantity: z.number().min(0),
  onHandQuantity: z.number().min(0),
  rationale: z.string().min(1)
});

export const productionPullFactorSummarySchema = z.object({
  businessFactor: z.number().min(0),
  weatherFactor: z.number().min(0),
  holidayFactor: z.number().min(0),
  trendFactor: z.number().min(0),
  holidayName: z.string().optional()
});

export const productionPlanSchema = z.object({
  ingredientDemandRows: z.array(ingredientDemandRowSchema).default([]),
  frozenPullForecastRows: z.array(frozenPullForecastRowSchema).default([]),
  factors: productionPullFactorSummarySchema.default({
    businessFactor: 1,
    weatherFactor: 1,
    holidayFactor: 1,
    trendFactor: 1
  })
});

export const recommendationResponseMetaSchema = z.object({
  runId: z.string().min(1),
  engineVersion: z.enum(recommendationEngineVersions),
  schemaVersion: z.literal("recommendations_v2"),
  generatedAt: z.string().datetime(),
  domains: z.array(z.enum(recommendationDomains)).min(1),
  rulePathUsed: z.string().min(1),
  sourceRefs: z.array(z.string().min(1)).default([]),
  degraded: z.boolean().default(false),
  fallbackUsed: z.boolean().default(false),
  fallbackReason: z.string().optional(),
  fallbackSource: z.enum(recommendationFallbackSources).optional(),
  fallbackTrigger: z.enum(recommendationFallbackTriggers).optional(),
  inputHash: z.string().min(1)
});
