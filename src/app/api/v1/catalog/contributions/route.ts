import { z } from "zod"

import { CatalogApiError, catalogApiResponse, catalogCorsHeaders, requireCatalogPrincipal } from "@/lib/catalog-api"
import { normalizeGtin } from "@/lib/open-food-facts-import"

const contribution = z.object({
  barcode: z.string().trim().min(1).max(32),
  productName: z.string().trim().min(1).max(300),
  imageURL: z.string().url().max(2_000).nullable().optional(),
  generalizedCategoryKey: z.string().trim().max(300).nullable().optional(),
  ingredients: z.string().trim().max(20_000).nullable().optional(),
  allergens: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
  nutritionPer100: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
  servingSize: z.string().trim().max(160).nullable().optional(),
  quantity: z.string().trim().max(160).nullable().optional(),
  evidence: z.string().trim().max(2_000).nullable().optional()
}).strict()
const schema = z.union([contribution, z.array(contribution).min(1).max(100)])

export function OPTIONS() { return new Response(null, { status: 204, headers: catalogCorsHeaders() }) }

export async function POST(request: Request) {
  try {
    const principal = await requireCatalogPrincipal(request, "catalog:contribute")
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new CatalogApiError(400, "invalid_contribution", "Send one product contribution or an array of up to 100 products.")
    const rows = Array.isArray(parsed.data) ? parsed.data : [parsed.data]
    const now = new Date().toISOString()
    const batch = principal.db.batch()
    const accepted: string[] = []
    for (const row of rows) {
      const normalizedGtin = normalizeGtin(row.barcode)
      if (!normalizedGtin) continue
      const ref = principal.db.collection("catalogProductContributions").doc()
      batch.create(ref, { ...row, normalizedGtin, status: "pending", submittedAt: now, submitter: { kind: principal.kind, id: principal.id, orgId: principal.orgId, client: principal.client } })
      accepted.push(ref.id)
    }
    if (!accepted.length) throw new CatalogApiError(400, "invalid_gtin", "Every contribution had an invalid UPC, EAN, or GTIN.")
    await batch.commit()
    return Response.json({ data: { accepted: accepted.length, rejected: rows.length - accepted.length, contributionIds: accepted } }, { status: 202, headers: catalogCorsHeaders() })
  } catch (error) { return catalogApiResponse(error) }
}
