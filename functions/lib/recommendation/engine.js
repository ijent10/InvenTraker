import { randomUUID } from "node:crypto";
import { getStoreRecommendationsResponseSchema } from "@inventracker/shared";
import { collectRecommendationFeatures } from "./feature-collector.js";
import { degradedRecommendationResponse } from "./fallback.js";
import { runDemandRulesV1 } from "./demand-rules-v1.js";
import { runWasteRiskRulesV1 } from "./waste-risk-rules-v1.js";
import { runOrderOptimizerRulesV1 } from "./order-optimizer-rules-v1.js";
import { runProductionOptimizerRulesV1 } from "./production-optimizer-rules-v1.js";
import { loadCachedRecommendationSnapshot, persistRecommendationArtifacts, recommendationInputHash } from "./persistence.js";
import { collectRecommendationQuestions, topGlobalDrivers } from "./rationale.js";
function normalizeDomains(domains) {
    if (!domains || domains.length === 0)
        return ["orders", "production"];
    const unique = [...new Set(domains.filter((domain) => domain === "orders" || domain === "production"))];
    return unique.length ? unique : ["orders", "production"];
}
function parseDateOrNull(value) {
    if (!value)
        return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
export async function buildStoreRecommendations(input) {
    const domains = normalizeDomains(input.domains);
    const features = await collectRecommendationFeatures({
        orgId: input.orgId,
        storeId: input.storeId,
        vendorId: input.vendorId,
        actorUid: input.actorUid,
        domains,
        productionPlanOptions: input.productionPlanOptions,
        window: input.windowStart || input.windowEnd
            ? {
                start: parseDateOrNull(input.windowStart) ?? new Date(),
                end: parseDateOrNull(input.windowEnd) ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            }
            : undefined
    });
    if (!input.forceRefresh) {
        const cached = await loadCachedRecommendationSnapshot(features);
        if (cached) {
            return {
                response: cached,
                features
            };
        }
    }
    const runId = randomUUID();
    const inputHash = recommendationInputHash(features);
    try {
        const productionOutput = runProductionOptimizerRulesV1(features);
        const productionDemandByItem = productionOutput.productionDemandByItem;
        const enrichedItems = features.items.map((item) => ({
            ...item,
            productionDemand: productionDemandByItem.get(item.itemId) ?? 0
        }));
        const demandByItem = new Map();
        const wasteRiskByItem = new Map();
        for (const item of enrichedItems) {
            demandByItem.set(item.itemId, runDemandRulesV1(item));
            wasteRiskByItem.set(item.itemId, runWasteRiskRulesV1(item));
        }
        const orderRecommendations = domains.includes("orders")
            ? runOrderOptimizerRulesV1({
                items: enrichedItems,
                demandByItem,
                wasteRiskByItem
            })
            : [];
        const productionRecommendations = domains.includes("production")
            ? productionOutput.recommendations
            : [];
        const questions = collectRecommendationQuestions({
            orderRecommendations,
            productionRecommendations
        });
        const response = {
            meta: {
                runId,
                engineVersion: "rules_v1",
                schemaVersion: "recommendations_v2",
                generatedAt: new Date().toISOString(),
                domains,
                rulePathUsed: "rules_v1:demand_rules+orders_optimizer+production_optimizer",
                sourceRefs: features.sourceRefs,
                degraded: false,
                fallbackUsed: false,
                inputHash
            },
            orderRecommendations,
            productionRecommendations,
            productionPlan: productionOutput.productionPlan,
            questions
        };
        const parsed = getStoreRecommendationsResponseSchema.parse(response);
        await persistRecommendationArtifacts({
            features,
            response: parsed,
            actorUid: input.actorUid
        });
        return {
            response: parsed,
            features
        };
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : "Recommendation engine failed.";
        const empty = degradedRecommendationResponse({
            domains,
            reason,
            runId,
            inputHash,
            sourceRefs: features.sourceRefs
        });
        await persistRecommendationArtifacts({
            features,
            response: empty,
            actorUid: input.actorUid,
            fallbackReason: reason
        });
        return {
            response: empty,
            features
        };
    }
}
export function summarizeRecommendationDrivers(response) {
    return topGlobalDrivers({
        orderRecommendations: response.orderRecommendations,
        productionRecommendations: response.productionRecommendations
    });
}
