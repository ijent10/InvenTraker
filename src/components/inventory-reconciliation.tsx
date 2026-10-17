"use client"
import { useEffect, useState } from "react"
import { useAuthSession } from "@/lib/auth-session"
import type { ReconciliationReport } from "@/lib/engines/inventory/reconciliation"
import { Button, ButtonLink, Panel, StatusPill } from "@/components/ui"

type Report = ReconciliationReport & { stores: { id: string; name: string }[]; storesPartial: boolean }
export function InventoryReconciliation() {
  const session = useAuthSession()
  const [storeId, setStoreId] = useState("")
  const [selectionOrg, setSelectionOrg] = useState("")
  const [page, setPage] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [result, setResult] = useState<{ orgId: string; report: Report } | null>(null)
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const selectedStore = selectionOrg === session.orgId ? storeId : ""
  const report = result?.orgId === session.orgId && (!selectedStore || result.report.storeId === selectedStore) ? result.report : null
  const stores = result?.orgId === session.orgId ? result.report.stores : []
  useEffect(() => {
    const controller = new AbortController()
    setMessage(""); setLoading(false); setPage(0)
    if (!session.user || session.status !== "ready") return () => controller.abort()
    const user = session.user
    setLoading(true)
    void (async () => {
      try {
        const token = await user.getIdToken()
        const response = await fetch(`/api/v1/inventory/reconciliation${selectedStore ? `?storeId=${encodeURIComponent(selectedStore)}` : ""}`, { headers: { Authorization: `Bearer ${token}`, "x-inventracker-org": session.orgId }, signal: controller.signal, cache: "no-store" })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error?.message || "The stock review could not be loaded.")
        if (!controller.signal.aborted) setResult({ orgId: session.orgId, report: body })
      } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "The stock review could not be loaded.") }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [session.orgId, session.user, session.status, selectedStore, refresh])
  return <div className="space-y-5">
    <Panel className="p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="grid gap-2 text-sm font-semibold">Store<select aria-label="Store to review" className="min-h-11 rounded-control border border-[var(--app-border)] bg-[var(--app-panel)] px-3" value={selectedStore || report?.storeId || ""} disabled={loading || !stores.length} onChange={event => { setSelectionOrg(session.orgId); setStoreId(event.target.value) }}>
          {!report && <option value="">Choose a store</option>}{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select></label>
        <Button disabled={loading || session.status !== "ready"} onClick={() => setRefresh(value => value + 1)}>{loading ? "Reviewing stock…" : "Refresh review"}</Button>
      </div>
      <p className="mt-4 text-sm text-[var(--app-muted)]">Compare saved quantities with batch detail and movement history. Review a discrepancy with a spot count before making a stock adjustment.</p>
      <p className="mt-2 text-xs text-[var(--app-subtle)]">This review does not change stock. Archived items are included. Older stock may have no movement baseline.</p>
    </Panel>
    <div role="status" aria-live="polite">{message || (loading ? "Reviewing the selected store…" : session.status !== "ready" ? "Sign in and choose an organization to review stock." : "")}</div>
    {report && <>
      <Panel className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{report.status === "balanced" ? "No differences found" : report.status === "incomplete" ? "Review incomplete" : "Items need review"}</h2><StatusPill tone={report.status === "balanced" ? "green" : "amber"}>{report.issues.length} findings</StatusPill></div>
        <p className="mt-3 text-sm text-[var(--app-muted)]">{report.checked.items} items · {report.checked.batches} batches · {report.checked.operations} movements reviewed</p>
        <p className="mt-2 text-xs text-[var(--app-subtle)]">Updated {new Date(report.generatedAt).toLocaleString()}. Counts can change after this review.</p>
        {report.partial && <p className="mt-3 text-sm text-[var(--app-muted)]">This store exceeds the review limit of 1,000 records per source. Results cover a partial snapshot and cannot confirm the whole store. Ask an administrator for a full reconciliation.</p>}
        {report.storesPartial && <p className="mt-3 text-sm text-[var(--app-muted)]">The store selector shows only part of the organization’s store directory.</p>}
        {!report.issues.length && <p className="mt-3 text-sm text-[var(--app-muted)]">{report.partial ? "No differences were found in the reviewed records." : "Saved totals, batches, and the reviewed movement balances agree."}</p>}
      </Panel>
      <ul className="grid gap-3 md:grid-cols-2" aria-label="Stock review findings">{report.issues.slice(page * 50, (page + 1) * 50).map((issue, index) => <li key={`${issue.code}-${issue.itemId}-${index}`}><Panel className="h-full p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{issue.itemName}</h3><StatusPill tone={issue.severity === "error" ? "red" : "amber"}>{issue.severity === "error" ? "Difference found" : "Review needed"}</StatusPill></div><p className="mt-3 text-sm text-[var(--app-muted)]">{issue.message}</p>{issue.itemId && <div className="mt-3"><ButtonLink href={`/inventory/${encodeURIComponent(issue.itemId)}`} variant="ghost">Open item</ButtonLink></div>}</Panel></li>)}</ul>
      {report.issues.length > 50 && <div className="flex flex-wrap items-center justify-between gap-3" aria-label="Finding pages"><Button variant="secondary" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous findings</Button><span className="text-sm text-[var(--app-muted)]">{page * 50 + 1}–{Math.min((page + 1) * 50, report.issues.length)} of {report.issues.length}</span><Button variant="secondary" disabled={(page + 1) * 50 >= report.issues.length} onClick={() => setPage(value => value + 1)}>Next findings</Button></div>}
    </>}
  </div>
}
