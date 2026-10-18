import { canMobile, mobileError, requireMobilePrincipal } from "@/lib/mobile-api"
import { userPreferencesPath } from "@/lib/firestore-schema"
import { workspaceWidgetCatalog } from "@/lib/workspace-catalog"
import { legacyWidgetDefinitions, legacyWidgetRegistry } from "@/lib/workspace-legacy-adapter"
import { dashboardLayoutSchema, deviceClassSchema } from "@/lib/workspace-contracts"
import { adaptWidgets } from "@/lib/workspace-grid"
import { migrateLegacyWidgetIds } from "@/lib/workspace-registry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    const device = deviceClassSchema.safeParse(new URL(request.url).searchParams.get("device"))
    if (!device.success) return Response.json({ message: "Choose a valid device layout." }, { status: 400, headers: { "Cache-Control": "private, no-store" } })
    const definitions = legacyWidgetRegistry.permitted(permission => canMobile(principal, permission as Parameters<typeof canMobile>[1]))
    const preferences = await principal.db.doc(userPreferencesPath(principal.uid)).get()
    const savedIds = preferences.data()?.dashboardWidgetIds
    const ids = Array.isArray(savedIds) ? savedIds.filter((id): id is string => typeof id === "string") : workspaceWidgetCatalog.filter(widget => widget.defaultVisible).map(widget => widget.id)
    const migrated = migrateLegacyWidgetIds({ ids, definitions: legacyWidgetDefinitions, userId: principal.uid, organizationId: principal.orgId, deviceClass: device.data, now: new Date().toISOString() })
    const defaultLayout = migrateLegacyWidgetIds({ ids: workspaceWidgetCatalog.filter(widget => widget.defaultVisible && definitions.some(definition => definition.id === widget.id)).map(widget => widget.id), definitions: legacyWidgetDefinitions, userId: principal.uid, organizationId: principal.orgId, deviceClass: device.data, now: new Date().toISOString() }).layout
    let seedLayout = migrated.layout
    // Copy a different device's saved presentation once; never overwrite it or remove legacy preferences.
    for (const sourceDevice of ["desktop", "tablet", "phone"] as const) {
      if (sourceDevice === device.data) continue
      const ref = principal.db.collection("workspaceLayouts").doc(encodeURIComponent(JSON.stringify([principal.uid, principal.orgId, sourceDevice])))
      const snapshot = await ref.get()
      if (!snapshot.exists) continue
      const source = legacyWidgetRegistry.validate(dashboardLayoutSchema.parse(snapshot.data()))
      if (source.userId !== principal.uid || source.organizationId !== principal.orgId || source.deviceClass !== sourceDevice) throw new Error("Invalid saved layout scope")
      seedLayout = { ...source, id: `${principal.orgId}-${device.data}`, deviceClass: device.data, revision: 1, widgets: adaptWidgets(source.widgets, device.data), updatedAt: new Date().toISOString() }
      break
    }
    return Response.json({ schemaVersion: "1", definitions: definitions.map(definition => ({ ...definition, href: workspaceWidgetCatalog.find(widget => widget.id === definition.id)!.href })), seedLayout, defaultLayout, unresolvedIds: migrated.unresolvedIds }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { const response = mobileError(error); response.headers.set("Cache-Control", "private, no-store"); return response }
}
