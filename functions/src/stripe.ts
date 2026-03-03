import { onCall, HttpsError } from "firebase-functions/v2/https"
import { onDocumentWritten } from "firebase-functions/v2/firestore"
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore"
import { z } from "zod"

import { adminAuth, adminDb } from "./lib/firebase.js"
import { requireAuth, requireOrgMembership, requirePermission } from "./lib/auth.js"

const createCheckoutSessionRequestSchema = z.object({
  orgId: z.string().min(1),
  priceId: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  trialFromPlanDays: z.number().int().min(0).max(90).optional()
})

const createPortalSessionRequestSchema = z.object({
  orgId: z.string().min(1),
  returnUrl: z.string().url()
})

const listPublicStripePlansRequestSchema = z.object({}).default({})

type StripePlanPrice = {
  priceId: string
  unitAmount: number
  currency: string
  interval: string
  intervalCount: number
  trialPeriodDays: number | null
}

type StripePlanSummary = {
  productId: string
  name: string
  description: string
  active: boolean
  prices: StripePlanPrice[]
}

type StripePlanOverride = {
  priceId: string
  displayName?: string
  description?: string
  trialMode?: "none" | "fixed" | "indefinite"
  trialDays?: number | null
  trialEndBehavior?: "halt" | "grace_2_days" | "grace_7_days"
  saleEnabled?: boolean
  saleLabel?: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stripeSecretKey(): string | null {
  const raw = String(
    process.env.STRIPE_SECRET_KEY ??
      process.env.STRIPE_API_KEY ??
      process.env.STRIPE_LIVE_SECRET_KEY ??
      ""
  ).trim()
  return raw.length > 0 ? raw : null
}

function stripeHeaders(secretKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded"
  }
}

async function stripeApiGet<T>(secretKey: string, endpoint: string, search: URLSearchParams): Promise<T> {
  const url = `https://api.stripe.com/v1/${endpoint}?${search.toString()}`
  const response = await fetch(url, { headers: stripeHeaders(secretKey), method: "GET" })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Stripe API ${endpoint} failed (${response.status}): ${body}`)
  }
  return (await response.json()) as T
}

async function fetchStripePlansFromApi(secretKey: string): Promise<StripePlanSummary[]> {
  type StripeList<T> = { data?: T[] }
  type StripeProduct = { id?: string; name?: string; description?: string; active?: boolean }
  type StripePrice = {
    id?: string
    active?: boolean
    unit_amount?: number
    currency?: string
    recurring?: { interval?: string; interval_count?: number; trial_period_days?: number | null } | null
  }

  const productsResponse = await stripeApiGet<StripeList<StripeProduct>>(
    secretKey,
    "products",
    new URLSearchParams({
      active: "true",
      limit: "100"
    })
  )

  const products = Array.isArray(productsResponse.data) ? productsResponse.data : []
  const plans: StripePlanSummary[] = []

  for (const product of products) {
    const productId = String(product.id ?? "").trim()
    if (!productId) continue
    const pricesResponse = await stripeApiGet<StripeList<StripePrice>>(
      secretKey,
      "prices",
      new URLSearchParams({
        active: "true",
        product: productId,
        type: "recurring",
        limit: "100"
      })
    )
    const prices = (Array.isArray(pricesResponse.data) ? pricesResponse.data : [])
      .map((price) => {
        const unitAmount = Number(price.unit_amount ?? 0)
        const recurring = price.recurring ?? {}
        return {
          priceId: String(price.id ?? "").trim(),
          unitAmount: Number.isFinite(unitAmount) ? unitAmount : 0,
          currency: String(price.currency ?? "usd").toUpperCase(),
          interval: String(recurring.interval ?? "month"),
          intervalCount: Number(recurring.interval_count ?? 1),
          trialPeriodDays:
            recurring.trial_period_days === null || recurring.trial_period_days === undefined
              ? null
              : Number(recurring.trial_period_days)
        } satisfies StripePlanPrice
      })
      .filter((price) => price.priceId.length > 0)
      .sort((a, b) => a.unitAmount - b.unitAmount)

    if (!prices.length) continue
    plans.push({
      productId,
      name: String(product.name ?? "Plan"),
      description: String(product.description ?? ""),
      active: Boolean(product.active ?? true),
      prices
    })
  }

  plans.sort((a, b) => {
    const minA = a.prices[0]?.unitAmount ?? Number.MAX_SAFE_INTEGER
    const minB = b.prices[0]?.unitAmount ?? Number.MAX_SAFE_INTEGER
    return minA - minB
  })

  return plans
}

async function fetchPlanOverrides(): Promise<Map<string, StripePlanOverride>> {
  const overrides = new Map<string, StripePlanOverride>()
  const snap = await adminDb.collection("stripePlanOverrides").limit(500).get().catch(() => null)
  for (const doc of snap?.docs ?? []) {
    const data = (doc.data() as Record<string, unknown>) ?? {}
    const priceId = typeof data.priceId === "string" && data.priceId.trim() ? data.priceId.trim() : doc.id
    if (!priceId) continue
    overrides.set(priceId, {
      priceId,
      displayName: typeof data.displayName === "string" ? data.displayName : undefined,
      description: typeof data.description === "string" ? data.description : undefined,
      trialMode:
        data.trialMode === "none" || data.trialMode === "fixed" || data.trialMode === "indefinite"
          ? data.trialMode
          : undefined,
      trialDays: Number.isFinite(Number(data.trialDays)) ? Number(data.trialDays) : null,
      trialEndBehavior:
        data.trialEndBehavior === "halt" || data.trialEndBehavior === "grace_2_days" || data.trialEndBehavior === "grace_7_days"
          ? data.trialEndBehavior
          : undefined,
      saleEnabled: data.saleEnabled === true,
      saleLabel: typeof data.saleLabel === "string" ? data.saleLabel : undefined
    })
  }
  return overrides
}

function applyOverrides(plan: StripePlanSummary, overrides: Map<string, StripePlanOverride>): StripePlanSummary {
  const primaryPriceId = plan.prices[0]?.priceId
  if (!primaryPriceId) return plan
  const override = overrides.get(primaryPriceId)
  if (!override) return plan

  let description = override.description?.trim() || plan.description
  if (override.saleEnabled) {
    const label = override.saleLabel?.trim() || "On sale"
    description = description ? `${description} • ${label}` : label
  }
  const trialHint =
    override.trialMode === "indefinite"
      ? "Trial: indefinite"
      : override.trialMode === "fixed" && Number.isFinite(Number(override.trialDays))
        ? `Trial: ${Number(override.trialDays)} day(s)`
        : null
  const trialBehavior =
    override.trialEndBehavior === "grace_2_days"
      ? "After trial: 2-day grace period"
      : override.trialEndBehavior === "grace_7_days"
        ? "After trial: 7-day grace period"
        : override.trialEndBehavior === "halt"
          ? "After trial: pay now to continue"
          : null
  const extra = [trialHint, trialBehavior].filter(Boolean).join(" • ")
  if (extra) {
    description = description ? `${description} • ${extra}` : extra
  }

  const prices = plan.prices.map((price) => {
    if (price.priceId !== primaryPriceId) return price
    if (override.trialMode === "fixed" && Number.isFinite(Number(override.trialDays))) {
      return {
        ...price,
        trialPeriodDays: Number(override.trialDays)
      }
    }
    if (override.trialMode === "none") {
      return {
        ...price,
        trialPeriodDays: null
      }
    }
    return price
  })

  return {
    ...plan,
    name: override.displayName?.trim() || plan.name,
    description,
    prices
  }
}

function normalizeStatus(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : ""
  if (!value) return "inactive"
  return value
}

function asDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (value instanceof Timestamp) return value.toDate()
  if (typeof value === "number") {
    const fromSeconds = value > 10_000_000_000 ? new Date(value) : new Date(value * 1000)
    return Number.isNaN(fromSeconds.getTime()) ? null : fromSeconds
  }
  if (typeof value === "string") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value === "object" && value) {
    const map = value as { seconds?: number; _seconds?: number; toDate?: () => Date }
    if (typeof map.toDate === "function") {
      const parsed = map.toDate()
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
    const seconds = typeof map.seconds === "number" ? map.seconds : map._seconds
    if (typeof seconds === "number") {
      const parsed = new Date(seconds * 1000)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
  }
  return null
}

function extractMetadata(data: Record<string, unknown>): Record<string, string> {
  const metadataRaw = data.metadata
  if (!metadataRaw || typeof metadataRaw !== "object") return {}
  const metadata = metadataRaw as Record<string, unknown>
  const entries = Object.entries(metadata)
    .map(([key, value]) => [key, typeof value === "string" ? value : String(value ?? "")] as const)
    .filter(([, value]) => value.length > 0)
  return Object.fromEntries(entries)
}

function extractPriceId(data: Record<string, unknown>): string | null {
  if (typeof data.priceId === "string" && data.priceId.trim()) return data.priceId.trim()
  const itemsRaw = data.items
  if (Array.isArray(itemsRaw) && itemsRaw.length > 0) {
    const first = itemsRaw[0] as Record<string, unknown>
    if (typeof first.price === "string" && first.price.trim()) return first.price.trim()
    if (first.price && typeof first.price === "object") {
      const nested = first.price as Record<string, unknown>
      if (typeof nested.id === "string" && nested.id.trim()) return nested.id.trim()
    }
  }
  return null
}

function extractPlanName(data: Record<string, unknown>, priceId: string | null): string {
  if (typeof data.planName === "string" && data.planName.trim()) return data.planName.trim()
  const itemsRaw = data.items
  if (Array.isArray(itemsRaw) && itemsRaw.length > 0) {
    const first = itemsRaw[0] as Record<string, unknown>
    if (typeof first.price === "object" && first.price) {
      const price = first.price as Record<string, unknown>
      if (typeof price.nickname === "string" && price.nickname.trim()) return price.nickname.trim()
    }
    if (typeof first.description === "string" && first.description.trim()) return first.description.trim()
  }
  if (priceId && priceId.toLowerCase().includes("pro")) return "Pro"
  if (priceId && priceId.toLowerCase().includes("growth")) return "Growth"
  if (priceId && priceId.toLowerCase().includes("starter")) return "Starter"
  return "Subscription"
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase()
}

function allowedRedirectHosts(): Set<string> {
  const configured = String(process.env.ALLOWED_CHECKOUT_HOSTS ?? "")
    .split(",")
    .map((entry) => normalizeHost(entry))
    .filter(Boolean)
  const defaults = ["localhost", "127.0.0.1", "inventracker.com", "www.inventracker.com"]
  return new Set([...defaults, ...configured])
}

function assertAllowedRedirectUrl(rawUrl: string, fieldName: "successUrl" | "cancelUrl") {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new HttpsError("invalid-argument", `${fieldName} must be a valid URL.`)
  }

  const host = normalizeHost(parsed.host)
  if (!allowedRedirectHosts().has(host)) {
    throw new HttpsError(
      "permission-denied",
      `${fieldName} host is not allowed. Add it to ALLOWED_CHECKOUT_HOSTS in functions env.`
    )
  }

  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new HttpsError("invalid-argument", `${fieldName} must use https.`)
  }
}

async function isActiveStripePrice(priceId: string): Promise<boolean> {
  const snap = await adminDb
    .collectionGroup("prices")
    .where("active", "==", true)
    .where("id", "==", priceId)
    .limit(1)
    .get()
  if (!snap.empty) return true

  const byDocId = await adminDb
    .collectionGroup("prices")
    .where("active", "==", true)
    .where(FieldPath.documentId(), "==", priceId)
    .limit(1)
    .get()
  return !byDocId.empty
}

async function resolveOrganizationIdForSubscription(
  ownerUidFromMetadata: string | null,
  metadataOrgId: string | null
): Promise<{ orgId: string | null; usedFallback: boolean }> {
  if (metadataOrgId) {
    const org = await adminDb.doc(`organizations/${metadataOrgId}`).get()
    if (org.exists) return { orgId: metadataOrgId, usedFallback: false }
  }

  if (!ownerUidFromMetadata) return { orgId: null, usedFallback: true }

  const byOwners = await adminDb
    .collection("organizations")
    .where("ownerUserIds", "array-contains", ownerUidFromMetadata)
    .limit(2)
    .get()
  const firstOwnerMatch = byOwners.docs.at(0)
  if (byOwners.docs.length === 1 && firstOwnerMatch) return { orgId: firstOwnerMatch.id, usedFallback: true }
  if (byOwners.docs.length > 1 && firstOwnerMatch) return { orgId: firstOwnerMatch.id, usedFallback: true }

  const byOwnerUid = await adminDb
    .collection("organizations")
    .where("ownerUid", "==", ownerUidFromMetadata)
    .limit(2)
    .get()
  const firstLegacyOwnerMatch = byOwnerUid.docs.at(0)
  if (firstLegacyOwnerMatch) return { orgId: firstLegacyOwnerMatch.id, usedFallback: true }

  return { orgId: null, usedFallback: true }
}

async function applyBillingSnapshot(input: {
  orgId: string
  status: string
  currentPeriodEnd: Date | null
  priceId: string | null
  planName: string
  billingOwnerUid: string | null
  stripeCustomerUid: string
  stripeSubscriptionId: string
  fallbackUsed: boolean
}) {
  const billingRef = adminDb.doc(`organizations/${input.orgId}/billing/default`)
  await billingRef.set(
    {
      organizationId: input.orgId,
      subscriptionStatus: input.status,
      currentPeriodEnd: input.currentPeriodEnd ? Timestamp.fromDate(input.currentPeriodEnd) : null,
      priceId: input.priceId,
      planName: input.planName,
      billingOwnerUid: input.billingOwnerUid,
      stripeCustomerUid: input.stripeCustomerUid,
      stripeSubscriptionId: input.stripeSubscriptionId,
      metadataFallbackUsed: input.fallbackUsed,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  )

  await adminDb.doc(`organizations/${input.orgId}`).set(
    {
      planId: input.priceId ?? "unknown",
      subscription: {
        status: input.status,
        renewsAt: input.currentPeriodEnd ? Timestamp.fromDate(input.currentPeriodEnd) : null,
        startedAt: FieldValue.serverTimestamp()
      },
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  )

  const members = await adminDb.collection(`organizations/${input.orgId}/members`).limit(1000).get()
  for (const member of members.docs) {
    try {
      const role = String((member.data() as { role?: string }).role ?? "Staff")
      const targetUid = member.id
      const authUser = await adminAuth.getUser(targetUid)
      const existingClaims = authUser.customClaims ?? {}
      await adminAuth.setCustomUserClaims(targetUid, {
        ...existingClaims,
        org_id: input.orgId,
        org_role: role,
        org_plan: input.planName,
        subscription_status: input.status
      })
    } catch (error) {
      console.error("Failed to update custom claims for org member", {
        orgId: input.orgId,
        memberId: member.id,
        reason: error instanceof Error ? error.message : String(error)
      })
    }
  }
}

export const createStripeCheckoutSession = onCall(async (request) => {
  const uid = requireAuth(request)
  const input = createCheckoutSessionRequestSchema.parse(request.data ?? {})
  await requireOrgMembership(input.orgId, uid)
  await requirePermission(input.orgId, uid, "manageOrgSettings")

  assertAllowedRedirectUrl(input.successUrl, "successUrl")
  assertAllowedRedirectUrl(input.cancelUrl, "cancelUrl")
  const priceIsActive = await isActiveStripePrice(input.priceId)
  if (!priceIsActive) {
    throw new HttpsError("invalid-argument", "Selected plan is unavailable.")
  }

  const ref = adminDb.collection("customers").doc(uid).collection("checkout_sessions").doc()
  await ref.set({
    mode: "subscription",
    line_items: [{ price: input.priceId, quantity: 1 }],
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
      }
    },
    client_reference_id: input.orgId,
    trial_period_days: input.trialFromPlanDays ?? null,
    createdAt: FieldValue.serverTimestamp()
  })

  for (let attempt = 0; attempt < 24; attempt += 1) {
    await sleep(500)
    const snap = await ref.get()
    const data = snap.data() as { url?: string; error?: { message?: string } } | undefined
    if (typeof data?.url === "string" && data.url.trim()) {
      return { ok: true, url: data.url, sessionDocPath: ref.path }
    }
    if (data?.error?.message) {
      throw new HttpsError("internal", data.error.message)
    }
  }

  return { ok: false, pending: true, sessionDocPath: ref.path }
})

export const createStripePortalSession = onCall(async (request) => {
  const uid = requireAuth(request)
  const input = createPortalSessionRequestSchema.parse(request.data ?? {})
  await requireOrgMembership(input.orgId, uid)
  await requirePermission(input.orgId, uid, "manageOrgSettings")
  assertAllowedRedirectUrl(input.returnUrl, "cancelUrl")

  const ref = adminDb.collection("customers").doc(uid).collection("portal_sessions").doc()
  await ref.set({
    return_url: input.returnUrl,
    metadata: {
      orgId: input.orgId,
      billingOwnerUid: uid
    },
    createdAt: FieldValue.serverTimestamp()
  })

  for (let attempt = 0; attempt < 24; attempt += 1) {
    await sleep(500)
    const snap = await ref.get()
    const data = snap.data() as { url?: string; error?: { message?: string } } | undefined
    if (typeof data?.url === "string" && data.url.trim()) {
      return { ok: true, url: data.url, sessionDocPath: ref.path }
    }
    if (data?.error?.message) {
      throw new HttpsError("internal", data.error.message)
    }
  }

  return { ok: false, pending: true, sessionDocPath: ref.path }
})

export const listPublicStripePlans = onCall(async (request) => {
  listPublicStripePlansRequestSchema.parse(request.data ?? {})

  const productsSnapshot = await adminDb
    .collection("products")
    .where("active", "==", true)
    .limit(100)
    .get()

  const plans: StripePlanSummary[] = []

  for (const productDoc of productsSnapshot.docs) {
    const productData = (productDoc.data() as Record<string, unknown>) ?? {}
    const priceSnapshot = await productDoc.ref.collection("prices").where("active", "==", true).limit(100).get()

    const prices: StripePlanPrice[] = priceSnapshot.docs
      .map((priceDoc) => {
        const priceData = (priceDoc.data() as Record<string, unknown>) ?? {}
        const recurring = (priceData.recurring as Record<string, unknown> | undefined) ?? {}
        const interval = String(recurring.interval ?? "month")
        const intervalCount = Number(recurring.interval_count ?? recurring.intervalCount ?? 1)
        const unitAmount = Number(priceData.unit_amount ?? priceData.unitAmount ?? 0)
        const currency = String(priceData.currency ?? "usd").toUpperCase()
        const trialRaw = recurring.trial_period_days ?? recurring.trialPeriodDays
        const trialPeriodDays = Number.isFinite(Number(trialRaw)) ? Number(trialRaw) : null

        return {
          priceId: priceDoc.id,
          unitAmount: Number.isFinite(unitAmount) ? unitAmount : 0,
          currency,
          interval,
          intervalCount: Number.isFinite(intervalCount) ? intervalCount : 1,
          trialPeriodDays
        }
      })
      .filter((entry) => entry.unitAmount >= 0)
      .sort((a, b) => a.unitAmount - b.unitAmount)

    if (!prices.length) continue

    plans.push({
      productId: productDoc.id,
      name: String(productData.name ?? "Plan"),
      description: String(productData.description ?? ""),
      active: Boolean(productData.active ?? true),
      prices
    })
  }

  plans.sort((a, b) => {
    const minA = a.prices[0]?.unitAmount ?? Number.MAX_SAFE_INTEGER
    const minB = b.prices[0]?.unitAmount ?? Number.MAX_SAFE_INTEGER
    return minA - minB
  })

  let effectivePlans = plans
  if (!effectivePlans.length) {
    const secretKey = stripeSecretKey()
    if (secretKey) {
      try {
        effectivePlans = await fetchStripePlansFromApi(secretKey)
      } catch (error) {
        console.error("Failed to fetch plans from Stripe API fallback", {
          reason: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }

  const overrides = await fetchPlanOverrides()
  const mergedPlans = effectivePlans.map((plan) => applyOverrides(plan, overrides))
  return { plans: mergedPlans }
})

export const syncOrgBillingFromStripeSubscription = onDocumentWritten(
  "customers/{customerUid}/subscriptions/{subscriptionId}",
  async (event) => {
    const customerUid = event.params.customerUid
    const subscriptionId = event.params.subscriptionId
    const after = event.data?.after
    const before = event.data?.before

    const afterData = after?.exists ? ((after.data() as Record<string, unknown>) ?? {}) : null
    const beforeData = before?.exists ? ((before.data() as Record<string, unknown>) ?? {}) : null

    const effectiveData = afterData ?? beforeData
    if (!effectiveData) return

    const metadata = extractMetadata(effectiveData)
    const metadataOrgId = typeof metadata.orgId === "string" && metadata.orgId.trim() ? metadata.orgId.trim() : null
    const billingOwnerUid =
      typeof metadata.billingOwnerUid === "string" && metadata.billingOwnerUid.trim()
        ? metadata.billingOwnerUid.trim()
        : customerUid

    const { orgId, usedFallback } = await resolveOrganizationIdForSubscription(billingOwnerUid, metadataOrgId)
    if (!orgId) {
      console.error("Could not resolve org for subscription update", {
        customerUid,
        subscriptionId,
        metadataOrgId,
        billingOwnerUid
      })
      return
    }

    const status = afterData ? normalizeStatus(afterData.status) : "canceled"
    const currentPeriodEnd = asDate(
      afterData?.current_period_end ??
        afterData?.currentPeriodEnd ??
        afterData?.cancel_at ??
        afterData?.cancelAt ??
        null
    )
    const priceId = extractPriceId(afterData ?? {})
    const planName = extractPlanName(afterData ?? {}, priceId)

    await applyBillingSnapshot({
      orgId,
      status,
      currentPeriodEnd,
      priceId,
      planName,
      billingOwnerUid,
      stripeCustomerUid: customerUid,
      stripeSubscriptionId: subscriptionId,
      fallbackUsed: usedFallback
    })
  }
)
