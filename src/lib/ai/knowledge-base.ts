import { lookupOpenFoodFactsProduct } from "@/lib/ai/external-sources"
import { buildImageCandidates } from "@/lib/ai/product-intelligence"
import type { ExternalProductMatch, NutritionFacts, ProductImageCandidate } from "@/lib/ai/types"
import type { CentralCatalogProduct, InventoryItem, Product } from "@/lib/demo-data"
import { getCentralCatalogProducts, getInventoryItems, getProducts } from "@/lib/server-data"

export type ProductKnowledgeRecord = {
  id: string
  productName: string
  sku?: string
  department: string
  category: string
  defaultUnit: string
  expires: boolean
  localInventory?: {
    onHand: number
    frontStock: number
    backStock: number
    par: number
    reorderPoint: number
    vendor: string
  }
  externalProducts: ExternalProductMatch[]
  nutritionCandidates: NutritionFacts[]
  imageCandidates: ProductImageCandidate[]
  learnedFacts: string[]
  verificationGaps: string[]
  learnedAt: string
}

function factsFromExternalMatches(matches: ExternalProductMatch[]) {
  const labels = new Set(matches.flatMap((match) => match.labels))
  const allergens = new Set(matches.flatMap((match) => match.allergens))
  const brands = new Set(matches.map((match) => match.brand).filter((brand): brand is string => Boolean(brand)))
  const nutritionMatches = matches.filter((match) => match.nutrition)

  return [
    brands.size > 0 ? `Brands seen externally: ${Array.from(brands).slice(0, 4).join(", ")}` : undefined,
    labels.size > 0 ? `Labels seen externally: ${Array.from(labels).slice(0, 8).join(", ")}` : undefined,
    allergens.size > 0 ? `Allergens seen externally: ${Array.from(allergens).slice(0, 8).join(", ")}` : undefined,
    nutritionMatches.length > 0 ? `${nutritionMatches.length} nutrition candidate${nutritionMatches.length === 1 ? "" : "s"} found` : undefined
  ].filter((fact): fact is string => Boolean(fact))
}

function verificationGaps(matches: ExternalProductMatch[]) {
  const gaps = ["Kosher status still needs stored supplier/package/certification proof"]

  if (!matches.some((match) => match.imageUrl)) {
    gaps.push("No external image URL found")
  }

  if (!matches.some((match) => match.ingredientsText)) {
    gaps.push("Ingredients were not available in external matches")
  }

  if (!matches.some((match) => match.nutrition)) {
    gaps.push("Nutrition facts were not available in external matches")
  }

  return gaps
}

async function learnProductRecord(product: Product, inventoryItems: InventoryItem[]): Promise<ProductKnowledgeRecord> {
  const inventory = inventoryItems.find((item) => item.name === product.name)
  const externalProducts = await lookupOpenFoodFactsProduct({
    productName: product.name,
    sku: inventory?.sku
  })
  const externalImageCandidates = externalProducts
    .filter((match) => match.imageUrl)
    .map((match) => ({
      title: match.brand ? `${match.name} by ${match.brand}` : match.name,
      query: [match.name, match.barcode].filter(Boolean).join(" "),
      reason: "Image URL found during product learning and should be reviewed before saving.",
      source: "open_food_facts" as const,
      imageUrl: match.imageUrl,
      sourceUrl: match.sourceUrl
    }))

  return {
    id: product.id,
    productName: product.name,
    sku: inventory?.sku,
    department: product.department,
    category: product.category,
    defaultUnit: product.defaultUnit,
    expires: product.expires,
    localInventory: inventory
      ? {
          onHand: inventory.onHand,
          frontStock: inventory.frontStock,
          backStock: inventory.backStock,
          par: inventory.par,
          reorderPoint: inventory.reorderPoint,
          vendor: inventory.vendor
        }
      : undefined,
    externalProducts,
    nutritionCandidates: externalProducts.map((match) => match.nutrition).filter((nutrition): nutrition is NutritionFacts => Boolean(nutrition)),
    imageCandidates: [...externalImageCandidates, ...buildImageCandidates(product.name, inventory?.sku)],
    learnedFacts: factsFromExternalMatches(externalProducts),
    verificationGaps: verificationGaps(externalProducts),
    learnedAt: new Date().toISOString()
  }
}

async function learnCentralCatalogRecord(product: CentralCatalogProduct, inventoryItems: InventoryItem[]): Promise<ProductKnowledgeRecord> {
  const inventory = inventoryItems.find((item) => item.centralProductId === product.id || item.sku === product.sku || item.name === product.name)
  const externalProducts = await lookupOpenFoodFactsProduct({
    productName: product.name,
    sku: product.sku
  })
  const externalImageCandidates = externalProducts
    .filter((match) => match.imageUrl)
    .map((match) => ({
      title: match.brand ? `${match.name} by ${match.brand}` : match.name,
      query: [match.name, match.barcode].filter(Boolean).join(" "),
      reason: "Image URL found during central catalog learning and should be reviewed before saving.",
      source: "open_food_facts" as const,
      imageUrl: match.imageUrl,
      sourceUrl: match.sourceUrl
    }))

  return {
    id: product.id,
    productName: product.name,
    sku: product.sku,
    department: inventory?.department ?? "Central catalog",
    category: inventory?.category ?? "Unassigned",
    defaultUnit: inventory?.unit ?? "eaches",
    expires: typeof product.averageExpirationDays === "number" ? product.averageExpirationDays > 0 : Boolean(inventory?.expires),
    localInventory: inventory
      ? {
          onHand: inventory.onHand,
          frontStock: inventory.frontStock,
          backStock: inventory.backStock,
          par: inventory.par,
          reorderPoint: inventory.reorderPoint,
          vendor: inventory.vendor
        }
      : undefined,
    externalProducts,
    nutritionCandidates: externalProducts.map((match) => match.nutrition).filter((nutrition): nutrition is NutritionFacts => Boolean(nutrition)),
    imageCandidates: [...externalImageCandidates, ...buildImageCandidates(product.name, product.sku)],
    learnedFacts: [
      ...product.learnedFacts,
      typeof product.averagePrice === "number" ? `Average price: ${product.averagePrice}` : undefined,
      typeof product.averageExpirationDays === "number" ? `Average expiration days: ${product.averageExpirationDays}` : undefined,
      typeof product.averageQuantityInCase === "number" ? `Average quantity in case: ${product.averageQuantityInCase}` : undefined,
      ...factsFromExternalMatches(externalProducts)
    ].filter((fact): fact is string => Boolean(fact)),
    verificationGaps: verificationGaps(externalProducts),
    learnedAt: new Date().toISOString()
  }
}

export async function learnProduct(productId: string): Promise<ProductKnowledgeRecord | undefined> {
  const [products, inventoryItems] = await Promise.all([getProducts(), getInventoryItems()])
  const product = products.find((candidate) => candidate.id === productId)
  if (!product) return undefined

  return learnProductRecord(product, inventoryItems)
}

export async function learnAllProducts() {
  const [centralCatalog, products, inventoryItems] = await Promise.all([getCentralCatalogProducts(), getProducts(), getInventoryItems()])
  const records: ProductKnowledgeRecord[] = []
  const learnedIds = new Set<string>()

  for (const product of centralCatalog) {
    records.push(await learnCentralCatalogRecord(product, inventoryItems))
    learnedIds.add(product.id)
  }

  for (const product of products) {
    if (product.centralProductId && learnedIds.has(product.centralProductId)) continue
    records.push(await learnProductRecord(product, inventoryItems))
  }

  return {
    learnedAt: new Date().toISOString(),
    totalProducts: centralCatalog.length + products.filter((product) => !product.centralProductId || !learnedIds.has(product.centralProductId)).length,
    learnedProducts: records.length,
    records
  }
}
