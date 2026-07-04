import { randomUUID } from "node:crypto"

import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { recommendSignupPlan, slugifySignupId, type SignupPayload } from "@/lib/signup"

type SignupActivationBilling = {
  mode: "stripe" | "trial"
  statusLabel: "Trialing" | "Active" | "Pending Stripe"
  organizationSlug?: string
  activationId?: string
  checkoutSessionId?: string
  signupIntakeId?: string
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  subscriptionStatus?: string
  renewal?: string
  trialEndsAt?: string
}

type SignupActivationInput = {
  signup: SignupPayload
  password: string
  billing: SignupActivationBilling
}

function employeeDisplayName(firstName: string, lastName: string) {
  return `${firstName.trim()} ${lastName.trim()}`.trim()
}

function uniqueOrgId(signup: SignupPayload, billing: SignupActivationBilling) {
  const baseOrgSlug = billing.organizationSlug || slugifySignupId(signup.organizationName) || "organization"
  const activationId = billing.activationId || billing.signupIntakeId || billing.checkoutSessionId || randomUUID()
  return `${baseOrgSlug}-${activationId.slice(0, 8)}`
}

export async function activateSignupWorkspace({ signup, password, billing }: SignupActivationInput) {
  const db = await adminDb()
  const auth = await adminAuth()

  if (!db || !auth) {
    throw new Error("Firebase Admin must be configured before account activation.")
  }

  const recommendation = recommendSignupPlan(signup)
  const orgId = uniqueOrgId(signup, billing)
  const ownerName = employeeDisplayName(signup.ownerFirstName, signup.ownerLastName)
  const now = new Date().toISOString()
  let ownerUser

  try {
    ownerUser = await auth.getUserByEmail(signup.ownerEmail)
    ownerUser = await auth.updateUser(ownerUser.uid, {
      displayName: ownerName,
      password,
      disabled: false
    })
  } catch (error) {
    if ((error as { code?: string })?.code !== "auth/user-not-found") throw error
    ownerUser = await auth.createUser({
      email: signup.ownerEmail,
      password,
      emailVerified: false,
      displayName: ownerName,
      disabled: false
    })
  }

  const batch = db.batch()
  const orgRef = db.collection("orgs").doc(orgId)

  batch.set(
    orgRef,
    {
      ownerId: ownerUser.uid,
      companyName: signup.organizationName,
      logoUrl: "/inventracker-mark.svg",
      headerText: "Connected workspace",
      accentColor: "#2563eb",
      secondaryColor: "#14b8a6",
      defaultMode: "Dark",
      defaultTheme: "Blue steel",
      businessDescription: signup.businessDescription,
      recommendedPlan: recommendation.id,
      billingMode: billing.mode,
      stripeLinkStatus: billing.mode === "stripe" ? "linked" : "pending_configuration",
      stripeCustomerId: billing.stripeCustomerId ?? "",
      stripeSubscriptionId: billing.stripeSubscriptionId ?? "",
      subscriptionStatus: billing.subscriptionStatus ?? (billing.statusLabel === "Pending Stripe" ? "pending_stripe" : "trialing"),
      trialEndsAt: billing.trialEndsAt ?? "",
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now
    },
    { merge: true }
  )

  batch.set(
    orgRef.collection("members").doc(ownerUser.uid),
    {
      id: ownerUser.uid,
      uid: ownerUser.uid,
      name: ownerName,
      employeeId: "OWNER-001",
      phone: "",
      email: signup.ownerEmail,
      jobTitle: "Owner",
      department: "Executive",
      location: "All locations",
      store: "All stores",
      status: "Active",
      role: "owner",
      permissions: ["*"],
      lastActive: "Account activated",
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now
    },
    { merge: true }
  )

  batch.set(
    db.collection("users").doc(ownerUser.uid),
    {
      email: signup.ownerEmail,
      name: ownerName,
      defaultOrgId: orgId,
      createdAt: now,
      updatedAt: now
    },
    { merge: true }
  )

  signup.stores.forEach((store, index) => {
    const storeId = slugifySignupId(store.nickname || store.location) || `store-${index + 1}`
    batch.set(
      orgRef.collection("stores").doc(storeId),
      {
        id: storeId,
        name: store.nickname,
        code: storeId.toUpperCase().slice(0, 12),
        address: store.location,
        manager: ownerName,
        phone: "",
        activeItems: 0,
        employees: 0,
        editableAreas: ["Inventory", "Orders", "Health checks", "Employees"],
        createdAt: now,
        updatedAt: now
      },
      { merge: true }
    )
  })

  signup.employees.forEach((employee, index) => {
    if (employee.email.toLowerCase() === signup.ownerEmail.toLowerCase()) return
    const inviteId = `invite-${slugifySignupId(employee.email) || index + 1}`
    batch.set(
      orgRef.collection("members").doc(inviteId),
      {
        id: inviteId,
        uid: "",
        name: employeeDisplayName(employee.firstName, employee.lastName),
        employeeId: `INVITE-${String(index + 1).padStart(3, "0")}`,
        phone: "",
        email: employee.email,
        jobTitle: "",
        department: "",
        location: "",
        store: "",
        status: "Invite sent",
        role: "employee",
        permissions: [],
        lastActive: "Invitation pending",
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now
      },
      { merge: true }
    )
  })

  batch.set(
    db.collection("platformSubscriptions").doc(orgId),
    {
      id: orgId,
      organization: signup.organizationName,
      ownerEmail: signup.ownerEmail,
      plan: recommendation.name,
      status: billing.statusLabel,
      seats: recommendation.seats,
      renewal: billing.renewal ?? billing.trialEndsAt ?? "",
      billingMode: billing.mode,
      stripeLinkStatus: billing.mode === "stripe" ? "linked" : "pending_configuration",
      stripeCustomerId: billing.stripeCustomerId ?? "",
      stripeSubscriptionId: billing.stripeSubscriptionId ?? "",
      stripeCheckoutSessionId: billing.checkoutSessionId ?? "",
      createdAt: now,
      updatedAt: now
    },
    { merge: true }
  )

  if (billing.signupIntakeId) {
    batch.set(
      db.collection("signupIntakes").doc(billing.signupIntakeId),
      {
        status: "activated",
        orgId,
        ownerUid: ownerUser.uid,
        billingMode: billing.mode,
        stripeCheckoutSessionId: billing.checkoutSessionId ?? "",
        updatedAt: now
      },
      { merge: true }
    )
  }

  await batch.commit()

  return {
    orgId,
    email: signup.ownerEmail,
    uid: ownerUser.uid,
    plan: recommendation
  }
}
