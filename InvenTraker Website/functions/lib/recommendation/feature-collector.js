import { adminDb } from "../lib/firebase.js";
import { findStorePath } from "../utils/store-path.js";
function asNumber(value, fallback = 0) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return fallback;
}
function asString(value) {
    if (typeof value !== "string")
        return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
}
function asDate(value) {
    if (value instanceof Date)
        return value;
    if (value && typeof value === "object" && "toDate" in value) {
        try {
            const date = value.toDate?.();
            return date instanceof Date ? date : null;
        }
        catch {
            return null;
        }
    }
    if (typeof value === "string" || typeof value === "number") {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
}
function normalizeStoreId(value) {
    return typeof value === "string" ? value.trim() : "";
}
function pathContainsStore(path, storeId) {
    if (!storeId)
        return false;
    return path.includes(`/stores/${storeId}/`) || path.endsWith(`/stores/${storeId}`);
}
function isStoreScopedMatch(data, path, storeId) {
    if (!storeId)
        return true;
    const rowStoreId = normalizeStoreId(data.storeId);
    if (rowStoreId) {
        return rowStoreId === storeId;
    }
    return pathContainsStore(path, storeId);
}
function normalizeWindow(window) {
    const now = new Date();
    if (!window) {
        const end = new Date(now);
        end.setDate(end.getDate() + 7);
        return { start: now, end };
    }
    return window;
}
export function daysUntilNextOrder(orderingDays, now) {
    if (!orderingDays || orderingDays.length === 0)
        return 0;
    const today = now.getDay();
    const sorted = [...orderingDays].sort((a, b) => a - b);
    const next = sorted.find((day) => day >= today);
    if (next !== undefined)
        return next - today;
    const first = sorted[0];
    return first === undefined ? 0 : 7 - today + first;
}
async function resolveStorePath(orgId, storeId) {
    const nested = await findStorePath(orgId, storeId);
    if (nested) {
        return {
            mode: "nested",
            path: `organizations/${orgId}/regions/${nested.regionId}/districts/${nested.districtId}/stores/${nested.storeId}`,
            regionId: nested.regionId,
            districtId: nested.districtId,
            storeId: nested.storeId
        };
    }
    const rootRef = adminDb.doc(`organizations/${orgId}/stores/${storeId}`);
    const rootSnap = await rootRef.get();
    if (rootSnap.exists) {
        return {
            mode: "root",
            path: rootRef.path,
            storeId
        };
    }
    return {
        mode: "root",
        path: rootRef.path,
        storeId
    };
}
function normalizeDomainSet(domains) {
    if (!domains || domains.length === 0)
        return ["orders", "production"];
    const unique = [...new Set(domains.filter((domain) => domain === "orders" || domain === "production"))];
    return unique.length ? unique : ["orders", "production"];
}
export async function collectRecommendationFeatures(params) {
    const now = new Date();
    const normalizedStoreId = params.storeId.trim();
    const input = {
        orgId: params.orgId,
        storeId: params.storeId,
        vendorId: params.vendorId,
        domains: normalizeDomainSet(params.domains),
        window: normalizeWindow(params.window),
        productionPlanOptions: params.productionPlanOptions,
        actorUid: params.actorUid
    };
    const storePath = await resolveStorePath(params.orgId, params.storeId);
    const sourceRefs = [
        storePath.path,
        `organizations/${params.orgId}/items`,
        `organizations/${params.orgId}/vendors`,
        "collectionGroup:inventoryBatches",
        "collectionGroup:wasteRecords",
        "collectionGroup:orders",
        `organizations/${params.orgId}/productionProducts`,
        `organizations/${params.orgId}/productionIngredients`,
        `organizations/${params.orgId}/productionSpotChecks`,
        `organizations/${params.orgId}/productionRuns`
    ];
    const [itemsSnap, vendorsSnap, batchesSnap, wasteSnap, ordersSnap, productsSnap, ingredientsSnap, spotChecksSnap, runsSnap] = await Promise.all([
        adminDb.collection(`organizations/${params.orgId}/items`).get(),
        adminDb.collection(`organizations/${params.orgId}/vendors`).get(),
        adminDb
            .collectionGroup("inventoryBatches")
            .where("organizationId", "==", params.orgId)
            .get(),
        adminDb
            .collectionGroup("wasteRecords")
            .where("organizationId", "==", params.orgId)
            .get(),
        adminDb
            .collectionGroup("orders")
            .where("organizationId", "==", params.orgId)
            .get(),
        adminDb.collection(`organizations/${params.orgId}/productionProducts`).get().catch(() => null),
        adminDb.collection(`organizations/${params.orgId}/productionIngredients`).get().catch(() => null),
        adminDb.collection(`organizations/${params.orgId}/productionSpotChecks`).get().catch(() => null),
        adminDb.collection(`organizations/${params.orgId}/productionRuns`).get().catch(() => null)
    ]);
    const vendorMap = new Map();
    for (const vendor of vendorsSnap.docs) {
        const data = vendor.data();
        vendorMap.set(vendor.id, {
            orderingDays: Array.isArray(data.orderingDays)
                ? data.orderingDays.map((value) => asNumber(value)).filter((value) => Number.isFinite(value))
                : [],
            leadDays: Math.max(0, asNumber(data.leadDays, 0))
        });
    }
    const onHandByItem = new Map();
    const expiringByItemByLead = new Map();
    for (const batch of batchesSnap.docs) {
        const data = batch.data();
        if (!isStoreScopedMatch(data, batch.ref.path, normalizedStoreId))
            continue;
        const itemId = asString(data.itemId);
        if (!itemId)
            continue;
        const quantity = Math.max(0, asNumber(data.quantity, 0));
        onHandByItem.set(itemId, (onHandByItem.get(itemId) ?? 0) + quantity);
        const expiresAt = asDate(data.expiresAt);
        if (!expiresAt)
            continue;
        const daysUntilExpiry = Math.floor((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        if (daysUntilExpiry <= 7) {
            expiringByItemByLead.set(itemId, (expiringByItemByLead.get(itemId) ?? 0) + quantity);
        }
    }
    const wasteByItem = new Map();
    for (const waste of wasteSnap.docs) {
        const data = waste.data();
        if (!isStoreScopedMatch(data, waste.ref.path, normalizedStoreId))
            continue;
        const itemId = asString(data.itemId);
        if (!itemId)
            continue;
        const affectsOrdersRaw = data.affectsOrders ?? data.wasteTypeAffectsOrders;
        const affectsOrders = typeof affectsOrdersRaw === "boolean" ? affectsOrdersRaw : true;
        if (!affectsOrders)
            continue;
        wasteByItem.set(itemId, (wasteByItem.get(itemId) ?? 0) + Math.max(0, asNumber(data.quantity, 0)));
    }
    const incomingLines = [];
    for (const order of ordersSnap.docs) {
        const orderData = order.data();
        if (!isStoreScopedMatch(orderData, order.ref.path, normalizedStoreId))
            continue;
        const status = (asString(orderData.status) ?? "suggested").toLowerCase();
        if (status === "received" || status === "closed")
            continue;
        if (params.vendorId) {
            const orderVendorId = asString(orderData.vendorId);
            if (orderVendorId && orderVendorId !== params.vendorId)
                continue;
        }
        const expectedDeliveryDate = asDate(orderData.expectedDeliveryDate) ?? asDate(orderData.vendorCutoffAt);
        const linesSnap = await order.ref.collection("lines").get().catch(() => null);
        for (const line of linesSnap?.docs ?? []) {
            const lineData = line.data();
            const itemId = asString(lineData.itemId);
            if (!itemId)
                continue;
            const finalQty = asNumber(lineData.finalQty, Number.NaN);
            const suggestedQty = asNumber(lineData.suggestedQty, 0);
            const units = Number.isFinite(finalQty) ? Math.max(0, finalQty) : Math.max(0, suggestedQty);
            incomingLines.push({
                itemId,
                units,
                expectedDate: expectedDeliveryDate
            });
        }
    }
    const items = [];
    for (const itemDoc of itemsSnap.docs) {
        const data = itemDoc.data();
        const unitRaw = (asString(data.unit) ?? "each").toLowerCase();
        const unit = unitRaw === "lbs" ? "lbs" : "each";
        const vendorId = asString(data.vendorId);
        if (params.vendorId && vendorId !== params.vendorId)
            continue;
        const vendorMeta = vendorMap.get(vendorId ?? "");
        const leadDays = Math.max(0, vendorMeta?.leadDays ?? 0);
        const nextOrderInDays = daysUntilNextOrder(vendorMeta?.orderingDays, now);
        const incomingBeforeLead = incomingLines
            .filter((line) => line.itemId === itemDoc.id)
            .filter((line) => {
            if (!line.expectedDate)
                return true;
            const threshold = new Date(now);
            threshold.setDate(threshold.getDate() + Math.max(1, leadDays));
            return line.expectedDate <= threshold;
        })
            .reduce((sum, line) => sum + line.units, 0);
        const item = {
            itemId: itemDoc.id,
            itemName: asString(data.name) ?? itemDoc.id,
            unit,
            qtyPerCase: Math.max(1, asNumber(data.qtyPerCase, 1)),
            caseSize: Math.max(1, asNumber(data.caseSize, 1)),
            minQuantity: Math.max(0, asNumber(data.minQuantity, 0)),
            weeklyUsage: Math.max(0, asNumber(data.weeklyUsage, 0)),
            price: Math.max(0, asNumber(data.price, 0)),
            archived: Boolean(data.archived),
            onHand: Math.max(0, onHandByItem.get(itemDoc.id) ?? 0),
            incomingBeforeLead: Math.max(0, incomingBeforeLead),
            wasteAffectingOrders: Math.max(0, wasteByItem.get(itemDoc.id) ?? 0),
            expiringBeforeLead: Math.max(0, expiringByItemByLead.get(itemDoc.id) ?? 0),
            productionDemand: 0,
            leadDays,
            nextOrderInDays
        };
        if (vendorId) {
            item.vendorId = vendorId;
        }
        items.push(item);
    }
    const productionProducts = [];
    for (const doc of productsSnap?.docs ?? []) {
        const row = doc.data();
        const rowStoreId = asString(row.storeId) ?? "";
        if (rowStoreId.length > 0 && rowStoreId !== normalizedStoreId)
            continue;
        const productId = doc.id;
        if (!productId)
            continue;
        productionProducts.push({
            productId,
            productName: asString(row.name) ?? "Production Product",
            outputItemId: asString(row.outputItemID) ?? undefined,
            outputUnitRaw: asString(row.outputUnitRaw) ?? "pieces",
            defaultBatchYield: Math.max(0.001, asNumber(row.defaultBatchYield, 1)),
            targetDaysOnHand: Math.max(0.25, asNumber(row.targetDaysOnHand, 1.5)),
            lastSpotCheckQuantity: Math.max(0, asNumber(row.lastSpotCheckQuantity, 0)),
            isActive: row.isActive === undefined ? true : Boolean(row.isActive)
        });
    }
    const productionIngredients = [];
    for (const doc of ingredientsSnap?.docs ?? []) {
        const row = doc.data();
        const rowStoreId = asString(row.storeId) ?? "";
        if (rowStoreId.length > 0 && rowStoreId !== normalizedStoreId)
            continue;
        const productionProductID = asString(row.productionProductID) ?? "";
        const quantityPerBatch = Math.max(0, asNumber(row.quantityPerBatch, 0));
        if (!productionProductID || quantityPerBatch <= 0)
            continue;
        productionIngredients.push({
            productionProductID,
            inventoryItemID: asString(row.inventoryItemID),
            inventoryItemNameSnapshot: asString(row.inventoryItemNameSnapshot) ?? "Ingredient",
            quantityPerBatch,
            unitRaw: asString(row.unitRaw) ?? "pieces",
            needsConversion: Boolean(row.needsConversion),
            convertToUnitRaw: asString(row.convertToUnitRaw)
        });
    }
    const productionSpotChecks = [];
    for (const doc of spotChecksSnap?.docs ?? []) {
        const row = doc.data();
        const rowStoreId = asString(row.storeId) ?? "";
        if (rowStoreId.length > 0 && rowStoreId !== normalizedStoreId)
            continue;
        const productionProductID = asString(row.productionProductID) ?? "";
        const usageObserved = Math.max(0, asNumber(row.usageObserved, 0));
        if (!productionProductID || usageObserved <= 0)
            continue;
        productionSpotChecks.push({
            productionProductID,
            usageObserved,
            checkedAt: asDate(row.checkedAt) ?? now
        });
    }
    const productionRuns = [];
    for (const doc of runsSnap?.docs ?? []) {
        const row = doc.data();
        const rowStoreId = asString(row.storeId) ?? "";
        if (rowStoreId.length > 0 && rowStoreId !== normalizedStoreId)
            continue;
        const productionProductID = asString(row.productionProductID) ?? "";
        const quantityMade = Math.max(0, asNumber(row.quantityMade, 0));
        if (!productionProductID || quantityMade <= 0)
            continue;
        productionRuns.push({
            productionProductID,
            quantityMade,
            madeAt: asDate(row.madeAt) ?? now
        });
    }
    return {
        input,
        storePath,
        sourceRefs,
        items,
        productionProducts,
        productionIngredients,
        productionSpotChecks,
        productionRuns
    };
}
