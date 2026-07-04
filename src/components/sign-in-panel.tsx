"use client"

import { useState } from "react"
import Link from "next/link"
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth"
import { ArrowRight, KeyRound, Loader2, UserPlus } from "lucide-react"

import { BetaOwnerActivation } from "@/components/beta-owner-activation"
import { Button, Field, Panel, StatusPill, TextInput } from "@/components/ui"
import { auth, db, firebaseConfigured } from "@/lib/firebase"
import { useAuthSession } from "@/lib/auth-session"

function authErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""
  const message = typeof error === "object" && error && "message" in error ? String(error.message) : "Firebase request failed."

  if (code.includes("auth/invalid-credential")) return "Firebase did not accept that email/password."
  if (code.includes("auth/network-request-failed")) return "Network issue while contacting Firebase Authentication."

  return message
}

export function SignInPanel({
  compact = false,
  onCreateAccount,
  showCreateAccount = true,
  redirectAfterSignIn = false
}: {
  compact?: boolean
  onCreateAccount?: () => void
  showCreateAccount?: boolean
  redirectAfterSignIn?: boolean
}) {
  const session = useAuthSession()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState<"signin" | "signout" | "reset" | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const handleCreateAccount = onCreateAccount ?? (() => window.location.assign("/signin?create=1"))

  async function run(kind: typeof busy, action: () => Promise<void>) {
    setBusy(kind)
    setMessage("")
    setError("")

    try {
      await action()
    } catch (caughtError) {
      setError(authErrorMessage(caughtError))
    } finally {
      setBusy(null)
    }
  }

  const configured = Boolean(firebaseConfigured && auth && db)
  const signedIn = Boolean(session.user)

  return (
    <Panel className={compact ? "p-4" : "mx-auto max-w-xl p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--app-text)]">Sign in</h2>
          <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">
            Use the email and password attached to your organization account.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={configured ? "green" : "red"}>{configured ? "Firebase configured" : "Missing Firebase config"}</StatusPill>
          <StatusPill tone={signedIn ? "blue" : "neutral"}>{signedIn ? "Signed in" : "Signed out"}</StatusPill>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <Field label="Email">
          <TextInput value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="name@example.com" autoComplete="email" />
        </Field>
        <Field label="Password">
          <TextInput
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="Password"
            autoComplete={signedIn ? "current-password" : "new-password"}
          />
        </Field>
      </div>

      {session.member ? (
        <div className="mt-4 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3 text-sm text-[var(--app-muted)]">
          Signed in as <span className="font-semibold text-[var(--app-text)]">{session.member.name}</span> with{" "}
          <span className="font-semibold text-[var(--app-text)]">{session.member.permissions.includes("*") ? "owner" : session.member.permissions.length}</span>{" "}
          permission{session.member.permissions.length === 1 ? "" : "s"}.
        </div>
      ) : null}

      {session.status === "no-member" ? (
        <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-200">
          This Firebase account is signed in, but it does not have a member record at <span className="font-semibold">orgs/{session.orgId}/members/{session.user?.uid}</span>.
          Ask an organization owner to add this user or seed a test user.
          <BetaOwnerActivation />
        </div>
      ) : null}

      <div className={`mt-5 grid gap-2 ${showCreateAccount ? "sm:grid-cols-2" : ""}`}>
        <Button
          className="w-full"
          disabled={!configured || busy !== null || !email.trim() || !password}
          onClick={() =>
            void run("signin", async () => {
              if (!auth) throw new Error("Firebase Auth is not configured.")
              const credential = await signInWithEmailAndPassword(auth, email.trim(), password)
              setMessage(`Signed in as ${credential.user.email}.`)
              if (redirectAfterSignIn) {
                window.location.assign("/dashboard")
              }
            })
          }
          icon={busy === "signin" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        >
          Sign in
        </Button>
        {showCreateAccount ? (
          <Button
            variant="secondary"
            className="w-full"
            onClick={handleCreateAccount}
            icon={<UserPlus className="h-4 w-4" />}
          >
            Create account
          </Button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--app-accent)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!configured || busy !== null || !email.trim()}
          onClick={() =>
            void run("reset", async () => {
              if (!auth) throw new Error("Firebase Auth is not configured.")
              await sendPasswordResetEmail(auth, email.trim())
              setMessage("Password reset email sent. Check your inbox for the reset link.")
            })
          }
        >
          {busy === "reset" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Forgot password?
        </button>
        {signedIn ? (
          <Button
            variant="ghost"
            disabled={busy !== null}
            onClick={() =>
              void run("signout", async () => {
                await session.signOut()
                setMessage("Signed out.")
              })
            }
          >
            Sign out
          </Button>
        ) : null}
      </div>

      {signedIn && session.status === "ready" ? (
        <Link href="/dashboard" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--app-accent)]">
          Continue to dashboard
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
      {message ? <p className="mt-4 text-sm font-semibold text-emerald-300">{message}</p> : null}
      {error ? <p className="mt-4 text-sm font-semibold text-rose-300">{error}</p> : null}
    </Panel>
  )
}
