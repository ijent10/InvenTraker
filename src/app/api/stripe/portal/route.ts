import { NextResponse } from "next/server"
import Stripe from "stripe"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  ownerEmail: z.string().email()
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
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured. Add STRIPE_SECRET_KEY." }, { status: 501 })
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid owner email is required." }, { status: 400 })
  }

  const customers = await stripe.customers.list({ email: parsed.data.ownerEmail, limit: 1 })
  const customer = customers.data[0] ?? (await stripe.customers.create({ email: parsed.data.ownerEmail }))
  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: `${origin}/administrator`
  })

  return NextResponse.json({ url: session.url })
}
