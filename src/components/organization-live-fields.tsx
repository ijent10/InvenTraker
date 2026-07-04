"use client"

import { useEffect } from "react"
import { doc, onSnapshot } from "firebase/firestore"

import { useAuthSession } from "@/lib/auth-session"
import { db } from "@/lib/firebase"

function setFieldValue(name: string, value: unknown) {
  if (typeof value !== "string") return

  const field = document.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`)
  if (!field || document.activeElement === field || field.value === value) return

  field.value = value
  field.dispatchEvent(new Event("input", { bubbles: true }))
  field.dispatchEvent(new Event("change", { bubbles: true }))
}

export function OrganizationLiveFields() {
  const session = useAuthSession()

  useEffect(() => {
    if (!db || !session.orgId) return undefined

    return onSnapshot(doc(db, "orgs", session.orgId), (snapshot) => {
      if (!snapshot.exists()) return

      const data = snapshot.data()
      const companyName = data.companyName ?? data.organizationName ?? data.name

      setFieldValue("organizationName", companyName)
      setFieldValue("companyDisplayName", companyName)
      setFieldValue("logoUrl", data.logoUrl)
      setFieldValue("headerText", data.headerText ?? "")
      setFieldValue("primaryAccent", data.accentColor)
      setFieldValue("secondaryAccent", data.secondaryColor)
      setFieldValue("defaultTheme", data.defaultTheme)
      setFieldValue("defaultMode", data.defaultMode)
      setFieldValue("primaryTimezone", data.primaryTimezone)
      setFieldValue("defaultUnit", data.defaultUnit)
      setFieldValue("expirationDefault", data.expirationDefault)
    })
  }, [session.orgId])

  return null
}
