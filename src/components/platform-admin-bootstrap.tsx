"use client"

import { useEffect, useMemo, useState } from "react"
import { onAuthStateChanged } from "firebase/auth"
import { doc, serverTimestamp, setDoc } from "firebase/firestore"
import { CheckCircle2, ShieldCheck } from "lucide-react"

import { auth, db } from "@/lib/firebase"

const bootstrapAdminEmail = "ianjjent@icloud.com"

type BootstrapState = {
  status: "checking" | "signed-out" | "wrong-user" | "syncing" | "claimed" | "unconfigured" | "error"
  message: string
  email?: string | null
}

export function PlatformAdminBootstrap() {
  const [state, setState] = useState<BootstrapState>(() => ({
    status: auth && db ? "checking" : "unconfigured",
    message: auth && db ? "Checking signed-in account..." : "Firebase Auth and Firestore need to be configured before platform admin can be claimed."
  }))

  useEffect(() => {
    if (!auth || !db) return

    const firestore = db

    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        setState({
          status: "signed-out",
          message: "Sign in with an approved platform administrator account."
        })
        return
      }

      if ((user.email ?? "").toLowerCase() !== bootstrapAdminEmail) {
        setState({
          status: "wrong-user",
          email: user.email,
          message: "This signed-in account is not the bootstrap administrator."
        })
        return
      }

      setState({
        status: "syncing",
        email: user.email,
        message: "Administrator access is active for this approved account. Refreshing the platform admin record..."
      })

      void setDoc(
        doc(firestore, "platformAdmins", user.uid),
        {
          uid: user.uid,
          email: user.email,
          role: "platformAdmin",
          status: "Active",
          permissions: ["platform.admin"],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      )
        .then(() => {
          setState({
            status: "claimed",
            email: user.email,
            message: "Platform administrator access is active for this account."
          })
        })
        .catch((error) => {
          setState({
            status: "error",
            email: user.email,
            message: error instanceof Error ? error.message : "Could not refresh platform administrator access."
          })
        })
    })
  }, [])

  const badge = useMemo(() => {
    if (state.status === "claimed") return "Claimed"
    if (state.status === "syncing") return "Syncing"
    if (state.status === "checking") return "Working"
    return "Needs sign-in"
  }, [state.status])

  return (
    <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
            {state.status === "claimed" ? <CheckCircle2 className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--app-text)]">Bootstrap administrator</p>
            <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">{state.message}</p>
            <p className="mt-1 text-xs font-semibold text-[var(--app-subtle)]">Allowed account: {bootstrapAdminEmail}</p>
          </div>
        </div>
        <span className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] px-2 py-1 text-xs font-semibold text-[var(--app-muted)]">
          {badge}
        </span>
      </div>

      <p className="mt-4 text-xs leading-5 text-[var(--app-muted)]">
        This is not a normal employee permission. Approved platform administrators are controlled by InvenTracker, and the current approved account is {bootstrapAdminEmail}.
      </p>
    </div>
  )
}
