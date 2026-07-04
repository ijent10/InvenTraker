import { NextResponse } from "next/server"
import { z } from "zod"

import { answerRetailIntelligenceQuery } from "@/lib/intelligence/engine"

const requestSchema = z.object({
  query: z.string().trim().min(2).max(1200),
  orgId: z.string().trim().min(1).optional(),
  allowExternal: z.boolean().optional()
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: "Send a product, inventory, ordering, waste, pricing, expiration, or operations query." }, { status: 400 })
  }

  const answer = await answerRetailIntelligenceQuery({
    query: parsed.data.query,
    orgId: parsed.data.orgId,
    allowExternal: parsed.data.allowExternal ?? true
  })

  return NextResponse.json(answer)
}
