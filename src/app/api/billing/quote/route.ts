import { billingConfigured, billingError, billingPrincipal, billingQuote } from "@/lib/billing/server"
import { billingTierSchema } from "@/lib/billing/plans"
import { MobileApiError } from "@/lib/mobile-api"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  try {
    const principal = await billingPrincipal(request)
    const tier = billingTierSchema.safeParse(new URL(request.url).searchParams.get("tier"))
    if (!tier.success) throw new MobileApiError("Choose Builder, Basic or Pro.", 400, "invalid_tier")
    const [quote, account] = await Promise.all([billingQuote(principal, tier.data), principal.db.collection("billingAccounts").doc(principal.orgId).get()])
    return Response.json({ quote, configured: billingConfigured(), subscription: account.exists ? { status: account.data()?.subscriptionStatus ?? "not_started", tierId: account.data()?.tierId ?? null, renewal: account.data()?.periodEnd ?? null, cancelAtPeriodEnd: Boolean(account.data()?.cancelAtPeriodEnd) } : null, sandbox: true }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return billingError(error) }
}
