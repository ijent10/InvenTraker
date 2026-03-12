import { randomUUID } from "node:crypto";
export function degradedRecommendationResponse(input) {
    const runId = input.runId ?? randomUUID();
    const engineVersion = input.engineVersion ?? "rules_v1";
    const meta = {
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
    };
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
    };
}
