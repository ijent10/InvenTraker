import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"

import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { activateSignupWorkspace } from "@/lib/signup-activation"
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
  password: z.string().min(6),
  signup: signupSchema
})

function trialEndDate() {
  const trialDays = Number.parseInt(process.env.STRIPE_SIGNUP_TRIAL_DAYS || "14", 10)
  const date = new Date()
  date.setDate(date.getDate() + (Number.isFinite(trialDays) ? trialDays : 14))
  return date.toISOString()
}


export async function POST(request: Request) {
  if (process.env.SIGNUP_TRIAL_ENABLED === "false") {
    return NextResponse.json({ error: "Trial signup is currently disabled." }, { status: 403 })
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "A completed signup and password are required to start a trial." }, { status: 400 })
  }

  const db = await adminDb()
  if (!db) {
    return NextResponse.json({ error: "Firebase Admin must be configured before account activation." }, { status: 501 })
  }

  const auth = await adminAuth()
  if (!auth) return NextResponse.json({ error: "Account service is unavailable." }, { status: 503 })
  try {
    const existing = await auth.getUserByEmail(parsed.data.signup.ownerEmail)
    if (existing) return NextResponse.json({ error: "An account already exists for this email. Sign in instead; signup cannot change an existing password." }, { status: 409 })
  } catch (error) {
    if ((error as { code?: string })?.code !== "auth/user-not-found") return NextResponse.json({ error: "Account lookup is temporarily unavailable." }, { status: 503 })
  }
  const signupIntakeId = randomUUID()
  const organizationSlug = slugifySignupId(parsed.data.signup.organizationName) || `org-${signupIntakeId.slice(0, 8)}`
  const recommendation = recommendSignupPlan(parsed.data.signup)
  const now = new Date().toISOString()

  await db.collection("signupIntakes").doc(signupIntakeId).set({
    id: signupIntakeId,
    status: "trial_started",
    recommendedPlan: recommendation.id,
    recommendation,
    organizationSlug,
    signup: parsed.data.signup,
    billingMode: "trial",
    stripeLinkStatus: "pending_configuration",
    stripeCustomerId: "",
    createdAt: now,
    updatedAt: now
  })

  const activation = await activateSignupWorkspace({
    signup: parsed.data.signup,
    password: parsed.data.password,
    billing: {
      mode: "trial",
      statusLabel: "Pending Stripe",
      organizationSlug,
      activationId: signupIntakeId,
      signupIntakeId,
      subscriptionStatus: "pending_stripe",
      stripeCustomerId: "",
      trialEndsAt: trialEndDate()
    }
  })

  return NextResponse.json({
    mode: "trial",
    orgId: activation.orgId,
    email: activation.email,
    plan: activation.plan.name
  })
}
