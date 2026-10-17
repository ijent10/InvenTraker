import { sandboxStripe } from "@/lib/billing/server"
import { processBillingEvent } from "@/lib/billing/webhook"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return Response.json({ error: "Billing webhook configuration is pending." }, { status: 503 })
  const body = await request.text()
  if (body.length > 1_000_000) return Response.json({ error: "Payload too large." }, { status: 413 })
  const signature = request.headers.get("stripe-signature")
  if (!signature) return Response.json({ error: "Signature required." }, { status: 400 })
  let stripe
  try { stripe = sandboxStripe() } catch { return Response.json({ error: "Billing webhook configuration is pending." }, { status: 503 }) }
  let event
  try { event = stripe.webhooks.constructEvent(body, signature, secret) }
  catch { return Response.json({ error: "Invalid webhook signature." }, { status: 400 }) }
  try { return Response.json(await processBillingEvent(event, stripe)) }
  catch { console.error("[billing] Event processing requires retry", event.id); return Response.json({ error: "Event processing requires retry." }, { status: 500 }) }
}
