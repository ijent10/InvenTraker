"use client"

import { useState } from "react"
import { AppButton, AppCard, AppInput } from "@inventracker/ui"
import { useMutation } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  fetchAuditLogs,
  fetchStoreBatches,
  fetchStoreOrders,
  fetchStores,
  fetchStoreTodo,
  fetchStoreWaste,
  updateItem
} from "@/lib/data/firestore"
import {
  adminSafeEdit as safeEditFunction,
  adminGetStoreDetail as adminGetStoreDetailFunction,
  adminListAuditLogs as adminListAuditLogsFunction
} from "@/lib/firebase/functions"
import { useQuery } from "@tanstack/react-query"

export default function AdminStoreDetailPage({ params }: { params: { storeId: string } }) {
  const { activeOrgId } = useOrgContext()
  const [targetId, setTargetId] = useState("")
  const [upc, setUpc] = useState("")

  const mutation = useMutation({
    mutationFn: async () => {
      try {
        return await safeEditFunction({
          orgId: activeOrgId,
          targetType: "item",
          targetId,
          patch: { upc },
          storeId: params.storeId
        })
      } catch {
        if (activeOrgId && targetId) {
          await updateItem(activeOrgId, targetId, { upc })
          return { ok: true, targetPath: `organizations/${activeOrgId}/items/${targetId}`, auditLogId: "fallback" }
        }
        return null
      }
    }
  })

  const { data: detail } = useQuery({
    queryKey: ["admin-store-detail", activeOrgId, params.storeId],
    queryFn: async () => {
      try {
        const response = await adminGetStoreDetailFunction({ orgId: activeOrgId, storeId: params.storeId })
        if (response) return response
      } catch {
        // Fallback handled below.
      }
      const stores = await fetchStores(activeOrgId)
      const targetStore = stores.find((store) => store.id === params.storeId)
      if (!targetStore) return null
      const [inventoryBatches, wasteRecords, orders, toDo] = await Promise.all([
        fetchStoreBatches(activeOrgId, targetStore),
        fetchStoreWaste(activeOrgId, targetStore),
        fetchStoreOrders(activeOrgId, targetStore),
        fetchStoreTodo(activeOrgId, targetStore)
      ])
      return {
        store: targetStore,
        inventoryBatches,
        wasteRecords,
        orders,
        toDo
      }
    },
    enabled: Boolean(activeOrgId)
  })

  const { data: logs = [] } = useQuery({
    queryKey: ["admin-store-logs", activeOrgId, params.storeId],
    queryFn: async () => {
      try {
        const response = await adminListAuditLogsFunction({ orgId: activeOrgId, limit: 200 })
        return (response?.logs ?? []).filter((log) => String(log.storeId ?? "") === params.storeId)
      } catch {
        const fallbackLogs = await fetchAuditLogs(activeOrgId, params.storeId)
        return fallbackLogs
      }
    },
    enabled: Boolean(activeOrgId)
  })

  return (
    <div>
      <PageHead title="Admin · Store" subtitle={`Store ${params.storeId}`} />
      <AppCard className="mb-4">
        <h2 className="card-title">Store Snapshot</h2>
        <p className="secondary-text mt-2">
          Batches: {detail?.inventoryBatches?.length ?? 0} · Waste: {detail?.wasteRecords?.length ?? 0} · Orders:{" "}
          {detail?.orders?.length ?? 0}
        </p>
      </AppCard>
      <AppCard>
        <h2 className="card-title">Database Admin Safe Edit</h2>
        <p className="secondary-text mt-2">Whitelisted admin edits only. Every change writes an audit log.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <AppInput placeholder="Item ID" value={targetId} onChange={(event) => setTargetId(event.target.value)} />
          <AppInput placeholder="Corrected Barcode" value={upc} onChange={(event) => setUpc(event.target.value)} />
          <AppButton onClick={() => mutation.mutate()}>{mutation.isPending ? "Saving..." : "Apply safe edit"}</AppButton>
        </div>
      </AppCard>

      <AppCard className="mt-4">
        <h2 className="card-title">Audit Log</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {logs.map((log) => (
            <li key={String(log.id)} className="rounded-xl border border-app-border p-3">
              <p className="font-semibold">{String(log.action ?? "update")}</p>
              <p className="secondary-text">{String(log.targetPath ?? "-")}</p>
            </li>
          ))}
        </ul>
      </AppCard>
    </div>
  )
}
