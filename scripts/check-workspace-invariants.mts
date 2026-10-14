import assert from "node:assert/strict"
import { adaptWidgets, commitLayoutRevision, compactWidgets, moveWidget, packWidgets, resizeWidget, snapWidgetSize, validateWorkspaceLayout, widgetFootprint, workspaceSizes } from "../src/lib/workspace-grid.ts"
import { createWidgetRegistry, migrateLegacyWidgetIds } from "../src/lib/workspace-registry.ts"
import type { DashboardLayout, DeviceClass, WidgetDefinition, WidgetInstance } from "../src/lib/workspace-contracts.ts"

const now = "2026-10-14T12:00:00.000Z"
const widget = (id: string): WidgetInstance => ({ id, engineId: "inventory", widgetDefinitionId: "stock", gridX: 0, gridY: 0, ...widgetFootprint("medium", "desktop"), size: "medium", mode: "fixed", preferences: {} })
const layout = (widgets: WidgetInstance[], deviceClass: DeviceClass = "desktop"): DashboardLayout => ({ id: "layout", userId: "user", organizationId: "org", deviceClass, revision: 1, shapePreference: "rounded-square", widgets, updatedAt: now })
const source = Array.from({ length: 40 }, (_, index) => ({ ...widget(`widget-${index}`), size: workspaceSizes[index % 4] }))
const original = JSON.stringify(source)

for (const device of ["phone", "tablet", "desktop"] as const) {
  const packed = packWidgets(source, device)
  validateWorkspaceLayout(layout(packed, device))
  assert.equal(packed.length, source.length, "packing must retain every instance")
  assert.deepEqual(packWidgets(source, device), packed, "packing must be deterministic")
  assert.deepEqual(packWidgets(packed, device), packed, "packing a valid layout must be stable")
  const moved = moveWidget(packed, device, "widget-0", 999, 2)
  validateWorkspaceLayout(layout(moved, device))
  assert.equal(moved[0].gridY, 2, "dragged widget takes priority over neighbors")
  const resized = resizeWidget(moved, device, "widget-0", 999, 999, workspaceSizes)
  validateWorkspaceLayout(layout(resized, device))
  assert.equal(resized[0].size, "extra-large")
  const adapted = adaptWidgets(packed, device)
  validateWorkspaceLayout(layout(adapted, device))
  assert.deepEqual(adapted.map((w) => w.id), source.map((w) => w.id))
  const compacted = compactWidgets(packed.map((w) => ({ ...w, gridY: w.gridY + 10 })), device)
  validateWorkspaceLayout(layout(compacted, device))
  assert.equal(Math.min(...compacted.map((w) => w.gridY)), 0, "compaction removes empty leading rows")
  for (let seed = 0; seed < 40; seed += 1) {
    const arbitrary = source.map((w, index) => ({ ...w, gridX: (index * 7 + seed) % 20, gridY: (index * 3 + seed) % 11 }))
    const result = packWidgets(arbitrary, device)
    validateWorkspaceLayout(layout(result, device))
    assert.equal(result.length, source.length)
  }
}
assert.equal(JSON.stringify(source), original, "operations cannot mutate input or undo snapshots")
assert.equal(snapWidgetSize(6, 4, ["small", "large"], "desktop"), "large")
assert.equal(snapWidgetSize(12, 4, ["small"], "desktop"), "small", "unsupported sizes must never be selected")
assert.throws(() => snapWidgetSize(NaN, 2, workspaceSizes, "desktop"))
assert.throws(() => snapWidgetSize(6, 2, [], "desktop"))
assert.throws(() => moveWidget(source, "desktop", "missing", 1, 2))
assert.throws(() => packWidgets([widget("same"), widget("same")], "desktop"))
assert.throws(() => validateWorkspaceLayout(layout([widget("a"), widget("b")])) , /overlap/)
assert.throws(() => validateWorkspaceLayout(layout([{ ...widget("a"), gridX: 11 }])), /outside/)

const valid = layout(packWidgets([widget("a"), widget("b")], "desktop"))
const first = commitLayoutRevision(null, valid, 0, now)
assert.equal(first.status, "saved")
const committed = commitLayoutRevision(valid, valid, 1, now)
assert.equal(committed.status, "saved")
if (committed.status === "saved") assert.equal(committed.layout.revision, 2)
assert.equal(commitLayoutRevision(valid, valid, 0, now).status, "conflict", "stale edits cannot overwrite remote edits")
assert.throws(() => commitLayoutRevision(valid, { ...valid, organizationId: "other" }, 1, now), /scope/)
assert.throws(() => commitLayoutRevision(null, valid, 3, now))
assert.throws(() => commitLayoutRevision(null, valid, -1, now))

const definition: WidgetDefinition = { id: "stock", engineId: "inventory", title: "Stock", description: "Stock overview", supportedSizes: workspaceSizes, supportedShapes: ["rounded-square"], dataSource: "inventory.summary", contentCapabilities: ["summary"], permissions: ["inventory.view"], availableActions: [], defaultRefreshPolicy: { strategy: "event", staleAfterSeconds: 60 }, fallbackRenderer: "unavailable" }
const registry = createWidgetRegistry([definition])
assert.equal(registry.permitted(() => false).length, 0)
assert.equal(registry.permitted((permission) => permission === "inventory.view").length, 1)
assert.throws(() => createWidgetRegistry([definition, definition]), /Duplicate/)
assert.throws(() => registry.validate({ ...valid, shapePreference: "circle" }), /shape/)
assert.throws(() => registry.validate({ ...valid, widgets: [{ ...valid.widgets[0], engineId: "orders" }] }), /provider/)
const migration = migrateLegacyWidgetIds({ ids: ["stock", "unknown", "stock"], definitions: [definition], userId: "user", organizationId: "org", deviceClass: "phone", now })
assert.equal(migration.layout.widgets.length, 1)
assert.deepEqual(migration.unresolvedIds, ["unknown"], "unrecognized legacy IDs must remain visible to migration callers")
registry.validate(migration.layout)
console.log("Workspace invariants passed: placement, resizing, adaptation, migration, registry, and revision conflicts.")
