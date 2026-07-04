"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowRight, X } from "lucide-react"

import { CreateAccountWizard } from "@/components/create-account-wizard"
import { SignInPanel } from "@/components/sign-in-panel"
import { useAuthSession } from "@/lib/auth-session"

type AuthMode = "signin" | "create" | null

function AuthModal({
  mode,
  onClose,
  onSwitchMode
}: {
  mode: Exclude<AuthMode, null>
  onClose: () => void
  onSwitchMode: (mode: Exclude<AuthMode, null>) => void
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 py-6 text-[var(--app-text)] backdrop-blur-md">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-panel border border-white/15 bg-[var(--app-bg)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--app-border)] bg-[var(--app-panel-strong)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--app-text)]">{mode === "signin" ? "Sign in" : "Create an account"}</p>
            <p className="app-tip mt-1 text-xs text-[var(--app-muted)]">
              {mode === "signin" ? "Access your organization workspace." : "Build your organization setup one step at a time."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] text-[var(--app-muted)] transition hover:bg-[var(--app-control-bg-hover)] hover:text-[var(--app-text)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {mode === "signin" ? (
            <div className="mx-auto max-w-xl">
              <SignInPanel showCreateAccount={false} redirectAfterSignIn />
              <button type="button" onClick={() => onSwitchMode("create")} className="mt-4 text-sm font-semibold text-[var(--app-accent)]">
                Need a new organization account?
              </button>
            </div>
          ) : (
            <CreateAccountWizard initiallyOpen onCollapse={onClose} showHeaderAction={false} />
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export function HomeAuthActions({ variant = "header" }: { variant?: "header" | "hero" | "final" }) {
  const session = useAuthSession()
  const [mode, setMode] = useState<AuthMode>(null)
  const createLabel = variant === "header" ? "Create account" : "Create an account"

  useEffect(() => {
    if (mode === "signin" && session.status === "ready") {
      window.location.assign("/dashboard")
    }
  }, [mode, session.status])

  function openSignInOrDashboard() {
    if (session.status === "ready") {
      window.location.assign("/dashboard")
      return
    }

    setMode("signin")
  }

  if (variant === "hero") {
    return (
      <>
        <button
          type="button"
          onClick={() => setMode("create")}
          className="inline-flex min-h-12 items-center gap-2 rounded-md bg-[#2563eb] px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#1d4ed8]"
        >
          {createLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
        {mode ? <AuthModal mode={mode} onClose={() => setMode(null)} onSwitchMode={setMode} /> : null}
      </>
    )
  }

  if (variant === "final") {
    return (
      <>
        <button
          type="button"
          onClick={() => setMode("create")}
          className="inline-flex min-h-12 items-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-[#0f172a] transition hover:-translate-y-0.5 hover:bg-[#dbeafe]"
        >
          {createLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
        {mode ? <AuthModal mode={mode} onClose={() => setMode(null)} onSwitchMode={setMode} /> : null}
      </>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("create")}
          className="rounded-md border border-white/15 bg-white/8 px-3 py-2 text-sm font-semibold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/12 sm:px-4"
        >
          {createLabel}
        </button>
        <button
          type="button"
          onClick={openSignInOrDashboard}
          className="rounded-md border border-white/15 bg-white px-4 py-2 text-sm font-semibold text-[#0f172a] transition hover:-translate-y-0.5 hover:bg-[#dbeafe]"
        >
          Sign in
        </button>
      </div>
      {mode ? <AuthModal mode={mode} onClose={() => setMode(null)} onSwitchMode={setMode} /> : null}
    </>
  )
}
