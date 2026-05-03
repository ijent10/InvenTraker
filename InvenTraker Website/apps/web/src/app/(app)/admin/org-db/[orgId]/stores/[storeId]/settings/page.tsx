"use client"

import { useQuery } from "@tanstack/react-query"
import { AppCard } from "@inventracker/ui"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchAdminStoreDetailDirect } from "@/lib/data/firestore"
import { adminGetStoreDetail } from "@/lib/firebase/functions"

export default function AdminStoreSettingsPage({ params }: { params: { orgId: string; storeId: string } }) {
  const { canViewAdmin, loading } = useOrgContext()
  const { data } = useQuery({
    queryKey: ["admin-store-settings", params.orgId, params.storeId],
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
  const settings = ((data as Record<string, unknown> | undefined)?.storeSettings ?? {}) as Record<string, unknown>
  const departments = Array.isArray(settings.departments) ? settings.departments.map(String) : []
  const locations = Array.isArray(settings.locationTemplates) ? settings.locationTemplates.map(String) : []
  const jobTitles = Array.isArray(settings.jobTitles)
    ? settings.jobTitles.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    : []

  if (loading) {
    return (
      <div>
        <PageHead title="Store Settings" subtitle="Loading access..." />
        <AppCard>
          <p className="secondary-text">Checking admin permissions.</p>
        </AppCard>
      </div>
    )
  }

  if (!canViewAdmin) {
    return (
      <div>
        <PageHead title="Store Settings" subtitle="Platform Admin only." />
        <AppCard>
          <p className="secondary-text">Access denied.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead
        title="Store Settings"
        subtitle={String(store.title ?? store.storeNumber ?? store.name ?? params.storeId)}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <AppCard>
          <h2 className="card-title">Store</h2>
          <div className="mt-3 space-y-2 text-sm">
            <p>Name: {String(store.name ?? "—")}</p>
            <p>Title: {String(store.title ?? "—")}</p>
            <p>Number: {String(store.storeNumber ?? "—")}</p>
            <p>Status: {String(store.status ?? "—")}</p>
            <p>Address: {[store.addressLine1, store.city, store.state, store.postalCode].filter(Boolean).join(", ") || "—"}</p>
          </div>
        </AppCard>
        <AppCard>
          <h2 className="card-title">Policy Snapshot</h2>
          <div className="mt-3 grid gap-3">
            <div className="rounded-xl border border-app-border p-3 text-sm">
              <p className="font-semibold">Core Controls</p>
              <p className="secondary-text mt-1">Can remove items: {String(Boolean(settings.canStoreRemoveItems))}</p>
              <p className="secondary-text">Max sale percent: {String(settings.maxSalePercent ?? 30)}</p>
            </div>
            <div className="rounded-xl border border-app-border p-3 text-sm">
              <p className="font-semibold">Departments</p>
              <p className="secondary-text mt-1">{departments.length ? departments.join(", ") : "No departments configured."}</p>
            </div>
            <div className="rounded-xl border border-app-border p-3 text-sm">
              <p className="font-semibold">Locations</p>
              <p className="secondary-text mt-1">{locations.length ? locations.join(", ") : "No locations configured."}</p>
            </div>
            <div className="rounded-xl border border-app-border p-3 text-sm">
              <p className="font-semibold">Roles</p>
              {jobTitles.length === 0 ? (
                <p className="secondary-text mt-1">No roles configured.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {jobTitles.map((entry, index) => (
                    <span key={`${String(entry.id ?? "job")}-${index}`} className="rounded-full border border-app-border px-3 py-1 text-xs">
                      {String(entry.title ?? "Untitled")} · {String(entry.baseRole ?? "Staff")}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <details className="rounded-xl border border-app-border p-3 text-xs">
              <summary className="cursor-pointer font-semibold">Raw JSON</summary>
              <pre className="mt-3 max-h-[320px] overflow-auto rounded-xl border border-app-border bg-app-surface p-3 text-xs">
                {JSON.stringify(settings, null, 2)}
              </pre>
            </details>
          </div>
        </AppCard>
      </div>
    </div>
  )
}
