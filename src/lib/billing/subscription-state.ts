import { billingPlans, type BillingTier } from "./plans.ts"

export type SubscriptionSnapshot = { id: string; customer: string; status: string; cancel_at_period_end?: boolean; items: { data: { price: { id: string }; quantity?: number | null; current_period_end?: number }[] }; latest_invoice?: { status?: string | null; amount_due?: number } | null }
export function subscriptionState(subscription: SubscriptionSnapshot, prices: Record<BillingTier, { base: string; store: string; employee: string }>) {
  const tiers = (Object.keys(prices) as BillingTier[]).filter((tier) => subscription.items.data.some((item) => item.price.id === prices[tier].base))
  if (tiers.length !== 1) throw new Error("A subscription must contain exactly one supported base plan.")
  const tierId = tiers[0]
  const allowed = Object.values(prices[tierId])
  const seen = new Set<string>()
  for (const item of subscription.items.data) {
    if (!allowed.includes(item.price.id) || seen.has(item.price.id) || !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1) throw new Error("The subscription contains unsupported or duplicate quantities.")
    seen.add(item.price.id)
    if (item.price.id === prices[tierId].base && item.quantity !== 1) throw new Error("The base plan quantity must be one.")
  }
  const paid = subscription.status === "trialing" || (subscription.status === "active" && (subscription.latest_invoice?.status === "paid" || subscription.latest_invoice?.amount_due === 0))
  const end = Math.max(0, ...subscription.items.data.map((item) => item.current_period_end ?? 0))
  return { tierId, catalogVersion: 1, subscriptionId: subscription.id, subscriptionStatus: subscription.status, cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end), periodEnd: end ? new Date(end * 1000).toISOString() : null, paidAccess: paid, features: Object.fromEntries(Object.entries(billingPlans[tierId].features).map(([feature, enabled]) => [feature, paid && enabled])), quantities: { base: 1, store: subscription.items.data.find((item) => item.price.id === prices[tierId].store)?.quantity ?? 0, employee: subscription.items.data.find((item) => item.price.id === prices[tierId].employee)?.quantity ?? 0 } }
}
