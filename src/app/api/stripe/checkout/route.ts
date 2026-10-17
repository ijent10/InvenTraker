import { billingError, billingPrincipal, billingRequestSchema } from "@/lib/billing/server"
import { startBillingCheckout } from "@/lib/billing/checkout"
import { MobileApiError } from "@/lib/mobile-api"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request) {
  try {
    const principal = await billingPrincipal(request)
    const parsed = billingRequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new MobileApiError("Review a current price quote before checkout.", 400, "invalid_request")
    return Response.json(await startBillingCheckout(principal, parsed.data), { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return billingError(error) }
}
