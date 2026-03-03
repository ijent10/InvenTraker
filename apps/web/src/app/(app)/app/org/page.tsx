"use client"

import { AppCard, MetricChip } from "@inventracker/ui"
import { useQuery } from "@tanstack/react-query"
import { computeFinancialHealth } from "@/lib/firebase/functions"
import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchStores } from "@/lib/data/firestore"

export default function OrganizationOverviewPage() {
  const { activeOrgId } = useOrgContext()

  const { data: stores = [] } = useQuery({
    queryKey: ["org-stores", activeOrgId],
    queryFn: () => fetchStores(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const { data: financial } = useQuery({
    queryKey: ["financial-org", activeOrgId],
    queryFn: () => computeFinancialHealth({ orgId: activeOrgId, expiringDays: 7 }),
    enabled: Boolean(activeOrgId)
  })

  return (
    <div>
      <PageHead title="Organization" subtitle="Company inventory metrics, region/district summary, and plan status." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AppCard><p className="secondary-text">Stores</p><p className="mt-2 text-3xl font-semibold">{stores.length}</p></AppCard>
        <AppCard><p className="secondary-text">Inventory Value</p><p className="mt-2 text-3xl font-semibold">${(financial?.inventoryValue ?? 0).toFixed(2)}</p></AppCard>
        <AppCard><p className="secondary-text">Waste (Week)</p><p className="mt-2 text-3xl font-semibold">${(financial?.wasteCostWeek ?? 0).toFixed(2)}</p></AppCard>
        <AppCard><p className="secondary-text">Expiring Soon</p><p className="mt-2 text-3xl font-semibold">${(financial?.expiringSoonValue ?? 0).toFixed(2)}</p></AppCard>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <AppCard>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="card-title">Stores</h2>
            <MetricChip label="Count" value={stores.length} />
          </div>
          <ul className="space-y-2 text-sm">
            {stores.map((store) => (
              <li key={store.id} className="rounded-xl border border-app-border p-3">
                <p className="font-semibold">{store.name}</p>
                <p className="secondary-text">Region {store.regionId} · District {store.districtId}</p>
              </li>
            ))}
          </ul>
        </AppCard>
        <AppCard>
          <h2 className="card-title">Subscription</h2>
          <p className="secondary-text mt-2">Plan and status are managed at organization level in Firestore.</p>
          <div className="mt-4 flex gap-2">
            <MetricChip label="Plan" value="Pro" />
            <MetricChip label="Status" value="Active" />
          </div>
        </AppCard>
      </div>
    </div>
  )
}
