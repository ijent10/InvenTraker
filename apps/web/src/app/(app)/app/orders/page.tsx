"use client"

import { useMemo, useState } from "react"
import { AppButton, AppCard, AppSelect, DataTable, type TableColumn } from "@inventracker/ui"
import { useMutation, useQuery } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  fetchOrgOrders,
  fetchVendors,
  generateOrderSuggestionsFromOrgData,
  type OrderSuggestionLine,
  type OrgOrderRecord
} from "@/lib/data/firestore"

export default function OrdersPage() {
  const { user } = useAuthUser()
  const { activeOrgId, activeStoreId, effectivePermissions } = useOrgContext()
  const [selectedVendorId, setSelectedVendorId] = useState("")
  const [generatedLines, setGeneratedLines] = useState<OrderSuggestionLine[]>([])
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
    enabled: Boolean(activeOrgId)
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeOrgId) return null
      return generateOrderSuggestionsFromOrgData(
        activeOrgId,
        activeStoreId || undefined,
        selectedVendorId || undefined,
        user?.uid
      )
    },
    onSuccess: async (result) => {
      if (!result) return
      setGeneratedLines(result.lines)
      setStatusMessage(`Generated ${result.lines.length} suggestions and created ${result.orderIds.length} order rows.`)
      setErrorMessage(null)
      await refetchOrders()
    },
    onError: () => {
      setErrorMessage("Could not generate suggestions.")
      setStatusMessage(null)
    }
  })

  const suggestionColumns: TableColumn<OrderSuggestionLine>[] = [
    { key: "itemName", header: "Item", render: (row) => row.itemName },
    {
      key: "qty",
      header: "Suggested",
      render: (row) => `${row.suggestedQty.toFixed(row.unit === "lbs" ? 3 : 0)} ${row.unit}`
    },
    { key: "onhand", header: "On Hand", render: (row) => row.onHand.toFixed(3) },
    { key: "min", header: "Min", render: (row) => row.minQuantity.toFixed(3) },
    { key: "reason", header: "Rationale", render: (row) => row.rationale }
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

  return (
    <div>
      <PageHead
        title="Orders"
        subtitle="Generate order suggestions using current stock + vendor schedule. Includes 0-qty items so users can still order manually."
        actions={
          <AppButton
            onClick={() => mutation.mutate()}
            disabled={!effectivePermissions.generateOrders || mutation.isPending}
          >
            {mutation.isPending ? "Generating..." : "Generate Suggestions"}
          </AppButton>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.9fr]">
        <AppCard>
          <h2 className="card-title">Generate</h2>
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
              Suggestions use min quantity, on-hand stock, case size, and vendor lead time. Items with 0 suggestion remain visible.
            </p>
          </div>
        </AppCard>

        <AppCard>
          <h2 className="card-title mb-3">Suggested Lines</h2>
          <DataTable
            columns={suggestionColumns}
            rows={generatedLines}
            empty="No suggestions yet. Generate an order to populate."
          />
        </AppCard>
      </div>

      <AppCard className="mt-4">
        <h2 className="card-title">Saved Order Rows</h2>
        <div className="mt-3 space-y-3">
          {groupedOrders.length === 0 ? (
            <p className="secondary-text">No orders saved yet.</p>
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
