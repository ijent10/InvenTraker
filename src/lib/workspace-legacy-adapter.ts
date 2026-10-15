import { workspaceWidgetCatalog } from "./workspace-catalog"
import { workspaceProviders } from "./workspace-providers"
import { createWidgetRegistry } from "./workspace-registry"
import type { WidgetDefinition } from "./workspace-contracts"

// Compatibility metadata only. Sample values in demo-data are never provider facts.
const providers: Record<string, { engine: string; permissions: string[] }> = {
  inventory: { engine: "inventory", permissions: ["inventory.view"] },
  orders: { engine: "orders", permissions: ["orders.view"] },
  assistant: { engine: "assistant", permissions: ["ai.use"] },
  insights: { engine: "insights", permissions: ["insights.view"] },
  health: { engine: "health-checks", permissions: ["health.view"] },
  history: { engine: "workspace", permissions: ["history.view"] },
  "low-stock": { engine: "inventory", permissions: ["inventory.view"] },
  expiration: { engine: "inventory", permissions: ["inventory.view"] },
  waste: { engine: "discards", permissions: ["insights.view"] },
  restocks: { engine: "restock", permissions: ["history.view"] },
  vendors: { engine: "orders", permissions: ["vendors.view"] },
  employees: { engine: "workspace", permissions: ["employees.view"] },
  products: { engine: "inventory", permissions: ["inventory.view"] },
  "pending-review": { engine: "assistant", permissions: ["ai.verifyAutofill"] },
  notes: { engine: "workspace", permissions: [] }
}

export const legacyWidgetDefinitions: WidgetDefinition[] = workspaceWidgetCatalog.map((widget) => {
  const provider = providers[widget.id] ?? { engine: widget.id, permissions: workspaceProviders[widget.id]?.permissions ?? [] }
  if (!provider) throw new Error(`Missing provider metadata for ${widget.id}`)
  return {
    id: widget.id, engineId: provider.engine, title: widget.title, description: widget.detail,
    supportedSizes: ["small", "medium", "large", "extra-large"],
    supportedShapes: ["circle", "square", "rounded-square"],
    permissions: workspaceProviders[widget.id]?.permissions ?? provider.permissions,
    dataSource: workspaceProviders[widget.id] ? `store-summary:${widget.id}` : `navigation:${widget.id}`,
    contentCapabilities: ["summary", "navigation", "priorities"], availableActions: ["navigate"],
    defaultRefreshPolicy: { strategy: "visibility", staleAfterSeconds: 60 },
    fallbackRenderer: "unavailable-summary"
  }
})

export const legacyWidgetRegistry = createWidgetRegistry(legacyWidgetDefinitions)
