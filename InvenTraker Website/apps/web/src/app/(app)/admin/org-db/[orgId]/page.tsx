"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { AppCard, appButtonClass } from "@inventracker/ui"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchAdminOrganizationDetailDirect } from "@/lib/data/firestore"
import { adminGetOrganizationDetail } from "@/lib/firebase/functions"

type OrganizationDetail = {
  organization?: { id: string; name?: string; status?: string; createdAt?: unknown; planId?: string }
  items?: Array<Record<string, unknown>>
  members?: Array<Record<string, unknown>>
}

export default function AdminOrganizationDetailCardPage({ params }: { params: { orgId: string } }) {
  const { canViewAdmin, loading } = useOrgContext()
  const { data } = useQuery({
    queryKey: ["admin-org-db-detail", params.orgId],
    queryFn: async () => {
      try {
        return await adminGetOrganizationDetail({ orgId: params.orgId })
      } catch {
        return await fetchAdminOrganizationDetailDirect(params.orgId)
      }
    },
    enabled: canViewAdmin
  })

  const detail = (data ?? {}) as OrganizationDetail
  const org = detail.organization
  const itemCount = detail.items?.length ?? 0
  const userCount = detail.members?.length ?? 0

  if (loading) {
    return (
      <div>
        <PageHead title="Organization Database" subtitle="Loading access..." />
        <AppCard>
          <p className="secondary-text">Checking admin permissions.</p>
        </AppCard>
      </div>
    )
  }

  if (!canViewAdmin) {
    return (
      <div>
        <PageHead title="Organization Database" subtitle="Platform Admin only." />
        <AppCard>
          <p className="secondary-text">Access denied.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead
        title={String(org?.name ?? "Organization")}
        subtitle={`Plan ${String(org?.planId ?? "n/a")} · ${itemCount} items · ${userCount} users`}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <AppCard>
          <h2 className="card-title">Stores</h2>
          <p className="secondary-text mt-2">Open this organization’s store list and drill into users, inventory, and settings.</p>
          <Link className={appButtonClass("primary", "mt-4")} href={`/admin/org-db/${params.orgId}/stores`}>
            Open Stores
          </Link>
        </AppCard>
        <AppCard>
          <h2 className="card-title">Settings</h2>
          <p className="secondary-text mt-2">View organization-level settings and policy defaults.</p>
          <Link className={appButtonClass("primary", "mt-4")} href={`/admin/org-db/${params.orgId}/settings`}>
            Open Settings
          </Link>
        </AppCard>
      </div>
    </div>
  )
}
