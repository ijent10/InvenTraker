"use client"

import { useState } from "react"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"

import { Button } from "@/components/ui"

export function PendingAutofillActions({ batchId }: { batchId: string }) {
  const [isReviewing, setIsReviewing] = useState<"approve" | "reject" | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function review(action: "approve" | "reject") {
    setIsReviewing(action)
    setMessage(null)

    try {
      const response = await fetch("/api/ai/autofill/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, action })
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? "Review failed.")
      }

      setMessage(payload.message ?? "Review saved.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review failed.")
    } finally {
      setIsReviewing(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => review("reject")}
          disabled={isReviewing !== null}
          icon={isReviewing === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
        >
          Reject
        </Button>
        <Button
          onClick={() => review("approve")}
          disabled={isReviewing !== null}
          icon={isReviewing === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        >
          Approve verified fields
        </Button>
      </div>
      {message ? <p className="mt-2 max-w-md text-xs leading-5 text-slate-400">{message}</p> : null}
    </div>
  )
}
