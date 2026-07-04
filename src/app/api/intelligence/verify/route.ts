import { NextResponse } from "next/server"
import { z } from "zod"

import { persistVerifiedLearning } from "@/lib/intelligence/learning-store"

const requestSchema = z.object({
  query: z.string().trim().min(2).max(1200),
  resolvedProductId: z.string().trim().min(1).optional(),
  resolvedProductName: z.string().trim().min(1).optional(),
  answer: z.string().trim().min(1).max(4000),
  confidenceScore: z.number().min(0).max(1).default(0.5),
  accepted: z.boolean(),
  correctedAnswer: z.string().trim().max(4000).optional(),
  verifiedByUser: z.boolean().optional(),
  sourceRoute: z.string().trim().max(200).optional(),
  orgId: z.string().trim().min(1).optional()
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: "Send a verified accepted/rejected intelligence answer." }, { status: 400 })
  }

  const { orgId, ...input } = parsed.data
  const result = await persistVerifiedLearning(input, orgId)

  return NextResponse.json(result)
}
