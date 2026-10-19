"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react"
import { GripVertical, MoveDownRight, Plus, Undo2, X } from "lucide-react"
import { useAuthSession } from "@/lib/auth-session"
import { type ShiftNote } from "@/lib/demo-data"
import { workspaceWidgetCatalog as dashboardWidgets } from "@/lib/workspace-catalog"
import { useWorkspaceData } from "@/lib/use-workspace-data"
import { selectWorkspaceCandidates } from "@/lib/workspace-providers"
import { readCloudWorkspacePreferences } from "@/lib/cloud-preferences"
import { readDashboardWidgetIds } from "@/lib/dashboard-layout"
import { legacyWidgetDefinitions, legacyWidgetRegistry } from "@/lib/workspace-legacy-adapter"
import { migrateLegacyWidgetIds } from "@/lib/workspace-registry"
import { moveWidget, resizeWidget, adaptWidgets, packWidgets, workspaceColumns, workspaceSizes } from "@/lib/workspace-grid"
import { dashboardLayoutSchema, type DashboardLayout, type DeviceClass, type WidgetShape } from "@/lib/workspace-contracts"
import { workspaceRequest, workspaceSeedRequest } from "@/lib/workspace-client"
import { ShiftNotesWidget } from "@/components/shift-notes-widget"

type Stats = Record<string, { value?: string; detail?: string }>

export function WorkspaceHome({ shiftNotes = [] }: { widgetStats?: Stats; shiftNotes?: ShiftNote[] }) {
  const session = useAuthSession()
  const [device, setDevice] = useState<DeviceClass | null>(null)
  const [layout, setLayout] = useState<DashboardLayout | null>(null)
  const providers = useWorkspaceData(session.orgId, session.user?.uid, session.status === "ready" && Boolean(layout), layout?.widgets.map((item) => item.widgetDefinitionId).sort().join(",") ?? "")
  const [editing, setEditing] = useState(false)
  const [history, setHistory] = useState<DashboardLayout[]>([])
  const [catalog, setCatalog] = useState(false)
  const [contentWidgetId, setContentWidgetId] = useState("")
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [activeWidget, setActiveWidget] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [recovery, setRecovery] = useState<{ layout: DashboardLayout; expectedRevision: number } | null>(null)
  const [conflict, setConflict] = useState<DashboardLayout | null>(null)
  const base = useRef<DashboardLayout | null>(null)
  const revision = useRef(0)
  const grid = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ id: string; kind: "move" | "resize"; x: number; y: number; start: DashboardLayout; preview?: DashboardLayout; unit: number; timer?: ReturnType<typeof setTimeout>; ready: boolean; changed: boolean } | null>(null)
  const cacheKey = session.user && device ? `inventraker.workspace-draft:${session.user.uid}:${session.orgId}:${device}` : ""

  useEffect(() => {
    const update = () => {
      const next = window.innerWidth < 640 ? "phone" : window.innerWidth < 1280 ? "tablet" : "desktop"
      setDevice(next)
    }
    update(); window.addEventListener("resize", update)
    setEditing(new URLSearchParams(window.location.search).get("edit") === "1")
    return () => window.removeEventListener("resize", update)
  }, [])

  useEffect(() => {
    if (!session.user || session.status !== "ready" || !device) return
    let cancelled = false
    setLayout(null); setMessage(""); setHistory([]); setConflict(null); setRecovery(null)
    async function load() {
      try {
        const remote = await workspaceRequest(session.orgId, device!)
        const preferences = remote.layout ? null : await readCloudWorkspacePreferences()
        const catalog = remote.layout ? null : await workspaceSeedRequest(session.orgId, device!)
        let next = remote.layout ?? (catalog?.seedSource === "device" ? catalog.seedLayout : migrateLegacyWidgetIds({
          ids: preferences?.dashboardWidgetIds ?? readDashboardWidgetIds(), definitions: legacyWidgetDefinitions,
          userId: session.user!.uid, organizationId: session.orgId, deviceClass: device!, now: new Date().toISOString()
        }).layout)
        if (cancelled) return
        let expectedRevision = remote.layout?.revision ?? 0
        let validDraft = false
        try {
          const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null")
          if (cached) {
            const draft = legacyWidgetRegistry.validate(dashboardLayoutSchema.parse(cached.layout))
            validDraft = draft.userId === next.userId && draft.organizationId === next.organizationId && draft.deviceClass === next.deviceClass && Number.isSafeInteger(cached.expectedRevision) && cached.expectedRevision >= 0
          }
        } catch { /* Invalid drafts cannot suppress initialization. */ }
        if (!remote.layout && !validDraft) {
          try {
            const initialized = await workspaceRequest(session.orgId, device!, { layout: next, expectedRevision: 0 })
            next = initialized.layout ?? initialized.conflict ?? next
            expectedRevision = initialized.layout?.revision ?? initialized.conflict?.revision ?? 0
          } catch { if (!cancelled) setMessage("Your home is ready on this device. Customize and choose Done to sync it when connected.") }
        }
        if (cancelled) return
        revision.current = expectedRevision
        base.current = next; setLayout(next)
        try {
          const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null")
          if (cached) {
            const draft = dashboardLayoutSchema.parse(cached.layout)
            legacyWidgetRegistry.validate(draft)
            if (draft.userId === next.userId && draft.organizationId === next.organizationId && draft.deviceClass === next.deviceClass && Number.isSafeInteger(cached.expectedRevision) && cached.expectedRevision >= 0) setRecovery({ layout: draft, expectedRevision: cached.expectedRevision })
          }
        } catch { /* Ignore invalid local drafts. */ }
      } catch {
        if (!cancelled) setMessage("Your home layout could not load. Check your connection and retry.")
      }
    }
    void load()
    return () => { cancelled = true; if (gesture.current?.timer) clearTimeout(gesture.current.timer); gesture.current = null }
  }, [session.user, session.status, session.orgId, device, loadAttempt, cacheKey])

  function change(next: DashboardLayout) {
    if (!layout || saving) return
    setHistory((items) => [...items.slice(-29), layout]); setLayout(next); setMessage("")
    try { localStorage.setItem(cacheKey, JSON.stringify({ layout: next, expectedRevision: revision.current })) } catch { /* Cloud saving remains available. */ }
  }

  async function save(expected = revision.current) {
    if (!layout || !device) return
    setSaving(true); setMessage("")
    try {
      const result = await workspaceRequest(session.orgId, device, { layout, expectedRevision: expected })
      if (result.conflict) { setConflict(result.conflict); setMessage("Another session changed this layout. Choose which version to keep."); return }
      if (result.layout) { revision.current = result.layout.revision; base.current = result.layout; setLayout(result.layout) }
      setConflict(null); setHistory([]); setEditing(false); setMessage("Home screen saved.")
      localStorage.removeItem(cacheKey)
      window.history.replaceState(null, "", "/dashboard#workspace")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Saving failed. Your edits are still here.") }
    finally { setSaving(false) }
  }

  function begin(event: PointerEvent<HTMLButtonElement>, id: string, kind: "move" | "resize") {
    if (!layout || !grid.current || saving || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const next = { id, kind, x: event.clientX, y: event.clientY, start: layout, unit: (grid.current.clientWidth + 12) / workspaceColumns[layout.deviceClass], ready: event.pointerType !== "touch" || kind === "resize", changed: false, timer: undefined as ReturnType<typeof setTimeout> | undefined }
    if (!next.ready) next.timer = setTimeout(() => { next.ready = true; setActiveWidget(id); navigator.vibrate?.(15) }, 350)
    else setActiveWidget(id)
    gesture.current = next
  }

  function track(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current
    if (!active) return
    if (!active.ready) {
      if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > 10) { if (active.timer) clearTimeout(active.timer); gesture.current = null }
      return
    }
    const widget = active.start.widgets.find((item) => item.id === active.id)!
    const dx = (event.clientX - active.x) / active.unit
    const dy = (event.clientY - active.y) / 96
    active.changed ||= Math.abs(dx) > 0.15 || Math.abs(dy) > 0.15
    const widgets = active.kind === "move"
      ? moveWidget(active.start.widgets, active.start.deviceClass, active.id, widget.gridX + dx, widget.gridY + dy)
      : resizeWidget(active.start.widgets, active.start.deviceClass, active.id, widget.gridWidth + dx, widget.gridHeight + dy, legacyWidgetRegistry.get(widget.widgetDefinitionId)!.supportedSizes)
    active.preview = { ...active.start, widgets }
    setLayout(active.preview)
  }

  function end(cancel = false) {
    setActiveWidget(null)
    const active = gesture.current
    if (!active) return
    if (active.timer) clearTimeout(active.timer)
    if (cancel) setLayout(active.start)
    else if (active.changed) {
      setHistory((items) => [...items.slice(-29), active.start])
      try { localStorage.setItem(cacheKey, JSON.stringify({ layout: active.preview ?? active.start, expectedRevision: revision.current })) } catch { /* Edits remain in memory. */ }
    }
    gesture.current = null
  }

  function keyboard(event: KeyboardEvent<HTMLButtonElement>, id: string, kind: "move" | "resize") {
    if (!layout || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return
    event.preventDefault()
    const widget = layout.widgets.find((item) => item.id === id)!
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1
    const next = kind === "resize"
      ? resizeWidget(layout.widgets, layout.deviceClass, id, ...(() => {
        const size = workspaceSizes[Math.max(0, Math.min(3, workspaceSizes.indexOf(widget.size) + direction))]
        const candidate = adaptWidgets([{ ...widget, size }], layout.deviceClass)[0]
        return [candidate.gridWidth, candidate.gridHeight] as const
      })(), workspaceSizes)
      : moveWidget(layout.widgets, layout.deviceClass, id, widget.gridX + (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0), widget.gridY + (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0))
    change({ ...layout, widgets: next })
  }

  if (!layout) return <section id="workspace" className="mt-6 rounded-panel bg-[var(--app-panel)] p-6" role="status">{message || "Loading your home screen…"}{message && <button className="ml-3 underline" onClick={() => setLoadAttempt((value) => value + 1)}>Retry</button>}</section>

  const permitted = legacyWidgetRegistry.permitted((permission) => session.can(permission as Parameters<typeof session.can>[0]))
  const contentWidget = layout.widgets.find((item) => item.id === contentWidgetId) ?? layout.widgets[0]
  const contentOptions = contentWidget ? providers.data?.widgets[contentWidget.widgetDefinitionId]?.candidates ?? [] : []
  return <section id="workspace" className="mt-6 scroll-mt-28" aria-label="Your home widgets">
    <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">Store <select className="min-h-11 rounded-control border border-[var(--app-border)] bg-[var(--app-panel)] px-3" aria-label="Widget store" value={providers.data?.storeId ?? ""} onChange={(event) => providers.setStoreId(event.target.value)} disabled={!providers.data?.stores.length}>{!providers.data && <option value="">Loading…</option>}{providers.data?.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <button className="min-h-11 px-3 underline" onClick={providers.refresh}>Refresh summaries</button>
      <span role="status" className="text-[var(--app-muted)]">{providers.error || (providers.data && !providers.data.storeId ? "Ask your manager to assign a store." : providers.stale ? "Showing the last saved summaries. Refresh to update." : providers.data ? `Updated ${new Date(providers.data.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Loading store summaries…")}</span>
    </div>
    {recovery && <div className="workspace-toolbar"><p>Unfinished edits are saved on this device.</p><button onClick={() => { revision.current = recovery.expectedRevision; setLayout(recovery.layout); setRecovery(null); setEditing(true) }}>Restore edits</button><button onClick={() => { setRecovery(null); localStorage.removeItem(cacheKey) }}>Discard unfinished edits</button></div>}
    {editing && <div className="workspace-toolbar">
      <h2 className="font-semibold">Customize your home screen</h2>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={saving} onClick={() => setCatalog(!catalog)}><Plus className="inline h-4 w-4" /> Add widget</button>
        <label>Shape <select disabled={saving} value={layout.shapePreference} onChange={(event) => change({ ...layout, shapePreference: event.target.value as WidgetShape })}>{["rounded-square", "square", "circle"].map((shape) => <option key={shape} value={shape}>{shape.replace("-", " ")}</option>)}</select></label>
        <button disabled={!history.length || saving} onClick={() => { setLayout(history[history.length - 1]); setHistory(history.slice(0, -1)) }}><Undo2 className="inline h-4 w-4" /> Undo</button>
        <button disabled={saving} onClick={() => change(migrateLegacyWidgetIds({ ids: dashboardWidgets.filter((w) => w.defaultVisible).map((w) => w.id), definitions: legacyWidgetDefinitions, userId: layout.userId, organizationId: layout.organizationId, deviceClass: layout.deviceClass, now: layout.updatedAt }).layout)}>Reset layout</button>
        <button disabled={saving} onClick={() => { setLayout(base.current); setHistory([]); setEditing(false); setConflict(null); localStorage.removeItem(cacheKey); window.history.replaceState(null, "", "/dashboard#workspace") }}>Cancel</button>
        <button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Done"}</button>
      </div>
      <p className="text-sm text-[var(--app-muted)]">Drag a handle to move. Drag the lower corner to resize. Focus either handle and use arrow keys as an alternative.</p>
    </div>}
    <p role="status" aria-live="polite" className="my-2 text-sm">{message}</p>
    {conflict && <div className="workspace-toolbar"><button onClick={() => { setLayout(conflict); base.current = conflict; revision.current = conflict.revision; setConflict(null); setHistory([]); setMessage("Loaded the other session’s layout.") }}>Load saved version</button><button onClick={() => void save(conflict.revision)}>Keep my layout</button></div>}
    {editing && catalog && <div className="workspace-toolbar" aria-label="Widget catalog">{permitted.filter((definition) => !layout.widgets.some((w) => w.widgetDefinitionId === definition.id)).map((definition) => <button key={definition.id} onClick={() => change({ ...layout, widgets: packWidgets([...layout.widgets, { id: crypto.randomUUID(), widgetDefinitionId: definition.id, engineId: definition.engineId, size: "medium", gridX: 0, gridY: 0, gridWidth: 1, gridHeight: 1, mode: "automatic", preferences: {} }], layout.deviceClass) })}>{definition.title} +</button>)}</div>}
    {editing && contentWidget && <details className="workspace-toolbar">
      <summary className="cursor-pointer py-2 font-medium">Widget content</summary>
      <div className="flex flex-wrap items-center gap-3">
        <label>Widget <select aria-label="Content widget" value={contentWidget.id} onChange={(event) => setContentWidgetId(event.target.value)}>{layout.widgets.map((item) => <option key={item.id} value={item.id}>{legacyWidgetRegistry.get(item.widgetDefinitionId)?.title}</option>)}</select></label>
        <label>Content <select aria-label="Content mode" disabled={saving} value={contentWidget.mode} onChange={(event) => change({ ...layout, widgets: layout.widgets.map((item) => item.id === contentWidget.id ? { ...item, mode: event.target.value as typeof item.mode, pinnedContentId: event.target.value === "pinned" ? contentOptions[0]?.id : undefined } : item) })}><option value="fixed">Summary</option><option value="automatic">Automatic priorities</option><option value="pinned" disabled={!contentOptions.length}>Pinned priority</option></select></label>
        {contentWidget.mode === "pinned" && <label>Priority <select aria-label="Pinned priority" disabled={saving} value={contentWidget.pinnedContentId ?? ""} onChange={(event) => change({ ...layout, widgets: layout.widgets.map((item) => item.id === contentWidget.id ? { ...item, pinnedContentId: event.target.value } : item) })}>{!contentOptions.some((item) => item.id === contentWidget.pinnedContentId) && <option value={contentWidget.pinnedContentId ?? ""}>Priority no longer available</option>}{contentOptions.map((item) => <option key={item.id} value={item.id}>{item.title} — {item.summary}</option>)}</select></label>}
      </div>
      <p className="text-sm text-[var(--app-muted)]">Priorities appear in large and extra-large widgets. Automatic content uses urgency and impact. A resolved pinned priority returns to the summary.</p>
    </details>}
    {layout.widgets.length === 0 && <p className="p-8 text-center text-[var(--app-muted)]">Your home screen is empty. Add widgets from Personal Settings → Customize your home screen.</p>}
    <div ref={grid} className="workspace-grid" style={{ gridTemplateColumns: `repeat(${workspaceColumns[layout.deviceClass]}, minmax(0, 1fr))` }}>
      {layout.widgets.map((widget) => {
        const definition = legacyWidgetRegistry.get(widget.widgetDefinitionId)!
        const legacy = dashboardWidgets.find((item) => item.id === widget.widgetDefinitionId)!
        const allowed = definition.permissions.every((permission) => session.can(permission as Parameters<typeof session.can>[0]))
        const Icon = legacy.icon
        const shape = widget.shapeOverride ?? layout.shapePreference
        const stat = allowed ? providers.data?.widgets[definition.id] : undefined
        const isProvider = definition.dataSource.startsWith("store-summary:")
        const value = stat?.value ?? (isProvider ? providers.error ? "Unavailable" : providers.data ? "Choose store" : "Loading…" : "Open")
        const candidates = stat && !providers.stale ? selectWorkspaceCandidates(stat.candidates, widget, new Date().toISOString()) : []
        return <article key={widget.id} className={`workspace-cell ${editing ? "workspace-editing" : ""} ${activeWidget === widget.id ? "workspace-lift" : ""}`} style={{ gridColumn: `${widget.gridX + 1} / span ${widget.gridWidth}`, gridRow: `${widget.gridY + 1} / span ${widget.gridHeight}` }}>
          {editing && <><button className="workspace-move" aria-label={`Move ${definition.title}; use arrow keys`} onPointerDown={(e) => begin(e, widget.id, "move")} onPointerMove={track} onPointerUp={() => end()} onPointerCancel={() => end(true)} onKeyDown={(e) => keyboard(e, widget.id, "move")}><GripVertical className="h-5 w-5" /></button><button className="workspace-remove" disabled={saving} aria-label={`Remove ${definition.title}`} onClick={() => change({ ...layout, widgets: layout.widgets.filter((w) => w.id !== widget.id) })}><X className="h-4 w-4" /></button></>}
          <div className={`workspace-surface workspace-shape-${shape}`}>
            {!allowed ? <div className="workspace-content"><Icon className="h-5 w-5" /><h3>{definition.title}</h3><p>Access unavailable</p></div>
            : definition.id === "notes" && !editing ? <ShiftNotesWidget widget={legacy} notes={shiftNotes} trigger={<><Icon className="h-6 w-6 text-[var(--app-accent)]" /><h3>Notes</h3><p className="workspace-value">{shiftNotes.length}</p>{widget.size !== "small" && shape !== "circle" && <p className="text-sm text-[var(--app-muted)]">Open your shift notes</p>}</>} />
            : <Link href={legacy.href} tabIndex={editing ? -1 : 0} aria-disabled={editing} onClick={(e) => { if (editing) e.preventDefault() }} className="workspace-content" data-provider-state={providers.stale ? "stale" : stat?.state ?? (isProvider ? "loading" : "navigation")}><Icon className="h-6 w-6 text-[var(--app-accent)]" /><h3>{definition.title}</h3><p className="workspace-value">{value}{stat?.partial && <span className="text-sm">*</span>}</p>{widget.size !== "small" && shape !== "circle" && <p className="text-sm text-[var(--app-muted)]">{stat?.detail ?? definition.description}</p>}{!editing && shape !== "circle" && (widget.size === "large" || widget.size === "extra-large") && candidates.length > 0 && <ul className="workspace-priorities">{candidates.map((item) => <li key={item.id}><span className={item.severity === "critical" ? "text-[var(--app-danger)]" : "font-medium"}>{item.title}</span><span className="text-[var(--app-muted)]">{item.summary}</span></li>)}</ul>}</Link>}
          </div>
          {editing && <button className="workspace-resize" aria-label={`Resize ${definition.title}, ${widget.size}; use arrow keys`} onPointerDown={(e) => begin(e, widget.id, "resize")} onPointerMove={track} onPointerUp={() => end()} onPointerCancel={() => end(true)} onKeyDown={(e) => keyboard(e, widget.id, "resize")}><MoveDownRight className="h-5 w-5" /></button>}
        </article>
      })}
    </div>
  </section>
}
