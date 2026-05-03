import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getStoreRecommendationsResponseSchema } from "@inventracker/shared";
import { adminDb } from "../lib/firebase.js";
function dayKey(date) {
    return date.toISOString().slice(0, 10);
}
function stableObjectHash(value) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function windowKey(input) {
    const vendorPart = input.vendorId?.trim().length ? input.vendorId.trim() : "all-vendors";
    const domainPart = [...new Set(input.domains)].sort().join("+");
    return `${dayKey(input.start)}_${dayKey(input.end)}_${vendorPart}_${domainPart}`;
}
function recommendationsCollectionPath(features) {
    return `${features.storePath.path}/recommendations`;
}
function recommendationRunsCollectionPath(features) {
    return `${features.storePath.path}/recommendationRuns`;
}
export function recommendationInputHash(features) {
    const payload = {
        orgId: features.input.orgId,
        storeId: features.input.storeId,
        vendorId: features.input.vendorId ?? null,
        domains: [...features.input.domains].sort(),
        window: {
            start: features.input.window.start.toISOString(),
            end: features.input.window.end.toISOString()
        },
        items: features.items.map((item) => ({
            itemId: item.itemId,
            unit: item.unit,
            qtyPerCase: item.qtyPerCase,
            caseSize: item.caseSize,
            minQuantity: item.minQuantity,
            weeklyUsage: item.weeklyUsage,
            price: item.price,
            vendorId: item.vendorId ?? null,
            archived: item.archived,
            onHand: item.onHand,
            incomingBeforeLead: item.incomingBeforeLead,
            wasteAffectingOrders: item.wasteAffectingOrders,
            expiringBeforeLead: item.expiringBeforeLead,
            productionDemand: item.productionDemand,
            leadDays: item.leadDays,
            nextOrderInDays: item.nextOrderInDays
        })),
        productionProducts: features.productionProducts.map((row) => ({
            productId: row.productId,
            outputItemId: row.outputItemId ?? null,
            outputUnitRaw: row.outputUnitRaw,
            defaultBatchYield: row.defaultBatchYield,
            targetDaysOnHand: row.targetDaysOnHand,
            lastSpotCheckQuantity: row.lastSpotCheckQuantity,
            isActive: row.isActive
        })),
        productionIngredients: features.productionIngredients.map((row) => ({
            productionProductID: row.productionProductID,
            inventoryItemID: row.inventoryItemID ?? null,
            quantityPerBatch: row.quantityPerBatch,
            unitRaw: row.unitRaw,
            needsConversion: row.needsConversion,
            convertToUnitRaw: row.convertToUnitRaw ?? null
        })),
        productionSpotChecks: features.productionSpotChecks.map((row) => ({
            productionProductID: row.productionProductID,
            usageObserved: row.usageObserved,
            checkedAt: row.checkedAt.toISOString()
        })),
        productionRuns: features.productionRuns.map((row) => ({
            productionProductID: row.productionProductID,
            quantityMade: row.quantityMade,
            madeAt: row.madeAt.toISOString()
        }))
    };
    return stableObjectHash(payload);
}
export async function loadCachedRecommendationSnapshot(features) {
    const key = windowKey({
        start: features.input.window.start,
        end: features.input.window.end,
        vendorId: features.input.vendorId,
        domains: features.input.domains
    });
    const doc = await adminDb.doc(`${recommendationsCollectionPath(features)}/${key}`).get();
    if (!doc.exists)
        return null;
    const data = doc.data();
    if (!data?.response || typeof data.response !== "object")
        return null;
    const parsed = getStoreRecommendationsResponseSchema.safeParse(data.response);
    if (!parsed.success)
        return null;
    return parsed.data;
}
export async function persistRecommendationArtifacts(input) {
    const key = windowKey({
        start: input.features.input.window.start,
        end: input.features.input.window.end,
        vendorId: input.features.input.vendorId,
        domains: input.features.input.domains
    });
    const summary = {
        orgId: input.features.input.orgId,
        storeId: input.features.input.storeId,
        vendorId: input.features.input.vendorId ?? null,
        domainCount: input.features.input.domains.length,
        itemCount: input.features.items.length,
        orderRecommendationCount: input.response.orderRecommendations.length,
        productionRecommendationCount: input.response.productionRecommendations.length,
        degraded: input.response.meta.degraded,
        fallbackUsed: input.response.meta.fallbackUsed,
        fallbackReason: input.response.meta.fallbackReason ?? input.fallbackReason ?? null,
        fallbackSource: input.response.meta.fallbackSource ?? null,
        fallbackTrigger: input.response.meta.fallbackTrigger ?? null,
        engineVersion: input.response.meta.engineVersion,
        schemaVersion: input.response.meta.schemaVersion,
        rulePathUsed: input.response.meta.rulePathUsed,
        sourceRefs: input.response.meta.sourceRefs,
        inputHash: input.response.meta.inputHash
    };
    const snapshotRef = adminDb.doc(`${recommendationsCollectionPath(input.features)}/${key}`);
    const latestRef = adminDb.doc(`${recommendationsCollectionPath(input.features)}/latest`);
    const runRef = adminDb.doc(`${recommendationRunsCollectionPath(input.features)}/${input.response.meta.runId}`);
    await Promise.all([
        snapshotRef.set({
            key,
            organizationId: input.features.input.orgId,
            storeId: input.features.input.storeId,
            vendorId: input.features.input.vendorId ?? null,
            domains: input.features.input.domains,
            generatedAt: input.response.meta.generatedAt,
            response: input.response,
            summary,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: input.actorUid
        }, { merge: true }),
        latestRef.set({
            key,
            organizationId: input.features.input.orgId,
            storeId: input.features.input.storeId,
            vendorId: input.features.input.vendorId ?? null,
            domains: input.features.input.domains,
            generatedAt: input.response.meta.generatedAt,
            response: input.response,
            summary,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: input.actorUid
        }, { merge: true }),
        runRef.set({
            runId: input.response.meta.runId,
            organizationId: input.features.input.orgId,
            storeId: input.features.input.storeId,
            vendorId: input.features.input.vendorId ?? null,
            domains: input.features.input.domains,
            generatedAt: input.response.meta.generatedAt,
            engineVersion: input.response.meta.engineVersion,
            schemaVersion: input.response.meta.schemaVersion,
            rulePathUsed: input.response.meta.rulePathUsed,
            sourceRefs: input.response.meta.sourceRefs,
            inputHash: input.response.meta.inputHash,
            degraded: input.response.meta.degraded,
            fallbackUsed: input.response.meta.fallbackUsed,
            fallbackReason: input.response.meta.fallbackReason ?? input.fallbackReason ?? null,
            fallbackSource: input.response.meta.fallbackSource ?? null,
            fallbackTrigger: input.response.meta.fallbackTrigger ?? null,
            orderRecommendations: input.response.orderRecommendations,
            productionRecommendations: input.response.productionRecommendations,
            productionPlan: input.response.productionPlan,
            questions: input.response.questions,
            inputSummary: {
                orgId: input.features.input.orgId,
                storeId: input.features.input.storeId,
                vendorId: input.features.input.vendorId ?? null,
                domains: input.features.input.domains,
                windowStart: input.features.input.window.start.toISOString(),
                windowEnd: input.features.input.window.end.toISOString()
            },
            createdAt: FieldValue.serverTimestamp(),
            createdBy: input.actorUid
        }, { merge: true })
    ]);
}
export async function readRecommendationRun(params) {
    const doc = await adminDb.doc(`${params.storePath}/recommendationRuns/${params.runId}`).get();
    return doc.exists ? doc.data() : null;
}
