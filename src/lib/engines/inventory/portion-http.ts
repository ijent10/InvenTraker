import { assertInventoryWritesEnabled } from "./availability"
import { z } from "zod"
import { assertStoreAccess, mobileEnvelope, mobileError, requireMobilePrincipal } from "@/lib/mobile-api"
import { engineDocumentIdSchema, engineErrorResponseSchema, EngineError } from "../contracts"
import { executePortion, portionRequestSchema } from "./portion"
import { firestorePortionRepository } from "./firestore-portion-repository"

const legacyRequestSchema = z.object({ operationId: z.string().uuid(), storeId: engineDocumentIdSchema, itemId: z.unknown(), sourceArea: z.unknown(), sourceBatchId: z.unknown().optional(), portionWeight: z.unknown(), portionCount: z.unknown(), expirationDate: z.unknown().optional(), packageBarcodePrefix: z.unknown().optional() }).transform(({ operationId, storeId, ...payload }) => ({ commandId: operationId, locationId: storeId, payload })).pipe(portionRequestSchema)

export async function handlePortion(request: Request, format: "mobile" | "engine") {
  let requestId: string | null = null
  try {
    const principal = await requireMobilePrincipal(request, "inventory.edit")
    const parsed = (format === "mobile" ? legacyRequestSchema : portionRequestSchema).safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new EngineError(parsed.error.issues[0]?.message ?? "Valid portion details are required.", 400, "invalid_request")
    requestId = parsed.data.commandId
    assertInventoryWritesEnabled()
    const result = await executePortion({ ...parsed.data, organizationId: principal.orgId, actorId: principal.uid }, { uid: principal.uid, organizationId: principal.orgId, permissions: principal.permissions, isManager: principal.isManager }, await firestorePortionRepository(principal, request), (storeId) => assertStoreAccess(principal, storeId))
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
