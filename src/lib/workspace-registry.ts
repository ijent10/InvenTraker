import { widgetDefinitionSchema, type DashboardLayout, type DeviceClass, type WidgetDefinition, type WidgetInstance } from "./workspace-contracts.ts"
import { adaptWidgets, validateWorkspaceLayout } from "./workspace-grid.ts"

export function createWidgetRegistry(definitions: WidgetDefinition[]) {
  const registry = new Map<string, WidgetDefinition>()
  for (const input of definitions) {
    const definition = widgetDefinitionSchema.parse(input)
    if (registry.has(definition.id)) throw new Error(`Duplicate widget definition: ${definition.id}`)
    registry.set(definition.id, definition)
  }
  return {
    get: (id: string) => registry.get(id),
    permitted: (can: (permission: string) => boolean) => [...registry.values()].filter((definition) => definition.permissions.every(can)),
    validate(layout: DashboardLayout) {
      validateWorkspaceLayout(layout)
      for (const widget of layout.widgets) {
        const definition = registry.get(widget.widgetDefinitionId)
        if (!definition || definition.engineId !== widget.engineId) throw new Error("Unknown widget provider")
        if (!definition.supportedSizes.includes(widget.size)) throw new Error("Unsupported widget size")
        if (!definition.supportedShapes.includes(widget.shapeOverride ?? layout.shapePreference)) throw new Error("Unsupported widget shape")
      }
      return layout
    }
  }
}

export function migrateLegacyWidgetIds({ ids, definitions, userId, organizationId, deviceClass, now }: {
  ids: string[]
  definitions: WidgetDefinition[]
  userId: string
  organizationId: string
  deviceClass: DeviceClass
  now: string
}) {
  const registry = createWidgetRegistry(definitions)
  const unresolvedIds: string[] = []
  const widgets: WidgetInstance[] = []
  for (const id of new Set(ids)) {
    const definition = registry.get(id)
    if (!definition) { unresolvedIds.push(id); continue }
    widgets.push({
      id: `legacy-${id}`, engineId: definition.engineId, widgetDefinitionId: definition.id,
      gridX: 0, gridY: 0, gridWidth: 1, gridHeight: 1,
      size: definition.supportedSizes.includes("medium") ? "medium" : definition.supportedSizes[0],
      mode: "fixed", preferences: {}
    })
  }
  const layout = validateWorkspaceLayout({
    id: `${organizationId}-${deviceClass}`, userId, organizationId, deviceClass,
    revision: 1, shapePreference: "rounded-square", widgets: adaptWidgets(widgets, deviceClass), updatedAt: now
  })
  registry.validate(layout)
  return { layout, unresolvedIds }
}
