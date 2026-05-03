import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminAuth, adminDb } from "./lib/firebase.js";
import { requireAuth, requireOrgMembership, requirePermission } from "./lib/auth.js";
const createCheckoutSessionRequestSchema = z.object({
    orgId: z.string().min(1),
    priceId: z.string().min(1),
    successUrl: z.string().url(),
    cancelUrl: z.string().url(),
    trialFromPlanDays: z.number().int().min(0).max(90).optional()
});
const createEmbeddedCheckoutSessionRequestSchema = z.object({
    orgId: z.string().min(1),
    priceId: z.string().min(1),
    returnUrl: z.string().url(),
    trialFromPlanDays: z.number().int().min(0).max(90).optional()
});
const getCheckoutSessionStatusRequestSchema = z.object({
    orgId: z.string().min(1),
    sessionId: z.string().min(1)
});
const createPortalSessionRequestSchema = z.object({
    orgId: z.string().min(1),
    returnUrl: z.string().url()
});
const reconcileBillingRequestSchema = z.object({
    orgId: z.string().min(1)
});
const listPublicStripePlansRequestSchema = z.object({}).default({});
const stripeSecretBinding = {
    secrets: ["STRIPE_SECRET_KEY"]
};
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function stripeSecretKey() {
    const raw = String(process.env.STRIPE_SECRET_KEY ??
        process.env.STRIPE_API_KEY ??
        process.env.STRIPE_LIVE_SECRET_KEY ??
        "").trim();
    return raw.length > 0 ? raw : null;
}
function stripeHeaders(secretKey) {
    return {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
    };
}
async function stripeApiGet(secretKey, endpoint, search) {
    const url = `https://api.stripe.com/v1/${endpoint}?${search.toString()}`;
    const response = await fetch(url, { headers: stripeHeaders(secretKey), method: "GET" });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Stripe API ${endpoint} failed (${response.status}): ${body}`);
    }
    return (await response.json());
}
async function stripeApiGetByPath(secretKey, endpointPath, search) {
    const suffix = search ? `?${search.toString()}` : "";
    const url = `https://api.stripe.com/v1/${endpointPath}${suffix}`;
    const response = await fetch(url, { headers: stripeHeaders(secretKey), method: "GET" });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Stripe API ${endpointPath} failed (${response.status}): ${body}`);
    }
    return (await response.json());
}
async function fetchStripeProductName(secretKey, productId) {
    const normalizedProductId = String(productId ?? "").trim();
    if (!normalizedProductId)
        return null;
    try {
        const product = await stripeApiGetByPath(secretKey, `products/${encodeURIComponent(normalizedProductId)}`);
        return typeof product?.name === "string" && product.name.trim().length > 0 ? product.name.trim() : null;
    }
    catch {
        return null;
    }
}
async function stripeApiPost(secretKey, endpoint, body) {
    const url = `https://api.stripe.com/v1/${endpoint}`;
    const response = await fetch(url, {
        method: "POST",
        headers: stripeHeaders(secretKey),
        body
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Stripe API ${endpoint} failed (${response.status}): ${text}`);
    }
    return JSON.parse(text);
}
async function resolveStripeCustomerIdForBillingPortal(input) {
    const { secretKey, uid, orgId } = input;
    const billingSnap = await adminDb.doc(`organizations/${orgId}/billing/default`).get().catch(() => null);
    const billingData = billingSnap?.data() ?? {};
    const billingCustomerId = firstNonEmptyString([
        billingData.stripeCustomerId,
        billingData.customerId
    ]);
    if (billingCustomerId)
        return billingCustomerId;
    const customerDoc = await adminDb.doc(`customers/${uid}`).get().catch(() => null);
    const customerData = customerDoc?.data() ?? {};
    const mappedCustomerId = firstNonEmptyString([
        customerData.stripeId,
        customerData.customerId,
        customerData.id
    ]);
    if (mappedCustomerId)
        return mappedCustomerId;
    const subscriptionId = firstNonEmptyString([billingData.stripeSubscriptionId]);
    if (subscriptionId) {
        try {
            const subscription = await stripeApiGetByPath(secretKey, `subscriptions/${encodeURIComponent(subscriptionId)}`);
            const fromSubscription = firstNonEmptyString([
                subscription.customer,
                typeof subscription.customer === "object" && subscription.customer ? subscription.customer.id : null
            ]);
            if (fromSubscription)
                return fromSubscription;
        }
        catch {
            // Continue to email lookup/create path.
        }
    }
    const authUser = await adminAuth.getUser(uid).catch(() => null);
    const email = typeof authUser?.email === "string" ? authUser.email.trim() : "";
    if (email) {
        const listed = await stripeApiGet(secretKey, "customers", new URLSearchParams({
            email,
            limit: "1"
        })).catch(() => null);
        const existing = listed?.data?.[0];
        const existingId = firstNonEmptyString([existing?.id]);
        if (existingId)
            return existingId;
    }
    const createParams = new URLSearchParams();
    if (email) {
        createParams.set("email", email);
    }
    createParams.set("metadata[firebase_uid]", uid);
    createParams.set("metadata[orgId]", orgId);
    const created = await stripeApiPost(secretKey, "customers", createParams);
    const createdId = firstNonEmptyString([created.id]);
    if (!createdId) {
        throw new Error("Stripe customer could not be resolved for billing portal.");
    }
    return createdId;
}
function firstNonEmptyString(values) {
    for (const value of values) {
        if (typeof value === "string" && value.trim().length > 0) {
            return value.trim();
        }
    }
    return null;
}
async function fetchStripePlansFromApi(secretKey) {
    const productsResponse = await stripeApiGet(secretKey, "products", new URLSearchParams({
        active: "true",
        limit: "100"
    }));
    const products = Array.isArray(productsResponse.data) ? productsResponse.data : [];
    const plans = [];
    for (const product of products) {
        const productId = String(product.id ?? "").trim();
        if (!productId)
            continue;
        const pricesResponse = await stripeApiGet(secretKey, "prices", new URLSearchParams({
            active: "true",
            product: productId,
            type: "recurring",
            limit: "100"
        }));
        const prices = (Array.isArray(pricesResponse.data) ? pricesResponse.data : [])
            .map((price) => {
            const unitAmount = Number(price.unit_amount ?? 0);
            const recurring = price.recurring ?? {};
            return {
                priceId: String(price.id ?? "").trim(),
                unitAmount: Number.isFinite(unitAmount) ? unitAmount : 0,
                currency: String(price.currency ?? "usd").toUpperCase(),
                interval: String(recurring.interval ?? "month"),
                intervalCount: Number(recurring.interval_count ?? 1),
                trialPeriodDays: recurring.trial_period_days === null || recurring.trial_period_days === undefined
                    ? null
                    : Number(recurring.trial_period_days)
            };
        })
            .filter((price) => price.priceId.length > 0)
            .sort((a, b) => a.unitAmount - b.unitAmount);
        if (!prices.length)
            continue;
        plans.push({
            productId,
            name: String(product.name ?? "Plan"),
            description: String(product.description ?? ""),
            active: Boolean(product.active ?? true),
            prices
        });
    }
    plans.sort((a, b) => {
        const minA = a.prices[0]?.unitAmount ?? Number.MAX_SAFE_INTEGER;
        const minB = b.prices[0]?.unitAmount ?? Number.MAX_SAFE_INTEGER;
        return minA - minB;
    });
    return plans;
}
async function fetchPlanOverrides() {
    const overrides = new Map();
    const snap = await adminDb.collection("stripePlanOverrides").limit(500).get().catch(() => null);
    for (const doc of snap?.docs ?? []) {
        const data = doc.data() ?? {};
        const priceId = typeof data.priceId === "string" && data.priceId.trim() ? data.priceId.trim() : doc.id;
        if (!priceId)
            continue;
        overrides.set(priceId, {
            priceId,
            displayName: typeof data.displayName === "string" ? data.displayName : undefined,
            description: typeof data.description === "string" ? data.description : undefined,
            trialMode: data.trialMode === "none" || data.trialMode === "fixed" || data.trialMode === "indefinite"
                ? data.trialMode
                : undefined,
            trialDays: Number.isFinite(Number(data.trialDays)) ? Number(data.trialDays) : null,
            trialEndBehavior: data.trialEndBehavior === "halt" || data.trialEndBehavior === "grace_2_days" || data.trialEndBehavior === "grace_7_days"
                ? data.trialEndBehavior
                : undefined,
            saleEnabled: data.saleEnabled === true,
            saleLabel: typeof data.saleLabel === "string" ? data.saleLabel : undefined
        });
    }
    return overrides;
}
function applyOverrides(plan, overrides) {
    const primaryPriceId = plan.prices[0]?.priceId;
    if (!primaryPriceId)
        return plan;
    const override = overrides.get(primaryPriceId);
    if (!override)
        return plan;
    let description = override.description?.trim() || plan.description;
    if (override.saleEnabled) {
        const label = override.saleLabel?.trim() || "On sale";
        description = description ? `${description} • ${label}` : label;
    }
    const trialHint = override.trialMode === "indefinite"
        ? "Trial: indefinite"
        : override.trialMode === "fixed" && Number.isFinite(Number(override.trialDays))
            ? `Trial: ${Number(override.trialDays)} day(s)`
            : null;
    const trialBehavior = override.trialEndBehavior === "grace_2_days"
        ? "After trial: 2-day grace period"
        : override.trialEndBehavior === "grace_7_days"
            ? "After trial: 7-day grace period"
            : override.trialEndBehavior === "halt"
                ? "After trial: pay now to continue"
                : null;
    const extra = [trialHint, trialBehavior].filter(Boolean).join(" • ");
    if (extra) {
        description = description ? `${description} • ${extra}` : extra;
    }
    const prices = plan.prices.map((price) => {
        if (price.priceId !== primaryPriceId)
            return price;
        if (override.trialMode === "fixed" && Number.isFinite(Number(override.trialDays))) {
            return {
                ...price,
                trialPeriodDays: Number(override.trialDays)
            };
        }
        if (override.trialMode === "none") {
            return {
                ...price,
                trialPeriodDays: null
            };
        }
        return price;
    });
    return {
        ...plan,
        name: override.displayName?.trim() || plan.name,
        description,
        prices
    };
}
function normalizeStatus(raw) {
    const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!value)
        return "inactive";
    return value;
}
function asDate(value) {
    if (!value)
        return null;
    if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? null : value;
    if (value instanceof Timestamp)
        return value.toDate();
    if (typeof value === "number") {
        const fromSeconds = value > 10_000_000_000 ? new Date(value) : new Date(value * 1000);
        return Number.isNaN(fromSeconds.getTime()) ? null : fromSeconds;
    }
    if (typeof value === "string") {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value === "object" && value) {
        const map = value;
        if (typeof map.toDate === "function") {
            const parsed = map.toDate();
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
        const seconds = typeof map.seconds === "number" ? map.seconds : map._seconds;
        if (typeof seconds === "number") {
            const parsed = new Date(seconds * 1000);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
    }
    return null;
}
function extractMetadata(data) {
    const metadataRaw = data.metadata;
    if (!metadataRaw || typeof metadataRaw !== "object")
        return {};
    const metadata = metadataRaw;
    const entries = Object.entries(metadata)
        .map(([key, value]) => [key, typeof value === "string" ? value : String(value ?? "")])
        .filter(([, value]) => value.length > 0);
    return Object.fromEntries(entries);
}
function extractPriceId(data) {
    if (typeof data.priceId === "string" && data.priceId.trim())
        return data.priceId.trim();
    const itemsRaw = data.items;
    if (Array.isArray(itemsRaw) && itemsRaw.length > 0) {
        const first = itemsRaw[0];
        if (typeof first.price === "string" && first.price.trim())
            return first.price.trim();
        if (first.price && typeof first.price === "object") {
            const nested = first.price;
            if (typeof nested.id === "string" && nested.id.trim())
                return nested.id.trim();
        }
    }
    return null;
}
function extractProductId(data) {
    if (typeof data.productId === "string" && data.productId.trim())
        return data.productId.trim();
    const itemsRaw = data.items;
    if (Array.isArray(itemsRaw) && itemsRaw.length > 0) {
        const first = itemsRaw[0];
        if (first.price && typeof first.price === "object") {
            const price = first.price;
            if (typeof price.product === "string" && price.product.trim())
                return price.product.trim();
            if (price.product && typeof price.product === "object") {
                const product = price.product;
                if (typeof product.id === "string" && product.id.trim())
                    return product.id.trim();
            }
        }
    }
    return null;
}
function extractPlanName(data, priceId) {
    if (typeof data.planName === "string" && data.planName.trim())
        return data.planName.trim();
    const itemsRaw = data.items;
    if (Array.isArray(itemsRaw) && itemsRaw.length > 0) {
        const first = itemsRaw[0];
        if (typeof first.price === "object" && first.price) {
            const price = first.price;
            if (typeof price.nickname === "string" && price.nickname.trim())
                return price.nickname.trim();
        }
        if (typeof first.description === "string" && first.description.trim())
            return first.description.trim();
    }
    if (priceId && priceId.toLowerCase().includes("pro"))
        return "Pro";
    if (priceId && priceId.toLowerCase().includes("growth"))
        return "Growth";
    if (priceId && priceId.toLowerCase().includes("starter"))
        return "Starter";
    return "Subscription";
}
function inferPlanTier(planName, priceId) {
    const combined = `${planName ?? ""} ${priceId ?? ""}`.trim().toLowerCase();
    if (combined.includes("plus"))
        return "pro";
    if (combined.includes("starter"))
        return "starter";
    if (combined.includes("growth"))
        return "growth";
    if (combined.includes("pro"))
        return "pro";
    return "custom";
}
function inferTierFromUnitAmount(unitAmountCents) {
    const amount = Number(unitAmountCents ?? NaN);
    if (!Number.isFinite(amount) || amount <= 0)
        return "custom";
    const starterThreshold = Number(process.env.STRIPE_STARTER_THRESHOLD_CENTS ?? 4900);
    const growthThreshold = Number(process.env.STRIPE_GROWTH_THRESHOLD_CENTS ?? 9900);
    const proThreshold = Number(process.env.STRIPE_PRO_THRESHOLD_CENTS ?? 19900);
    if (Number.isFinite(proThreshold) && amount >= proThreshold)
        return "pro";
    if (Number.isFinite(growthThreshold) && amount >= growthThreshold)
        return "growth";
    if (Number.isFinite(starterThreshold) && amount >= starterThreshold)
        return "starter";
    return "custom";
}
function configuredPlanProductMap() {
    const starter = String(process.env.STRIPE_STARTER_PRODUCT_ID ?? "prod_U3w3aRWIJ8XYxp")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    const growth = String(process.env.STRIPE_GROWTH_PRODUCT_ID ?? "prod_U3w4m9RfBxuajU")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    const pro = String(process.env.STRIPE_PRO_PRODUCT_ID ?? "prod_U3w5Qbr2l2eQGP")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    return { starter, growth, pro };
}
function inferTierFromProductId(productId) {
    const normalized = String(productId ?? "").trim();
    if (!normalized)
        return "custom";
    const map = configuredPlanProductMap();
    if (map.starter.includes(normalized))
        return "starter";
    if (map.growth.includes(normalized))
        return "growth";
    if (map.pro.includes(normalized))
        return "pro";
    return "custom";
}
function derivePlanTier(input) {
    const byProduct = inferTierFromProductId(input.productId);
    if (byProduct !== "custom")
        return byProduct;
    const byNameOrPrice = inferPlanTier(input.planName, input.priceId);
    if (byNameOrPrice !== "custom")
        return byNameOrPrice;
    return inferTierFromUnitAmount(input.unitAmountCents ?? null);
}
function tierEntitlements(tier) {
    if (tier === "pro") {
        return {
            multiStore: true,
            advancedInsights: true,
            customBranding: true,
            healthChecks: true,
            transferWorkflows: true
        };
    }
    if (tier === "growth") {
        return {
            multiStore: true,
            advancedInsights: true,
            customBranding: false,
            healthChecks: true,
            transferWorkflows: true
        };
    }
    if (tier === "starter") {
        return {
            multiStore: false,
            advancedInsights: false,
            customBranding: false,
            healthChecks: true,
            transferWorkflows: true
        };
    }
    return {
        multiStore: false,
        advancedInsights: false,
        customBranding: false,
        healthChecks: false,
        transferWorkflows: false
    };
}
function normalizeHost(value) {
    return value.trim().toLowerCase();
}
function allowedRedirectHosts() {
    const configured = String(process.env.ALLOWED_CHECKOUT_HOSTS ?? "")
        .split(",")
        .map((entry) => normalizeHost(entry))
        .filter(Boolean);
    const defaults = [
        "localhost",
        "127.0.0.1",
        "inventracker.com",
        "www.inventracker.com",
        "inventraker.com",
        "www.inventraker.com"
    ];
    return new Set([...defaults, ...configured]);
}
function assertAllowedRedirectUrl(rawUrl, fieldName) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    }
    catch {
        throw new HttpsError("invalid-argument", `${fieldName} must be a valid URL.`);
    }
    const host = normalizeHost(parsed.hostname);
    if (!allowedRedirectHosts().has(host)) {
        throw new HttpsError("permission-denied", `${fieldName} host is not allowed. Add it to ALLOWED_CHECKOUT_HOSTS in functions env.`);
    }
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
        throw new HttpsError("invalid-argument", `${fieldName} must use https.`);
    }
}
async function isActiveStripePrice(priceId) {
    const snap = await adminDb
        .collectionGroup("prices")
        .where("active", "==", true)
        .where("id", "==", priceId)
        .limit(1)
        .get();
    if (!snap.empty)
        return true;
    const byDocId = await adminDb
        .collectionGroup("prices")
        .where("active", "==", true)
        .where(FieldPath.documentId(), "==", priceId)
        .limit(1)
        .get();
    return !byDocId.empty;
}
async function isActiveStripePriceFromApi(secretKey, priceId) {
    try {
        const price = await stripeApiGetByPath(secretKey, `prices/${encodeURIComponent(priceId)}`);
        return Boolean(price?.id && price.active);
    }
    catch {
        return false;
    }
}
async function resolveActiveCheckoutPriceId(candidateId, secretKey) {
    const normalized = String(candidateId ?? "").trim();
    if (!normalized)
        return null;
    if (normalized.startsWith("price_")) {
        const active = secretKey
            ? await isActiveStripePriceFromApi(secretKey, normalized)
            : await isActiveStripePrice(normalized);
        return active ? normalized : null;
    }
    if (normalized.startsWith("prod_")) {
        if (secretKey) {
            try {
                const response = await stripeApiGet(secretKey, "prices", new URLSearchParams({
                    active: "true",
                    product: normalized,
                    type: "recurring",
                    limit: "100"
                }));
                const prices = (Array.isArray(response.data) ? response.data : [])
                    .map((entry) => ({
                    id: String(entry.id ?? "").trim(),
                    active: Boolean(entry.active ?? true),
                    unitAmount: Number(entry.unit_amount ?? 0)
                }))
                    .filter((entry) => entry.id.length > 0 && entry.active)
                    .sort((a, b) => a.unitAmount - b.unitAmount);
                return prices[0]?.id ?? null;
            }
            catch {
                return null;
            }
        }
        const snapshot = await adminDb
            .collection("products")
            .doc(normalized)
            .collection("prices")
            .where("active", "==", true)
            .limit(100)
            .get()
            .catch(() => null);
        if (!snapshot || snapshot.empty)
            return null;
        const prices = snapshot.docs
            .map((doc) => {
            const data = doc.data() ?? {};
            const id = typeof data.id === "string" && data.id.trim() ? data.id.trim() : doc.id;
            const unitAmount = Number(data.unit_amount ?? data.unitAmount ?? 0);
            return {
                id,
                unitAmount: Number.isFinite(unitAmount) ? unitAmount : 0
            };
        })
            .filter((entry) => entry.id.length > 0)
            .sort((a, b) => a.unitAmount - b.unitAmount);
        return prices[0]?.id ?? null;
    }
    if (secretKey && (await isActiveStripePriceFromApi(secretKey, normalized))) {
        return normalized;
    }
    const byIdSnapshot = await adminDb
        .collectionGroup("prices")
        .where("active", "==", true)
        .where("id", "==", normalized)
        .limit(1)
        .get()
        .catch(() => null);
    if (byIdSnapshot && !byIdSnapshot.empty) {
        const doc = byIdSnapshot.docs.at(0);
        if (doc) {
            const data = doc.data() ?? {};
            const mappedId = typeof data.id === "string" && data.id.trim() ? data.id.trim() : doc.id;
            if (mappedId)
                return mappedId;
        }
    }
    const byDocSnapshot = await adminDb
        .collectionGroup("prices")
        .where("active", "==", true)
        .where(FieldPath.documentId(), "==", normalized)
        .limit(1)
        .get()
        .catch(() => null);
    if (byDocSnapshot && !byDocSnapshot.empty) {
        const doc = byDocSnapshot.docs.at(0);
        if (doc) {
            const data = doc.data() ?? {};
            const mappedId = typeof data.id === "string" && data.id.trim() ? data.id.trim() : doc.id;
            if (mappedId)
                return mappedId;
        }
    }
    return null;
}
function appendCheckoutBaseParams(params, input) {
    params.set("mode", "subscription");
    params.set("line_items[0][price]", input.priceId);
    params.set("line_items[0][quantity]", "1");
    params.set("allow_promotion_codes", "true");
    params.set("metadata[orgId]", input.orgId);
    params.set("metadata[billingOwnerUid]", input.uid);
    params.set("subscription_data[metadata][orgId]", input.orgId);
    params.set("subscription_data[metadata][billingOwnerUid]", input.uid);
    params.set("client_reference_id", input.orgId);
    if (Number.isFinite(Number(input.trialFromPlanDays)) && Number(input.trialFromPlanDays) > 0) {
        params.set("subscription_data[trial_period_days]", String(Number(input.trialFromPlanDays)));
    }
}
async function resolveOrganizationIdForSubscription(ownerUidFromMetadata, metadataOrgId) {
    if (metadataOrgId) {
        const org = await adminDb.doc(`organizations/${metadataOrgId}`).get();
        if (org.exists)
            return { orgId: metadataOrgId, usedFallback: false };
    }
    if (!ownerUidFromMetadata)
        return { orgId: null, usedFallback: true };
    const byOwners = await adminDb
        .collection("organizations")
        .where("ownerUserIds", "array-contains", ownerUidFromMetadata)
        .limit(2)
        .get();
    const firstOwnerMatch = byOwners.docs.at(0);
    if (byOwners.docs.length === 1 && firstOwnerMatch)
        return { orgId: firstOwnerMatch.id, usedFallback: true };
    if (byOwners.docs.length > 1 && firstOwnerMatch)
        return { orgId: firstOwnerMatch.id, usedFallback: true };
    const byOwnerUid = await adminDb
        .collection("organizations")
        .where("ownerUid", "==", ownerUidFromMetadata)
        .limit(2)
        .get();
    const firstLegacyOwnerMatch = byOwnerUid.docs.at(0);
    if (firstLegacyOwnerMatch)
        return { orgId: firstLegacyOwnerMatch.id, usedFallback: true };
    return { orgId: null, usedFallback: true };
}
async function applyBillingSnapshot(input) {
    const normalizedStatus = normalizeStatus(input.status);
    const isActive = normalizedStatus === "active" || normalizedStatus === "trialing";
    const billingRef = adminDb.doc(`organizations/${input.orgId}/billing/default`);
    let tier = input.planTier ?? derivePlanTier({
        planName: input.planName,
        priceId: input.priceId,
        productId: input.stripeProductId ?? null
    });
    if (tier === "custom" && isActive) {
        const existing = await billingRef.get().catch(() => null);
        const existingData = existing?.data() ?? {};
        const existingTierRaw = firstNonEmptyString([existingData.planTier]);
        const existingTier = existingTierRaw === "starter" || existingTierRaw === "growth" || existingTierRaw === "pro"
            ? existingTierRaw
            : null;
        if (existingTier) {
            tier = existingTier;
        }
        else {
            const inferredFromStoredPlan = inferPlanTier(firstNonEmptyString([existingData.planName]), null);
            if (inferredFromStoredPlan !== "custom") {
                tier = inferredFromStoredPlan;
            }
        }
    }
    const entitlements = tierEntitlements(tier);
    await billingRef.set({
        organizationId: input.orgId,
        subscriptionStatus: normalizedStatus,
        currentPeriodEnd: input.currentPeriodEnd ? Timestamp.fromDate(input.currentPeriodEnd) : null,
        priceId: input.priceId,
        planName: input.planName,
        planTier: tier,
        entitlements,
        isActive,
        paymentVerification: {
            provider: "stripe",
            verified: isActive,
            verifiedAt: FieldValue.serverTimestamp(),
            sourceSubscriptionId: input.stripeSubscriptionId,
            sourceCustomerUid: input.stripeCustomerUid,
            sourceCustomerId: input.stripeCustomerId ?? null
        },
        billingOwnerUid: input.billingOwnerUid,
        stripeCustomerUid: input.stripeCustomerUid,
        stripeCustomerId: input.stripeCustomerId ?? null,
        stripeProductId: input.stripeProductId ?? null,
        stripeSubscriptionId: input.stripeSubscriptionId,
        metadataFallbackUsed: input.fallbackUsed,
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await adminDb.doc(`organizations/${input.orgId}`).set({
        planId: input.priceId ?? "unknown",
        planName: input.planName,
        planTier: tier,
        subscription: {
            status: normalizedStatus,
            renewsAt: input.currentPeriodEnd ? Timestamp.fromDate(input.currentPeriodEnd) : null,
            startedAt: FieldValue.serverTimestamp()
        },
        entitlements,
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    const members = await adminDb.collection(`organizations/${input.orgId}/members`).limit(1000).get();
    for (const member of members.docs) {
        try {
            const role = String(member.data().role ?? "Staff");
            const targetUid = member.id;
            const authUser = await adminAuth.getUser(targetUid);
            const existingClaims = authUser.customClaims ?? {};
            await adminAuth.setCustomUserClaims(targetUid, {
                ...existingClaims,
                org_id: input.orgId,
                org_role: role,
                org_plan: input.planName,
                org_plan_tier: tier,
                org_price_id: input.priceId ?? null,
                subscription_status: normalizedStatus,
                billing_verified: isActive
            });
        }
        catch (error) {
            console.error("Failed to update custom claims for org member", {
                orgId: input.orgId,
                memberId: member.id,
                reason: error instanceof Error ? error.message : String(error)
            });
        }
    }
}
export const createStripeCheckoutSession = onCall(stripeSecretBinding, async (request) => {
    const uid = requireAuth(request);
    const input = createCheckoutSessionRequestSchema.parse(request.data ?? {});
    await requireOrgMembership(input.orgId, uid);
    await requirePermission(input.orgId, uid, "manageOrgSettings");
    assertAllowedRedirectUrl(input.successUrl, "successUrl");
    assertAllowedRedirectUrl(input.cancelUrl, "cancelUrl");
    const secretKey = stripeSecretKey();
    const resolvedPriceId = await resolveActiveCheckoutPriceId(input.priceId, secretKey);
    if (!resolvedPriceId) {
        throw new HttpsError("invalid-argument", "Selected plan is unavailable.");
    }
    if (secretKey) {
        try {
            const params = new URLSearchParams();
            appendCheckoutBaseParams(params, {
                orgId: input.orgId,
                uid,
                priceId: resolvedPriceId,
                trialFromPlanDays: input.trialFromPlanDays
            });
            params.set("success_url", input.successUrl);
            params.set("cancel_url", input.cancelUrl);
            const session = await stripeApiPost(secretKey, "checkout/sessions", params);
            const url = firstNonEmptyString([session.url]);
            if (!url) {
                throw new Error("Stripe did not return a checkout URL.");
            }
            const sessionId = firstNonEmptyString([session.id]) ?? "session";
            return { ok: true, url, sessionDocPath: `stripe/checkout_sessions/${sessionId}` };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new HttpsError("failed-precondition", message);
        }
    }
    const ref = adminDb.collection("customers").doc(uid).collection("checkout_sessions").doc();
    await ref.set({
        mode: "subscription",
        line_items: [{ price: resolvedPriceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        allow_promotion_codes: true,
        metadata: {
            orgId: input.orgId,
            billingOwnerUid: uid
        },
        subscription_data: {
            metadata: {
                orgId: input.orgId,
                billingOwnerUid: uid
            },
            trial_period_days: input.trialFromPlanDays ?? undefined
        },
        client_reference_id: input.orgId,
        createdAt: FieldValue.serverTimestamp()
    });
    for (let attempt = 0; attempt < 24; attempt += 1) {
        await sleep(500);
        const snap = await ref.get();
        const data = snap.data();
        if (typeof data?.url === "string" && data.url.trim()) {
            return { ok: true, url: data.url, sessionDocPath: ref.path };
        }
        if (data?.error?.message) {
            throw new HttpsError("internal", data.error.message);
        }
    }
    return { ok: false, pending: true, sessionDocPath: ref.path };
});
export const createStripeEmbeddedCheckoutSession = onCall(stripeSecretBinding, async (request) => {
    const uid = requireAuth(request);
    const input = createEmbeddedCheckoutSessionRequestSchema.parse(request.data ?? {});
    await requireOrgMembership(input.orgId, uid);
    await requirePermission(input.orgId, uid, "manageOrgSettings");
    assertAllowedRedirectUrl(input.returnUrl, "cancelUrl");
    const secretKey = stripeSecretKey();
    const resolvedPriceId = await resolveActiveCheckoutPriceId(input.priceId, secretKey);
    if (!resolvedPriceId) {
        throw new HttpsError("invalid-argument", "Selected plan is unavailable.");
    }
    if (secretKey) {
        try {
            const params = new URLSearchParams();
            appendCheckoutBaseParams(params, {
                orgId: input.orgId,
                uid,
                priceId: resolvedPriceId,
                trialFromPlanDays: input.trialFromPlanDays
            });
            params.set("ui_mode", "embedded");
            params.set("return_url", input.returnUrl);
            const session = await stripeApiPost(secretKey, "checkout/sessions", params);
            const sessionId = firstNonEmptyString([session.id]) ?? "session";
            const clientSecret = firstNonEmptyString([session.client_secret]);
            const url = firstNonEmptyString([session.url]);
            if (!clientSecret && !url) {
                throw new Error("Stripe did not return an embedded client secret.");
            }
            return {
                ok: true,
                clientSecret,
                url,
                sessionId,
                sessionDocPath: `stripe/checkout_sessions/${sessionId}`
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new HttpsError("failed-precondition", message);
        }
    }
    const ref = adminDb.collection("customers").doc(uid).collection("checkout_sessions").doc();
    await ref.set({
        mode: "subscription",
        ui_mode: "embedded",
        line_items: [{ price: resolvedPriceId, quantity: 1 }],
        return_url: input.returnUrl,
        allow_promotion_codes: true,
        metadata: {
            orgId: input.orgId,
            billingOwnerUid: uid
        },
        subscription_data: {
            metadata: {
                orgId: input.orgId,
                billingOwnerUid: uid
            },
            trial_period_days: input.trialFromPlanDays ?? undefined
        },
        client_reference_id: input.orgId,
        createdAt: FieldValue.serverTimestamp()
    });
    for (let attempt = 0; attempt < 24; attempt += 1) {
        await sleep(500);
        const snap = await ref.get();
        const data = snap.data() ?? {};
        const errorMessage = (() => {
            const direct = data.error;
            if (typeof direct === "string" && direct.trim())
                return direct.trim();
            if (direct && typeof direct === "object") {
                const nested = direct;
                if (typeof nested.message === "string" && nested.message.trim())
                    return nested.message.trim();
            }
            return null;
        })();
        if (errorMessage) {
            throw new HttpsError("internal", errorMessage);
        }
        const session = data.session && typeof data.session === "object" ? data.session : null;
        const clientSecret = firstNonEmptyString([
            data.client_secret,
            data.clientSecret,
            session?.client_secret,
            session?.clientSecret
        ]);
        const url = firstNonEmptyString([data.url, session?.url]);
        const sessionId = firstNonEmptyString([data.session_id, data.sessionId, data.id, session?.id]);
        if (clientSecret || url) {
            return {
                ok: true,
                clientSecret,
                url,
                sessionId,
                sessionDocPath: ref.path
            };
        }
    }
    return { ok: false, pending: true, sessionDocPath: ref.path };
});
export const createStripePortalSession = onCall(stripeSecretBinding, async (request) => {
    const uid = requireAuth(request);
    const input = createPortalSessionRequestSchema.parse(request.data ?? {});
    await requireOrgMembership(input.orgId, uid);
    await requirePermission(input.orgId, uid, "manageOrgSettings");
    assertAllowedRedirectUrl(input.returnUrl, "cancelUrl");
    const secretKey = stripeSecretKey();
    if (secretKey) {
        try {
            const customerId = await resolveStripeCustomerIdForBillingPortal({
                secretKey,
                uid,
                orgId: input.orgId
            });
            const params = new URLSearchParams();
            params.set("customer", customerId);
            params.set("return_url", input.returnUrl);
            const session = await stripeApiPost(secretKey, "billing_portal/sessions", params);
            const url = firstNonEmptyString([session.url]);
            if (!url) {
                throw new Error("Stripe did not return a billing portal URL.");
            }
            const sessionId = firstNonEmptyString([session.id]) ?? "portal";
            return { ok: true, url, sessionDocPath: `stripe/portal_sessions/${sessionId}` };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new HttpsError("failed-precondition", message);
        }
    }
    const ref = adminDb.collection("customers").doc(uid).collection("portal_sessions").doc();
    await ref.set({
        return_url: input.returnUrl,
        metadata: {
            orgId: input.orgId,
            billingOwnerUid: uid
        },
        createdAt: FieldValue.serverTimestamp()
    });
    for (let attempt = 0; attempt < 24; attempt += 1) {
        await sleep(500);
        const snap = await ref.get();
        const data = snap.data();
        if (typeof data?.url === "string" && data.url.trim()) {
            return { ok: true, url: data.url, sessionDocPath: ref.path };
        }
        if (data?.error?.message) {
            throw new HttpsError("internal", data.error.message);
        }
    }
    return { ok: false, pending: true, sessionDocPath: ref.path };
});
export const getStripeCheckoutSessionStatus = onCall(stripeSecretBinding, async (request) => {
    const uid = requireAuth(request);
    const input = getCheckoutSessionStatusRequestSchema.parse(request.data ?? {});
    await requireOrgMembership(input.orgId, uid);
    const secretKey = stripeSecretKey();
    if (!secretKey) {
        const billingSnap = await adminDb.doc(`organizations/${input.orgId}/billing/default`).get();
        const billing = billingSnap.data() ?? {};
        const subscriptionStatus = normalizeStatus(billing.subscriptionStatus);
        const planName = firstNonEmptyString([billing.planName]);
        const priceId = firstNonEmptyString([billing.priceId]);
        const currentPeriodEnd = asDate(billing.currentPeriodEnd)?.toISOString() ?? null;
        const active = subscriptionStatus === "active" || subscriptionStatus === "trialing";
        return {
            ok: true,
            sessionId: input.sessionId,
            status: active ? "complete" : "open",
            paymentStatus: active ? "paid" : "unpaid",
            mode: "subscription",
            customerEmail: null,
            billingUpdated: active,
            subscriptionStatus,
            planName,
            priceId,
            currentPeriodEnd,
            orgId: input.orgId
        };
    }
    const session = await stripeApiGetByPath(secretKey, `checkout/sessions/${encodeURIComponent(input.sessionId)}`, new URLSearchParams({
        "expand[]": "subscription"
    }));
    const sessionMetadata = session.metadata ?? {};
    const metadataOrgId = typeof sessionMetadata.orgId === "string" && sessionMetadata.orgId.trim()
        ? sessionMetadata.orgId.trim()
        : input.orgId;
    const billingOwnerUid = typeof sessionMetadata.billingOwnerUid === "string" && sessionMetadata.billingOwnerUid.trim()
        ? sessionMetadata.billingOwnerUid.trim()
        : uid;
    const status = normalizeStatus(session.status);
    const paymentStatus = normalizeStatus(session.payment_status);
    const mode = typeof session.mode === "string" ? session.mode : "subscription";
    const customerEmail = typeof session.customer_details?.email === "string" ? session.customer_details.email : null;
    const stripeCustomerId = firstNonEmptyString([
        session.customer,
        typeof session.customer === "object" && session.customer ? session.customer.id : null
    ]);
    let billingUpdated = false;
    let priceId = null;
    let planName = null;
    let currentPeriodEndISO = null;
    let subscriptionStatus = status;
    if (mode === "subscription" && status === "complete" && session.subscription) {
        const subscriptionObj = typeof session.subscription === "object" && session.subscription
            ? session.subscription
            : null;
        const subscriptionId = typeof session.subscription === "string"
            ? session.subscription
            : firstNonEmptyString([subscriptionObj?.id]);
        if (subscriptionId) {
            const subscription = subscriptionObj && subscriptionObj.id
                ? subscriptionObj
                : await stripeApiGetByPath(secretKey, `subscriptions/${encodeURIComponent(subscriptionId)}`, new URLSearchParams({
                    "expand[]": "items.data.price.product"
                }));
            subscriptionStatus = normalizeStatus(subscription.status ?? status);
            const periodEnd = asDate(subscription.current_period_end ?? null);
            currentPeriodEndISO = periodEnd?.toISOString() ?? null;
            const firstPrice = subscription.items?.data?.[0]?.price;
            priceId = firstNonEmptyString([firstPrice?.id]);
            const stripeProductId = firstNonEmptyString([
                firstPrice?.product,
                typeof firstPrice?.product === "object" && firstPrice?.product ? firstPrice.product.id : null
            ]);
            const stripeProductName = firstNonEmptyString([
                typeof firstPrice?.product === "object" && firstPrice?.product ? firstPrice.product.name : null
            ]);
            const resolvedProductName = stripeProductName ?? (await fetchStripeProductName(secretKey, stripeProductId));
            const unitAmountCents = Number(firstPrice?.unit_amount ?? NaN);
            planName =
                firstNonEmptyString([firstPrice?.nickname, resolvedProductName]) ??
                    extractPlanName({ planName: null }, priceId);
            const planTier = derivePlanTier({
                planName,
                priceId,
                productId: stripeProductId,
                unitAmountCents: Number.isFinite(unitAmountCents) ? unitAmountCents : null
            });
            await applyBillingSnapshot({
                orgId: metadataOrgId,
                status: subscriptionStatus,
                currentPeriodEnd: periodEnd,
                priceId,
                planName: planName ?? "Subscription",
                planTier,
                stripeProductId,
                billingOwnerUid,
                stripeCustomerUid: uid,
                stripeCustomerId,
                stripeSubscriptionId: subscriptionId,
                fallbackUsed: false
            });
            billingUpdated = true;
        }
    }
    return {
        ok: true,
        sessionId: input.sessionId,
        status,
        paymentStatus,
        mode,
        customerEmail,
        billingUpdated,
        subscriptionStatus,
        planName,
        priceId,
        currentPeriodEnd: currentPeriodEndISO,
        orgId: metadataOrgId
    };
});
export const reconcileOrganizationBilling = onCall(stripeSecretBinding, async (request) => {
    const uid = requireAuth(request);
    const input = reconcileBillingRequestSchema.parse(request.data ?? {});
    await requireOrgMembership(input.orgId, uid);
    await requirePermission(input.orgId, uid, "manageOrgSettings");
    const secretKey = stripeSecretKey();
    if (!secretKey) {
        throw new HttpsError("failed-precondition", "Stripe secret key is not configured.");
    }
    const billingSnap = await adminDb.doc(`organizations/${input.orgId}/billing/default`).get();
    const billingData = billingSnap.data() ?? {};
    const subscriptionId = firstNonEmptyString([billingData.stripeSubscriptionId]);
    if (!subscriptionId) {
        throw new HttpsError("failed-precondition", "No Stripe subscription is linked to this organization yet.");
    }
    const subscription = await stripeApiGetByPath(secretKey, `subscriptions/${encodeURIComponent(subscriptionId)}`, new URLSearchParams({
        "expand[]": "items.data.price.product"
    }));
    const status = normalizeStatus(subscription.status);
    const currentPeriodEnd = asDate(subscription.current_period_end ?? null);
    const firstPrice = subscription.items?.data?.[0]?.price;
    const priceId = firstNonEmptyString([firstPrice?.id]);
    const stripeProductId = firstNonEmptyString([
        firstPrice?.product,
        typeof firstPrice?.product === "object" && firstPrice?.product ? firstPrice.product.id : null
    ]);
    const resolvedProductName = firstNonEmptyString([
        typeof firstPrice?.product === "object" && firstPrice?.product ? firstPrice.product.name : null
    ]) ?? (await fetchStripeProductName(secretKey, stripeProductId));
    const unitAmountCents = Number(firstPrice?.unit_amount ?? NaN);
    const planName = firstNonEmptyString([
        firstPrice?.nickname,
        resolvedProductName,
        billingData.planName
    ]) ?? "Subscription";
    const planTier = derivePlanTier({
        planName,
        priceId,
        productId: stripeProductId,
        unitAmountCents: Number.isFinite(unitAmountCents) ? unitAmountCents : null
    });
    const stripeCustomerId = firstNonEmptyString([
        subscription.customer,
        typeof subscription.customer === "object" && subscription.customer ? subscription.customer.id : null,
        billingData.stripeCustomerId
    ]);
    const billingOwnerUid = firstNonEmptyString([billingData.billingOwnerUid]) ?? uid;
    const stripeCustomerUid = firstNonEmptyString([billingData.stripeCustomerUid]) ?? uid;
    await applyBillingSnapshot({
        orgId: input.orgId,
        status,
        currentPeriodEnd,
        priceId,
        planName,
        planTier,
        stripeProductId,
        billingOwnerUid,
        stripeCustomerUid,
        stripeCustomerId,
        stripeSubscriptionId: subscriptionId,
        fallbackUsed: false
    });
    return {
        ok: true,
        orgId: input.orgId,
        subscriptionStatus: status,
        planName,
        planTier,
        priceId,
        stripeProductId,
        currentPeriodEnd: currentPeriodEnd?.toISOString() ?? null
    };
});
export const listPublicStripePlans = onCall(stripeSecretBinding, async (request) => {
    listPublicStripePlansRequestSchema.parse(request.data ?? {});
    const productsSnapshot = await adminDb
        .collection("products")
        .where("active", "==", true)
        .limit(100)
        .get();
    const firestorePlans = [];
    for (const productDoc of productsSnapshot.docs) {
        const productData = productDoc.data() ?? {};
        const priceSnapshot = await productDoc.ref.collection("prices").where("active", "==", true).limit(100).get();
        const prices = priceSnapshot.docs
            .map((priceDoc) => {
            const priceData = priceDoc.data() ?? {};
            const recurring = priceData.recurring ?? {};
            const interval = String(recurring.interval ?? "month");
            const intervalCount = Number(recurring.interval_count ?? recurring.intervalCount ?? 1);
            const unitAmount = Number(priceData.unit_amount ?? priceData.unitAmount ?? 0);
            const currency = String(priceData.currency ?? "usd").toUpperCase();
            const stripePriceId = typeof priceData.id === "string" && priceData.id.trim().length > 0
                ? priceData.id.trim()
                : priceDoc.id;
            const trialRaw = recurring.trial_period_days ?? recurring.trialPeriodDays;
            const trialPeriodDays = Number.isFinite(Number(trialRaw)) ? Number(trialRaw) : null;
            return {
                priceId: stripePriceId,
                unitAmount: Number.isFinite(unitAmount) ? unitAmount : 0,
                currency,
                interval,
                intervalCount: Number.isFinite(intervalCount) ? intervalCount : 1,
                trialPeriodDays
            };
        })
            .filter((entry) => entry.unitAmount >= 0)
            .sort((a, b) => a.unitAmount - b.unitAmount);
        if (!prices.length)
            continue;
        firestorePlans.push({
            productId: productDoc.id,
            name: String(productData.name ?? "Plan"),
            description: String(productData.description ?? ""),
            active: Boolean(productData.active ?? true),
            prices
        });
    }
    firestorePlans.sort((a, b) => {
        const minA = a.prices[0]?.unitAmount ?? Number.MAX_SAFE_INTEGER;
        const minB = b.prices[0]?.unitAmount ?? Number.MAX_SAFE_INTEGER;
        return minA - minB;
    });
    let effectivePlans = firestorePlans;
    const secretKey = stripeSecretKey();
    if (secretKey) {
        try {
            // Prefer live Stripe API so website pricing tracks Stripe updates immediately.
            const apiPlans = await fetchStripePlansFromApi(secretKey);
            if (apiPlans.length) {
                effectivePlans = apiPlans;
            }
        }
        catch (error) {
            console.error("Failed to fetch plans from Stripe API; using Firestore extension data", {
                reason: error instanceof Error ? error.message : String(error)
            });
        }
    }
    const overrides = await fetchPlanOverrides();
    const mergedPlans = effectivePlans.map((plan) => applyOverrides(plan, overrides));
    return { plans: mergedPlans };
});
export const syncOrgBillingFromStripeSubscription = onDocumentWritten("customers/{customerUid}/subscriptions/{subscriptionId}", async (event) => {
    const customerUid = event.params.customerUid;
    const subscriptionId = event.params.subscriptionId;
    const after = event.data?.after;
    const before = event.data?.before;
    const afterData = after?.exists ? (after.data() ?? {}) : null;
    const beforeData = before?.exists ? (before.data() ?? {}) : null;
    const effectiveData = afterData ?? beforeData;
    if (!effectiveData)
        return;
    const metadata = extractMetadata(effectiveData);
    const metadataOrgId = typeof metadata.orgId === "string" && metadata.orgId.trim() ? metadata.orgId.trim() : null;
    const billingOwnerUid = typeof metadata.billingOwnerUid === "string" && metadata.billingOwnerUid.trim()
        ? metadata.billingOwnerUid.trim()
        : customerUid;
    const { orgId, usedFallback } = await resolveOrganizationIdForSubscription(billingOwnerUid, metadataOrgId);
    if (!orgId) {
        console.error("Could not resolve org for subscription update", {
            customerUid,
            subscriptionId,
            metadataOrgId,
            billingOwnerUid
        });
        return;
    }
    const status = afterData ? normalizeStatus(afterData.status) : "canceled";
    const currentPeriodEnd = asDate(afterData?.current_period_end ??
        afterData?.currentPeriodEnd ??
        afterData?.cancel_at ??
        afterData?.cancelAt ??
        null);
    const secretKey = stripeSecretKey();
    let priceId = extractPriceId(afterData ?? {});
    let stripeProductId = extractProductId(afterData ?? {});
    let planName = extractPlanName(afterData ?? {}, priceId);
    let unitAmountCents = Number.NaN;
    if (secretKey && subscriptionId) {
        try {
            const subscription = await stripeApiGetByPath(secretKey, `subscriptions/${encodeURIComponent(subscriptionId)}`, new URLSearchParams({
                "expand[]": "items.data.price.product"
            }));
            const firstPrice = subscription.items?.data?.[0]?.price;
            priceId = firstNonEmptyString([firstPrice?.id]) ?? priceId;
            stripeProductId =
                firstNonEmptyString([
                    firstPrice?.product,
                    typeof firstPrice?.product === "object" && firstPrice?.product ? firstPrice.product.id : null
                ]) ?? stripeProductId;
            const resolvedProductName = firstNonEmptyString([
                typeof firstPrice?.product === "object" && firstPrice?.product ? firstPrice.product.name : null
            ]) ?? (await fetchStripeProductName(secretKey, stripeProductId));
            unitAmountCents = Number(firstPrice?.unit_amount ?? Number.NaN);
            planName =
                firstNonEmptyString([
                    firstPrice?.nickname,
                    resolvedProductName
                ]) ?? planName;
        }
        catch {
            // Keep snapshot-derived values when Stripe lookup fails.
        }
    }
    const planTier = derivePlanTier({
        planName,
        priceId,
        productId: stripeProductId,
        unitAmountCents: Number.isFinite(unitAmountCents) ? unitAmountCents : null
    });
    const customerDoc = await adminDb.doc(`customers/${customerUid}`).get().catch(() => null);
    const customerData = customerDoc?.data() ?? {};
    const stripeCustomerId = firstNonEmptyString([
        customerData.stripeId,
        customerData.customerId,
        customerData.id
    ]);
    await applyBillingSnapshot({
        orgId,
        status,
        currentPeriodEnd,
        priceId,
        planName,
        planTier,
        stripeProductId,
        billingOwnerUid,
        stripeCustomerUid: customerUid,
        stripeCustomerId,
        stripeSubscriptionId: subscriptionId,
        fallbackUsed: usedFallback
    });
});
