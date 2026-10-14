# InvenTraker Workspace Engine

## Current gap

The current dashboard persists an ordered array of widget IDs and renders them through one static definition list. It supports add/remove/reorder, but not direct home-screen editing, coordinates, resizing, shapes, device variants, revisions, conflicts, or engine data providers.

## Foundation implemented

`workspace-contracts.ts` validates layouts, instances, definitions, and candidates. `workspace-grid.ts` implements pure placement, move, size snapping, resize, compaction, device adaptation, geometry validation, and revision comparison. Phone XL uses a full-width six-row footprint so it remains distinct from Large.

`workspace-registry.ts` validates provider metadata, filters definitions through a supplied permission predicate, and migrates legacy IDs. Unrecognized IDs are returned to the caller for resolution. `workspace-legacy-adapter.ts` maps the current widget catalog to provider metadata without treating its example values as operational facts.

Run `workspace:check` for geometry, deterministic adaptation, migration, permission filtering, unsupported configuration, and revision-conflict invariants. The production build checks the compatibility adapter's TypeScript imports.

These modules are not yet connected to dashboard rendering or cloud persistence. Revision comparison must run inside a persistence transaction; calling the pure function alone does not provide concurrent-write protection. The next implementation adds that persistence adapter and the in-home editor.

## Ownership

The Workspace Engine owns layout and presentation preferences. Operational engines own facts, metrics, actions, and permissions. The shared renderer owns consistent visual states. The intelligence layer ranks approved candidates. AI never moves, resizes, adds, removes, or reshapes widgets.

## Persistence

Store layouts under a user-scoped preference path, partitioned by organization and device class.

```ts
type DashboardLayout = {
  id: string
  userId: string
  organizationId: string
  deviceClass: "phone" | "tablet" | "desktop"
  revision: number
  shapePreference: "circle" | "square" | "rounded-square"
  widgets: WidgetInstance[]
  updatedAt: string
}

type WidgetInstance = {
  id: string
  engineId: string
  widgetDefinitionId: string
  gridX: number
  gridY: number
  gridWidth: number
  gridHeight: number
  size: "small" | "medium" | "large" | "extra-large"
  shapeOverride?: "circle" | "square" | "rounded-square"
  pinnedContentId?: string
  mode: "automatic" | "pinned" | "fixed"
  preferences: Record<string, unknown>
}
```

Retain `dashboardWidgetIds` during migration. On first load without a new layout, convert the ordered IDs deterministically and save revision 1. Never delete the legacy field during the initial release.

## Grid

Desktop starts with 12 logical columns and a 12px gap. Default spans are 3×2, 6×2, 6×4, and 12×4. Tablet and phone use independent saved layouts, seeded from a deterministic packing transform. Widgets are never silently discarded when the viewport narrows.

Packing rules:

1. Clamp candidate span to definition-supported sizes and current grid.
2. Keep the dragged/resized widget at the nearest valid origin.
3. Resolve collisions by stable row-major displacement.
4. Compact empty rows after drop, not continuously during pointer movement.
5. Validate that no saved rectangle overlaps or exceeds the grid.

## Edit mode

Entry point: Personal Settings → Customize your home screen. Activation returns to Home in edit mode while preserving the current layout.

Controls: Add Widget, Reset Layout, Undo, Done. Widgets reveal a drag handle and bottom-right resize handle. Operational write actions are disabled in edit mode. Cancel restores the last persisted revision.

### Drag

Pointer drag begins only on a handle/designated surface. Mobile uses long press plus haptic feedback. A lifted preview and placeholder show placement; neighbors reflow with 200–300ms motion. Keyboard/assistive alternatives move the selected widget by row/column.

### Resize

The bottom-right handle tracks pointer/touch deltas, displays a live candidate, and snaps to the nearest supported size on release. Accessible actions expose “make smaller/larger” using the same size sequence. No dropdown or settings form is the primary resizing mechanism.

### Conflict control

Save with expected revision. A mismatch returns both revisions. If the remote revision changed and local edits exist, offer reload remote or keep local as a new revision. Do not silently overwrite.

## Renderer states

All widgets implement loading, loaded, empty, stale, permission denied, engine unavailable, network unavailable, AI unavailable, and unexpected error. Unknown values render as unavailable, not zero. Each size has a content budget matching the specification.

Circle is limited to compatible compact definitions. Larger rectangular footprints may center a circular information surface. Shape does not alter permissions or actions.

## Refresh

Provider data invalidates on relevant engine events, organization/location changes, completed actions, candidate expiry, and visibility after freshness expiry. Use bounded polling only where real-time invalidation is absent. Layout persistence is debounced; resizing does not trigger AI requests.

## Tests

- packing, collision, bounds, size snapping, deterministic device transform
- add/remove/drag/resize/undo/reset
- keyboard and screen-reader alternatives
- revision conflicts and offline retry
- all shapes at every supported size
- provider permission denial and stale/offline/error states
- AI outage with deterministic content

## Rollout

Ship behind `workspaceLayoutV2`. First enable read-only rendering from converted layouts, then editing, then cloud writes. Roll back by disabling the flag and reading `dashboardWidgetIds`; retain versioned layouts for a later retry.
