import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import Stripe from "stripe"
import { z } from "zod"

import { adminDb } from "@/lib/firebase-admin"
import { recommendSignupPlan, slugifySignupId } from "@/lib/signup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const storeSchema = z.object({
  location: z.string().min(1),
  nickname: z.string().min(1)
})

const employeeSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email()
})

const signupSchema = z.object({
  ownerFirstName: z.string().min(1),
  ownerLastName: z.string().min(1),
  ownerEmail: z.string().email(),
  organizationName: z.string().min(1),
  stores: z.array(storeSchema).min(1),
  employeeCount: z.number().int().min(0),
  employees: z.array(employeeSchema),
  businessDescription: z.string().min(1)
})

const requestSchema = z.object({
  signup: signupSchema,
  recommendedPlan: z.enum(["starter", "growth", "scale"]).optional()
})

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    typescript: true,
    maxNetworkRetries: 2
  })
}

function priceForPlan(planId: string) {
  if (planId === "starter") return process.env.STRIPE_STARTER_PRICE_ID || process.env.STRIPE_DEFAULT_PRICE_ID
  if (planId === "growth") return process.env.STRIPE_GROWTH_PRICE_ID || process.env.STRIPE_DEFAULT_PRICE_ID
  if (planId === "scale") return process.env.STRIPE_SCALE_PRICE_ID || process.env.STRIPE_DEFAULT_PRICE_ID
  return process.env.STRIPE_DEFAULT_PRICE_ID
}

export async function POST(request: Request) {
  const stripe = stripeClient()
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured. Add STRIPE_SECRET_KEY." }, { status: 501 })
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Complete signup details are required before checkout." }, { status: 400 })
  }

  const recommendation = recommendSignupPlan(parsed.data.signup)
  const planId = parsed.data.recommendedPlan ?? recommendation.id
  const priceId = priceForPlan(planId)
  if (!priceId) {
    return NextResponse.json({ error: "Stripe price is not configured for this plan." }, { status: 501 })
  }

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const signupIntakeId = randomUUID()
  const orgSlug = slugifySignupId(parsed.data.signup.organizationName) || `org-${signupIntakeId.slice(0, 8)}`
  const db = await adminDb()

  if (db) {
    await db.collection("signupIntakes").doc(signupIntakeId).set({
      id: signupIntakeId,
      status: "checkout_started",
      recommendedPlan: planId,
      recommendation,
      organizationSlug: orgSlug,
      signup: parsed.data.signup,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: parsed.data.signup.ownerEmail,
    line_items: [{ price: priceId, quantity: Math.max(recommendation.seats, 1) }],
    success_url: `${origin}/signin?signup=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/signin?create=1&signup=cancelled`,
    allow_promotion_codes: true,
    subscription_data: {
      trial_period_days: Number.parseInt(process.env.STRIPE_SIGNUP_TRIAL_DAYS || "14", 10),
      metadata: {
        signupIntakeId,
        organizationSlug: orgSlug,
        recommendedPlan: planId
      }
    },
    metadata: {
      signupIntakeId,
      organizationSlug: orgSlug,
      recommendedPlan: planId,
      organization: parsed.data.signup.organizationName,
      ownerEmail: parsed.data.signup.ownerEmail,
      storeCount: String(parsed.data.signup.stores.length),
      employeeCount: String(recommendation.seats)
    }
  })

  if (db) {
    await db.collection("signupIntakes").doc(signupIntakeId).set(
      {
        stripeCheckoutSessionId: session.id,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    )
  }

  return NextResponse.json({ url: session.url })
}
