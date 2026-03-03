"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { AppCard, appButtonClass } from "@inventracker/ui"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchAdminOrganizationsDirect } from "@/lib/data/firestore"
import { adminListOrganizations } from "@/lib/firebase/functions"

type AdminOrgRow = {
  id: string
  name?: string
  status?: string
  createdAt?: unknown
}

export default function AdminOrganizationDatabasePage() {
  const { user } = useAuthUser()
  const { canViewAdmin, loading, orgs } = useOrgContext()
  const { data: organizations = [] } = useQuery({
    queryKey: ["admin-org-db-list", user?.uid],
    queryFn: async () => {
      try {
        const response = await adminListOrganizations({ q: "", limit: 200 })
        return ((response?.organizations ?? []) as AdminOrgRow[]).sort((a, b) =>
          String(a.name ?? "").localeCompare(String(b.name ?? ""))
        )
      } catch {
        try {
          return await fetchAdminOrganizationsDirect()
        } catch {
          return orgs.map((org) => ({
            id: org.organizationId,
            name: org.organizationName,
            status: "active"
          }))
        }
      }
    },
    enabled: canViewAdmin
  })

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
      <PageHead title="Organization Database" subtitle="All organizations and their stores." />
      <div className="grid gap-4">
        {organizations.map((org) => (
          <AppCard key={org.id}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{String(org.name ?? "Organization")}</p>
                <p className="secondary-text">Status: {String(org.status ?? "active")}</p>
              </div>
              <Link className={appButtonClass("secondary")} href={`/admin/org-db/${org.id}`}>
                Open
              </Link>
            </div>
          </AppCard>
        ))}
      </div>
    </div>
  )
}
