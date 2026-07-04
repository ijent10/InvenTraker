import { NextResponse } from "next/server"
import { z } from "zod"

import { createPendingAutofillBatch, persistPendingAutofillBatch } from "@/lib/ai/pending-verification"

const requestSchema = z.object({
  productName: z.string().trim().min(2).max(200),
  sku: z.string().trim().max(80).optional(),
  productId: z.string().trim().max(80).optional(),
  reason: z.string().trim().max(400).optional(),
  persist: z.boolean().default(true),
  orgId: z.string().trim().max(120).optional()
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const parsed = requestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a product name, and optionally a SKU or barcode." }, { status: 400 })
  }

  const { persist, orgId, ...input } = parsed.data
  const result = await createPendingAutofillBatch(input)
  const persistence = persist ? await persistPendingAutofillBatch(result.batch, orgId) : undefined

  return NextResponse.json({
    ...result,
    persistence,
    reviewRequired: true,
    message:
      result.batch.fields.length > 0
        ? "AI autofill created a pending review batch. Approve fields before they become inventory data."
        : "No autofill fields were found. Ask again with a barcode or exact package name."
  })
}
