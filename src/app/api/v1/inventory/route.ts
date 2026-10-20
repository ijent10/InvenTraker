import { z } from "zod"

import { CatalogApiError, catalogApiResponse, catalogCorsHeaders, requireCatalogPrincipal } from "@/lib/catalog-api"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  storeId: z.string().trim().min(1).max(160).optional(),
  barcode: z.string().trim().min(1).max(32).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100)
})

const allowedFields = [
  "centralProductId", "orgProductId", "storeId", "name", "sku", "barcode", "normalizedGtin", "department", "category",
  "location", "vendor", "price", "quantity", "frontQuantity", "backQuantity", "totalQuantity", "quantityInCase", "unit",
  "par", "reorderPoint", "status", "expires", "expirationDate", "source", "revision", "updatedAt"
] as const

function safeInventoryRecord(document: FirebaseFirestore.QueryDocumentSnapshot) {
  const source = document.data()
  const record: Record<string, unknown> = { id: document.id }
  allowedFields.forEach((field) => { if (source[field] !== undefined) record[field] = source[field] })
  return record
}

export function OPTIONS() { return new Response(null, { status: 204, headers: catalogCorsHeaders() }) }

export async function GET(request: Request) {
  try {
    const principal = await requireCatalogPrincipal(request, "inventory:read")
    if (!principal.orgId) throw new CatalogApiError(403, "organization_required", "This credential is not assigned to an organization.")
    const url = new URL(request.url)
    const parsed = querySchema.safeParse({ storeId: url.searchParams.get("storeId") || undefined, barcode: url.searchParams.get("barcode") || undefined, limit: url.searchParams.get("limit") ?? 100 })
    if (!parsed.success) throw new CatalogApiError(400, "invalid_inventory_query", "Use an optional storeId or barcode and a limit from 1 to 500.")
    let query: FirebaseFirestore.Query = principal.db.collection("orgs").doc(principal.orgId).collection("inventory")
    if (parsed.data.storeId) query = query.where("storeId", "==", parsed.data.storeId)
    if (parsed.data.barcode) query = query.where("barcode", "==", parsed.data.barcode)
    const snapshot = await query.limit(parsed.data.limit).get()
    return Response.json({ data: snapshot.docs.map(safeInventoryRecord), meta: { count: snapshot.size, organizationId: principal.orgId } }, { headers: catalogCorsHeaders() })
  } catch (error) { return catalogApiResponse(error) }
}
