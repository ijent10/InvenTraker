"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useAuthSession } from "@/lib/auth-session"
import { Button, Panel, StatusPill } from "@/components/ui"
import type { OperationSession, SessionContent } from "@/lib/engines/operations/sessions"

type Item = OperationSession["items"][number]
type Directory = { assignees: { id: string; name: string }[]; assigneesPartial: boolean; storeId: string; stores: { id: string; name: string }[]; storesPartial: boolean; items: Item[]; itemsPartial: boolean; sessions: OperationSession[]; sessionsPartial: boolean; canReview: boolean; uid: string }
const field = "min-h-11 rounded-control border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-sm"
function Sessions({ kind }: { kind: "count" | "receiving" }) {
  const auth = useAuthSession()
  const [data, setData] = useState<Directory | null>(null)
  const [storeId, setStoreId] = useState("")
  const [current, setCurrent] = useState<OperationSession | null>(null)
  const [title, setTitle] = useState("")
  const [assignedTo, setAssignedTo] = useState("")
  const [note, setNote] = useState("")
  const [reference, setReference] = useState("")
  const [reviewNote, setReviewNote] = useState("")
  const [lines, setLines] = useState<{ itemId: string; front: string; back: string; quantity: string; expectedRevision: number }[]>([])
  const [itemId, setItemId] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [creating, setCreating] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const draftId = useRef("")
  const user = auth.user
  const request = useCallback(async (body?: unknown, signal?: AbortSignal) => {
    if (!user) throw new Error("Sign in to open tasks.")
    const response = await fetch(`/api/v1/operations/sessions${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ""}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${await user.getIdToken()}`, "x-inventracker-org": auth.orgId, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message ?? "This task could not be loaded.")
    return result
  }, [user, auth.orgId, storeId])
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setCurrent(null); setCreating(false); setMessage("")
    if (auth.status !== "ready") return () => controller.abort()
    void request(undefined, controller.signal).then(result => { if (!controller.signal.aborted) setData(result) }).catch(error => { if (!controller.signal.aborted) setMessage(error.message) })
    return () => controller.abort()
  }, [request, auth.status, refresh])
  const open = (value: OperationSession) => {
    setCurrent(value); setCreating(false); setTitle(value.title); setAssignedTo(value.assignedTo); setNote(value.note); setReference(value.supplierReference); setReviewNote("")
    setLines(value.payload.lines.map(line => ({ itemId: line.itemId, front: "frontStock" in line ? String(line.frontStock) : "", back: "backStock" in line ? String(line.backStock) : "", quantity: "quantity" in line ? String(line.quantity) : "", expectedRevision: "expectedRevision" in line ? line.expectedRevision : 0 })))
  }
  const act = async (action: string) => {
    if (!data) return
    setBusy(true); setMessage("")
    try {
      let body: unknown
      if (action === "save") {
        if (!lines.length || lines.some(line => kind === "count" ? !line.front.trim() || !line.back.trim() : !line.quantity.trim())) throw new Error("Enter a quantity for every item, including zero for an empty area.")
        // Preserve saved receipt/order/expiration detail that this form does not edit.
        const payload = { lines: lines.map(line => {
          const previous = current?.payload.lines.find(entry => entry.itemId === line.itemId)
          return kind === "count" ? { ...previous, itemId: line.itemId, expectedRevision: line.expectedRevision, frontStock: Number(line.front), backStock: Number(line.back) } : { ...previous, itemId: line.itemId, quantity: Number(line.quantity) }
        }) }
        const content = { kind, title, note, supplierReference: reference, assignedTo: assignedTo || data.uid, payload } as SessionContent
        body = current ? { action: "save", id: current.id, expectedRevision: current.revision, content } : { action: "create", id: draftId.current, storeId: data.storeId, content }
      } else if (current) body = { action, id: current.id, expectedRevision: current.revision, reviewNote }
      if (!body) return
      const result = await request(body)
      open(result.session)
      setData(previous => previous ? { ...previous, sessions: [result.session, ...previous.sessions.filter(value => value.id !== result.session.id)] } : previous)
      setMessage(action === "post" ? "Approved. Inventory and movement history are updated." : action === "submit" ? "Submitted for manager review. Stock has not changed." : "Task saved.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "This task could not be saved.") }
    finally { setBusy(false) }
  }
  const unsaved = current?.status === "draft" && (title !== current.title || note !== current.note || reference !== current.supplierReference || assignedTo !== current.assignedTo || JSON.stringify(lines) !== JSON.stringify(current.payload.lines.map(line => ({ itemId: line.itemId, front: "frontStock" in line ? String(line.frontStock) : "", back: "backStock" in line ? String(line.backStock) : "", quantity: "quantity" in line ? String(line.quantity) : "", expectedRevision: "expectedRevision" in line ? line.expectedRevision : 0 }))))
  const editing = creating || current?.status === "draft"
  return <div className="space-y-5">
    <Panel className="p-5"><div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-2 text-sm">Store<select className={field} disabled={busy || !data} value={data?.storeId ?? storeId} onChange={event => setStoreId(event.target.value)}>{!data && <option value="">Loading stores…</option>}{data?.stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <Button disabled={!data || busy} onClick={() => { draftId.current = crypto.randomUUID(); setCurrent(null); setCreating(true); setAssignedTo(data?.uid ?? ""); setTitle(kind === "count" ? "Spot count" : "Delivery"); setNote(""); setReference(""); setLines([]); setMessage("") }}>New {kind === "count" ? "count" : "delivery"}</Button>
      <Button variant="secondary" disabled={busy || auth.status !== "ready"} onClick={() => setRefresh(value => value + 1)}>Reload saved tasks</Button>
    </div><p className="mt-3 text-sm text-[var(--app-muted)]">Save a draft, submit it for review, then have a manager approve the stock changes. Reloading or switching stores replaces unsaved edits.</p></Panel>
    <p role="status" aria-live="polite">{message || (auth.status !== "ready" ? "Sign in to start a task." : "")}</p>
    {data && (data.itemsPartial || data.sessionsPartial || data.storesPartial) && <p className="text-sm text-[var(--app-muted)]">This view shows a limited directory: up to 200 items, 100 tasks per query, and 200 stores. Additional records may not be shown.</p>}
    {(creating || current) && <Panel className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{creating ? "New draft" : current?.title}</h2>{current && <StatusPill tone={current.status === "posted" ? "green" : "blue"}>{current.status}</StatusPill>}</div>
      {unsaved && <p className="text-sm text-[var(--app-muted)]">Save your changes before submitting for review.</p>}
      {editing ? <>
        <label className="grid gap-2 text-sm">Title<input className={field} disabled={busy} maxLength={100} value={title} onChange={event => setTitle(event.target.value)} /></label>
        {data?.canReview && <label className="grid gap-2 text-sm">Assigned employee<select className={field} disabled={busy} value={assignedTo} onChange={event => setAssignedTo(event.target.value)}>{!data.assignees.some(value => value.id === assignedTo) && <option value={assignedTo}>Current assignee</option>}{data.assignees.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select>{data.assigneesPartial && <span>The employee list is limited to 200 records.</span>}</label>}
        {kind === "receiving" && <label className="grid gap-2 text-sm">Supplier or delivery reference<input className={field} disabled={busy} maxLength={120} value={reference} onChange={event => setReference(event.target.value)} /></label>}
        <label className="grid gap-2 text-sm">Notes<textarea className={`${field} py-3`} disabled={busy} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></label>
        <div className="flex flex-wrap gap-3"><label className="grid flex-1 gap-2 text-sm">Add an item<select className={field} disabled={busy} value={itemId} onChange={event => setItemId(event.target.value)}><option value="">Choose an item</option>{data?.items.filter(item => !lines.some(line => line.itemId === item.id)).map(item => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></label><Button variant="secondary" disabled={!itemId || busy} onClick={() => { const item = data?.items.find(value => value.id === itemId); if (item) setLines(previous => [...previous, { itemId: item.id, front: "", back: "", quantity: "", expectedRevision: item.revision }]); setItemId("") }}>Add item</Button></div>
      </> : <><p className="text-sm text-[var(--app-muted)]">{current?.note}</p>{current?.supplierReference && <p className="text-sm">Delivery reference: {current.supplierReference}</p>}</>}
      {current?.reviewNote && <p className="rounded-control bg-[var(--app-panel-muted)] p-3 text-sm">Review note: {current.reviewNote}</p>}
      <ul className="space-y-3">{lines.map((line, index) => {
        const latest = data?.items.find(value => value.id === line.itemId)
        const item = current?.items.find(value => value.id === line.itemId) ?? data?.items.find(value => value.id === line.itemId)
        return <li key={line.itemId} className="rounded-2xl border border-[var(--app-border)] p-4"><h3 className="font-semibold">{item?.name ?? line.itemId}</h3>{editing && kind === "count" && latest && latest.revision !== line.expectedRevision && <div className="mt-2 text-sm"><p>Stock changed. Count this item again before submitting.</p><Button variant="secondary" disabled={busy} onClick={() => setLines(previous => previous.map((value, position) => position === index ? { ...value, front: "", back: "", expectedRevision: latest.revision } : value))}>Recount using latest stock</Button></div>}<p className="mt-1 text-xs text-[var(--app-muted)]">Quantities in {item?.unit ?? "stock units"}{kind === "count" && item ? ` · Saved stock: front ${item.frontStock}, back ${item.backStock}` : " · Received into back stock"}</p><div className="mt-3 flex flex-wrap gap-3">{(kind === "count" ? ["front", "back"] : ["quantity"]).map(key => <label key={key} className="grid gap-2 text-sm">{key === "quantity" ? "Received" : key === "front" ? "Front count" : "Back count"}<input type="number" min="0" step="0.001" className={`${field} w-36`} disabled={!editing || busy} value={line[key as "front" | "back" | "quantity"]} onChange={event => setLines(previous => previous.map((value, position) => position === index ? { ...value, [key]: event.target.value } : value))} /></label>)}{editing && <Button variant="secondary" disabled={busy} onClick={() => setLines(previous => previous.filter((_, position) => position !== index))}>Remove</Button>}</div></li>
      })}</ul>
      <div className="flex flex-wrap gap-3">{editing && <Button disabled={busy || !lines.length} onClick={() => void act("save")}>Save draft</Button>}{current?.status === "draft" && <><Button variant="secondary" disabled={busy || Boolean(unsaved)} onClick={() => void act("submit")}>Submit saved draft</Button><Button variant="secondary" disabled={busy} onClick={() => void act("cancel")}>Cancel task</Button></>}</div>
      {current?.status === "submitted" && data?.canReview && <div className="space-y-3 border-t border-[var(--app-border)] pt-4"><label className="grid gap-2 text-sm">Review note<textarea className={`${field} py-3`} disabled={busy} maxLength={1000} value={reviewNote} onChange={event => setReviewNote(event.target.value)} /></label><div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void act("post")}>Approve and update stock</Button><Button variant="secondary" disabled={busy || !reviewNote.trim()} onClick={() => void act("return")}>Return for correction</Button><Button variant="secondary" disabled={busy} onClick={() => void act("cancel")}>Cancel task</Button></div></div>}
    </Panel>}
    <div className="grid gap-3 md:grid-cols-2">{data?.sessions.filter(value => value.kind === kind).map(value => <Panel key={value.id} className="p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{value.title}</h2><StatusPill tone={value.status === "posted" ? "green" : "blue"}>{value.status}</StatusPill></div><p className="mt-2 text-sm text-[var(--app-muted)]">{value.payload.lines.length} items · {new Date(value.updatedAt).toLocaleString()}</p><Button className="mt-3" variant="secondary" disabled={busy} onClick={() => open(value)}>Open task</Button></Panel>)}</div>
    {data && !data.sessions.some(value => value.kind === kind) && <p className="text-sm text-[var(--app-muted)]">No saved {kind === "count" ? "counts" : "deliveries"} in this view yet.</p>}
  </div>
}
export function OperationSessions({ kind }: { kind: "count" | "receiving" }) {
  const auth = useAuthSession()
  return <Sessions key={`${auth.user?.uid}:${auth.orgId}:${kind}`} kind={kind} />
}
