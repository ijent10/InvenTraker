import { dashboardWidgets } from "@/lib/demo-data"

export const DASHBOARD_LAYOUT_STORAGE_KEY = "inventracker.dashboardLayout"
export const DASHBOARD_LAYOUT_EVENT = "inventracker-dashboard-layout-change"

export function defaultDashboardWidgetIds() {
  return dashboardWidgets.filter((widget) => widget.defaultVisible).map((widget) => widget.id)
}

export function normalizeDashboardWidgetIds(ids: string[]) {
  const knownIds = new Set(dashboardWidgets.map((widget) => widget.id))
  const uniqueIds = new Set<string>()
  const normalizedIds: string[] = []

  ids.forEach((id) => {
    if (!knownIds.has(id) || uniqueIds.has(id)) return
    uniqueIds.add(id)
    normalizedIds.push(id)
  })

  return normalizedIds
}

export function readDashboardWidgetIds() {
  if (typeof window === "undefined") return defaultDashboardWidgetIds()

  try {
    const raw = window.localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY)
    if (!raw) return defaultDashboardWidgetIds()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? normalizeDashboardWidgetIds(parsed) : defaultDashboardWidgetIds()
  } catch {
    return defaultDashboardWidgetIds()
  }
}

export function storeDashboardWidgetIds(ids: string[]) {
  if (typeof window === "undefined") return
  const normalizedIds = normalizeDashboardWidgetIds(ids)
  window.localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(normalizedIds))
  window.dispatchEvent(new CustomEvent(DASHBOARD_LAYOUT_EVENT, { detail: normalizedIds }))
}
