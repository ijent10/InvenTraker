"use client"

import { useEffect, useState } from "react"
import { signInWithEmailAndPassword } from "firebase/auth"
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react"

import { Panel } from "@/components/ui"
import { auth } from "@/lib/firebase"

type FinalizerState = {
  status: "idle" | "working" | "done" | "error"
  message: string
}

type PendingSignup = {
  signup: unknown
  password: string
}

const storageKey = "inventracker.signup.pending"

export function SignupFinalizer() {
  const [state, setState] = useState<FinalizerState>({ status: "idle", message: "" })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const signupStatus = params.get("signup")
    const checkoutSessionId = params.get("session_id")
    if (signupStatus !== "success") return

    async function finalize() {
      setState({ status: "working", message: "Activating your account from the Stripe checkout..." })

      try {
        const rawPendingSignup = window.sessionStorage.getItem(storageKey)
        if (!rawPendingSignup) {
          throw new Error("Signup details were not found in this browser. Start the signup again or contact support with the Stripe checkout session.")
        }

        const pendingSignup = JSON.parse(rawPendingSignup) as PendingSignup
        if (!checkoutSessionId) throw new Error("Stripe did not return a checkout session id.")

        const response = await fetch("/api/signup/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkoutSessionId,
            signup: pendingSignup.signup,
            password: pendingSignup.password
          })
        })
        const result = (await response.json().catch(() => null)) as { email?: string; error?: string } | null
        if (!response.ok || !result?.email) throw new Error(result?.error ?? "Could not activate account.")

        if (auth) {
          await signInWithEmailAndPassword(auth, result.email, pendingSignup.password)
        }

        window.sessionStorage.removeItem(storageKey)
        setState({ status: "done", message: "Account activated. Taking you to the dashboard..." })
        window.location.assign("/dashboard")
      } catch (error) {
        setState({ status: "error", message: error instanceof Error ? error.message : "Could not activate account." })
      }
    }

    void finalize()
  }, [])

  if (state.status === "idle") return null

  const Icon = state.status === "done" ? CheckCircle2 : state.status === "error" ? ShieldAlert : Loader2

  return (
    <Panel className="mx-auto mb-5 max-w-5xl p-4">
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 ${state.status === "working" ? "animate-spin text-[var(--app-accent)]" : state.status === "done" ? "text-emerald-300" : "text-rose-300"}`} />
        <div>
          <p className="font-semibold text-[var(--app-text)]">{state.status === "error" ? "Activation needs attention" : "Account activation"}</p>
          <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">{state.message}</p>
        </div>
      </div>
    </Panel>
  )
}

export function rememberPendingSignup(pendingSignup: PendingSignup) {
  window.sessionStorage.setItem(storageKey, JSON.stringify(pendingSignup))
}
