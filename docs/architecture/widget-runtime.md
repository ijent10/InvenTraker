# InvenTraker Workspace Engine

## Starting point

Before the Workspace Engine, the dashboard persisted an ordered array of widget IDs through a static definition list. The implementation below replaces that foundation additively; current Phase 5 delivery and verification limits are recorded in `docs/migration/phase-5-workspace.md`.

## Foundation implemented

`workspace-contracts.ts` validates layouts, instances, definitions, and candidates. `workspace-grid.ts` implements pure placement, move, size snapping, resize, compaction, device adaptation, geometry validation, and revision comparison. Phone XL uses a full-width six-row footprint so it remains distinct from Large.

`workspace-registry.ts` validates provider metadata, filters definitions through a supplied permission predicate, and migrates legacy IDs. Unrecognized IDs are returned to the caller for resolution. `workspace-legacy-adapter.ts` maps the current widget catalog to provider metadata without treating its example values as operational facts.

Run `workspace:check` for geometry, deterministic adaptation, migration, permission filtering, unsupported configuration, and revision-conflict invariants. The production build checks the compatibility adapter's TypeScript imports.

The web home screen now uses `WorkspaceHome` through `HomeWorkspaceRuntime`. Personal Settings redirects into in-home editing. The editor supports pointer handles, long-press touch movement, keyboard arrow alternatives, four-size corner snapping, add/remove, reset, undo, cancel, and dashboard-wide shapes. Notes retain their existing editing flow through a custom trigger.

`GET/PUT /api/v1/workspace/layout` authenticate with the existing principal resolver and store documents in the server-only root `workspaceLayouts` collection. Document identity includes user, organization, and device. PUT validates geometry/provider contracts and compares revisions in a Firestore transaction. Conflicts return HTTP 409 and the current layout; the UI offers load remote or explicitly retry local. Layout edits are staged locally and committed with Done. Unfinished edits are cached under a user/organization/device-specific browser key for recovery. Legacy ordered IDs remain intact.

The current renderer adapts summary density by size and uses existing live dashboard summaries. Unsupported metric data displays Unavailable rather than the legacy catalog's example values. Scoped engine summaries, deterministic candidate selection and native customization are described in the follow-up sections below. Expanded operational workflows remain Phase 6.

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

`NEXT_PUBLIC_WORKSPACE_LAYOUT_V2=false` at build time restores the legacy renderer and settings customizer. The default enables the new web workspace. Rollback retains both server-side layouts and the untouched `dashboardWidgetIds` preference. No stock or operational schema migration is involved.

## Verification record

- Pure invariant suite: all device classes, 40 generated placement scenarios per class, resize snapping, collision bounds, adaptation, registry checks, migration, and revisions.
- API integration against the existing test organization: unsigned 401, nonmember 403, mismatched layout owner 403, invalid geometry/provider 400, concurrent PUT responses 200/409, persisted increment, employee/owner isolation.
- Local browser: keyboard move/resize; actual corner drag from Large to Medium; add and undo; shape change; successful cloud save; saved layout loaded after a fresh login; notes modal through a circular surface; explicit conflict resolution.
- Phone viewport at 390px: all eight migrated widgets retained, independent four-column layout, document width equals viewport width.
- Native touch/haptic behavior and screen-reader hardware validation remain unverified.


### Store-scoped summary providers

`workspace-providers.ts` defines the explicit source/permission map and pure candidate selection. `/api/v1/workspace/widgets?widgets=inventory,orders&storeId=...` accepts known catalog IDs; omitted IDs request the complete provider set for compatibility. Membership and selected-store access are checked on every request, including refreshes. Only permitted sources are queried, with explicit field projections. The response carries `generatedAt`, per-widget state, partial-coverage labels and short-lived candidates. No writes or AI requests occur.

Eight supported source collections cover the 11 domain summaries. Activity counts are record counts, not totals of incompatible units or fabricated session states. Spot-check/restock/transfer counts refer to the stock ledger. Transfers currently mean front/back movements. Assistant and Insights consume authorized inventory/expiry/order/check summaries only. Legacy navigation-only widgets stay navigational.

The client polls visible pages at 60 seconds and refreshes on reconnect/visibility return; fetches time out after 20 seconds. Requests are aborted and prior context is hidden on organization/store/widget-set changes. Source failures are independent. Cached data is labeled stale after failure or two minutes; stale candidates are hidden. Stock-event invalidation and its refresh fallback are described in the follow-up section below.

Large and extra-large rectangular widgets render bounded priority lists. Summary, automatic, and pinned modes persist in the existing versioned layout. Missing/expired pins fall back to the summary. Selection is engine- and size-filtered, critical-first, deterministically scored, then ID-tiebroken. `workspace:providers` checks filtering, privacy boundaries, source selection, expiry, modes and failure isolation.


## Stock-event invalidation follow-up

The server now captures `stockRevision` before loading authorized widget facts. The web hook probes a dedicated scoped invalidation endpoint every 15 seconds while visible and refreshes facts when that arrival revision changes. Source loading stays independent of cursor availability; the existing one-minute refresh remains a fallback. Both request types abort on context changes, and nonready sessions do not render their cached snapshot. The authenticated scheduled consumer, receipts, retries, limits and rollback are documented in `engine-contracts.md`. Deployed API and consumer checks passed; browser visibility/context interaction checks and native subscriptions are still pending.

## Phase 5 native workspace implementation

The active SwiftUI Home now renders the same versioned layout contract, with server-owned provider metadata from `GET /api/v1/workspace/catalog?device=phone|tablet|desktop`. The read-only catalog filters the add menu by current permissions, supplies defaults, preserves unresolved legacy IDs, and seeds a device from another saved device through the shared packing transform. Existing legacy preferences and layouts on other devices are untouched. The native editor uses the existing layout GET/PUT transaction and its explicit expected revision; Done commits the staged layout.

Native controls include in-home Customize and Account → Customize your home screen, permission-filtered Add Widget, removal, undo/reset/cancel, global and per-widget shapes, summary/automatic/pinned content, hold-and-drag movement with a placeholder, corner resize/snapping, and accessible move/size alternatives. Layout drafts are cached only under the user/organization/device identity. Reload offers restore/discard; a failed save retains edits; conflicts require loading the remote version or explicitly saving local edits against its latest revision. No widget changes stock or calls AI while editing.

The app supports iPhone and iPad, using separate tablet layouts at regular width and phone layouts at compact width. Native geometry is checked against the same 120 generated TypeScript scenarios for all three device classes. Squared resize distances are quantized in both implementations to resolve floating-point ties identically. `workspace:swift` compiles the actual native models/store/client and verifies geometry parity, drafts, undo, initial revisions, failed-save recovery, explicit conflicts, candidate expiry, permission revocation and store isolation.

Widget facts use the existing bounded, permission-scoped gateway. Visible native Home checks stock-event revisions every 15 seconds, with a 60-second full refresh fallback. Leaving Home, backgrounding and context changes cancel refresh work; old store facts are discarded. Stale data is labeled and stale/expired priority content is hidden. Module widgets open the available native tool, with the existing web destination as a fallback when no native equivalent is available. This is bounded refresh, not instantaneous push. No AI integration is added.

Native rollback: set `WorkspaceLayoutV2` to Boolean false in `ios/InvenTracker/InvenTracker/Info.plist` and rebuild; the original standard Home remains available. A failed catalog load also offers an explicit standard-home fallback. Web rollback remains `NEXT_PUBLIC_WORKSPACE_LAYOUT_V2=false`. Neither rollback deletes saved layouts, drafts or legacy preferences. Simulator/live API validation for this implementation is recorded after release verification.


Initialization now uses an explicit expected-revision-zero PUT after read-only seeding on both clients. A concurrent existing layout is adopted without overwriting it; a valid unfinished draft suppresses automatic initialization. Ordinary edits remain staged until Done. Web first use can also seed from another saved device. Native controls stay disabled during initialization so its response cannot overwrite edits made while loading. The native API base now uses the canonical `https://www.inventraker.com`; the older Firebase Hosting alias did not serve the new catalog route. Full Phase 5 status and verification limits are maintained in `docs/migration/phase-5-workspace.md`.


The web editor now exposes per-widget shape overrides alongside content options. Undo updates the scoped recovery draft; Cancel restores the saved expected revision; loading a conflicting saved layout discards the rejected local draft. These keep recovery and revision state aligned with the visible editor.
