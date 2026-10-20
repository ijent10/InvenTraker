import { z } from "zod"

import { catalogApiResponse, catalogCorsHeaders, requireCatalogPrincipal, searchCatalog } from "@/lib/catalog-api"

export const dynamic = "force-dynamic"

export function OPTIONS() { return new Response(null, { status: 204, headers: catalogCorsHeaders() }) }

export async function GET(request: Request) {
  try {
    const principal = await requireCatalogPrincipal(request)
    const url = new URL(request.url)
    const parsed = z.object({ q: z.string().trim().min(1).max(300), limit: z.coerce.number().int().min(1).max(50).default(20) }).safeParse({ q: url.searchParams.get("q"), limit: url.searchParams.get("limit") ?? 20 })
    if (!parsed.success) return Response.json({ error: { code: "invalid_query", message: "Send q and an optional limit from 1 to 50." } }, { status: 400, headers: catalogCorsHeaders() })
    const data = await searchCatalog(principal.db, parsed.data.q, parsed.data.limit)
    return Response.json({ data, meta: { count: data.length } }, { headers: catalogCorsHeaders() })
  } catch (error) { return catalogApiResponse(error) }
}
