import { z } from "zod"

import { CatalogApiError, catalogApiResponse, catalogCorsHeaders, catalogProductByGtin, requireCatalogPrincipal } from "@/lib/catalog-api"

const bodySchema = z.object({ barcodes: z.array(z.string().trim().min(1).max(32)).min(1).max(100) }).strict()

export function OPTIONS() { return new Response(null, { status: 204, headers: catalogCorsHeaders() }) }

export async function POST(request: Request) {
  try {
    const principal = await requireCatalogPrincipal(request)
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: { code: "invalid_request", message: "Send 1 to 100 barcode strings." } }, { status: 400, headers: catalogCorsHeaders() })
    const results = await Promise.all(parsed.data.barcodes.map(async (barcode) => {
      try { return { barcode, product: await catalogProductByGtin(principal.db, barcode) } }
      catch (error) { return { barcode, product: null, error: error instanceof CatalogApiError ? error.code : "lookup_failed" } }
    }))
    return Response.json({ data: results }, { headers: catalogCorsHeaders() })
  } catch (error) { return catalogApiResponse(error) }
}
