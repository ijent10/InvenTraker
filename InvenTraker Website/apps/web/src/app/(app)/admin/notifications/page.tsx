"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AppButton, AppCard, AppCheckbox, AppInput, AppSelect, AppTextarea } from "@inventracker/ui"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchAdminOrganizationsDirect } from "@/lib/data/firestore"
import { sendPlatformNotification } from "@/lib/firebase/functions"

export default function AdminNotificationsPage() {
  const { canViewAdmin } = useOrgContext()
  const { data: orgs = [] } = useQuery({
    queryKey: ["admin-orgs-for-platform-notification"],
    queryFn: fetchAdminOrganizationsDirect,
    enabled: canViewAdmin
  })

  const [selectedOrgId, setSelectedOrgId] = useState("all")
  const [name, setName] = useState("")
  const [content, setContent] = useState("")
  const [includeEmployees, setIncludeEmployees] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedOrg = useMemo(
    () => orgs.find((org) => org.id === selectedOrgId),
    [orgs, selectedOrgId]
  )

  const send = async () => {
    setMessage(null)
    setError(null)
    if (!name.trim() || !content.trim()) {
      setError("Name and content are required.")
      return
    }
    try {
      const result = await sendPlatformNotification({
        orgId: selectedOrgId === "all" ? undefined : selectedOrgId,
        name,
        content,
        includeEmployees
      })
      if (!result?.ok) {
        setError("Notification send failed.")
        return
      }
      setMessage(`Sent to ${result.organizationsNotified} organization(s). Push sent: ${result.pushSent}, failed: ${result.pushFailed}.`)
      setName("")
      setContent("")
      setIncludeEmployees(false)
      setSelectedOrgId("all")
    } catch (sendError) {
      const raw = String((sendError as { message?: string } | undefined)?.message ?? "")
      setError(raw || "Notification send failed.")
    }
  }

  if (!canViewAdmin) {
    return (
      <div>
        <PageHead title="Admin Notifications" subtitle="Platform Admin only." />
        <AppCard>
          <p className="secondary-text">Access denied.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead title="Admin Notifications" subtitle="Send to owners only, or include employees." />
      <AppCard>
        <div className="grid gap-3">
          <label className="text-sm font-semibold">Organization target</label>
          <AppSelect value={selectedOrgId} onChange={(event) => setSelectedOrgId(event.target.value)}>
            <option value="all">All organizations</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {String(org.name ?? org.id)}
              </option>
            ))}
          </AppSelect>
          {selectedOrg ? (
            <p className="text-xs text-app-muted">Selected: {String(selectedOrg.name ?? selectedOrg.id)}</p>
          ) : null}
          <AppInput placeholder="Notification title" value={name} onChange={(event) => setName(event.target.value)} />
          <AppTextarea placeholder="Notification content" value={content} onChange={(event) => setContent(event.target.value)} />
          <AppCheckbox
            checked={includeEmployees}
            onChange={(event) => setIncludeEmployees(event.target.checked)}
            label="Include employees (Manager + Staff). Off = Owners only."
          />
          <div className="flex gap-2">
            <AppButton onClick={() => void send()}>Send notification</AppButton>
          </div>
        </div>
      </AppCard>
      {message ? <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
    </div>
  )
}
