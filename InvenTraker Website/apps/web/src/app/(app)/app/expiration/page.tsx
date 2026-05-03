"use client"

import { useEffect, useState } from "react"
import { AppButton, AppCard, SegmentedControl, TipBanner } from "@inventracker/ui"
import { useQuery } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchExpirationEntries, fetchOrgSettings, fetchStoreSettings } from "@/lib/data/firestore"
import { downloadSpreadsheetExport } from "@/lib/exports/spreadsheet"

export default function ExpirationPage() {
  const { activeOrgId, activeStoreId, activeOrg, activeStore, contextReady, effectivePermissions } = useOrgContext()
  const [scope, setScope] = useState<"store" | "org">("store")

  useEffect(() => {
    if (scope === "store" && !activeStoreId) setScope("org")
  }, [activeStoreId, scope])

  const scopedStoreId = scope === "store" ? activeStoreId || undefined : undefined
  const canRunQuery = Boolean(activeOrgId && contextReady && (scope === "org" || scopedStoreId))

  const { data: expiring = [], isFetching } = useQuery({
    queryKey: ["expiration-entries", activeOrgId, scopedStoreId],
    queryFn: () => fetchExpirationEntries(activeOrgId, scopedStoreId, 7),
    retry: 1,
    enabled: canRunQuery,
    refetchInterval: 30_000
  })
  const { data: orgSettings } = useQuery({
    queryKey: ["expiration-org-export-settings", activeOrgId],
    queryFn: () => fetchOrgSettings(activeOrgId),
    enabled: Boolean(activeOrgId)
  })
  const { data: storeSettings } = useQuery({
    queryKey: ["expiration-store-export-settings", activeOrgId, activeStoreId],
    queryFn: () => fetchStoreSettings(activeOrgId, activeStore!),
    enabled: Boolean(activeOrgId && activeStore)
  })

  const exportExpiration = () => {
    if (expiring.length === 0) return
    const storeName = scope === "store" ? activeStore?.title ?? activeStore?.name : undefined
    downloadSpreadsheetExport({
      dataset: "expiration",
      rows: expiring as unknown as Array<Record<string, unknown>>,
      settings: { orgSettings, storeSettings },
      organizationName: activeOrg?.organizationName,
      storeName,
      scopeLabel: scope === "store" && storeName ? `${storeName} Expiration` : "Organization Expiration"
    })
  }

  return (
    <div>
      <PageHead
        title="Expiration"
        subtitle="Upcoming expirations from the same batch data synced by iOS."
        actions={
          <AppButton
            variant="secondary"
            onClick={exportExpiration}
            disabled={!effectivePermissions.exportData || expiring.length === 0}
          >
            Export
          </AppButton>
        }
      />
      <div className="space-y-4">
        <TipBanner title="Tip" message="Use this view to prioritize expiring value before waste." accentColor="#F97316" />
        <AppCard>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="card-title">Expiring Items</h2>
            {activeStoreId ? (
              <SegmentedControl
                options={[
                  { label: "Store", value: "store" },
                  { label: "Organization", value: "org" }
                ]}
                value={scope}
                onChange={(value) => setScope(value)}
              />
            ) : null}
          </div>
          <div className="mt-3 space-y-2">
            {!canRunQuery ? (
              <p className="secondary-text">
                {scope === "store"
                  ? "Select a store to view store-level expirations."
                  : "Loading expiration data..."}
              </p>
            ) : expiring.length === 0 ? (
              <p className="secondary-text">
                {scope === "store"
                  ? "No expiring batches found for this store. Switch to Organization to view all stores."
                  : "No expiring batches found in the selected window."}
              </p>
            ) : (
              expiring.map((entry, idx) => (
                <div key={`${entry.itemId}-${entry.expirationDate.toISOString()}-${idx}`} className="rounded-xl border border-app-border p-3">
                  <p className="text-sm font-semibold">{entry.itemName}</p>
                  <p className="secondary-text">
                    {entry.quantity.toFixed(3)} {entry.unit} · expires {entry.expirationDate.toLocaleDateString()}
                  </p>
                  <p className={`text-xs ${entry.isExpired ? "text-rose-300" : "text-amber-300"}`}>
                    {entry.isExpired
                      ? `Expired ${Math.abs(entry.daysUntilExpiration)} day(s) ago`
                      : `Expires in ${entry.daysUntilExpiration} day(s)`}
                  </p>
                </div>
              ))
            )}
            {isFetching ? <p className="secondary-text text-xs">Refreshing...</p> : null}
          </div>
        </AppCard>
      </div>
    </div>
  )
}
