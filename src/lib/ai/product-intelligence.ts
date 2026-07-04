import type { NationalSignal, ProductEvidence, ProductImageCandidate, WasteSignal } from "@/lib/ai/types"

export const productEvidence: ProductEvidence[] = [
  {
    productId: "prod-001",
    productName: "Cabernet Sauvignon",
    sku: "WINE-CAB-750",
    kosherStatus: "not_recorded",
    allergens: ["Sulfites may be present"],
    dietaryNotes: ["Alcoholic beverage", "Certification status is not stored yet"],
    handlingNotes: ["Keep away from heat and direct sunlight", "Verify vintage and supplier before customer-facing claims"],
    imageHints: ["cabernet sauvignon 750ml bottle", "red wine bottle"],
    sources: [
      {
        id: "local-catalog-prod-001",
        label: "Local product catalog",
        type: "product_profile",
        detail: "Catalog record exists, but kosher certification is not recorded."
      }
    ]
  },
  {
    productId: "prod-002",
    productName: "Sourdough loaf",
    sku: "BAKE-SOUR-01",
    kosherStatus: "not_recorded",
    allergens: ["Wheat", "Gluten"],
    dietaryNotes: ["In-house bakery item", "Certification status depends on facility, ingredients, and supervision"],
    handlingNotes: ["Track production date", "Use expiration tracking"],
    imageHints: ["sourdough loaf bakery bread", "artisan sourdough loaf"],
    sources: [
      {
        id: "local-catalog-prod-002",
        label: "Local product catalog",
        type: "product_profile",
        detail: "Catalog record tracks expiration and bakery department defaults."
      }
    ]
  },
  {
    productId: "prod-003",
    productName: "Strawberry clamshell",
    sku: "PROD-STRAW-16",
    kosherStatus: "not_recorded",
    allergens: [],
    dietaryNotes: ["Fresh produce", "Certification and inspection requirements should be store policy controlled"],
    handlingNotes: ["Keep refrigerated", "Inspect for quality before stocking"],
    imageHints: ["strawberry clamshell 16 oz", "fresh strawberry package"],
    sources: [
      {
        id: "local-catalog-prod-003",
        label: "Local product catalog",
        type: "product_profile",
        detail: "Catalog record tracks expiration and produce department defaults."
      }
    ]
  }
]

export const wasteSignals: WasteSignal[] = [
  {
    productName: "Strawberry clamshell",
    quantity: 2,
    unit: "cases",
    reason: "Quality pull",
    recordedAt: "Yesterday, 6:12 PM"
  },
  {
    productName: "Sourdough loaf",
    quantity: 6,
    unit: "eaches",
    reason: "Expired before close",
    recordedAt: "Yesterday, 9:38 PM"
  }
]

export const nationalSignals: NationalSignal[] = [
  {
    title: "Certification claims require source-backed answers",
    detail: "Kosher, organic, gluten-free, and allergen answers should be backed by supplier data, certification databases, or packaging evidence.",
    sourceLabel: "AI policy placeholder"
  },
  {
    title: "External search connector reserved",
    detail: "Nationwide product status, recalls, supplier updates, product images, and nutrition candidates flow through public source lookups before review.",
    sourceLabel: "Open Food Facts and openFDA"
  }
]

export function buildImageCandidates(productName: string, sku?: string): ProductImageCandidate[] {
  const baseQuery = [productName, sku].filter(Boolean).join(" ")

  return [
    {
      title: "Exact product image search",
      query: baseQuery,
      reason: "Best first pass when SKU/barcode is available.",
      source: "external_search_ready"
    },
    {
      title: "Package and shelf image search",
      query: `${productName} package product image`,
      reason: "Useful when SKU does not return a strong image match.",
      source: "external_search_ready"
    },
    {
      title: "Local catalog image hint",
      query: productName,
      reason: "Use as a fallback until supplier image URLs are stored.",
      source: "local_hint"
    }
  ]
}
