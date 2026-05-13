"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { FirebaseError } from "firebase/app"
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword
} from "firebase/auth"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { AppButton, AppInput } from "@inventracker/ui"

import { auth, firebaseReady } from "@/lib/firebase/client"
import { env } from "@/lib/env"
import { claimOrganizationByCompanyCode } from "@/lib/firebase/functions"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  companyCode: z.string().optional(),
  employeeId: z.string().optional()
})

type Input = z.infer<typeof schema>
const authApiKey = env.success ? env.data.NEXT_PUBLIC_FIREBASE_API_KEY : ""
const AUTH_OP_TIMEOUT_MS = 10_000
const DIAGNOSTIC_TIMEOUT_MS = 6_500

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out.`))
    }, timeoutMs)
    void promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      }
    )
  })
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

async function runAuthEndpointDiagnostic(emailForSignIn?: string, passwordForSignIn?: string): Promise<string> {
  if (!authApiKey) return "Auth diagnostic unavailable: missing Firebase API key."
  if (typeof window === "undefined") return "Auth diagnostic unavailable outside browser."

  const checkCreateAuthUri = async () => {
    try {
      const response = await fetchWithTimeout(
        `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${encodeURIComponent(authApiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            identifier: "diagnostic@inventraker.com",
            continueUri: window.location.origin
          })
        },
        DIAGNOSTIC_TIMEOUT_MS
      )
      const raw = await response.text()
      if (response.ok) return `createAuthUri: reachable (${response.status})`
      const hint = raw.slice(0, 160).replace(/\s+/g, " ").trim()
      return `createAuthUri: failed (${response.status}) ${hint}`
    } catch (error) {
      return `createAuthUri: fetch failed (${error instanceof Error ? error.message : "unknown"})`
    }
  }

  const checkSignInWithPassword = async () => {
    try {
      const diagnosticEmail = (emailForSignIn ?? "diagnostic@inventraker.com").trim().toLowerCase()
      const diagnosticPassword = passwordForSignIn ?? "diagnostic-password"
      const response = await fetchWithTimeout(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(authApiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: diagnosticEmail,
            password: diagnosticPassword,
            returnSecureToken: true
          })
        },
        DIAGNOSTIC_TIMEOUT_MS
      )
      const raw = await response.text()
      if (response.ok) return `signInWithPassword: valid credentials (${response.status})`
      const expectedCredentialError =
        response.status === 400 &&
        /INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|INVALID_PASSWORD|INVALID_EMAIL/i.test(raw)
      if (expectedCredentialError) return `signInWithPassword: invalid credentials (${response.status})`
      const hint = raw.slice(0, 200).replace(/\s+/g, " ").trim()
      return `signInWithPassword: failed (${response.status}) ${hint}`
    } catch (error) {
      return `signInWithPassword: fetch failed (${error instanceof Error ? error.message : "unknown"})`
    }
  }

  const checkSecureToken = async () => {
    try {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: "diagnostic-refresh-token"
      })
      const response = await fetchWithTimeout(
        `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(authApiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: body.toString()
        },
        DIAGNOSTIC_TIMEOUT_MS
      )
      const raw = await response.text()
      if (response.ok) return `securetoken: reachable (${response.status})`
      const expectedRefreshError = response.status === 400 && /INVALID_REFRESH_TOKEN|INVALID_GRANT_TYPE/i.test(raw)
      if (expectedRefreshError) return `securetoken: reachable (${response.status}, expected invalid refresh token)`
      const hint = raw.slice(0, 220).replace(/\s+/g, " ").trim()
      return `securetoken: failed (${response.status}) ${hint}`
    } catch (error) {
      return `securetoken: fetch failed (${error instanceof Error ? error.message : "unknown"})`
    }
  }

  const [createAuthUriResult, signInWithPasswordResult, secureTokenResult] = await Promise.all([
    checkCreateAuthUri(),
    checkSignInWithPassword(),
    checkSecureToken()
  ])

  return `${createAuthUriResult}; ${signInWithPasswordResult}; ${secureTokenResult}`
}

function mapAuthError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "Email or password is incorrect."
      case "auth/invalid-email":
        return "Email address looks invalid."
      case "auth/too-many-requests":
        return "Too many attempts. Please wait a minute and try again."
      case "auth/network-request-failed":
        return "Could not reach Firebase Authentication. Check connection, disable VPN/content blockers, and confirm this domain is listed under Firebase Auth authorized domains."
      case "auth/invalid-api-key":
      case "auth/app-not-authorized":
        return "Authentication configuration is not valid for this domain. Confirm the Firebase web app config and authorized domains."
      case "auth/email-already-in-use":
        return "That email is already in use."
      default:
        return error.message || "Authentication failed."
    }
  }
  const message = String((error as { message?: string } | undefined)?.message ?? "")
  return message || "Something went wrong while signing in."
}

export function AuthCard({ mode }: { mode: "signin" | "signup" }) {
  const router = useRouter()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [signupMethod, setSignupMethod] = useState<"email" | "company">("email")
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting }
  } = useForm<Input>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: "",
      companyCode: "",
      employeeId: ""
    }
  })

  const onSubmit = async (values: Input) => {
    setSubmitError(null)
    setStatusMessage(null)
    if (!firebaseReady || !auth) {
      setSubmitError("Authentication is temporarily unavailable. Please refresh and try again.")
      return
    }

    try {
      const normalizedEmail = values.email.trim().toLowerCase()
      if (mode === "signin") {
        if (typeof (auth as { authStateReady?: unknown }).authStateReady === "function") {
          await withTimeout(
            (auth as { authStateReady: () => Promise<void> }).authStateReady(),
            AUTH_OP_TIMEOUT_MS,
            "Auth state readiness"
          )
        }
        await withTimeout(
          signInWithEmailAndPassword(auth, normalizedEmail, values.password),
          AUTH_OP_TIMEOUT_MS,
          "Sign-in request"
        )
        document.cookie = "it_session=1; path=/; max-age=2592000; samesite=lax"
        router.replace("/app")
        return
      }

      const credential = await withTimeout(
        createUserWithEmailAndPassword(auth, normalizedEmail, values.password),
        AUTH_OP_TIMEOUT_MS,
        "Sign-up request"
      )
      if (signupMethod === "company") {
        const companyCode = values.companyCode?.trim().toUpperCase() ?? ""
        const employeeId = values.employeeId?.trim() ?? ""
        if (!companyCode || !employeeId) {
          throw new Error("Company code and employee ID are required for this signup option.")
        }
        try {
          await claimOrganizationByCompanyCode({ companyCode, employeeId })
        } catch (error) {
          await credential.user.delete().catch(() => undefined)
          throw error
        }
      }
      document.cookie = "it_session=1; path=/; max-age=2592000; samesite=lax"
      router.replace("/app")
    } catch (error) {
      const mappedMessage = mapAuthError(error)
      if (error instanceof FirebaseError) {
        if (error.code === "auth/network-request-failed") {
          const normalizedEmail = values.email.trim().toLowerCase()
          // One immediate retry after auth state settles helps with occasional browser race conditions.
          try {
            if (typeof (auth as { authStateReady?: unknown }).authStateReady === "function") {
              await withTimeout(
                (auth as { authStateReady: () => Promise<void> }).authStateReady(),
                AUTH_OP_TIMEOUT_MS,
                "Auth state readiness"
              )
            }
            await new Promise((resolve) => window.setTimeout(resolve, 150))
            await withTimeout(
              signInWithEmailAndPassword(auth, normalizedEmail, values.password),
              AUTH_OP_TIMEOUT_MS,
              "Retry sign-in request"
            )
            document.cookie = "it_session=1; path=/; max-age=2592000; samesite=lax"
            router.replace("/app")
            return
          } catch {
            // Continue to detailed diagnostic below.
          }

          let diagnostic = ""
          try {
            diagnostic = await runAuthEndpointDiagnostic(normalizedEmail, values.password)
          } catch (diagnosticError) {
            diagnostic = `Auth endpoint check threw: ${
              diagnosticError instanceof Error ? diagnosticError.message : "Unknown diagnostic error."
            }`
          }
          const host = typeof window !== "undefined" ? window.location.host : "unknown-host"
          setSubmitError(`${mappedMessage} [${error.code}] Host: ${host}. ${diagnostic}`)
          return
        }

        const details =
          typeof error.message === "string" && error.message.trim().length > 0
            ? ` (${error.code}: ${error.message})`
            : ` (${error.code})`
        setSubmitError(mappedMessage + details)
        return
      }

      if (error instanceof Error && /timed out/i.test(error.message)) {
        setSubmitError("Sign-in timed out. Please try again.")
        return
      }

      setSubmitError(mappedMessage)
    }
  }

  const sendResetEmail = async () => {
    setSubmitError(null)
    setStatusMessage(null)
    if (!firebaseReady || !auth) {
      setSubmitError("Password reset is temporarily unavailable. Please refresh and try again.")
      return
    }

    const emailValue = getValues("email")?.trim().toLowerCase()
    if (!emailValue) {
      setSubmitError("Enter your email first, then click Forgot password.")
      return
    }

    try {
      await sendPasswordResetEmail(auth, emailValue)
      setStatusMessage(`Password reset email sent to ${emailValue}.`)
    } catch (error) {
      setSubmitError(mapAuthError(error))
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-card border border-app-border bg-app-surface p-6 shadow-card">
      <h1 className="page-title mb-2">{mode === "signin" ? "Sign in" : "Create account"}</h1>
      <p className="secondary-text mb-6">Use your InvenTraker credentials to continue.</p>

      {mode === "signup" ? (
        <div className="mb-4 rounded-2xl border border-app-border p-1">
          <div className="grid grid-cols-2 gap-1">
            <AppButton
              type="button"
              variant={signupMethod === "email" ? "primary" : "secondary"}
              className="h-10 rounded-xl"
              onClick={() => setSignupMethod("email")}
            >
              Sign up with email
            </AppButton>
            <AppButton
              type="button"
              variant={signupMethod === "company" ? "primary" : "secondary"}
              className="h-10 rounded-xl"
              onClick={() => setSignupMethod("company")}
            >
              Use company code
            </AppButton>
          </div>
        </div>
      ) : null}

      <noscript>
        <p className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          JavaScript is required for secure sign-in. Please enable JavaScript and refresh.
        </p>
      </noscript>

      <form className="space-y-4" method="post" onSubmit={handleSubmit(onSubmit)}>
        <label className="block text-sm font-semibold">
          Email
          <AppInput className="mt-2" {...register("email")} />
          {errors.email ? <span className="mt-1 block text-xs text-red-400">{errors.email.message}</span> : null}
        </label>

        <label className="block text-sm font-semibold">
          Password
          <AppInput
            type="password"
            className="mt-2"
            {...register("password")}
          />
          {errors.password ? (
            <span className="mt-1 block text-xs text-red-400">{errors.password.message}</span>
          ) : null}
        </label>

        {mode === "signup" && signupMethod === "company" ? (
          <>
            <label className="block text-sm font-semibold">
              Company code
              <AppInput className="mt-2 uppercase" {...register("companyCode")} />
            </label>
            <label className="block text-sm font-semibold">
              Employee ID
              <AppInput className="mt-2" {...register("employeeId")} />
            </label>
          </>
        ) : null}

        <AppButton className="w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
        </AppButton>
        {mode === "signin" ? (
          <AppButton
            type="button"
            variant="ghost"
            className="w-full text-center text-sm !text-blue-300 transition hover:!text-blue-200"
            onClick={sendResetEmail}
          >
            Forgot password?
          </AppButton>
        ) : null}
        {statusMessage ? <p className="text-sm text-emerald-300">{statusMessage}</p> : null}
        {submitError ? <p className="text-sm text-red-400">{submitError}</p> : null}
      </form>
    </div>
  )
}
