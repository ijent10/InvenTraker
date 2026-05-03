"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { AppCard, appButtonClass } from "@inventracker/ui"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchAdminStoreDetailDirect } from "@/lib/data/firestore"
import { adminGetStoreDetail } from "@/lib/firebase/functions"

export const dynamic = "force-dynamic"

export default function AdminStoreCardPage({ params }: { params: { orgId: string; storeId: string } }) {
  const { canViewAdmin, loading } = useOrgContext()
  const { data } = useQuery({
    queryKey: ["admin-org-db-store-card", params.orgId, params.storeId],
    queryFn: async () => {
      try {
        return await adminGetStoreDetail({ orgId: params.orgId, storeId: params.storeId })
      } catch {
        return await fetchAdminStoreDetailDirect(params.orgId, params.storeId)
      }
    },
    enabled: canViewAdmin
  })

  const store = (data?.store ?? {}) as Record<string, unknown>
  const storeLabel =
    store.title && store.storeNumber
      ? `${String(store.title)} (${String(store.storeNumber)})`
      : String(store.title ?? store.storeNumber ?? store.name ?? params.storeId)

  if (loading) {
    return (
      <div>
        <PageHead title="Store" subtitle="Loading access..." />
        <AppCard>
          <p className="secondary-text">Checking admin permissions.</p>
        </AppCard>
      </div>
    )
  }

  if (!canViewAdmin) {
    return (
      <div>
        <PageHead title="Store" subtitle="Platform Admin only." />
        <AppCard>
          <p className="secondary-text">Access denied.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead title={storeLabel} subtitle={`Store ${params.storeId}`} />
      <div className="grid gap-4 md:grid-cols-3">
        <AppCard>
          <h2 className="card-title">Users</h2>
          <p className="secondary-text mt-2">Manage user roles, store assignments, and reset passwords.</p>
          <Link className={appButtonClass("primary", "mt-4")} href={`/admin/org-db/${params.orgId}/stores/${params.storeId}/users`}>
            Open Users
          </Link>
        </AppCard>
        <AppCard>
          <h2 className="card-title">Inventory</h2>
          <p className="secondary-text mt-2">Review and adjust item metadata and stock visibility for this store.</p>
          <Link className={appButtonClass("primary", "mt-4")} href={`/admin/org-db/${params.orgId}/stores/${params.storeId}/inventory`}>
            Open Inventory
          </Link>
        </AppCard>
        <AppCard>
          <h2 className="card-title">Settings</h2>
          <p className="secondary-text mt-2">Inspect store settings and policy overrides.</p>
          <Link className={appButtonClass("primary", "mt-4")} href={`/admin/org-db/${params.orgId}/stores/${params.storeId}/settings`}>
            Open Settings
          </Link>
        </AppCard>
      </div>
    </div>
  )
}
