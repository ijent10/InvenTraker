import { NextResponse } from "next/server"
import { z } from "zod"

import { lookupOpenFoodFactsProduct } from "@/lib/ai/external-sources"
import { buildImageCandidates } from "@/lib/ai/product-intelligence"

const requestSchema = z.object({
  productName: z.string().trim().min(2).max(200),
  sku: z.string().trim().max(120).optional()
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: "Product name is required." }, { status: 400 })
  }

  const externalProducts = await lookupOpenFoodFactsProduct(parsed.data)
  const externalCandidates = externalProducts
    .filter((product) => product.imageUrl)
    .map((product) => ({
      title: product.brand ? `${product.name} by ${product.brand}` : product.name,
      query: [product.name, product.barcode].filter(Boolean).join(" "),
      reason: "Image URL found in Open Food Facts and should be reviewed before becoming the official product image.",
      source: "open_food_facts" as const,
      imageUrl: product.imageUrl,
      sourceUrl: product.sourceUrl
    }))

  return NextResponse.json({
    candidates: [...externalCandidates, ...buildImageCandidates(parsed.data.productName, parsed.data.sku)],
    externalProducts,
    status: "external_search_ready",
    message:
      externalCandidates.length > 0
        ? "External image candidates found. Review before saving to the product record."
        : "No external image URL found yet. Connect supplier images or a broader image provider for additional candidates."
  })
}
