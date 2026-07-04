"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, GripVertical, Plus, RotateCcw, Trash2 } from "lucide-react"

import { Button, Panel, StatusPill } from "@/components/ui"
import { readCloudWorkspacePreferences, writeCloudWorkspacePreferences } from "@/lib/cloud-preferences"
import { dashboardWidgets } from "@/lib/demo-data"
import { defaultDashboardWidgetIds, normalizeDashboardWidgetIds, readDashboardWidgetIds, storeDashboardWidgetIds } from "@/lib/dashboard-layout"

function moveItem(ids: string[], fromIndex: number, toIndex: number) {
  const nextIds = [...ids]
  const [movedId] = nextIds.splice(fromIndex, 1)
  nextIds.splice(toIndex, 0, movedId)
  return nextIds
}

function widgetKind(type: string) {
  return type === "Tile" || type === "Shortcut" ? "tile" : "widget"
}

export function DashboardCustomizer() {
  const [selectedIds, setSelectedIds] = useState(() => defaultDashboardWidgetIds())
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [message, setMessage] = useState("")

  useEffect(() => {
    function applyLocalLayout() {
      setSelectedIds(readDashboardWidgetIds())
    }

    applyLocalLayout()
    readCloudWorkspacePreferences()
      .then((preferences) => {
        if (!preferences?.dashboardWidgetIds) return
        const cloudIds = normalizeDashboardWidgetIds(preferences.dashboardWidgetIds)
        setSelectedIds(cloudIds)
        storeDashboardWidgetIds(cloudIds)
      })
      .catch(applyLocalLayout)
  }, [])

  const selectedWidgets = useMemo(
    () =>
      selectedIds
        .map((id) => dashboardWidgets.find((widget) => widget.id === id))
        .filter((widget): widget is (typeof dashboardWidgets)[number] => Boolean(widget)),
    [selectedIds]
  )
  const availableWidgets = dashboardWidgets.filter((widget) => !selectedIds.includes(widget.id))

  async function persistLayout(ids: string[]) {
    const normalizedIds = normalizeDashboardWidgetIds(ids)
    storeDashboardWidgetIds(normalizedIds)
    const synced = await writeCloudWorkspacePreferences({ dashboardWidgetIds: normalizedIds }).catch(() => false)
    return { normalizedIds, synced }
  }

  async function saveLayout(ids = selectedIds) {
    const { synced } = await persistLayout(ids)
    setMessage(synced ? "Dashboard layout saved to the database." : "Dashboard layout saved in this browser. Sign in to sync it across devices.")
  }

  async function addWidget(id: string) {
    const nextIds = normalizeDashboardWidgetIds([...selectedIds, id])
    setSelectedIds(nextIds)
    storeDashboardWidgetIds(nextIds)
    const { synced } = await persistLayout(nextIds)
    setMessage(synced ? "Widget added and saved to the database." : "Widget added locally. Sign in to sync it across devices.")
  }

  async function removeWidget(id: string) {
    const nextIds = normalizeDashboardWidgetIds(selectedIds.filter((selectedId) => selectedId !== id))
    setSelectedIds(nextIds)
    storeDashboardWidgetIds(nextIds)
    const { synced } = await persistLayout(nextIds)
    setMessage(synced ? "Widget removed and saved to the database." : "Widget removed locally. Sign in to sync it across devices.")
  }

  async function reorderWidget(id: string, direction: "up" | "down") {
    const fromIndex = selectedIds.indexOf(id)
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1
    if (fromIndex < 0 || toIndex < 0 || toIndex >= selectedIds.length) return
    const nextIds = normalizeDashboardWidgetIds(moveItem(selectedIds, fromIndex, toIndex))
    setSelectedIds(nextIds)
    storeDashboardWidgetIds(nextIds)
    await persistLayout(nextIds)
  }

  async function dropOnWidget(targetId: string) {
    if (!draggingId || draggingId === targetId) return
    const fromIndex = selectedIds.indexOf(draggingId)
    const toIndex = selectedIds.indexOf(targetId)
    if (fromIndex < 0 || toIndex < 0) return
    const nextIds = normalizeDashboardWidgetIds(moveItem(selectedIds, fromIndex, toIndex))
    setSelectedIds(nextIds)
    storeDashboardWidgetIds(nextIds)
    setDraggingId(null)
    const { synced } = await persistLayout(nextIds)
    setMessage(synced ? "Widget reordered and saved to the database." : "Widget reordered locally. Sign in to sync it across devices.")
  }

  async function resetLayout() {
    const defaultIds = defaultDashboardWidgetIds()
    setSelectedIds(defaultIds)
    await saveLayout(defaultIds)
  }

  return (
    <Panel id="dashboard-customization" className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-[var(--app-text)]">Dashboard customization</h2>
          <p className="app-tip mt-1 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
            Add tiles, drag them into the order you want, and save the layout for your home dashboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void resetLayout()}>
            Reset dashboard
          </Button>
          <Button onClick={() => void saveLayout()}>Save dashboard</Button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_420px]">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--app-text)]">Home screen order</p>
            <StatusPill tone="blue">{selectedWidgets.length} visible</StatusPill>
          </div>
          <div className="grid gap-2">
            {selectedWidgets.map((widget, index) => {
              const Icon = widget.icon

              return (
                <div
                  key={widget.id}
                  draggable
                  onDragStart={() => setDraggingId(widget.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropOnWidget(widget.id)}
                  className="grid gap-3 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3 transition hover:border-[var(--app-accent)] md:grid-cols-[28px_1fr_auto]"
                >
                  <div className="flex items-center justify-center text-[var(--app-subtle)]">
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      {widgetKind(widget.type) === "tile" ? (
                        <span className="flex h-12 w-12 items-center justify-center rounded-md border border-[var(--app-control-border)] bg-gradient-to-br from-[var(--app-accent)] to-[var(--app-secondary)] text-[var(--app-on-accent)] shadow-md shadow-black/10">
                          <Icon className="h-5 w-5" />
                        </span>
                      ) : (
                        <span className="grid h-12 min-w-24 place-items-center rounded-md border border-[var(--app-control-border)] bg-[var(--app-panel)] px-3 text-center">
                          <span className="text-sm font-semibold text-[var(--app-text)]">{widget.value}</span>
                          <span className="text-[10px] font-semibold uppercase text-[var(--app-subtle)]">{widget.type}</span>
                        </span>
                      )}
                      <div>
                        <p className="font-semibold text-[var(--app-text)]">{widget.title}</p>
                        <StatusPill>{widgetKind(widget.type) === "tile" ? "App tile" : "Info widget"}</StatusPill>
                      </div>
                    </div>
                    <p className="app-tip mt-2 text-sm leading-5 text-[var(--app-muted)]">{widget.detail}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="ghost"
                      className="px-2"
                      disabled={index === 0}
                      aria-label={`Move ${widget.title} up`}
                      title={`Move ${widget.title} up`}
                      onClick={() => void reorderWidget(widget.id, "up")}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2"
                      disabled={index === selectedWidgets.length - 1}
                      aria-label={`Move ${widget.title} down`}
                      title={`Move ${widget.title} down`}
                      onClick={() => void reorderWidget(widget.id, "down")}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2"
                      aria-label={`Remove ${widget.title}`}
                      title={`Remove ${widget.title}`}
                      onClick={() => void removeWidget(widget.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-[var(--app-text)]">Add widgets and tiles</p>
          <div className="grid gap-2">
            {availableWidgets.length === 0 ? (
              <div className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-4 text-sm text-[var(--app-muted)]">
                Every widget is already on your dashboard.
              </div>
            ) : (
              availableWidgets.map((widget) => {
                const Icon = widget.icon

                return (
                  <button
                    key={widget.id}
                    type="button"
                    onClick={() => void addWidget(widget.id)}
                    className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3 text-left transition hover:border-[var(--app-accent)] hover:bg-[var(--app-control-bg-hover)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3">
                        {widgetKind(widget.type) === "tile" ? (
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-[var(--app-control-border)] bg-gradient-to-br from-[var(--app-accent)] to-[var(--app-secondary)] text-[var(--app-on-accent)]">
                            <Icon className="h-5 w-5" />
                          </span>
                        ) : (
                          <span className="grid h-12 min-w-20 shrink-0 place-items-center rounded-md border border-[var(--app-control-border)] bg-[var(--app-panel)] px-2 text-center">
                            <span className="text-sm font-semibold text-[var(--app-text)]">{widget.value}</span>
                            <span className="text-[10px] font-semibold uppercase text-[var(--app-subtle)]">{widget.type}</span>
                          </span>
                        )}
                        <span>
                          <span className="block font-semibold text-[var(--app-text)]">{widget.title}</span>
                          <span className="app-tip mt-1 block text-sm leading-5 text-[var(--app-muted)]">{widget.detail}</span>
                        </span>
                      </div>
                      <Plus className="h-4 w-4 shrink-0 text-[var(--app-accent)]" />
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>

      {message ? <p className="mt-4 text-sm font-semibold text-[var(--app-muted)]">{message}</p> : null}
    </Panel>
  )
}
