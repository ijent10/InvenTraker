"use client"

import { usePathname } from "next/navigation"
import { useState, type MouseEvent, type ReactNode } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

import { Button } from "@/components/ui"
import { writeFormSnapshot } from "@/lib/cloud-records"

function actionText(children: ReactNode, fallback: string): string {
  if (typeof children === "string" || typeof children === "number") return String(children)
  if (Array.isArray(children)) return children.map((child) => actionText(child, "")).join(" ").trim() || fallback
  return fallback
}

export function ActionButton({
  children,
  doneLabel = "Saved",
  icon,
  variant = "primary",
  className = "",
  onAction,
  persistFallback = true
}: {
  children: ReactNode
  doneLabel?: string
  icon?: ReactNode
  variant?: "primary" | "secondary" | "ghost"
  className?: string
  onAction?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<void>
  persistFallback?: boolean
}) {
  const pathname = usePathname()
  const [state, setState] = useState<"idle" | "busy" | "done">("idle")
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")

  async function runAction(event: MouseEvent<HTMLButtonElement>) {
    setState("busy")
    setSuccess("")
    setError("")

    try {
      if (onAction) {
        await onAction(event)
      } else if (persistFallback) {
        await writeFormSnapshot({
          actionLabel: actionText(children, doneLabel),
          form: event.currentTarget.closest("form"),
          pathname
        })
      }
      setState("done")
      setSuccess(doneLabel)
      window.setTimeout(() => setState("idle"), 1800)
      window.setTimeout(() => setSuccess(""), 4200)
    } catch (caughtError) {
      setState("idle")
      setError(caughtError instanceof Error ? caughtError.message : "Action failed.")
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant={variant}
        className={className}
        onClick={runAction}
        disabled={state === "busy"}
        icon={state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "done" ? <CheckCircle2 className="h-4 w-4" /> : icon}
      >
        {state === "done" ? doneLabel : children}
      </Button>
      {success ? <span className="max-w-xs text-xs font-semibold leading-5 text-emerald-300">{success}</span> : null}
      {error ? <span className="max-w-xs text-xs font-semibold leading-5 text-rose-300">{error}</span> : null}
    </span>
  )
}
