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

type InsightSectionKey = "inventory" | "waste" | "expiring" | "mostWasted" | "overstocked"

const DEFAULT_SECTIONS: Record<InsightSectionKey, boolean> = {
  inventory: true,
  waste: true,
  expiring: true,
  mostWasted: true,
  overstocked: true
}

const SECTION_LABELS: Array<{ key: InsightSectionKey; label: string }> = [
  { key: "inventory", label: "Inventory Value" },
  { key: "waste", label: "Waste" },
  { key: "expiring", label: "Expiring Soon" },
  { key: "mostWasted", label: "Most Wasted" },
  { key: "overstocked", label: "Overstocked" }
]

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
    queryKey: ["financial-health-local", activeOrgId, scopedStoreId, expiringWindow],
    queryFn: () => computeFinancialHealthFromOrgData(activeOrgId, scopedStoreId, Number(expiringWindow)),
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
                <p className="mt-2 text-3xl font-semibold">${(financial?.wasteCostWeek ?? 0).toFixed(2)}</p>
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
                <p className="secondary-text">No waste entries recorded.</p>
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
                <p className="secondary-text">No overstocked items currently.</p>
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
      </div>
    </div>
  )
}
