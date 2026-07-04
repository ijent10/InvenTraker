import { NextResponse } from "next/server"
import Stripe from "stripe"
import { z } from "zod"

import { adminDb } from "@/lib/firebase-admin"
import { activateSignupWorkspace } from "@/lib/signup-activation"

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
  checkoutSessionId: z.string().min(1),
  password: z.string().min(6),
  signup: signupSchema
})

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    typescript: true,
    maxNetworkRetries: 2
  })
}

function activatedSession(session: Stripe.Checkout.Session) {
  return session.status === "complete" && (session.payment_status === "paid" || session.payment_status === "no_payment_required")
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription | null) {
  const value = (subscription as unknown as { current_period_end?: number } | null)?.current_period_end
  return typeof value === "number" ? value : undefined
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "A completed signup, password, and Stripe session id are required." }, { status: 400 })
  }

  const stripe = stripeClient()
  const db = await adminDb()
  if (!stripe || !db) {
    return NextResponse.json({ error: "Stripe and Firebase Admin must be configured before account activation." }, { status: 501 })
  }

  const session = await stripe.checkout.sessions.retrieve(parsed.data.checkoutSessionId, { expand: ["subscription"] })
  if (!activatedSession(session)) {
    return NextResponse.json({ error: "Stripe has not confirmed a paid or trialing checkout session yet." }, { status: 402 })
  }

  if ((session.customer_email ?? "").toLowerCase() !== parsed.data.signup.ownerEmail.toLowerCase()) {
    return NextResponse.json({ error: "Stripe checkout email does not match the signup owner email." }, { status: 403 })
  }

  const signupIntakeId = session.metadata?.signupIntakeId ?? ""
  const intakeRef = signupIntakeId ? db.collection("signupIntakes").doc(signupIntakeId) : null
  const intakeSnapshot = intakeRef ? await intakeRef.get() : null
  if (intakeSnapshot?.exists && intakeSnapshot.data()?.status === "activated") {
    return NextResponse.json({
      orgId: intakeSnapshot.data()?.orgId,
      email: parsed.data.signup.ownerEmail,
      alreadyActivated: true
    })
  }

  const subscription = typeof session.subscription === "object" && session.subscription ? session.subscription : null
  const renewalSeconds = subscriptionPeriodEnd(subscription)
  const activation = await activateSignupWorkspace({
    signup: parsed.data.signup,
    password: parsed.data.password,
    billing: {
      mode: "stripe",
      statusLabel: subscription?.status === "trialing" ? "Trialing" : "Active",
      organizationSlug: session.metadata?.organizationSlug,
      signupIntakeId,
      checkoutSessionId: session.id,
      stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? "",
      stripeSubscriptionId: subscription?.id ?? "",
      subscriptionStatus: subscription?.status ?? "active",
      renewal: renewalSeconds ? new Date(renewalSeconds * 1000).toISOString() : ""
    }
  })

  return NextResponse.json({
    orgId: activation.orgId,
    email: activation.email
  })
}
