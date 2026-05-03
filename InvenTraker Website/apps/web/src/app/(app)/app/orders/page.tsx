"use client"

import { useMemo, useState } from "react"
import { AppButton, AppCard, AppCheckbox, AppInput, AppSelect, DataTable, type TableColumn } from "@inventracker/ui"
import { useMutation, useQuery } from "@tanstack/react-query"
import type { OrderRecommendation } from "@inventracker/shared"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  fetchOrgSettings,
  fetchOrgOrders,
  fetchStoreSettings,
  fetchVendors,
  type OrgOrderRecord
} from "@/lib/data/firestore"
import { downloadSpreadsheetExport } from "@/lib/exports/spreadsheet"
import {
  commitOrderRecommendations,
  getStoreRecommendations
} from "@/lib/firebase/functions"

type DraftLine = {
  itemId: string
  itemName: string
  unit: "each" | "lbs"
  recommendedQuantity: number
  finalQuantity: string
  onHand: number
  minQuantity: number
  rationaleSummary: string
  caseInterpretation: "direct_units" | "case_rounded"
  selected: boolean
}

function formatSuggestedQuantity(line: DraftLine): string {
  if (line.unit === "lbs") {
    return `${line.recommendedQuantity.toFixed(3)} lbs`
  }
  if (line.caseInterpretation === "case_rounded") {
    return `${Math.round(line.recommendedQuantity)} units (case rounded)`
  }
  return `${Math.round(line.recommendedQuantity)} each`
}

function draftFromRecommendation(row: OrderRecommendation): DraftLine {
  return {
    itemId: row.itemId,
    itemName: row.itemName ?? row.itemId,
    unit: row.unit,
    recommendedQuantity: row.recommendedQuantity,
    finalQuantity: row.recommendedQuantity.toString(),
    onHand: row.onHand,
    minQuantity: row.minQuantity,
    rationaleSummary: row.rationaleSummary,
    caseInterpretation: row.caseInterpretation,
    selected: row.recommendedQuantity > 0
  }
}

export default function OrdersPage() {
  const { activeOrgId, activeStoreId, activeOrg, activeStore, effectivePermissions } = useOrgContext()
  const [selectedVendorId, setSelectedVendorId] = useState("")
  const [previewRunId, setPreviewRunId] = useState<string | null>(null)
  const [previewMeta, setPreviewMeta] = useState<{ engineVersion: string; degraded: boolean; fallbackReason?: string } | null>(null)
  const [previewLines, setPreviewLines] = useState<DraftLine[]>([])
  const [previewQuestions, setPreviewQuestions] = useState<string[]>([])
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: vendors = [] } = useQuery({
    queryKey: ["order-vendors", activeOrgId],
    queryFn: () => fetchVendors(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const { data: existingOrders = [], refetch: refetchOrders } = useQuery({
    queryKey: ["org-orders", activeOrgId, activeStoreId],
    queryFn: () => fetchOrgOrders(activeOrgId, activeStoreId || undefined),
    enabled: Boolean(activeOrgId && activeStoreId),
    refetchInterval: 30_000
  })

  const { data: orgSettings } = useQuery({
    queryKey: ["orders-org-export-settings", activeOrgId],
    queryFn: () => fetchOrgSettings(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const { data: storeSettings } = useQuery({
    queryKey: ["orders-store-export-settings", activeOrgId, activeStoreId],
    queryFn: () => fetchStoreSettings(activeOrgId, activeStore!),
    enabled: Boolean(activeOrgId && activeStore)
  })

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!activeOrgId || !activeStoreId) return null
      return getStoreRecommendations({
        orgId: activeOrgId,
        storeId: activeStoreId,
        vendorId: selectedVendorId || undefined,
        domains: ["orders"],
        forceRefresh: true
      })
    },
    onSuccess: (result) => {
      if (!result) return
      setPreviewRunId(result.meta.runId)
      setPreviewMeta({
        engineVersion: result.meta.engineVersion,
        degraded: result.meta.degraded,
        fallbackReason: result.meta.fallbackReason
      })
      setPreviewLines(result.orderRecommendations.map(draftFromRecommendation))
      setPreviewQuestions(result.questions)
      setStatusMessage(`Preview ready: ${result.orderRecommendations.length} recommendation line(s).`)
      setErrorMessage(null)
    },
    onError: (error) => {
      setStatusMessage(null)
      setErrorMessage(error instanceof Error ? error.message : "Could not generate recommendation preview.")
    }
  })

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!activeOrgId || !activeStoreId || !previewRunId) return null
      const selectedLines = previewLines
        .filter((line) => line.selected)
        .map((line) => {
          const parsed = Number(line.finalQuantity)
          const finalQuantity = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
          return {
            itemId: line.itemId,
            finalQuantity,
            unit: line.unit,
            rationaleSummary: line.rationaleSummary
          }
        })
        .filter((line) => line.finalQuantity > 0)

      return commitOrderRecommendations({
        orgId: activeOrgId,
        storeId: activeStoreId,
        vendorId: selectedVendorId || undefined,
        runId: previewRunId,
        selectedLines
      })
    },
    onSuccess: async (result) => {
      if (!result) return
      setStatusMessage(`Order completed with ${result.lineCount} line(s). Order ${result.orderId} created.`)
      setErrorMessage(null)
      await refetchOrders()
    },
    onError: (error) => {
      setStatusMessage(null)
      setErrorMessage(error instanceof Error ? error.message : "Could not apply suggestions.")
    }
  })

  const suggestionColumns: TableColumn<DraftLine>[] = [
    {
      key: "selected",
      header: "Use",
      render: (row) => (
        <AppCheckbox
          checked={row.selected}
          onChange={(event) =>
            setPreviewLines((current) =>
              current.map((line) =>
                line.itemId === row.itemId ? { ...line, selected: event.target.checked } : line
              )
            )
          }
        />
      )
    },
    { key: "item", header: "Item", render: (row) => row.itemName },
    {
      key: "suggested",
      header: "Recommended",
      render: (row) => formatSuggestedQuantity(row)
    },
    {
      key: "final",
      header: "Final Qty",
      render: (row) => (
        <AppInput
          value={row.finalQuantity}
          onChange={(event) =>
            setPreviewLines((current) =>
              current.map((line) =>
                line.itemId === row.itemId ? { ...line, finalQuantity: event.target.value } : line
              )
            )
          }
          inputMode="decimal"
          className="h-9 w-28"
        />
      )
    },
    { key: "onHand", header: "On Hand", render: (row) => row.onHand.toFixed(3) },
    { key: "min", header: "Min", render: (row) => row.minQuantity.toFixed(3) },
    { key: "reason", header: "Rationale", render: (row) => row.rationaleSummary }
  ]

  const groupedOrders = useMemo(() => {
    const grouped = new Map<string, OrgOrderRecord[]>()
    for (const order of existingOrders) {
      const key = `${order.vendorName ?? order.vendorId ?? "No Vendor"}|${String(order.orderDate ?? "")}`
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)?.push(order)
    }
    return Array.from(grouped.entries()).map(([key, rows]) => ({ key, rows }))
  }, [existingOrders])

  const exportOrders = () => {
    if (existingOrders.length === 0) return
    downloadSpreadsheetExport({
      dataset: "orders",
      rows: existingOrders as unknown as Array<Record<string, unknown>>,
      settings: { orgSettings, storeSettings },
      organizationName: activeOrg?.organizationName,
      storeName: activeStore?.title ?? activeStore?.name,
      scopeLabel: activeStore ? `${activeStore.title ?? activeStore.name} Orders` : "Orders"
    })
  }

  return (
    <div>
      <PageHead
        title="Orders"
        subtitle="Single-engine backend recommendations. Quantities are prefilled and fully editable before completion."
        actions={
          <div className="flex flex-wrap gap-2">
            <AppButton
              variant="secondary"
              onClick={exportOrders}
              disabled={!effectivePermissions.exportData || existingOrders.length === 0}
            >
              Export
            </AppButton>
            <AppButton
              variant="secondary"
              onClick={() => previewMutation.mutate()}
              disabled={!effectivePermissions.generateOrders || previewMutation.isPending || !activeStoreId}
            >
              {previewMutation.isPending ? "Generating..." : "Generate Preview"}
            </AppButton>
            <AppButton
              onClick={() => applyMutation.mutate()}
              disabled={
                !effectivePermissions.generateOrders ||
                applyMutation.isPending ||
                !previewRunId ||
                previewLines.every((line) => !line.selected)
              }
            >
              {applyMutation.isPending ? "Completing..." : "Complete Order"}
            </AppButton>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.05fr_1.95fr]">
        <AppCard>
          <h2 className="card-title">Preview Configuration</h2>
          <div className="mt-3 grid gap-3">
            <AppSelect
              value={selectedVendorId}
              onChange={(event) => setSelectedVendorId(event.target.value)}
            >
              <option value="">All vendors</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </AppSelect>

            <p className="secondary-text text-sm">
              Recommendations are generated by the shared backend engine (`rules_v1`) to keep web and iOS in sync.
            </p>

            {previewMeta ? (
              <div className="rounded-2xl border border-app-border px-3 py-2 text-xs text-app-muted">
                Engine: {previewMeta.engineVersion} · Mode: {previewMeta.degraded ? "Degraded fallback" : "Primary"}
                {previewMeta.fallbackReason ? ` · ${previewMeta.fallbackReason}` : ""}
              </div>
            ) : null}

            {previewQuestions.length > 0 ? (
              <div className="rounded-2xl border border-app-border px-3 py-2 text-xs text-app-muted">
                {previewQuestions.slice(0, 3).map((question) => (
                  <p key={question}>• {question}</p>
                ))}
              </div>
            ) : null}
          </div>
        </AppCard>

        <AppCard>
          <h2 className="card-title mb-3">Recommendation Preview</h2>
          <DataTable
            columns={suggestionColumns}
            rows={previewLines}
            empty="No preview yet. Select a vendor and click Generate to fetch server recommendations for this store."
          />
        </AppCard>
      </div>

      <AppCard className="mt-4">
        <h2 className="card-title">Saved Order Rows</h2>
        <div className="mt-3 space-y-3">
          {groupedOrders.length === 0 ? (
            <p className="secondary-text">No completed orders saved yet. Review a recommendation preview and click Complete to save lines.</p>
          ) : (
            groupedOrders.map((group) => (
              <div key={group.key} className="rounded-2xl border border-app-border p-3">
                <p className="text-sm font-semibold">{group.key.split("|")[0]}</p>
                <p className="secondary-text">{group.rows.length} lines</p>
                <div className="mt-2 grid gap-1 text-sm">
                  {group.rows.slice(0, 8).map((row) => (
                    <p key={row.id} className="secondary-text">
                      {row.itemName ?? row.itemId ?? "Item"} · rec {row.recommendedQuantity ?? 0} · ordered {row.orderedQuantity ?? 0}
                    </p>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </AppCard>

      {statusMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      ) : null}
    </div>
  )
}
