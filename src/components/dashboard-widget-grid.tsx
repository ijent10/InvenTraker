"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Settings2 } from "lucide-react"

import { Panel } from "@/components/ui"
import { ShiftNotesWidget } from "@/components/shift-notes-widget"
import { readCloudWorkspacePreferences } from "@/lib/cloud-preferences"
import { dashboardWidgets, type ShiftNote } from "@/lib/demo-data"
import { DASHBOARD_LAYOUT_EVENT, normalizeDashboardWidgetIds, readDashboardWidgetIds, storeDashboardWidgetIds } from "@/lib/dashboard-layout"

function widgetSpan(size: string, kind: "tile" | "widget") {
  if (kind === "tile") return ""
  if (size === "Large") return "md:col-span-2 xl:col-span-2"
  return ""
}

type DashboardWidgetStats = Record<string, { value?: string; detail?: string }>

function widgetKind(type: string) {
  if (type === "Tile" || type === "Shortcut") return "tile"
  return "widget"
}

function widgetTone(type: string) {
  if (type === "Metric") return "from-[var(--app-accent-soft)] via-[var(--app-control-bg)] to-[var(--app-control-bg)]"
  if (type === "History") return "from-emerald-500/15 via-[var(--app-control-bg)] to-[var(--app-control-bg)]"
  if (type === "Review") return "from-amber-500/15 via-[var(--app-control-bg)] to-[var(--app-control-bg)]"
  if (type === "Note") return "from-fuchsia-500/15 via-[var(--app-control-bg)] to-[var(--app-control-bg)]"
  return "from-[var(--app-control-bg-hover)] via-[var(--app-control-bg)] to-[var(--app-control-bg)]"
}

export function DashboardWidgetGrid({ widgetStats = {}, shiftNotes = [] }: { widgetStats?: DashboardWidgetStats; shiftNotes?: ShiftNote[] }) {
  const [widgetIds, setWidgetIds] = useState(() => dashboardWidgets.filter((widget) => widget.defaultVisible).map((widget) => widget.id))

  useEffect(() => {
    function syncLayout() {
      setWidgetIds(readDashboardWidgetIds())
    }

    syncLayout()
    readCloudWorkspacePreferences()
      .then((preferences) => {
        if (preferences?.dashboardWidgetIds) {
          const cloudIds = normalizeDashboardWidgetIds(preferences.dashboardWidgetIds)
          setWidgetIds(cloudIds)
          storeDashboardWidgetIds(cloudIds)
        }
      })
      .catch(syncLayout)
    window.addEventListener(DASHBOARD_LAYOUT_EVENT, syncLayout)
    window.addEventListener("storage", syncLayout)
    return () => {
      window.removeEventListener(DASHBOARD_LAYOUT_EVENT, syncLayout)
      window.removeEventListener("storage", syncLayout)
    }
  }, [])

  const widgets = useMemo(
    () =>
      widgetIds
        .map((id) => dashboardWidgets.find((widget) => widget.id === id))
        .filter((widget): widget is (typeof dashboardWidgets)[number] => Boolean(widget))
        .map((widget) => ({
          ...widget,
          value: widgetStats[widget.id]?.value ?? widget.value,
          detail: widgetStats[widget.id]?.detail ?? widget.detail
        })),
    [widgetIds, widgetStats]
  )

  if (widgets.length === 0) {
    return (
      <Panel className="mt-6 p-6 text-center">
        <Settings2 className="mx-auto h-8 w-8 text-[var(--app-accent)]" />
        <h2 className="mt-3 font-semibold text-[var(--app-text)]">Your dashboard is empty</h2>
        <p className="app-tip mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--app-muted)]">
          Add only the tiles and widgets you want. Nothing else will be added back unless you choose it.
        </p>
      </Panel>
    )
  }

  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      {widgets.map((widget) => {
        const Icon = widget.icon
        const kind = widgetKind(widget.type)

        if (widget.id === "notes") {
          return <ShiftNotesWidget key={widget.id} widget={widget} notes={shiftNotes} className={widgetSpan(widget.size, kind)} />
        }

        if (kind === "tile") {
          return (
            <Link
              key={widget.id}
              href={widget.href}
              className="group flex min-h-36 flex-col items-center justify-center rounded-md border border-transparent p-3 text-center transition hover:border-[var(--app-control-border)] hover:bg-[var(--app-control-bg)]"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-md border border-[var(--app-control-border)] bg-gradient-to-br from-[var(--app-accent)] to-[var(--app-secondary)] text-[var(--app-on-accent)] shadow-lg shadow-black/20 transition group-hover:-translate-y-1 group-hover:shadow-[0_18px_40px_rgba(0,0,0,0.24)]">
                <Icon className="h-7 w-7" />
              </span>
              <span className="mt-3 line-clamp-2 text-sm font-semibold leading-5 text-[var(--app-text)]">{widget.title}</span>
              <span className="mt-1 text-xs font-semibold text-[var(--app-muted)]">{widget.value}</span>
            </Link>
          )
        }

        return (
          <Link
            key={widget.id}
            href={widget.href}
            className={`group relative block min-h-36 overflow-hidden rounded-md border border-[var(--app-control-border)] bg-gradient-to-br ${widgetTone(
              widget.type
            )} p-4 shadow-lg shadow-black/10 transition hover:border-[var(--app-accent)] hover:shadow-xl hover:shadow-black/20 ${widgetSpan(widget.size, kind)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-subtle)]">{widget.type}</p>
                <h2 className="mt-1 text-sm font-semibold text-[var(--app-muted)]">{widget.title}</h2>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-text)]">
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-5 text-3xl font-semibold tracking-normal text-[var(--app-text)]">{widget.value}</p>
            <p className="app-tip mt-3 max-w-lg text-sm leading-5 text-[var(--app-muted)]">{widget.detail}</p>
            <ArrowRight className="absolute bottom-4 right-4 h-4 w-4 text-[var(--app-subtle)] transition group-hover:translate-x-0.5 group-hover:text-[var(--app-accent)]" />
          </Link>
        )
      })}
    </div>
  )
}
