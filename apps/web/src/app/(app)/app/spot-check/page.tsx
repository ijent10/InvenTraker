"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import JsBarcode from "jsbarcode"
import { useQuery } from "@tanstack/react-query"
import { AppButton, AppCard, TipBanner } from "@inventracker/ui"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  fetchSpotCheckRecords,
  fetchStoreInventoryItems,
  type SpotCheckRecord,
  type StoreInventoryItemRecord
} from "@/lib/data/firestore"

function dayKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatQuantity(item: StoreInventoryItemRecord) {
  const total = item.totalQuantity
  const base = `${total.toFixed(item.unit === "lbs" ? 3 : 0)} ${item.unit}`
  if (item.unit === "lbs") return base
  if (!item.qtyPerCase || item.qtyPerCase <= 0) return base
  const cases = total / item.qtyPerCase
  return `${base} (${cases.toFixed(3)} cases)`
}

function BarcodeSvg({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || !value) return
    const lineColor =
      typeof window !== "undefined"
        ? getComputedStyle(document.documentElement).getPropertyValue("--app-text").trim() || "#0f172a"
        : "#0f172a"

    try {
      JsBarcode(element, value, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        width: 1.25,
        height: 38,
        lineColor,
        background: "transparent"
      })
    } catch {
      element.innerHTML = ""
    }
  }, [value])

  if (!value) {
    return <p className="secondary-text text-xs">No barcode</p>
  }

  return <svg ref={ref} className="h-10 w-full max-w-[230px]" aria-label={`Barcode ${value}`} />
}

function buildBarcodeSvgMarkup(value: string) {
  if (!value) return ""
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    JsBarcode(svg, value, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      width: 1.3,
      height: 44,
      lineColor: "#0f172a",
      background: "transparent"
    })
    return svg.outerHTML
  } catch {
    return ""
  }
}

export default function SpotCheckPage() {
  const { activeOrgId, activeStore, activeStoreId, contextReady, effectivePermissions } = useOrgContext()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedDateKey, setSelectedDateKey] = useState("")

  const canRunQuery = Boolean(activeOrgId && activeStoreId && contextReady)

  const { data: spotChecks = [], isFetching: spotCheckLoading } = useQuery({
    queryKey: ["spot-check-records", activeOrgId, activeStoreId],
    queryFn: () => fetchSpotCheckRecords(activeOrgId, activeStoreId),
    enabled: canRunQuery,
    staleTime: 45_000,
    refetchOnWindowFocus: true
  })

  const { data: storeInventoryRows = [], isFetching: exportLoading } = useQuery({
    queryKey: ["spot-check-export-rows", activeOrgId, activeStoreId],
    queryFn: () => fetchStoreInventoryItems(activeOrgId, activeStoreId),
    enabled: canRunQuery,
    staleTime: 60_000,
    refetchOnWindowFocus: false
  })

  const groupedByDate = useMemo(() => {
    const grouped = new Map<string, SpotCheckRecord[]>()
    for (const row of spotChecks) {
      const key = dayKey(row.checkedAt)
      const current = grouped.get(key) ?? []
      current.push(row)
      grouped.set(key, current)
    }

    return Array.from(grouped.entries())
      .map(([key, rows]) => ({
        key,
        rows: rows.sort((left, right) => right.checkedAt.getTime() - left.checkedAt.getTime()),
        displayDate: new Date(`${key}T12:00:00`).toLocaleDateString()
      }))
      .sort((left, right) => right.key.localeCompare(left.key))
  }, [spotChecks])

  useEffect(() => {
    if (!groupedByDate.length) {
      setSelectedDateKey("")
      return
    }
    if (!selectedDateKey || !groupedByDate.some((entry) => entry.key === selectedDateKey)) {
      setSelectedDateKey(groupedByDate[0]?.key ?? "")
    }
  }, [groupedByDate, selectedDateKey])

  const latestGroup = groupedByDate[0]
  const selectedGroup = groupedByDate.find((entry) => entry.key === selectedDateKey) ?? latestGroup

  const exportRows = useMemo(() => {
    return storeInventoryRows
      .filter((row) => Boolean((row.upc ?? "").trim()))
      .map((row) => ({
        id: row.id,
        name: row.name,
        barcode: (row.upc ?? "").trim(),
        quantity: formatQuantity(row)
      }))
  }, [storeInventoryRows])

  const printExport = () => {
    if (!exportRows.length) return

    const popup = window.open("", "_blank", "width=980,height=760")
    if (!popup) return

    const rowsHtml = exportRows
      .map((row) => {
        const svgMarkup = buildBarcodeSvgMarkup(row.barcode)
        return `
          <article style="border:1px solid #cbd5e1;border-radius:14px;padding:14px;break-inside:avoid;">
            <h3 style="margin:0 0 6px 0;font-size:16px;font-weight:700;color:#0f172a;">${row.name}</h3>
            <p style="margin:0 0 6px 0;font-size:13px;color:#334155;">Barcode: ${row.barcode}</p>
            ${svgMarkup ? `<div style="margin:4px 0 8px 0;">${svgMarkup}</div>` : ""}
            <p style="margin:0;font-size:13px;color:#0f172a;font-weight:600;">Quantity: ${row.quantity}</p>
          </article>
        `
      })
      .join("")

    popup.document.write(`
      <html>
        <head>
          <title>Spot Check Export - ${activeStore?.name ?? "Store"}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 24px; color: #0f172a; }
            h1 { margin: 0 0 6px 0; font-size: 24px; }
            p.meta { margin: 0 0 18px 0; font-size: 13px; color: #475569; }
            .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
            @media print {
              .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
              body { margin: 12px; }
            }
          </style>
        </head>
        <body>
          <h1>Spot Check Export</h1>
          <p class="meta">Store: ${activeStore?.name ?? "Selected Store"} • Generated ${new Date().toLocaleString()}</p>
          <section class="grid">${rowsHtml}</section>
        </body>
      </html>
    `)
    popup.document.close()
    popup.focus()
    popup.print()
  }

  if (!effectivePermissions.appSpotCheck) {
    return (
      <div>
        <PageHead title="Spot Check" subtitle="Most recent count + export history." />
        <AppCard>
          <p className="secondary-text">You do not have permission to view Spot Check.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead
        title="Spot Check"
        subtitle="View the latest store spot check, browse history by date, and print barcode exports."
        actions={
          <>
            <AppButton variant="secondary" onClick={() => setHistoryOpen((value) => !value)}>
              {historyOpen ? "Hide History" : "History"}
            </AppButton>
            <AppButton variant="secondary" onClick={printExport} disabled={!exportRows.length}>
              Print Export
            </AppButton>
          </>
        }
      />

      <div className="space-y-4">
        <TipBanner
          title="Tip"
          message="History groups spot checks by date. Use print export for barcode-ready count sheets."
          accentColor="#2563EB"
        />

        <AppCard>
          <h2 className="card-title">Most Recent Spot Check</h2>
          {!canRunQuery ? (
            <p className="secondary-text mt-3">Select an organization + store to load spot checks.</p>
          ) : !latestGroup ? (
            <p className="secondary-text mt-3">No spot checks recorded yet for this store. Run the first spot check in the app to start history.</p>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-semibold">{latestGroup.displayDate}</p>
              <p className="secondary-text text-xs">{latestGroup.rows.length} counted batch row(s)</p>
              <div className="grid gap-2 md:grid-cols-2">
                {latestGroup.rows.slice(0, 12).map((row) => (
                  <div key={row.id} className="rounded-xl border border-app-border p-3">
                    <p className="text-sm font-semibold">{row.itemName}</p>
                    <p className="secondary-text text-xs">
                      {row.quantity.toFixed(row.unit === "lbs" ? 3 : 0)} {row.unit}
                      {row.expiresAt ? ` • exp ${row.expiresAt.toLocaleDateString()}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {spotCheckLoading ? <p className="secondary-text mt-2 text-xs">Refreshing...</p> : null}
        </AppCard>

        {historyOpen ? (
          <AppCard>
            <h2 className="card-title">Spot Check History</h2>
            {groupedByDate.length === 0 ? (
              <p className="secondary-text mt-3">No completed sessions yet. Spot checks will appear here once teams submit counts.</p>
            ) : (
              <div className="mt-3 grid gap-4 lg:grid-cols-[280px_1fr]">
                <div className="space-y-2">
                  {groupedByDate.map((entry) => (
                    <AppButton
                      key={entry.key}
                      variant="secondary"
                      className={`!h-auto !justify-start w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                        entry.key === selectedDateKey
                          ? "border-[color:var(--accent)] bg-[color:var(--app-surface-soft)]"
                          : "border-app-border"
                      }`}
                      onClick={() => setSelectedDateKey(entry.key)}
                    >
                      <p className="font-semibold">{entry.displayDate}</p>
                      <p className="secondary-text text-xs">{entry.rows.length} row(s)</p>
                    </AppButton>
                  ))}
                </div>

                <div className="space-y-2">
                  {selectedGroup?.rows.map((row) => (
                    <div key={`${selectedGroup.key}-${row.id}`} className="rounded-xl border border-app-border p-3">
                      <p className="text-sm font-semibold">{row.itemName}</p>
                      <p className="secondary-text text-xs">
                        Counted {row.quantity.toFixed(row.unit === "lbs" ? 3 : 0)} {row.unit}
                        {row.expiresAt ? ` • exp ${row.expiresAt.toLocaleDateString()}` : ""}
                      </p>
                      <p className="secondary-text text-xs">{row.checkedAt.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AppCard>
        ) : null}

        <AppCard>
          <h2 className="card-title">Export Preview</h2>
          <p className="secondary-text mt-1 text-xs">Matches iPhone export fields: item name, barcode, quantity.</p>
          {!canRunQuery ? (
            <p className="secondary-text mt-3">Select a store to preview export rows.</p>
          ) : exportRows.length === 0 ? (
            <p className="secondary-text mt-3">No UPC-coded items are available yet. Add items with barcodes or run receiving first, then export again.</p>
          ) : (
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {exportRows.map((row) => (
                <article key={row.id} className="rounded-2xl border border-app-border p-4">
                  <p className="text-sm font-semibold">{row.name}</p>
                  <p className="secondary-text mt-1 text-xs">Barcode: {row.barcode}</p>
                  <div className="mt-2">
                    <BarcodeSvg value={row.barcode} />
                  </div>
                  <p className="mt-2 text-xs font-semibold">Quantity: {row.quantity}</p>
                </article>
              ))}
            </div>
          )}
          {exportLoading ? <p className="secondary-text mt-2 text-xs">Refreshing export preview...</p> : null}
        </AppCard>
      </div>
    </div>
  )
}
