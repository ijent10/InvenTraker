import { NextResponse } from "next/server"
import { z } from "zod"

import { generateProductEnrichmentSuggestions, persistProductEnrichmentSuggestions } from "@/lib/intelligence/enrichment"

const requestSchema = z.object({
  query: z.string().trim().min(2).max(800).optional(),
  productId: z.string().trim().min(1).optional(),
  orgId: z.string().trim().min(1).optional(),
  persist: z.boolean().optional()
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)

  if (!parsed.success || (!parsed.data.query && !parsed.data.productId)) {
    return NextResponse.json({ error: "Send a productId or query to create enrichment suggestions." }, { status: 400 })
  }

  const result = await generateProductEnrichmentSuggestions({
    query: parsed.data.query,
    productId: parsed.data.productId,
    orgId: parsed.data.orgId
  })
  const persistence = parsed.data.persist ? await persistProductEnrichmentSuggestions(result.suggestions, parsed.data.orgId) : undefined

  return NextResponse.json({
    ...result,
    persistence
  })
}
