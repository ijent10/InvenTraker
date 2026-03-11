"use client"

import Link from "next/link"
import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AppCard, appButtonClass } from "@inventracker/ui"

import { getCheckoutSessionStatus } from "@/lib/firebase/functions"

function BillingSuccessContent() {
  const searchParams = useSearchParams()
  const orgId = (searchParams.get("orgId") ?? "").trim()
  const sessionId = (searchParams.get("session_id") ?? "").trim()
  const [statusMessage, setStatusMessage] = useState("Activating subscription…")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isComplete, setIsComplete] = useState(false)

  const canCheckSession = useMemo(() => orgId.length > 0 && sessionId.length > 0, [orgId, sessionId])

  useEffect(() => {
    if (!canCheckSession) {
      setErrorMessage("Missing checkout session ID. Please try billing again.")
      return
    }

    let cancelled = false
    let attempts = 0
    const maxAttempts = 15

    const poll = async () => {
      attempts += 1
      try {
        const status = await getCheckoutSessionStatus({ orgId, sessionId })
        if (cancelled || !status) return

        if (status.status === "complete" && (status.subscriptionStatus === "active" || status.subscriptionStatus === "trialing")) {
          setIsComplete(true)
          setErrorMessage(null)
          setStatusMessage(
            status.billingUpdated
              ? "Subscription is active. Your workspace is unlocked."
              : "Payment complete. Finalizing billing sync now."
          )
          return
        }

        if (status.status === "open") {
          setErrorMessage("Checkout is still open or was canceled. Please complete payment to continue.")
          return
        }

        setStatusMessage("Payment received. Finalizing subscription status…")

        if (attempts < maxAttempts) {
          setTimeout(() => void poll(), 1500)
          return
        }

        setErrorMessage("Billing sync is taking longer than expected. Open the app and refresh billing status.")
      } catch (error) {
        if (cancelled) return
        const message = String((error as { message?: string } | undefined)?.message ?? "").trim()
        setErrorMessage(message || "Could not verify checkout status.")
      }
    }

    void poll()
    return () => {
      cancelled = true
    }
  }, [canCheckSession, orgId, sessionId])

  return (
    <AppCard>
      <h1 className="page-title">Billing Confirmation</h1>
      <p className="secondary-text mt-3">{statusMessage}</p>

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/app" className={appButtonClass("primary")}>
          {isComplete ? "Open App" : "Go to App"}
        </Link>
        <Link href="/pricing" className={appButtonClass("secondary")}>
          View Pricing
        </Link>
      </div>
    </AppCard>
  )
}

export default function BillingSuccessPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <Suspense
        fallback={
          <AppCard>
            <h1 className="page-title">Activating subscription…</h1>
            <p className="secondary-text mt-3">Checking checkout session.</p>
          </AppCard>
        }
      >
        <BillingSuccessContent />
      </Suspense>
    </div>
  )
}

