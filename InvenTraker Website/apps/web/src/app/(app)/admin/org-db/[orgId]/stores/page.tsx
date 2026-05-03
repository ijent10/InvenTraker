"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { AppCard, DataTable, type TableColumn } from "@inventracker/ui"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchAdminOrganizationDetailDirect } from "@/lib/data/firestore"
import { adminGetOrganizationDetail } from "@/lib/firebase/functions"

type AdminStoreRow = {
  id: string
  name?: string
  title?: string
  storeNumber?: string
  regionId?: string
  districtId?: string
  status?: string
}

export default function AdminOrganizationStoresPage({ params }: { params: { orgId: string } }) {
  const { canViewAdmin, loading } = useOrgContext()
  const { data } = useQuery({
    queryKey: ["admin-org-db-stores", params.orgId],
    queryFn: async () => {
      try {
        return await adminGetOrganizationDetail({ orgId: params.orgId })
      } catch {
        return await fetchAdminOrganizationDetailDirect(params.orgId)
      }
    },
    enabled: canViewAdmin
  })

  const stores = ((data?.organization as { stores?: AdminStoreRow[] } | undefined)?.stores ?? []).slice()
  stores.sort((a, b) => String(a.title ?? a.name ?? "").localeCompare(String(b.title ?? b.name ?? "")))

  const columns: TableColumn<AdminStoreRow>[] = [
    {
      key: "name",
      header: "Store",
      render: (row) => (
        <Link className="font-semibold text-blue-400" href={`/admin/org-db/${params.orgId}/stores/${row.id}`}>
          {row.title && row.storeNumber
            ? `${row.title} (${row.storeNumber})`
            : row.title || row.storeNumber || row.name || row.id}
        </Link>
      )
    },
    { key: "region", header: "Region", render: (row) => row.regionId ?? "—" },
    { key: "district", header: "District", render: (row) => row.districtId ?? "—" },
    { key: "status", header: "Status", render: (row) => row.status ?? "active" }
  ]

  if (loading) {
    return (
      <div>
        <PageHead title="Stores" subtitle="Loading access..." />
        <AppCard>
          <p className="secondary-text">Checking admin permissions.</p>
        </AppCard>
      </div>
    )
  }

  if (!canViewAdmin) {
    return (
      <div>
        <PageHead title="Stores" subtitle="Platform Admin only." />
        <AppCard>
          <p className="secondary-text">Access denied.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead title="Stores" subtitle="Stores in this organization." />
      <AppCard>
        <DataTable columns={columns} rows={stores} empty="No stores found." />
      </AppCard>
    </div>
  )
}
