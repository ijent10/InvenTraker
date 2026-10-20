import { catalogApiResponse, catalogCorsHeaders, catalogPatchSchema, catalogProductByGtin, requireCatalogPrincipal, updateCatalogProduct } from "@/lib/catalog-api"

export const dynamic = "force-dynamic"

export function OPTIONS() { return new Response(null, { status: 204, headers: catalogCorsHeaders() }) }

export async function GET(request: Request, context: { params: { gtin: string } }) {
  try {
    const principal = await requireCatalogPrincipal(request)
    return Response.json({ data: await catalogProductByGtin(principal.db, context.params.gtin) }, { headers: catalogCorsHeaders() })
  } catch (error) { return catalogApiResponse(error) }
}

export async function PATCH(request: Request, context: { params: { gtin: string } }) {
  try {
    const principal = await requireCatalogPrincipal(request, "catalog:write")
    const parsed = catalogPatchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: { code: "invalid_patch", message: "Send at least one supported product field.", details: parsed.error.flatten() } }, { status: 400, headers: catalogCorsHeaders() })
    return Response.json({ data: await updateCatalogProduct(principal, context.params.gtin, parsed.data) }, { headers: catalogCorsHeaders() })
  } catch (error) { return catalogApiResponse(error) }
}
