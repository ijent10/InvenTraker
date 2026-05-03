"use client"

import { useMemo, useState } from "react"
import { AppButton, AppCard, SegmentedControl, TipBanner } from "@inventracker/ui"
import { useQuery } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchItems, fetchOrgSettings, fetchOrgWasteRecords, fetchStoreSettings } from "@/lib/data/firestore"
import { downloadSpreadsheetExport } from "@/lib/exports/spreadsheet"

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate()
    } catch {
      return null
    }
  }
  return null
}

export default function WastePage() {
  const { activeOrgId, activeStoreId, activeOrg, activeStore, effectivePermissions } = useOrgContext()
  const [scope, setScope] = useState<"store" | "org">("store")

  const scopedStoreId = scope === "store" ? activeStoreId || undefined : undefined

  const { data: items = [] } = useQuery({
    queryKey: ["waste-items", activeOrgId, scopedStoreId],
    queryFn: () => fetchItems(activeOrgId, { storeId: scopedStoreId }),
    enabled: Boolean(activeOrgId),
    refetchInterval: 30_000
  })
  const { data: rows = [] } = useQuery({
    queryKey: ["waste-rows", activeOrgId, scopedStoreId],
    queryFn: () => fetchOrgWasteRecords(activeOrgId, scopedStoreId),
    enabled: Boolean(activeOrgId),
    refetchInterval: 30_000
  })
  const { data: orgSettings } = useQuery({
    queryKey: ["waste-org-export-settings", activeOrgId],
    queryFn: () => fetchOrgSettings(activeOrgId),
    enabled: Boolean(activeOrgId)
  })
  const { data: storeSettings } = useQuery({
    queryKey: ["waste-store-export-settings", activeOrgId, activeStoreId],
    queryFn: () => fetchStoreSettings(activeOrgId, activeStore!),
    enabled: Boolean(activeOrgId && activeStore)
  })

  const itemPriceById = useMemo(() => new Map(items.map((item) => [item.id, item.price])), [items])
  const itemNameById = useMemo(() => new Map(items.map((item) => [item.id, item.name])), [items])

  const summary = useMemo(() => {
    const now = new Date()
    const weekAgo = new Date(now)
    weekAgo.setDate(now.getDate() - 7)
    const monthAgo = new Date(now)
    monthAgo.setDate(now.getDate() - 30)

    const enriched = rows
      .map((row) => {
        const itemId = String(row.itemId ?? "")
        const quantity = Number(row.quantity ?? row.amount ?? 0)
        const eventAt = asDate(row.date ?? row.createdAt)
        const priceSnapshot = Number(row.itemPriceSnapshot ?? 0)
        const price = Number.isFinite(priceSnapshot) && priceSnapshot > 0 ? priceSnapshot : itemPriceById.get(itemId) ?? 0
        const cost = Number((Math.max(0, quantity) * Math.max(0, price)).toFixed(2))
        return {
          id: row.id,
          itemId,
          itemName: itemNameById.get(itemId) ?? String(row.itemName ?? "Item"),
          quantity,
          reason: String(row.reason ?? row.wasteType ?? "unspecified"),
          cost,
          createdAt: eventAt
        }
      })
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))

    const total = enriched.reduce((sum, row) => sum + row.cost, 0)
    const week = enriched.reduce((sum, row) => sum + ((row.createdAt && row.createdAt >= weekAgo) ? row.cost : 0), 0)
    const month = enriched.reduce((sum, row) => sum + ((row.createdAt && row.createdAt >= monthAgo) ? row.cost : 0), 0)

    return {
      total: Number(total.toFixed(2)),
      week: Number(week.toFixed(2)),
      month: Number(month.toFixed(2)),
      exportRows: enriched,
      rows: enriched.slice(0, 200)
    }
  }, [itemNameById, itemPriceById, rows])

  const exportWaste = () => {
    if (summary.exportRows.length === 0) return
    const storeName = scope === "store" ? activeStore?.title ?? activeStore?.name : undefined
    downloadSpreadsheetExport({
      dataset: "waste",
      rows: summary.exportRows as unknown as Array<Record<string, unknown>>,
      settings: { orgSettings, storeSettings },
      organizationName: activeOrg?.organizationName,
      storeName,
      scopeLabel: scope === "store" && storeName ? `${storeName} Waste` : "Organization Waste"
    })
  }

  return (
    <div>
      <PageHead
        title="Waste"
        subtitle="Log spoilage and track dollar impact in real time."
        actions={
          <AppButton
            variant="secondary"
            onClick={exportWaste}
            disabled={!effectivePermissions.exportData || summary.exportRows.length === 0}
          >
            Export
          </AppButton>
        }
      />
      <TipBanner title="Tip" message="Waste always uses red semantics, independent of your accent color." accentColor="#EF4444" />

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <AppCard>
          <p className="secondary-text">Waste this week</p>
          <p className="mt-1 text-3xl font-semibold text-rose-300">${summary.week.toFixed(2)}</p>
        </AppCard>
        <AppCard>
          <p className="secondary-text">Waste this month</p>
          <p className="mt-1 text-3xl font-semibold text-rose-300">${summary.month.toFixed(2)}</p>
        </AppCard>
        <AppCard>
          <p className="secondary-text">Total tracked waste</p>
          <p className="mt-1 text-3xl font-semibold text-rose-300">${summary.total.toFixed(2)}</p>
        </AppCard>
      </div>

      <AppCard className="mt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="card-title">Waste records</h2>
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
        {summary.rows.length === 0 ? (
          <p className="secondary-text">
            No waste records for this scope yet. Log waste from the mobile app (scan or manual entry) to start tracking spoilage and cost.
          </p>
        ) : (
          <div className="space-y-2">
            {summary.rows.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-app-border p-3">
                <div>
                  <p className="text-sm font-semibold">{entry.itemName}</p>
                  <p className="secondary-text text-xs">
                    {entry.quantity.toFixed(3)} · {entry.reason} · {entry.createdAt ? entry.createdAt.toLocaleString() : "No date"}
                  </p>
                </div>
                <p className="text-sm font-semibold text-rose-300">${entry.cost.toFixed(2)}</p>
              </div>
            ))}
          </div>
        )}
      </AppCard>
    </div>
  )
}
