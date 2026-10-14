import { z } from "zod"
import { requireMobilePrincipal, mobileError } from "@/lib/mobile-api"
import { dashboardLayoutSchema, deviceClassSchema } from "@/lib/workspace-contracts"
import { commitLayoutRevision } from "@/lib/workspace-grid"
import { legacyWidgetRegistry } from "@/lib/workspace-legacy-adapter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const updateSchema = z.object({ expectedRevision: z.number().int().nonnegative(), layout: dashboardLayoutSchema })

export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    const device = deviceClassSchema.safeParse(new URL(request.url).searchParams.get("device"))
    if (!device.success) return Response.json({ message: "Choose a valid device layout." }, { status: 400 })
    const snapshot = await principal.db.collection("workspaceLayouts").doc(encodeURIComponent(JSON.stringify([principal.uid, principal.orgId, device.data]))).get()
    return Response.json({ layout: snapshot.exists ? legacyWidgetRegistry.validate(dashboardLayoutSchema.parse(snapshot.data())) : null }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return mobileError(error) }
}

export async function PUT(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    const body = await request.text()
    if (body.length > 64000) return Response.json({ message: "This layout is too large." }, { status: 413 })
    let input: unknown
    try { input = JSON.parse(body) } catch { return Response.json({ message: "Send valid layout data." }, { status: 400 }) }
    const parsed = updateSchema.safeParse(input)
    if (!parsed.success || parsed.data.layout.widgets.length > 60) return Response.json({ message: "Send a valid home layout." }, { status: 400 })
    const { layout, expectedRevision } = parsed.data
    if (layout.userId !== principal.uid || layout.organizationId !== principal.orgId) return Response.json({ message: "This layout belongs to another workspace." }, { status: 403 })
    try { legacyWidgetRegistry.validate(layout) } catch { return Response.json({ message: "The widget layout is invalid." }, { status: 400 }) }
    const ref = principal.db.collection("workspaceLayouts").doc(encodeURIComponent(JSON.stringify([principal.uid, principal.orgId, layout.deviceClass])))
    const result = await principal.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref)
      const current = snapshot.exists ? dashboardLayoutSchema.parse(snapshot.data()) : null
      const result = commitLayoutRevision(current, layout, expectedRevision, new Date().toISOString())
      if (result.status === "saved") transaction.set(ref, result.layout)
      return result
    })
    return Response.json(result, { status: result.status === "conflict" ? 409 : 200 })
  } catch (error) { return mobileError(error) }
}
