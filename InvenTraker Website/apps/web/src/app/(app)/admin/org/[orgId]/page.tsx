"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { AppCard, DataTable, type TableColumn } from "@inventracker/ui"
import { PageHead } from "@/components/page-head"
import { fetchItems, fetchMembers, fetchStores } from "@/lib/data/firestore"
import { adminGetOrganizationDetail as adminGetOrganizationDetailFunction } from "@/lib/firebase/functions"

type StoreRow = { id: string; name: string; regionId?: string; districtId?: string; status?: string }
type MemberRow = { id: string; email?: string; role?: string; storeIds?: string[] }

export default function AdminOrgDetailPage({ params }: { params: { orgId: string } }) {
  const { data } = useQuery({
    queryKey: ["admin-org-detail", params.orgId],
    queryFn: async () => {
      try {
        const response = await adminGetOrganizationDetailFunction({ orgId: params.orgId })
        if (response) return response
      } catch {
        // Fallback to direct org-scoped reads.
      }
      const [stores, items, members] = await Promise.all([
        fetchStores(params.orgId),
        fetchItems(params.orgId),
        fetchMembers(params.orgId)
      ])
      return {
        organization: { id: params.orgId, stores },
        items,
        members
      }
    }
  })

  const organization = data?.organization ?? {}
  const stores = ((organization.stores as StoreRow[] | undefined) ?? []).slice()
  const items = data?.items ?? []
  const members = (data?.members as MemberRow[] | undefined) ?? []

  const storeColumns: TableColumn<StoreRow>[] = [
    { key: "name", header: "Store", render: (row) => <Link href={`/admin/store/${row.id}`} className="text-blue-400">{row.name}</Link> },
    { key: "region", header: "Region", render: (row) => row.regionId ?? "-" },
    { key: "district", header: "District", render: (row) => row.districtId ?? "-" },
    { key: "status", header: "Status", render: (row) => row.status ?? "-" }
  ]

  const memberColumns: TableColumn<MemberRow>[] = [
    { key: "email", header: "User", render: (row) => row.email ?? row.id },
    { key: "role", header: "Role", render: (row) => row.role ?? "-" },
    { key: "stores", header: "Stores", render: (row) => row.storeIds?.join(", ") || "All" }
  ]

  return (
    <div>
      <PageHead title="Admin · Organization" subtitle={`Org ${params.orgId}`} />
      <div className="grid gap-4 xl:grid-cols-2">
        <AppCard>
          <h2 className="card-title mb-3">Stores</h2>
          <DataTable columns={storeColumns} rows={stores} empty="No stores" />
        </AppCard>
        <AppCard>
          <h2 className="card-title mb-3">Users</h2>
          <DataTable columns={memberColumns} rows={members} empty="No users" />
        </AppCard>
      </div>
      <AppCard className="mt-4">
        <h2 className="card-title mb-3">Inventory</h2>
        <p className="secondary-text">{items.length} items in organization catalog.</p>
      </AppCard>
    </div>
  )
}
