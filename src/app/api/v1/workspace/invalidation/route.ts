import { assertStoreAccess, mobileError, orgCollection, requireMobilePrincipal, MobileApiError } from "@/lib/mobile-api"
import { engineDocumentIdSchema } from "@/lib/engines/contracts"
import { readWorkspaceStockRevision } from "@/lib/engines/events/workspace-revision"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    if (String(principal.member.status ?? "active").toLowerCase() !== "active") throw new MobileApiError("An active membership is required.", 403, "account_inactive")
    const parsed = engineDocumentIdSchema.safeParse(new URL(request.url).searchParams.get("storeId"))
    if (!parsed.success) throw new MobileApiError("Choose a valid store.", 400, "store_required")
    const storeId = parsed.data
    await assertStoreAccess(principal, storeId)
    if (!(await orgCollection(principal, "stores").doc(storeId).get()).exists) throw new MobileApiError("Store not found.", 404, "store_not_found")
    const revision = await readWorkspaceStockRevision(principal, storeId)
    return Response.json({ schemaVersion: "1", storeId, stockRevision: revision }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { const response = mobileError(error); response.headers.set("Cache-Control", "private, no-store"); return response }
}
