"use client"

import { useState } from "react"
import { doc, serverTimestamp, setDoc } from "firebase/firestore"
import { CheckCircle2, Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui"
import { useAuthSession } from "@/lib/auth-session"
import { db } from "@/lib/firebase"

function fieldValue(name: string) {
  if (typeof document === "undefined") return ""
  const field = document.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`)
  return field?.value.trim() ?? ""
}

export function OrganizationSaveButton() {
  const session = useAuthSession()
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle")
  const [error, setError] = useState("")

  async function saveOrganization() {
    if (!db) {
      setError("Firebase is not configured, so organization branding cannot sync yet.")
      return
    }

    if (!session.user) {
      setError("Sign in before saving organization branding.")
      return
    }

    setState("saving")
    setError("")

    try {
      const organizationName = fieldValue("organizationName")
      const companyDisplayName = fieldValue("companyDisplayName")
      const companyName = companyDisplayName || organizationName || "InvenTracker Workspace"
      const logoUrl = fieldValue("logoUrl") || "/inventracker-mark.svg"
      const headerText = fieldValue("headerText")

      await setDoc(
        doc(db, "orgs", session.orgId),
        {
          companyName,
          logoUrl,
          headerText,
          accentColor: fieldValue("primaryAccent") || "#2563eb",
          secondaryColor: fieldValue("secondaryAccent") || "#14b8a6",
          defaultTheme: fieldValue("defaultTheme") || "Blue steel",
          defaultMode: fieldValue("defaultMode") || "Dark",
          primaryTimezone: fieldValue("primaryTimezone") || "America/New_York",
          defaultUnit: fieldValue("defaultUnit") || "eaches",
          expirationDefault: fieldValue("expirationDefault") || "No expiration",
          updatedAt: serverTimestamp(),
          updatedBy: session.user.uid
        },
        { merge: true }
      )

      setState("saved")
      window.setTimeout(() => setState("idle"), 1800)
    } catch (caughtError) {
      setState("idle")
      setError(caughtError instanceof Error ? caughtError.message : "Organization branding could not be saved.")
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        onClick={() => void saveOrganization()}
        disabled={state === "saving"}
        icon={state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "saved" ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
      >
        {state === "saved" ? "Organization saved" : "Save organization"}
      </Button>
      {error ? <span className="max-w-xs text-xs font-semibold leading-5 text-rose-300">{error}</span> : null}
    </span>
  )
}
