import { assertInventoryWritesEnabled } from "./availability"
import { z } from "zod"
import { assertStoreAccess, mobileEnvelope, mobileError, requireMobilePrincipal } from "@/lib/mobile-api"
import { engineDocumentIdSchema, engineErrorResponseSchema, EngineError } from "../contracts"
import { executeThresholdChange, thresholdRequestSchema } from "./threshold"
import { firestoreThresholdRepository } from "./firestore-threshold-repository"

const legacyRequestSchema = z.object({ operationId: z.string().uuid(), storeId: engineDocumentIdSchema, itemId: z.unknown(), expectedRevision: z.unknown(), par: z.unknown(), reorderPoint: z.unknown(), reason: z.unknown() }).transform(({ operationId, storeId, ...payload }) => ({ commandId: operationId, locationId: storeId, payload })).pipe(thresholdRequestSchema)

export async function handleThresholdChange(request: Request, format: "mobile" | "engine") {
  let requestId: string | null = null
  try {
    const principal = await requireMobilePrincipal(request, "inventory.edit")
    const parsed = (format === "mobile" ? legacyRequestSchema : thresholdRequestSchema).safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new EngineError(parsed.error.issues[0]?.message ?? "Valid targets and a reason are required.", 400, "invalid_request")
    requestId = parsed.data.commandId
    assertInventoryWritesEnabled()
    const result = await executeThresholdChange({ ...parsed.data, organizationId: principal.orgId, actorId: principal.uid }, { uid: principal.uid, organizationId: principal.orgId, permissions: principal.permissions, isManager: principal.isManager }, await firestoreThresholdRepository(principal, request), (storeId) => assertStoreAccess(principal, storeId))
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
