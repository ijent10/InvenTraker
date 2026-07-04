"use client"

import { useState } from "react"
import { doc, serverTimestamp, setDoc } from "firebase/firestore"
import { ShieldCheck, Loader2 } from "lucide-react"

import { Button } from "@/components/ui"
import { useAuthSession } from "@/lib/auth-session"
import { DEFAULT_ORG_ID } from "@/lib/firestore-schema"
import { auth, db } from "@/lib/firebase"

const bootstrapAdminEmail = "ianjjent@icloud.com"

async function activateWithClientBootstrap() {
  const user = auth?.currentUser
  if (!user || !db) throw new Error("Firebase is not ready in this browser.")

  const email = user.email?.toLowerCase() ?? ""
  if (email !== bootstrapAdminEmail) throw new Error("Only the bootstrap administrator can activate beta owner access.")

  const now = serverTimestamp()
  const displayName = user.displayName || email.split("@")[0] || "Ian"

  await setDoc(
    doc(db, "platformAdmins", user.uid),
    {
      uid: user.uid,
      email,
      role: "platformAdmin",
      status: "Active",
      permissions: ["platform.admin"],
      source: "client-beta-owner-activation",
      updatedAt: now,
      createdAt: now
    },
    { merge: true }
  )

  await setDoc(
    doc(db, "orgs", DEFAULT_ORG_ID),
    {
      ownerId: user.uid,
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

  await setDoc(
    doc(db, "orgs", DEFAULT_ORG_ID, "members", user.uid),
    {
      id: user.uid,
      uid: user.uid,
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

  await setDoc(
    doc(db, "users", user.uid),
    {
      email,
      name: displayName,
      defaultOrgId: DEFAULT_ORG_ID,
      updatedAt: now,
      createdAt: now
    },
    { merge: true }
  )

  return DEFAULT_ORG_ID
}

export function BetaOwnerActivation() {
  const session = useAuthSession()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const canActivate = session.user?.email?.toLowerCase() === bootstrapAdminEmail

  if (!canActivate) return null

  async function activate() {
    if (!auth?.currentUser) return
    setBusy(true)
    setMessage("")
    setError("")

    try {
      const idToken = await auth.currentUser.getIdToken(true)
      const response = await fetch("/api/beta/activate-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken })
      })
      const result = (await response.json().catch(() => null)) as { orgId?: string; error?: string } | null
      let orgId = result?.orgId

      if ((!response.ok || !orgId) && response.status === 501) {
        orgId = await activateWithClientBootstrap()
      }

      if (!orgId) throw new Error(result?.error ?? "Could not activate beta owner access.")

      await auth.currentUser.getIdToken(true)
      setMessage(`Beta owner access is active for ${orgId}. Opening dashboard...`)
      window.setTimeout(() => window.location.assign("/dashboard"), 500)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not activate beta owner access.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 rounded-md border border-[var(--app-accent)] bg-[var(--app-accent-soft)] p-4 text-left">
      <p className="text-sm font-semibold text-[var(--app-text)]">Beta owner setup</p>
      <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">
        This signed-in account is the bootstrap administrator. Activate it as the owner of the beta workspace so you can test real Firebase sync and permissions.
      </p>
      <Button className="mt-3" onClick={() => void activate()} disabled={busy} icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}>
        Activate my beta owner access
      </Button>
      {message ? <p className="mt-3 text-sm font-semibold text-emerald-300">{message}</p> : null}
      {error ? <p className="mt-3 text-sm font-semibold text-rose-300">{error}</p> : null}
    </div>
  )
}
