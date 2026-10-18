"use client"
import { useEffect, useState } from "react"
import { useAuthSession } from "@/lib/auth-session"
import { Button, ButtonLink, Panel, StatusPill } from "@/components/ui"
import type { ItemMovement } from "@/lib/engines/inventory/movements"
type Page = { schemaVersion: "1"; itemName: string; revision: number | null; rows: ItemMovement[]; scannedCount: number; nextCursor: string | null; complete: boolean }
const labels: Record<ItemMovement["type"], string> = { receipt: "Received stock", area_transfer: "Stock area transfer", restock_reconciliation: "Restock and floor count", discard: "Discarded stock", portion_reclassification: "Portioned stock", count_adjustment: "Verified count", threshold_change: "Stock targets changed", unknown: "Unrecognized movement" }
function balance(value: ItemMovement["before"]) {
  if (!value) return "Saved values need review"
  if ("onHand" in value) return `Floor ${value.frontStock} · Back ${value.backStock} · Total ${value.onHand}`
  return `Par ${value.par} · Reorder ${value.reorderPoint}`
}
export function InventoryMovements({ storeId, itemId }: { storeId: string; itemId: string }) {
  const session = useAuthSession()
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [pageNumber, setPageNumber] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [result, setResult] = useState<{ scope: string; page: Page } | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const cursor = cursors[pageNumber]
  const scope = `${session.user?.uid}:${session.orgId}:${storeId}:${itemId}:${cursor ?? "first"}`
  useEffect(() => { setCursors([null]); setPageNumber(0) }, [session.orgId, session.user?.uid, storeId, itemId])
  useEffect(() => {
    const controller = new AbortController()
    setError(""); setLoading(false)
    if (!session.user || session.status !== "ready" || !storeId || !itemId) return () => controller.abort()
    const user = session.user
    setLoading(true)
    void (async () => {
      try {
        const params = new URLSearchParams({ storeId, itemId }); if (cursor) params.set("cursor", cursor)
        const r = await fetch(`/api/v1/inventory/movements?${params}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}`, "x-inventracker-org": session.orgId }, signal: controller.signal, cache: "no-store" })
        const data = await r.json()
        if (!r.ok) throw new Error(data.error?.message || "Movement history could not be loaded.")
        if (!controller.signal.aborted) setResult({ scope, page: data })
      } catch (error) { if (!controller.signal.aborted) { setResult(null); setError(error instanceof Error ? error.message : "Movement history could not be loaded.") } }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [session.user, session.status, session.orgId, storeId, itemId, cursor, scope, refresh])
  const data = session.status === "ready" && result?.scope === scope ? result.page : null
  function restart() { setCursors([null]); setPageNumber(0); setResult(null); setRefresh(v => v + 1) }
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><ButtonLink href={itemId ? `/inventory/${encodeURIComponent(itemId)}` : "/inventory"} variant="secondary">Back to item</ButtonLink><Button disabled={loading} onClick={restart}>Start fresh review</Button></div>
    <p role="status" aria-live="polite">{error || (loading ? "Loading movement history…" : !storeId || !itemId ? "Open movement history from an inventory item." : session.status !== "ready" ? "Sign in to review movement history." : "")}</p>
    {data && <><Panel className="p-5"><h2 className="text-lg font-semibold">{data.itemName}</h2><p className="mt-2 text-sm text-[var(--app-muted)]">Revision {data.revision ?? "unverified"} · Page {pageNumber + 1} · {data.rows.length} matching movements</p><p className="mt-2 text-sm text-[var(--app-muted)]">This review includes older records without a new movement label. Pages use stable record references; revision numbers show the sequence of changes. Stock changes require a fresh review.</p><p className="mt-2 text-xs text-[var(--app-subtle)]">{data.scannedCount} store records searched on this page. Some pages may contain no matching items. This view does not change stock.</p></Panel>
      <ul className="space-y-3" aria-label="Movement history">{[...data.rows].sort((a, b) => (b.after?.revision ?? -1) - (a.after?.revision ?? -1)).map(row => <li key={row.operationId}><Panel className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{labels[row.type]}</h3><StatusPill tone={row.verified ? "green" : "amber"}>{row.verified ? `Revision ${row.after?.revision}` : "Review needed"}</StatusPill></div><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-[var(--app-subtle)]">Before</p><p className="mt-1">{balance(row.before)}</p></div><div><p className="text-[var(--app-subtle)]">After</p><p className="mt-1">{balance(row.after)}</p></div></div><p className="mt-3 text-xs text-[var(--app-subtle)]">{row.createdAt ? new Date(row.createdAt).toLocaleString() : "Date unverified"}{row.unit ? ` · ${row.unit}` : ""}</p><details className="mt-3 text-xs text-[var(--app-subtle)]"><summary className="cursor-pointer">Movement reference</summary><p className="mt-2 break-all">{row.operationId}</p></details></Panel></li>)}</ul>
      {!data.rows.length && <Panel className="p-5"><p className="text-sm text-[var(--app-muted)]">No movements for this item were found on this page.{!data.complete ? " Continue to search more records." : " The end of the history has been reached."}</p></Panel>}
      <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="secondary" disabled={loading || pageNumber === 0} onClick={() => setPageNumber(v => v - 1)}>Previous page</Button><span className="text-sm text-[var(--app-muted)]">{data.complete ? "End of history reached" : "More records available"}</span><Button disabled={loading || !data.nextCursor} onClick={() => { if (!data.nextCursor) return; setCursors(old => [...old.slice(0, pageNumber + 1), data.nextCursor]); setPageNumber(v => v + 1) }}>Next page</Button></div>
    </>}
  </div>
}
