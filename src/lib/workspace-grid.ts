import { dashboardLayoutSchema, type DashboardLayout, type DeviceClass, type WidgetInstance, type WidgetSize } from "./workspace-contracts.ts"

export const workspaceColumns: Record<DeviceClass, number> = { phone: 4, tablet: 8, desktop: 12 }
export const workspaceSizes: WidgetSize[] = ["small", "medium", "large", "extra-large"]

export function widgetFootprint(size: WidgetSize, device: DeviceClass) {
  const columns = workspaceColumns[device]
  const widths = { small: columns / 4, medium: columns / 2, large: columns / 2, "extra-large": columns }
  return {
    gridWidth: device === "phone" ? (size === "small" ? 2 : 4) : widths[size],
    gridHeight: device === "phone" && size === "extra-large" ? 6 : size === "small" || size === "medium" ? 2 : 4
  }
}

function overlaps(a: WidgetInstance, b: WidgetInstance) {
  return a.gridX < b.gridX + b.gridWidth && a.gridX + a.gridWidth > b.gridX &&
    a.gridY < b.gridY + b.gridHeight && a.gridY + a.gridHeight > b.gridY
}

/** Place in stable input order; an optional active widget gets first choice. */
export function packWidgets(widgets: WidgetInstance[], device: DeviceClass, activeId?: string): WidgetInstance[] {
  const columns = workspaceColumns[device]
  if (new Set(widgets.map((widget) => widget.id)).size !== widgets.length) throw new Error("Duplicate widget instance ID")
  const ordered = activeId ? [...widgets.filter((w) => w.id === activeId), ...widgets.filter((w) => w.id !== activeId)] : widgets
  const placed: WidgetInstance[] = []
  for (const widget of ordered) {
    const footprint = widgetFootprint(widget.size, device)
    const next = { ...widget, ...footprint, gridX: Math.max(0, Math.min(columns - footprint.gridWidth, Math.round(widget.gridX))), gridY: Math.max(0, Math.round(widget.gridY)) }
    // Search from the requested row, preserving the active widget's target.
    if (placed.some((other) => overlaps(next, other))) {
      let found = false
      const lastRow = placed.reduce((max, other) => Math.max(max, other.gridY + other.gridHeight), next.gridY)
      for (let y = next.gridY; y <= lastRow && !found; y += 1) {
        for (let x = 0; x <= columns - next.gridWidth; x += 1) {
          const candidate = { ...next, gridX: x, gridY: y }
          if (!placed.some((other) => overlaps(candidate, other))) {
            next.gridX = x
            next.gridY = y
            found = true
            break
          }
        }
      }
    }
    placed.push(next)
  }
  return widgets.map((widget) => placed.find((placedWidget) => placedWidget.id === widget.id)!)
}

export function moveWidget(widgets: WidgetInstance[], device: DeviceClass, id: string, x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Invalid widget position")
  if (!widgets.some((widget) => widget.id === id)) throw new Error("Unknown widget instance")
  return packWidgets(widgets.map((widget) => widget.id === id ? { ...widget, gridX: x, gridY: Math.min(500, y) } : widget), device, id)
}

/** Distance is measured in logical grid units, independent of pointer pixels. */
export function snapWidgetSize(width: number, height: number, supported: WidgetSize[], device: DeviceClass): WidgetSize {
  if (!Number.isFinite(width) || !Number.isFinite(height) || supported.length === 0) throw new Error("Invalid resize target")
  return workspaceSizes.filter((size) => supported.includes(size)).reduce((best, size) => {
    const a = widgetFootprint(best, device)
    const b = widgetFootprint(size, device)
    // Quantize squared distance so JS and native floating-point hypot ties select the same first size.
    const distance = (footprint: { gridWidth: number; gridHeight: number }) => Math.round(((footprint.gridWidth - width) ** 2 + (footprint.gridHeight - height) ** 2) * 1e9)
    return distance(b) < distance(a) ? size : best
  })
}

export function resizeWidget(widgets: WidgetInstance[], device: DeviceClass, id: string, width: number, height: number, supported: WidgetSize[]) {
  if (!widgets.some((widget) => widget.id === id)) throw new Error("Unknown widget instance")
  const size = snapWidgetSize(width, height, supported, device)
  return packWidgets(widgets.map((widget) => widget.id === id ? { ...widget, size } : widget), device, id)
}

/** Seed a different device without carrying desktop coordinates onto a phone. */
export function adaptWidgets(widgets: WidgetInstance[], device: DeviceClass) {
  return packWidgets(widgets.map((widget) => ({ ...widget, gridX: 0, gridY: 0 })), device)
}

/** Run after a completed drop or removal, rather than on every pointer move. */
export function compactWidgets(widgets: WidgetInstance[], device: DeviceClass) {
  const ordered = [...widgets].sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX)
  const packed = packWidgets(ordered.map((widget) => ({ ...widget, gridY: 0 })), device)
  return widgets.map((widget) => packed.find((next) => next.id === widget.id)!)
}

export function validateWorkspaceLayout(input: unknown): DashboardLayout {
  const layout = dashboardLayoutSchema.parse(input)
  const columns = workspaceColumns[layout.deviceClass]
  if (new Set(layout.widgets.map((widget) => widget.id)).size !== layout.widgets.length) throw new Error("Duplicate widget instance ID")
  layout.widgets.forEach((widget, index) => {
    const footprint = widgetFootprint(widget.size, layout.deviceClass)
    if (widget.gridWidth !== footprint.gridWidth || widget.gridHeight !== footprint.gridHeight || widget.gridX + widget.gridWidth > columns) {
      throw new Error("Widget is outside the grid or has an invalid footprint")
    }
    if (layout.widgets.slice(index + 1).some((other) => overlaps(widget, other))) throw new Error("Widget placements overlap")
  })
  return layout
}

export type LayoutCommitResult =
  | { status: "saved"; layout: DashboardLayout }
  | { status: "conflict"; current: DashboardLayout }

/** The persistence adapter must call this inside its compare-and-set transaction. */
export function commitLayoutRevision(current: DashboardLayout | null, proposed: DashboardLayout, expectedRevision: number, now: string): LayoutCommitResult {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("Invalid expected revision")
  if (current) validateWorkspaceLayout(current)
  const next = validateWorkspaceLayout(proposed)
  if (current && (current.id !== next.id || current.userId !== next.userId || current.organizationId !== next.organizationId || current.deviceClass !== next.deviceClass)) {
    throw new Error("Layout scope cannot change")
  }
  if (current && current.revision !== expectedRevision) return { status: "conflict", current }
  if (!current && expectedRevision !== 0) throw new Error("Layout does not exist")
  return { status: "saved", layout: validateWorkspaceLayout({ ...next, revision: expectedRevision + 1, updatedAt: now }) }
}
