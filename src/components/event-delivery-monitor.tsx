"use client"
import { useEffect, useState } from "react"
import { useAuthSession } from "@/lib/auth-session"
import { Button, Panel, StatusPill } from "@/components/ui"
import type { DeliveryMonitor, DeliveryMonitorRow } from "@/lib/engines/events/delivery-health"
const date = (value: string | null) => value ? new Date(value).toLocaleString() : "Not recorded"
const reasons: Record<string, string> = {
  invalid_event: "The event format needs review.", event_scope_invalid: "The event’s organization or movement reference could not be verified.", movement_scope_invalid: "The movement and event scopes do not match.", invalid_retry_time: "The retry time is invalid.", invalid_attempt_count: "The retry count is invalid.", delivery_failed: "Delivery failed. Check the movement and worker logs before retrying.", unknown_error: "This event needs administrator review."
}
function Events({ rows, partial, empty }: { rows: DeliveryMonitorRow[]; partial: boolean; empty: string }) {
  if (!rows.length) return <p className="text-sm text-[var(--app-muted)]">{empty}</p>
  return <><ul className="space-y-3">{rows.map(row => <li key={row.id} className="rounded-control border border-[var(--app-border)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{row.scope?.operationType.replaceAll("_", " ") || "Unverified event"}</p><p className="mt-1 break-words text-sm text-[var(--app-muted)]">{row.scope ? `${row.scope.organizationId} · ${row.scope.storeId}` : "Scope is hidden until the event can be verified."}</p></div><StatusPill tone={row.status === "dead_letter" ? "red" : "amber"}>{row.status === "dead_letter" ? "Review needed" : row.attempts ? "Retry queued" : "Queued"}</StatusPill></div><p className="mt-3 text-sm text-[var(--app-muted)]">{row.errorCode ? reasons[row.errorCode] : "Waiting for the next worker run."}</p><p className="mt-2 text-xs text-[var(--app-subtle)]">Attempts: {row.attempts ?? "Unknown"} · {row.status === "pending" ? `Next attempt: ${date(row.nextAttemptAt)}` : `Last attempt: ${date(row.lastAttemptAt)}`}</p><details className="mt-3 text-xs text-[var(--app-subtle)]"><summary className="cursor-pointer">Event reference</summary><p className="mt-2 break-all">{row.scope?.operationId || row.id}</p></details></li>)}</ul>{partial && <p className="mt-3 text-sm text-[var(--app-muted)]">Showing the first 50 matching events. Counts above include the whole queue.</p>}</>
}
export function EventDeliveryMonitor() {
  const session = useAuthSession()
  const [snapshot, setSnapshot] = useState<{ uid: string; data: DeliveryMonitor } | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!session.user || !session.platformAdmin) return
    const user = session.user
    let disposed = false, active = false
    let controller: AbortController | null = null
    async function load() {
      if (active || document.visibilityState === "hidden") return
      active = true; setBusy(true); setMessage(""); controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 20_000)
      try {
        const r = await fetch("/api/platform/event-delivery", { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, signal: controller.signal, cache: "no-store" })
        const data = await r.json()
        if (!r.ok) { if (!disposed && (r.status === 401 || r.status === 403)) setSnapshot(null); throw new Error(data.error?.message || "Delivery status could not be loaded.") }
        if (!disposed) setSnapshot({ uid: user.uid, data })
      } catch (error) { if (!disposed) setMessage(error instanceof Error ? error.message : "Delivery status could not be loaded.") }
      finally { clearTimeout(timeout); active = false; if (!disposed) setBusy(false) }
    }
    void load()
    const interval = setInterval(() => void load(), 60_000)
    const resume = () => void load()
    document.addEventListener("visibilitychange", resume); window.addEventListener("online", resume)
    return () => { disposed = true; controller?.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume) }
  }, [session.user, session.platformAdmin, attempt])
  if (!session.user || !session.platformAdmin) return <Panel className="p-5"><p>Platform administrator access is required to review delivery status.</p></Panel>
  const data = snapshot?.uid === session.user.uid ? snapshot.data : null
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[var(--app-muted)]">Refreshes every minute while this page is visible.</p><Button disabled={busy} onClick={() => setAttempt(value => value + 1)}>{busy ? "Checking…" : "Refresh status"}</Button></div>
    <p role="status" aria-live="polite" className="text-sm text-[var(--app-muted)]">{message || (!data ? "Loading delivery status…" : "")}</p>
    {data && <>
      <Panel className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{message ? "Showing the last status" : data.state === "healthy" ? "Delivery is running" : data.state === "unknown" ? "Worker status is unconfirmed" : "Delivery needs attention"}</h2><StatusPill tone={message || data.state !== "healthy" ? "amber" : "green"}>{!data.enabled ? "Dispatch paused" : "Scheduled worker"}</StatusPill></div><p className="mt-3 text-sm text-[var(--app-muted)]">Last successful run: {date(data.worker.lastSuccessAt)}</p>{data.worker.lastFailureAt && <p className="mt-2 text-sm text-[var(--app-muted)]">Last failed run: {date(data.worker.lastFailureAt)}</p>}<p className="mt-3 text-xs text-[var(--app-subtle)]">Checked {date(data.generatedAt)}. These counts can change while the worker runs.</p></Panel>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Queued", data.counts.pending], ["Ready for delivery", data.counts.due], ["Invalid schedule", data.counts.unscheduled], ["Need review", data.counts.deadLetters]].map(([label, count]) => <Panel key={label} className="p-4"><p className="text-sm text-[var(--app-muted)]">{label}</p><p className="mt-2 text-2xl font-semibold">{count}</p></Panel>)}</div>
      {data.counts.unscheduled > 0 && <Panel className="p-5"><p className="text-sm">Some queued events have missing or invalid schedules. They need administrator investigation before the worker can deliver them.</p></Panel>}
      <div className="grid items-start gap-5 xl:grid-cols-2"><Panel className="p-5"><h2 className="mb-4 text-lg font-semibold">Events needing review</h2><Events rows={data.deadLetters} partial={data.deadLettersPartial} empty="No retained failures were found." /></Panel><Panel className="p-5"><h2 className="mb-4 text-lg font-semibold">Delivery queue</h2><Events rows={data.pending} partial={data.pendingPartial} empty="No scheduled events are waiting." /></Panel></div>
      <p className="text-sm text-[var(--app-muted)]">This page is read-only. It does not change stock or replay events. Alerts by email or other channels are not configured.</p>
    </>}
  </div>
}
