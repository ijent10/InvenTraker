import Stripe from "stripe"
import { z } from "zod"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { MobileApiError } from "@/lib/mobile-api"
import { billingPlans, quoteBilling, usageFromRecords, type BillingTier } from "./plans"
import catalog from "./stripe-sandbox-catalog.json"

export const billingRequestSchema = z.object({ tierId: z.enum(["builder", "basic", "pro"]), requestId: z.string().uuid(), quoteFingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export async function billingPrincipal(request: Request) {
  const token = /^Bearer (.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]
  if (!token) throw new MobileApiError("Sign in to manage billing.", 401, "unauthenticated")
  const [auth, db] = await Promise.all([adminAuth(), adminDb()])
  if (!auth || !db) throw new MobileApiError("Billing data is unavailable.", 503, "service_unavailable")
  const decoded = await auth.verifyIdToken(token, true).catch(() => null)
  if (!decoded) throw new MobileApiError("Sign in again to manage billing.", 401, "invalid_session")
  const orgId = request.headers.get("x-inventracker-org")?.trim()
  if (!orgId || orgId.includes("/") || orgId.length > 200) throw new MobileApiError("Choose an organization.", 400, "organization_required")
  const org = await db.collection("orgs").doc(orgId).get()
  if (!org.exists) throw new MobileApiError("Organization not found.", 404, "organization_not_found")
  const [member, admin] = await Promise.all([org.ref.collection("members").doc(decoded.uid).get(), db.collection("platformAdmins").doc(decoded.uid).get()])
  const isAdmin = decoded.platformAdmin === true || (admin.exists && !["disabled", "suspended"].includes(String(admin.data()?.status ?? "active").toLowerCase()))
  const owner = org.data()?.ownerId === decoded.uid && member.exists && !["suspended", "disabled", "deleted"].includes(String(member.data()?.status ?? "active").toLowerCase())
  if (!owner && !isAdmin) throw new MobileApiError("Only the organization owner or a platform administrator can manage billing.", 403, "billing_owner_required")
  return { db, org, orgId, uid: decoded.uid, email: String(decoded.email ?? ""), isAdmin }
}
export type BillingPrincipal = Awaited<ReturnType<typeof billingPrincipal>>
export async function billingQuote(principal: BillingPrincipal, tier: BillingTier) {
  const [stores, members] = await Promise.all([principal.org.ref.collection("stores").limit(10_001).get(), principal.org.ref.collection("members").limit(100_001).get()])
  if (stores.size > 10_000 || members.size > 100_000) throw new MobileApiError("Billing needs a complete organization snapshot. Contact support.", 409, "billing_snapshot_incomplete")
  try { const quote = quoteBilling(tier, usageFromRecords(stores.docs.map((doc) => ({ ...doc.data(), id: doc.id })), members.docs.map((doc) => ({ ...doc.data(), id: doc.id })))); return { ...quote, storeNames: Object.fromEntries(stores.docs.map((doc) => [doc.id, String(doc.data().name ?? "Store")])) } }
  catch (error) { throw new MobileApiError(error instanceof Error ? error.message : "Update employee assignments before billing.", 409, "billing_assignments_required") }
}
export function billingOrigin() {
  const origin = process.env.BILLING_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://inventraker.com"
  const url = new URL(origin)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Billing return address must use HTTPS.")
  if (url.username || url.password) throw new Error("Billing return address cannot contain credentials.")
  return url.origin
}
export function billingConfigured() { return process.env.STRIPE_BILLING_MODE === "sandbox" && /^(rk|sk)_test_/.test(process.env.STRIPE_SANDBOX_RESTRICTED_KEY ?? "") && Boolean(process.env.STRIPE_WEBHOOK_SECRET) }
export function sandboxStripe() {
  if (!billingConfigured()) throw new MobileApiError("Sandbox billing is awaiting secure server configuration.", 503, "billing_not_configured")
  return new Stripe(process.env.STRIPE_SANDBOX_RESTRICTED_KEY!, { typescript: true, maxNetworkRetries: 2 })
}
export async function verifyCatalog(stripe: Stripe, tierId: BillingTier) {
  const account = await stripe.accounts.retrieve(null)
  if (account.id !== catalog.accountId) throw new Error("The server key does not belong to the configured billing sandbox.")
  const ids = catalog.prices[tierId]
  const plan = billingPlans[tierId]
  for (const [kind, expected] of [["base", plan.baseCents], ["store", plan.extraStoreCents], ["employee", plan.extraEmployeeCents]] as const) {
    const price = await stripe.prices.retrieve(ids[kind])
    if (price.livemode || !price.active || price.unit_amount !== expected || price.currency !== "usd" || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1 || price.recurring.usage_type !== "licensed") throw new Error("The Stripe catalog does not match this plan. Checkout is unavailable.")
  }
  return ids
}
export function billingCustomerKey(customerId: string) { return Buffer.from(JSON.stringify([catalog.accountId, false, customerId])).toString("base64url") }
export function billingError(error: unknown) {
  if (error instanceof MobileApiError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "private, no-store" } })
  console.error("[billing] Request failed", error instanceof Error ? error.name : "unknown")
  return Response.json({ error: "Billing is temporarily unavailable. Please try again.", code: "billing_unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } })
}
