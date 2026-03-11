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
import { claimOrganizationByCompanyCode } from "@/lib/firebase/functions"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  companyCode: z.string().optional(),
  employeeId: z.string().optional()
})

type Input = z.infer<typeof schema>

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
        return "Network issue while contacting authentication service."
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
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, values.email.toLowerCase(), values.password)
        document.cookie = "it_session=1; path=/; max-age=2592000; samesite=lax"
        router.replace("/app")
        return
      }

      const credential = await createUserWithEmailAndPassword(auth, values.email.toLowerCase(), values.password)
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
      setSubmitError(mapAuthError(error))
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
