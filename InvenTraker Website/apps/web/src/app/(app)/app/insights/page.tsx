"use client"

import { useEffect, useMemo, useState } from "react"
import { AppButton, AppCard, SearchInput, SegmentedControl, TipBanner } from "@inventracker/ui"
import { useQuery } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  computeFinancialHealthFromOrgData,
  fetchStoreInventoryItems,
  fetchOrgWasteRecords
} from "@/lib/data/firestore"
import { computeFinancialHealth } from "@/lib/firebase/functions"

type InsightSectionKey = "inventory" | "waste" | "expiring" | "mostWasted" | "overstocked" | "risk" | "stock"

const DEFAULT_SECTIONS: Record<InsightSectionKey, boolean> = {
  inventory: true,
  waste: true,
  expiring: true,
  mostWasted: true,
  overstocked: true,
  risk: true,
  stock: true
}

const SECTION_LABELS: Array<{ key: InsightSectionKey; label: string }> = [
  { key: "inventory", label: "Inventory Value" },
  { key: "waste", label: "Waste" },
  { key: "expiring", label: "Expiring Soon" },
  { key: "mostWasted", label: "Most Wasted" },
  { key: "overstocked", label: "Overstocked" },
  { key: "stock", label: "Stock Pressure" },
  { key: "risk", label: "Risk Signals" }
]

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === "number") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value === "string") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      const parsed = (value as { toDate: () => Date }).toDate()
      return Number.isNaN(parsed.getTime()) ? null : parsed
    } catch {
      return null
    }
  }
  return null
}

export default function InsightsPage() {
  const { user } = useAuthUser()
  const { activeOrgId, activeStoreId, effectivePermissions } = useOrgContext()
  const [scope, setScope] = useState<"store" | "org">("store")
  const [expiringWindow, setExpiringWindow] = useState<"7" | "14" | "30">("7")
  const [wasteSearch, setWasteSearch] = useState("")
  const [showCustomize, setShowCustomize] = useState(false)
  const [visibleSections, setVisibleSections] = useState<Record<InsightSectionKey, boolean>>(DEFAULT_SECTIONS)

  useEffect(() => {
    if (!activeStoreId) setScope("org")
  }, [activeStoreId])

  useEffect(() => {
    if (!activeOrgId) return
    const storageKey = `insights_sections_${user?.uid ?? "anon"}_${activeOrgId}`
    const raw = localStorage.getItem(storageKey)
    if (!raw) {
      setVisibleSections(DEFAULT_SECTIONS)
      return
    }
    try {
      const parsed = JSON.parse(raw) as Partial<Record<InsightSectionKey, boolean>>
      setVisibleSections({
        ...DEFAULT_SECTIONS,
        ...parsed
      })
    } catch {
      setVisibleSections(DEFAULT_SECTIONS)
    }
  }, [activeOrgId, user?.uid])

  useEffect(() => {
    if (!activeOrgId) return
    const storageKey = `insights_sections_${user?.uid ?? "anon"}_${activeOrgId}`
    localStorage.setItem(storageKey, JSON.stringify(visibleSections))
  }, [activeOrgId, user?.uid, visibleSections])

  const scopedStoreId = scope === "store" ? activeStoreId || undefined : undefined

  const {
    data: financial,
    error: financialError,
    isFetching: financialLoading
  } = useQuery({
    queryKey: ["financial-health-engine", activeOrgId, scopedStoreId, expiringWindow],
    queryFn: async () => {
      try {
        const remote = await computeFinancialHealth({
          orgId: activeOrgId,
          storeId: scopedStoreId,
          expiringDays: Number(expiringWindow)
        })
        if (remote) return remote
      } catch {
        // Keep the dashboard usable if callable insights are temporarily unavailable.
      }
      return computeFinancialHealthFromOrgData(activeOrgId, scopedStoreId, Number(expiringWindow))
    },
    retry: 1,
    enabled: Boolean(activeOrgId && effectivePermissions.viewInsights)
  })

  const { data: wasteRows = [], error: wasteError } = useQuery({
    queryKey: ["insights-waste-rows", activeOrgId, scopedStoreId],
    queryFn: () => fetchOrgWasteRecords(activeOrgId, scopedStoreId),
    retry: 1,
    enabled: Boolean(activeOrgId && effectivePermissions.viewInsights)
  })

  const { data: scopedItems = [] } = useQuery({
    queryKey: ["insights-items", activeOrgId, scopedStoreId],
    queryFn: () => (scopedStoreId ? fetchStoreInventoryItems(activeOrgId, scopedStoreId) : Promise.resolve([])),
    enabled: Boolean(activeOrgId && effectivePermissions.viewInsights && scopedStoreId)
  })

  const healthGrade = useMemo(() => {
    const lowStockCount = scopedItems.filter((item) => item.totalQuantity < item.minimumQuantity).length
    const expiringPenalty = Math.min(30, Math.round((financial?.expiringSoonValue ?? 0) / 60))
    const wastePenalty = Math.min(35, Math.round((financial?.wasteCostWeek ?? 0) / 40))
    const lowStockPenalty = Math.min(25, lowStockCount * 2)
    const score = Math.max(0, 100 - expiringPenalty - wastePenalty - lowStockPenalty)

    let grade = "A"
    if (score < 90) grade = "B"
    if (score < 80) grade = "C"
    if (score < 70) grade = "D"
    if (score < 60) grade = "F"

    return { score, grade, lowStockCount }
  }, [financial?.expiringSoonValue, financial?.wasteCostWeek, scopedItems])

  const mostWasted = useMemo(() => {
    const grouped = new Map<string, number>()
    for (const row of wasteRows) {
      const itemName = String(row.itemName ?? row.itemId ?? "Unknown")
      const quantity = Number(row.quantity ?? 0)
      grouped.set(itemName, (grouped.get(itemName) ?? 0) + quantity)
    }
    return Array.from(grouped.entries())
      .map(([name, quantity]) => ({ name, quantity }))
      .filter((entry) => {
        const q = wasteSearch.trim().toLowerCase()
        if (!q) return true
        return entry.name.toLowerCase().includes(q)
      })
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10)
  }, [wasteRows, wasteSearch])

  const derivedInsights = useMemo(() => {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const weekAgo = now - 7 * dayMs
    const expiringCutoff = now + Number(expiringWindow) * dayMs

    let expiringBatchCount = 0
    let expiredBatchCount = 0
    let expiringUnits = 0
    let outOfStockCount = 0
    let lowStockCount = 0
    let shortageValue = 0

    const lowStockDrivers: Array<{ itemId: string; itemName: string; deficit: number; deficitValue: number }> = []
    const priceByItemId = new Map(scopedItems.map((item) => [item.id, Number(item.price ?? 0)]))
    const topLossByItem = new Map<string, { name: string; cost: number; quantity: number }>()

    for (const item of scopedItems) {
      const totalQuantity = Number(item.totalQuantity ?? 0)
      const minimumQuantity = Number(item.minimumQuantity ?? item.minQuantity ?? 0)
      const unitPrice = Number(item.price ?? 0)
      if (totalQuantity <= 0) outOfStockCount += 1
      if (totalQuantity < minimumQuantity) {
        lowStockCount += 1
        const deficit = Math.max(0, minimumQuantity - totalQuantity)
        const deficitValue = deficit * unitPrice
        shortageValue += deficitValue
        lowStockDrivers.push({
          itemId: item.id,
          itemName: item.name,
          deficit: Number(deficit.toFixed(3)),
          deficitValue: Number(deficitValue.toFixed(2))
        })
      }

      for (const batch of item.batches) {
        const expirationDate = toDate(batch.expirationDate)
        if (!expirationDate) continue
        const expiresAt = expirationDate.getTime()
        if (expiresAt < now) {
          expiredBatchCount += 1
          continue
        }
        if (expiresAt <= expiringCutoff) {
          expiringBatchCount += 1
          expiringUnits += Number(batch.quantity ?? 0)
        }
      }
    }

    let wasteCostWeek = 0
    let wasteUnitsWeek = 0
    for (const row of wasteRows) {
      const eventAt = toDate(row.date ?? row.createdAt)?.getTime()
      if (!eventAt || eventAt < weekAgo) continue

      const itemId = String(row.itemId ?? "")
      const itemName = String(row.itemName ?? row.itemId ?? "Unknown")
      const quantity = Number(row.quantity ?? row.amount ?? 0)
      const unitPrice = Number(row.itemPriceSnapshot ?? (itemId ? priceByItemId.get(itemId) ?? 0 : 0))
      const explicitCost = Number(row.totalCost ?? row.cost ?? Number.NaN)
      const lossCost = Number.isFinite(explicitCost) ? explicitCost : quantity * unitPrice
      wasteCostWeek += lossCost
      wasteUnitsWeek += quantity

      const current = topLossByItem.get(itemName) ?? { name: itemName, cost: 0, quantity: 0 }
      current.cost += lossCost
      current.quantity += quantity
      topLossByItem.set(itemName, current)
    }

    const wasteRate = (financial?.inventoryValue ?? 0) > 0 ? (wasteCostWeek / (financial?.inventoryValue ?? 1)) * 100 : 0
    const topLossItems = Array.from(topLossByItem.values())
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 8)
      .map((row) => ({
        ...row,
        cost: Number(row.cost.toFixed(2)),
        quantity: Number(row.quantity.toFixed(3))
      }))

    return {
      expiringBatchCount,
      expiredBatchCount,
      expiringUnits: Number(expiringUnits.toFixed(3)),
      outOfStockCount,
      lowStockCount,
      shortageValue: Number(shortageValue.toFixed(2)),
      wasteCostWeek: Number(wasteCostWeek.toFixed(2)),
      wasteUnitsWeek: Number(wasteUnitsWeek.toFixed(3)),
      wasteRate: Number(wasteRate.toFixed(2)),
      lowStockDrivers: lowStockDrivers.sort((a, b) => b.deficitValue - a.deficitValue).slice(0, 8),
      topLossItems
    }
  }, [expiringWindow, financial?.inventoryValue, scopedItems, wasteRows])

  const allSectionsHidden = Object.values(visibleSections).every((enabled) => !enabled)

  if (!effectivePermissions.viewInsights) {
    return (
      <div>
        <PageHead title="Insights" subtitle="Financial health and trend analysis." />
        <AppCard>
          <p className="secondary-text">You do not have access to insights.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead title="Insights" subtitle="Filter scope, tune windows, and choose exactly what shows on this dashboard." />

      <div className="space-y-4">
        <TipBanner
          title="Tip"
          message="Use Data Scope + Customize to focus only on the signals you want to manage day-to-day."
          accentColor="#A855F7"
        />

        <AppCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
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
              <SegmentedControl
                options={[
                  { label: "7 Days", value: "7" },
                  { label: "14 Days", value: "14" },
                  { label: "30 Days", value: "30" }
                ]}
                value={expiringWindow}
                onChange={(value) => setExpiringWindow(value)}
              />
            </div>
            <AppButton type="button" variant="secondary" onClick={() => setShowCustomize((current) => !current)}>
              {showCustomize ? "Done Customizing" : "Customize"}
            </AppButton>
          </div>

          {showCustomize ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {SECTION_LABELS.map((section) => {
                const enabled = visibleSections[section.key]
                return (
                  <AppButton
                    key={section.key}
                    onClick={() =>
                      setVisibleSections((current) => ({
                        ...current,
                        [section.key]: !current[section.key]
                      }))
                    }
                    variant="secondary"
                    className={`!h-8 !rounded-full !px-3 !py-1 !text-xs ${
                      enabled
                        ? "!border-blue-400/50 !bg-blue-500/20 !text-blue-200"
                        : "!border-app-border !text-app-muted"
                    }`}
                  >
                    {section.label}
                  </AppButton>
                )
              })}
            </div>
          ) : null}
        </AppCard>

        {allSectionsHidden ? (
          <AppCard>
            <p className="secondary-text">No insight cards are selected. Click Customize and enable at least one section.</p>
          </AppCard>
        ) : null}

        {financialError ? (
          <AppCard>
            <p className="text-sm text-rose-300">
              Could not load financial metrics for this scope. Please retry after data sync.
            </p>
          </AppCard>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {visibleSections.inventory ? (
            <AppCard>
              <p className="secondary-text">Inventory Health Grade</p>
              <p className="mt-2 text-3xl font-semibold">{healthGrade.grade}</p>
              <p className="secondary-text mt-1">
                Score {healthGrade.score}/100 · {healthGrade.lowStockCount} low stock items
              </p>
            </AppCard>
          ) : null}
          {visibleSections.inventory ? (
            <AppCard>
              <p className="secondary-text">Inventory Value</p>
              <p className="mt-2 text-3xl font-semibold">${(financial?.inventoryValue ?? 0).toFixed(2)}</p>
              <p className="secondary-text mt-1">{financialLoading ? "Refreshing..." : "Current on-hand value"}</p>
            </AppCard>
          ) : null}
          {visibleSections.waste ? (
            <>
              <AppCard>
                <p className="secondary-text">Waste Cost (Week)</p>
                <p className="mt-2 text-3xl font-semibold">${derivedInsights.wasteCostWeek.toFixed(2)}</p>
                <p className="secondary-text mt-1">{derivedInsights.wasteUnitsWeek.toFixed(3)} units logged</p>
              </AppCard>
              <AppCard>
                <p className="secondary-text">Waste Cost (Month)</p>
                <p className="mt-2 text-3xl font-semibold">${(financial?.wasteCostMonth ?? 0).toFixed(2)}</p>
              </AppCard>
            </>
          ) : null}
          {visibleSections.expiring ? (
            <AppCard>
              <p className="secondary-text">Expiring Soon Value</p>
              <p className="mt-2 text-3xl font-semibold">${(financial?.expiringSoonValue ?? 0).toFixed(2)}</p>
              <p className="secondary-text mt-1">Within {expiringWindow} days</p>
            </AppCard>
          ) : null}
          {visibleSections.expiring ? (
            <AppCard>
              <p className="secondary-text">Expiring / Expired Batches</p>
              <p className="mt-2 text-3xl font-semibold">
                {derivedInsights.expiringBatchCount} / {derivedInsights.expiredBatchCount}
              </p>
              <p className="secondary-text mt-1">{derivedInsights.expiringUnits.toFixed(3)} units expiring soon</p>
            </AppCard>
          ) : null}
          {visibleSections.stock ? (
            <>
              <AppCard>
                <p className="secondary-text">Out of Stock</p>
                <p className="mt-2 text-3xl font-semibold">{derivedInsights.outOfStockCount}</p>
                <p className="secondary-text mt-1">{derivedInsights.lowStockCount} additional low-stock items</p>
              </AppCard>
              <AppCard>
                <p className="secondary-text">Shortage Risk Value</p>
                <p className="mt-2 text-3xl font-semibold">${derivedInsights.shortageValue.toFixed(2)}</p>
                <p className="secondary-text mt-1">Estimated value to reach minimum levels</p>
              </AppCard>
            </>
          ) : null}
          {visibleSections.risk ? (
            <AppCard>
              <p className="secondary-text">Waste Rate (7d)</p>
              <p className="mt-2 text-3xl font-semibold">{derivedInsights.wasteRate.toFixed(2)}%</p>
              <p className="secondary-text mt-1">Waste cost as a percentage of current inventory value</p>
            </AppCard>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {visibleSections.mostWasted ? (
          <AppCard>
            <h2 className="card-title">Most Wasted</h2>
            <div className="mt-3">
              <SearchInput value={wasteSearch} onChange={setWasteSearch} placeholder="Filter waste by item name" />
            </div>
            <div className="mt-3 space-y-2">
              {wasteError ? (
                <p className="text-sm text-rose-300">Could not load waste records for this scope.</p>
              ) : mostWasted.length === 0 ? (
                <p className="secondary-text">
                  No waste entries recorded yet. Use Waste tracking to log spoilage so this section can surface top drivers.
                </p>
              ) : (
                mostWasted.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between rounded-xl border border-app-border px-3 py-2 text-sm">
                    <span>{entry.name}</span>
                    <span className="font-semibold">{entry.quantity.toFixed(3)}</span>
                  </div>
                ))
              )}
            </div>
          </AppCard>
        ) : null}
        {visibleSections.overstocked ? (
          <AppCard>
            <h2 className="card-title">Overstocked</h2>
            <div className="mt-3 space-y-2">
              {(financial?.overstocked ?? []).length === 0 ? (
                <p className="secondary-text">Everything looks balanced right now. No overstocked items in the selected scope.</p>
              ) : (
                (financial?.overstocked ?? []).map((entry) => (
                  <div key={entry.itemId} className="rounded-xl border border-app-border px-3 py-2 text-sm">
                    <p className="font-semibold">{entry.itemName}</p>
                    <p className="secondary-text">
                      On hand {entry.onHand.toFixed(3)} · Min {entry.minQuantity.toFixed(3)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </AppCard>
        ) : null}
        {visibleSections.stock ? (
          <AppCard>
            <h2 className="card-title">Low Stock Drivers</h2>
            <div className="mt-3 space-y-2">
              {derivedInsights.lowStockDrivers.length === 0 ? (
                <p className="secondary-text">No shortages right now.</p>
              ) : (
                derivedInsights.lowStockDrivers.map((entry) => (
                  <div key={entry.itemId} className="rounded-xl border border-app-border px-3 py-2 text-sm">
                    <p className="font-semibold">{entry.itemName}</p>
                    <p className="secondary-text">
                      Deficit {entry.deficit.toFixed(3)} · Risk ${entry.deficitValue.toFixed(2)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </AppCard>
        ) : null}
        {visibleSections.risk ? (
          <AppCard>
            <h2 className="card-title">Top Waste Loss (7d)</h2>
            <div className="mt-3 space-y-2">
              {derivedInsights.topLossItems.length === 0 ? (
                <p className="secondary-text">No recent waste losses found in the selected scope.</p>
              ) : (
                derivedInsights.topLossItems.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between rounded-xl border border-app-border px-3 py-2 text-sm">
                    <span>{entry.name}</span>
                    <span className="font-semibold">${entry.cost.toFixed(2)}</span>
                  </div>
                ))
              )}
            </div>
          </AppCard>
        ) : null}
      </div>
    </div>
  )
}
