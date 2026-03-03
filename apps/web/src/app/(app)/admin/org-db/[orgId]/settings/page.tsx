"use client"

import { useQuery } from "@tanstack/react-query"
import { AppCard } from "@inventracker/ui"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchAdminOrganizationDetailDirect } from "@/lib/data/firestore"
import { adminGetOrganizationDetail } from "@/lib/firebase/functions"

export default function AdminOrganizationSettingsPage({ params }: { params: { orgId: string } }) {
  const { canViewAdmin, loading } = useOrgContext()
  const { data } = useQuery({
    queryKey: ["admin-org-db-settings", params.orgId],
    queryFn: async () => {
      try {
        return await adminGetOrganizationDetail({ orgId: params.orgId })
      } catch {
        return await fetchAdminOrganizationDetailDirect(params.orgId)
      }
    },
    enabled: canViewAdmin
  })

  const orgData = (data?.organization ?? {}) as Record<string, unknown>
  const settings = ((data as Record<string, unknown> | undefined)?.organizationSettings ??
    {}) as Record<string, unknown>

  if (loading) {
    return (
      <div>
        <PageHead title="Organization Settings" subtitle="Loading access..." />
        <AppCard>
          <p className="secondary-text">Checking admin permissions.</p>
        </AppCard>
      </div>
    )
  }

  if (!canViewAdmin) {
    return (
      <div>
        <PageHead title="Organization Settings" subtitle="Platform Admin only." />
        <AppCard>
          <p className="secondary-text">Access denied.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead
        title="Organization Settings"
        subtitle={`Settings for ${String(orgData.name ?? params.orgId)}`}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <AppCard>
          <h2 className="card-title">Organization Details</h2>
          <div className="mt-3 space-y-2 text-sm">
            <p>Name: {String(orgData.name ?? "—")}</p>
            <p>Status: {String(orgData.status ?? "—")}</p>
            <p>Plan: {String(orgData.planId ?? "—")}</p>
            <p>Created: {String(orgData.createdAt ?? "—")}</p>
          </div>
        </AppCard>
        <AppCard>
          <h2 className="card-title">Policy Snapshot</h2>
          <pre className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-app-border bg-app-surface p-3 text-xs">
            {JSON.stringify(settings, null, 2)}
          </pre>
        </AppCard>
      </div>
    </div>
  )
}
