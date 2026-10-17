export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST() {
  return Response.json({ error: "Sign in to your workspace and open Billing. Subscription activation is confirmed by Stripe events.", code: "authenticated_billing_required" }, { status: 410 })
}
