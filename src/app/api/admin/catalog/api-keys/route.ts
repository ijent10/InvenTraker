import { z } from "zod"

import { catalogApiResponse, createCatalogApiKey } from "@/lib/catalog-api"
import { MobileApiError, mobileError } from "@/lib/mobile-api"
import { requirePlatformPrincipal } from "@/lib/platform/principal"

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  client: z.enum(["inventraker", "simplipantri", "external"]),
  orgId: z.string().trim().min(1).max(160),
  scopes: z.array(z.enum(["catalog:read", "catalog:contribute", "catalog:write"])).min(1),
  expiresAt: z.string().datetime().optional()
}).strict()

export async function GET(request: Request) {
  try {
    const { db } = await requirePlatformPrincipal(request)
    const snapshot = await db.collection("catalogApiKeys").orderBy("createdAt", "desc").limit(100).get()
    return Response.json({ data: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), createdByUid: undefined })) })
  } catch (error) { return mobileError(error) }
}

export async function POST(request: Request) {
  try {
    const { uid, db } = await requirePlatformPrincipal(request)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new MobileApiError("Send a name, client, organization, and catalog scopes.", 400, "invalid_api_key_request")
    return Response.json({ data: await createCatalogApiKey(db, parsed.data, uid), warning: "Copy this API key now. It cannot be retrieved again." }, { status: 201 })
  } catch (error) { return error instanceof MobileApiError ? mobileError(error) : catalogApiResponse(error) }
}

export async function DELETE(request: Request) {
  try {
    const { db } = await requirePlatformPrincipal(request)
    const id = new URL(request.url).searchParams.get("id")?.trim()
    if (!id) throw new MobileApiError("Send the API-key id to revoke.", 400, "api_key_id_required")
    await db.collection("catalogApiKeys").doc(id).set({ status: "revoked", revokedAt: new Date().toISOString() }, { merge: true })
    return Response.json({ data: { id, status: "revoked" } })
  } catch (error) { return mobileError(error) }
}
