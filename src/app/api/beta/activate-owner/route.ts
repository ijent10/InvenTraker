import { NextResponse } from "next/server"

import { adminAuth, adminDb, adminFieldValue } from "@/lib/firebase-admin"
import { DEFAULT_ORG_ID } from "@/lib/firestore-schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bootstrapAdminEmail = (process.env.INVENTRACKER_PLATFORM_ADMIN_EMAIL || "ianjjent@icloud.com").toLowerCase()

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { idToken?: string; orgId?: string } | null
  if (!body?.idToken) {
    return NextResponse.json({ error: "Sign in before activating beta owner access." }, { status: 401 })
  }

  const auth = await adminAuth()
  const db = await adminDb()
  const FieldValue = await adminFieldValue()

  if (!auth || !db) {
    return NextResponse.json({ error: "Firebase Admin is not configured on this server." }, { status: 501 })
  }

  const decodedToken = await auth.verifyIdToken(body.idToken)
  const email = (decodedToken.email || "").toLowerCase()
  if (email !== bootstrapAdminEmail) {
    return NextResponse.json({ error: "Only the bootstrap administrator can activate beta owner access." }, { status: 403 })
  }

  const uid = decodedToken.uid
  const user = await auth.getUser(uid)
  const displayName = user.displayName || decodedToken.name || email.split("@")[0] || "Ian"
  const orgId = body.orgId || DEFAULT_ORG_ID
  const orgRef = db.collection("orgs").doc(orgId)
  const now = FieldValue.serverTimestamp()

  await auth.setCustomUserClaims(uid, {
    ...(user.customClaims ?? {}),
    platformAdmin: true
  })

  const batch = db.batch()
  batch.set(
    orgRef,
    {
      ownerId: uid,
      companyName: "InvenTracker Beta",
      logoUrl: "/inventracker-mark.svg",
      headerText: "Beta testing workspace",
      accentColor: "#2563eb",
      secondaryColor: "#14b8a6",
      defaultMode: "Dark",
      defaultTheme: "Blue steel",
      schemaVersion: 1,
      updatedAt: now,
      createdAt: now
    },
    { merge: true }
  )
  batch.set(
    orgRef.collection("members").doc(uid),
    {
      id: uid,
      uid,
      name: displayName,
      employeeId: "OWNER-BETA",
      phone: "",
      email,
      jobTitle: "Owner",
      department: "Executive",
      location: "All locations",
      store: "All stores",
      status: "Active",
      role: "owner",
      permissions: ["*"],
      lastActive: "Beta access activated",
      schemaVersion: 1,
      updatedAt: now,
      createdAt: now
    },
    { merge: true }
  )
  batch.set(
    db.collection("users").doc(uid),
    {
      email,
      name: displayName,
      defaultOrgId: orgId,
      updatedAt: now,
      createdAt: now
    },
    { merge: true }
  )
  batch.set(
    db.collection("platformAdmins").doc(uid),
    {
      uid,
      email,
      role: "platformAdmin",
      status: "Active",
      permissions: ["platform.admin"],
      source: "beta-owner-activation",
      updatedAt: now,
      createdAt: now
    },
    { merge: true }
  )

  await batch.commit()

  return NextResponse.json({
    orgId,
    uid,
    email
  })
}
