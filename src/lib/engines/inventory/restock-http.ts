import { z } from "zod"
import { assertStoreAccess, mobileEnvelope, mobileError, requireMobilePrincipal } from "@/lib/mobile-api"
import { engineDocumentIdSchema, engineErrorResponseSchema, EngineError } from "../contracts"
import { executeRestock, restockRequestSchema, restockEngineRequestSchema, restockLineSchema } from "./restock"
import { firestoreRestockRepository } from "./firestore-restock-repository"

const legacyRequestSchema = z.object({ operationId: z.string().uuid(), storeId: engineDocumentIdSchema, commit: z.boolean().default(false), lines: z.array(restockLineSchema.strip()) }).transform(({ operationId, storeId, commit, lines }) => ({ commandId: operationId, locationId: storeId, payload: { commit, lines } })).pipe(restockRequestSchema)

export async function handleRestock(request: Request, format: "mobile" | "engine") {
  let requestId: string | null = null
  try {
    const principal = await requireMobilePrincipal(request, "inventory.edit")
    const parsed = (format === "mobile" ? legacyRequestSchema : restockEngineRequestSchema).safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new EngineError(parsed.error.issues[0]?.message ?? "Valid restock counts are required.", 400, "invalid_request")
    requestId = parsed.data.commandId
    const result = await executeRestock({ ...parsed.data, organizationId: principal.orgId, actorId: principal.uid }, { uid: principal.uid, organizationId: principal.orgId, permissions: principal.permissions, isManager: principal.isManager }, await firestoreRestockRepository(principal, request), (storeId) => assertStoreAccess(principal, storeId))
    return Response.json(format === "mobile" ? mobileEnvelope(result.data) : result, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    const response = mobileError(error)
    if (format === "engine") {
      const body = await response.json()
      return Response.json(engineErrorResponseSchema.parse({ requestId, schemaVersion: "1", serverTime: new Date().toISOString(), error: body.error }), { status: response.status, headers: { "Cache-Control": "private, no-store" } })
    }
    response.headers.set("Cache-Control", "private, no-store")
    return response
  }
}
