import { NextResponse } from "next/server"
import { z } from "zod"

import { learnAllProducts, learnProduct } from "@/lib/ai/knowledge-base"

const requestSchema = z.object({
  productId: z.string().optional(),
  scope: z.enum(["all", "one"]).default("all"),
  persist: z.boolean().default(true),
  orgId: z.string().optional()
})

async function persistIfRequested(records: Awaited<ReturnType<typeof learnAllProducts>>["records"], shouldPersist: boolean, orgId?: string) {
  if (!shouldPersist) return undefined

  try {
    const { persistKnowledgeRecords } = await import("@/lib/ai/knowledge-store")
    return persistKnowledgeRecords(records, orgId)
  } catch (error) {
    return {
      attempted: true,
      persisted: false,
      orgId: orgId || process.env.AI_LEARNING_ORG_ID || "demo-org",
      error: error instanceof Error ? error.message : "Preview mode: learning completed here, but it was not saved to Firestore yet."
    }
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const parsed = requestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid learning request." }, { status: 400 })
  }

  if (parsed.data.scope === "one") {
    if (!parsed.data.productId) {
      return NextResponse.json({ error: "productId is required for single-product learning." }, { status: 400 })
    }

    const record = await learnProduct(parsed.data.productId)
    if (!record) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 })
    }

    const persistence = await persistIfRequested([record], parsed.data.persist, parsed.data.orgId)

    return NextResponse.json({
      learnedAt: new Date().toISOString(),
      totalProducts: 1,
      learnedProducts: 1,
      records: [record],
      persistence
    })
  }

  const result = await learnAllProducts()
  const persistence = await persistIfRequested(result.records, parsed.data.persist, parsed.data.orgId)
  return NextResponse.json({ ...result, persistence })
}
