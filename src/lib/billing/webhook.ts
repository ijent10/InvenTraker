import type Stripe from "stripe"
import { adminDb } from "@/lib/firebase-admin"
import { billingCustomerKey } from "./server"
import { billingPlans } from "./plans"
import { subscriptionState, type SubscriptionSnapshot } from "./subscription-state"
import catalog from "./stripe-sandbox-catalog.json"

const events = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed", "invoice.paid", "invoice.payment_failed"])
function objectId(value: unknown): string | undefined { return typeof value === "string" ? value : value && typeof value === "object" && "id" in value ? String(value.id) : undefined }
export async function processBillingEvent(event: Stripe.Event, stripe: Stripe) {
  if (event.livemode) throw new Error("Live events are not accepted by the sandbox handler.")
  if (!events.has(event.type)) return { ignored: true }
  const db = await adminDb()
  if (!db) throw new Error("Billing persistence is unavailable.")
  const record = event.data.object as unknown as Record<string, unknown>
  let customerId = objectId(record.customer)
  let subscriptionId: string | undefined
  if (event.type.startsWith("customer.subscription.")) subscriptionId = objectId(record.id)
  else if (event.type.startsWith("checkout.session.")) {
    const session = await stripe.checkout.sessions.retrieve(String(record.id))
    if (session.livemode || session.mode !== "subscription" || session.status !== "complete" || !["paid", "no_payment_required"].includes(session.payment_status)) return { ignored: true }
    customerId = objectId(session.customer); subscriptionId = objectId(session.subscription)
  } else {
    const parent = record.parent as { subscription_details?: { subscription?: unknown } } | undefined
    subscriptionId = objectId(parent?.subscription_details?.subscription ?? record.subscription)
  }
  if (!customerId || !subscriptionId) return { ignored: true }
  const mapping = (await db.collection("billingCustomers").doc(billingCustomerKey(customerId)).get()).data()
  if (!mapping || mapping.customerId !== customerId || mapping.stripeAccountId !== catalog.accountId || mapping.livemode !== false) return { ignored: true }
  const accountRef = db.collection("billingAccounts").doc(mapping.orgId)
  const eventRef = db.collection("billingWebhookEvents").doc(`${catalog.accountId}-${event.id}`)
  const generation = await db.runTransaction(async (transaction) => {
    const [saved, account] = await Promise.all([transaction.get(eventRef), transaction.get(accountRef)])
    if (["processed", "ignored"].includes(String(saved.data()?.status))) return null
    if (!account.exists || account.data()?.customerId !== customerId || account.data()?.stripeAccountId !== catalog.accountId || account.data()?.livemode !== false) throw new Error("Billing ownership does not match the verified customer.")
    if (account.data()?.subscriptionId && account.data()?.subscriptionId !== subscriptionId && !["canceled", "incomplete_expired"].includes(String(account.data()?.subscriptionStatus))) { transaction.set(eventRef, { status: "ignored", eventId: event.id, type: event.type, orgId: mapping.orgId, reason: "secondary_subscription", processedAt: new Date().toISOString() }); return null }
    const next = Number(account.data()?.syncGeneration ?? 0) + 1
    transaction.update(accountRef, { syncGeneration: next })
    transaction.set(eventRef, { status: "processing", eventId: event.id, type: event.type, orgId: mapping.orgId, subscriptionId, attemptedAt: new Date().toISOString() }, { merge: true })
    return next
  })
  if (generation === null) return { replayed: true }
  // Refresh canonical state rather than applying possibly old event snapshots.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] })
  if (objectId(subscription.customer) !== customerId || subscription.livemode) throw new Error("Subscription/customer ownership mismatch.")
  const canonical = subscriptionState({ ...subscription, customer: customerId } as unknown as SubscriptionSnapshot, catalog.prices)
  await db.runTransaction(async (transaction) => {
    const [saved, account] = await Promise.all([transaction.get(eventRef), transaction.get(accountRef)])
    if (saved.data()?.status === "processed") return
    if (account.data()?.syncGeneration !== generation) throw new Error("A concurrent subscription refresh requires a retry.")
    transaction.update(accountRef, { ...canonical, lastEventId: event.id, updatedAt: new Date().toISOString(), usageSyncRequired: true })
    transaction.set(db.collection("platformSubscriptions").doc(mapping.orgId), { id: mapping.orgId, plan: billingPlans[canonical.tierId].name, status: canonical.subscriptionStatus === "trialing" ? "Trialing" : canonical.subscriptionStatus === "active" ? "Active" : canonical.subscriptionStatus === "past_due" ? "Past due" : "Paused", renewal: canonical.periodEnd ?? "", stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId, billingMode: "sandbox", updatedAt: new Date().toISOString() }, { merge: true })
    transaction.set(eventRef, { status: "processed", processedAt: new Date().toISOString() }, { merge: true })
  })
  return { processed: true }
}
