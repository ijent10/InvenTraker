import { billingError, billingOrigin, billingPrincipal, sandboxStripe } from "@/lib/billing/server"
import { MobileApiError } from "@/lib/mobile-api"
import catalog from "@/lib/billing/stripe-sandbox-catalog.json"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request) {
  try {
    const principal = await billingPrincipal(request)
    const account = (await principal.db.collection("billingAccounts").doc(principal.orgId).get()).data()
    if (!account?.customerId || account.stripeAccountId !== catalog.accountId || account.livemode !== false) throw new MobileApiError("This organization has no verified sandbox billing account.", 409, "billing_account_missing")
    const stripe = sandboxStripe()
    const customer = await stripe.customers.retrieve(account.customerId)
    if (customer.deleted || customer.livemode) throw new Error("A valid sandbox customer is required.")
    const session = await stripe.billingPortal.sessions.create({ customer: account.customerId, configuration: catalog.portalConfigurationId, return_url: `${billingOrigin()}/account/billing` })
    return Response.json({ url: session.url }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return billingError(error) }
}
