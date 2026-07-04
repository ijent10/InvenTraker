import { NextResponse } from "next/server"
import Stripe from "stripe"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  organization: z.string().min(1),
  ownerEmail: z.string().email(),
  plan: z.string().min(1),
  seats: z.number().int().positive().default(1)
})

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    typescript: true,
    maxNetworkRetries: 2
  })
}

export async function POST(request: Request) {
  const stripe = stripeClient()
  const priceId = process.env.STRIPE_DEFAULT_PRICE_ID

  if (!stripe || !priceId) {
    return NextResponse.json({ error: "Stripe is not configured. Add STRIPE_SECRET_KEY and STRIPE_DEFAULT_PRICE_ID." }, { status: 501 })
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid organization, owner email, plan, and seat count are required." }, { status: 400 })
  }

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: parsed.data.ownerEmail,
    line_items: [{ price: priceId, quantity: parsed.data.seats }],
    success_url: `${origin}/administrator?stripe=success`,
    cancel_url: `${origin}/administrator?stripe=cancelled`,
    metadata: {
      organization: parsed.data.organization,
      plan: parsed.data.plan
    }
  })

  return NextResponse.json({ url: session.url })
}
