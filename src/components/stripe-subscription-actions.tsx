"use client"

import { useState } from "react"
import { CreditCard, Loader2 } from "lucide-react"

import { Button } from "@/components/ui"
import type { PlatformSubscription } from "@/lib/demo-data"

export function StripeSubscriptionActions({ subscription }: { subscription: PlatformSubscription }) {
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null)
  const [message, setMessage] = useState("")

  async function openStripe(action: "checkout" | "portal") {
    setBusy(action)
    setMessage("")

    try {
      const response = await fetch(`/api/stripe/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription)
      })
      const payload = (await response.json()) as { url?: string; error?: string }
      if (!response.ok || !payload.url) throw new Error(payload.error ?? "Stripe request failed.")
      window.location.href = payload.url
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Stripe request failed.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <span className="inline-flex flex-col gap-2">
      <span className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy !== null}
          icon={busy === "checkout" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          onClick={() => void openStripe("checkout")}
        >
          Stripe checkout
        </Button>
        <Button
          variant="ghost"
          disabled={busy !== null}
          icon={busy === "portal" ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          onClick={() => void openStripe("portal")}
        >
          Stripe portal
        </Button>
      </span>
      {message ? <span className="max-w-sm text-xs font-semibold leading-5 text-amber-300">{message}</span> : null}
    </span>
  )
}
