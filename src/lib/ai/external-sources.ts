import type { ExternalProductMatch, NutritionFacts, NutritionValues, RecallMatch } from "@/lib/ai/types"

const USER_AGENT = "InvenTracker/0.1 product-intelligence (local development)"

function isBarcode(value?: string) {
  return Boolean(value && /^\d{8,14}$/.test(value))
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  return tags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.replace(/^en:/, "").replace(/-/g, " "))
}

function compact(value?: string) {
  return value?.trim() || undefined
}

function numberFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function nutrimentValue(nutriments: Record<string, unknown>, key: string) {
  return numberFrom(nutriments[key])
}

function hasNutritionValues(values: NutritionValues) {
  return Object.values(values).some((value) => typeof value === "number")
}

function nutritionValuesFromNutriments(nutriments: Record<string, unknown>, suffix: "serving" | "100g"): NutritionValues | undefined {
  const sodiumG = nutrimentValue(nutriments, `sodium_${suffix}`)
  const values: NutritionValues = {
    caloriesKcal: nutrimentValue(nutriments, `energy-kcal_${suffix}`),
    fatG: nutrimentValue(nutriments, `fat_${suffix}`),
    saturatedFatG: nutrimentValue(nutriments, `saturated-fat_${suffix}`),
    carbohydratesG: nutrimentValue(nutriments, `carbohydrates_${suffix}`),
    sugarsG: nutrimentValue(nutriments, `sugars_${suffix}`),
    fiberG: nutrimentValue(nutriments, `fiber_${suffix}`),
    proteinG: nutrimentValue(nutriments, `proteins_${suffix}`),
    sodiumMg: typeof sodiumG === "number" ? Math.round(sodiumG * 1000) : undefined,
    saltG: nutrimentValue(nutriments, `salt_${suffix}`)
  }

  return hasNutritionValues(values) ? values : undefined
}

function mapNutritionFacts(product: Record<string, unknown>, sourceUrl?: string): NutritionFacts | undefined {
  const nutriments = product.nutriments
  if (!nutriments || typeof nutriments !== "object") return undefined

  const perServing = nutritionValuesFromNutriments(nutriments as Record<string, unknown>, "serving")
  const per100g = nutritionValuesFromNutriments(nutriments as Record<string, unknown>, "100g")

  if (!perServing && !per100g) return undefined

  return {
    servingSize: compact(product.serving_size as string),
    perServing,
    per100g,
    nutriScoreGrade: compact(product.nutriscore_grade as string),
    novaGroup: typeof product.nova_group === "number" ? product.nova_group : undefined,
    sourceLabel: "Open Food Facts",
    sourceUrl
  }
}

async function fetchJson(url: string, timeoutMs = 5000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT
      },
      signal: controller.signal
    })

    if (!response.ok) return undefined
    return response.json()
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

function mapOpenFoodFactsProduct(product: Record<string, unknown>): ExternalProductMatch | undefined {
  const name = compact(product.product_name_en as string) ?? compact(product.product_name as string)
  if (!name) return undefined

  const barcode = compact(product.code as string)
  const imageUrl = compact(product.image_front_url as string) ?? compact(product.image_url as string)
  const sourceUrl = barcode ? `https://world.openfoodfacts.org/product/${barcode}` : undefined
  const nutrition = mapNutritionFacts(product, sourceUrl)

  return {
    source: "open_food_facts",
    name,
    brand: compact(product.brands as string),
    barcode,
    imageUrl,
    sourceUrl,
    labels: normalizeTags(product.labels_tags),
    allergens: normalizeTags(product.allergens_tags),
    categories: normalizeTags(product.categories_tags),
    ingredientsText: compact(product.ingredients_text_en as string) ?? compact(product.ingredients_text as string),
    nutritionGrade: compact(product.nutriscore_grade as string),
    novaGroup: typeof product.nova_group === "number" ? product.nova_group : undefined,
    nutrition
  }
}

export async function lookupOpenFoodFactsProduct({
  productName,
  sku
}: {
  productName: string
  sku?: string
}): Promise<ExternalProductMatch[]> {
  const matches: ExternalProductMatch[] = []

  if (isBarcode(sku)) {
    const barcodePayload = await fetchJson(`https://world.openfoodfacts.org/api/v2/product/${sku}.json`)
    const product = barcodePayload?.product
    if (product && typeof product === "object") {
      const mapped = mapOpenFoodFactsProduct(product as Record<string, unknown>)
      if (mapped) matches.push(mapped)
    }
  }

  const params = new URLSearchParams({
    search_terms: productName,
    countries_tags_en: "United States",
    fields:
      "code,product_name,product_name_en,brands,image_url,image_front_url,labels_tags,allergens_tags,categories_tags,ingredients_text,ingredients_text_en,nutriscore_grade,nova_group,serving_size,nutriments",
    page_size: "3",
    json: "1"
  })

  const searchPayload = await fetchJson(`https://world.openfoodfacts.org/cgi/search.pl?${params.toString()}`)
  const products = Array.isArray(searchPayload?.products) ? searchPayload.products : []

  for (const product of products) {
    if (!product || typeof product !== "object") continue
    const mapped = mapOpenFoodFactsProduct(product as Record<string, unknown>)
    if (mapped && !matches.some((match) => match.barcode && match.barcode === mapped.barcode)) {
      matches.push(mapped)
    }
  }

  return matches.slice(0, 4)
}

export async function lookupOpenFdaRecalls(productName: string): Promise<RecallMatch[]> {
  const query = productName.replace(/[^\w\s-]/g, " ").trim()
  if (!query) return []

  const params = new URLSearchParams({
    search: `product_description:"${query}"`,
    limit: "3"
  })

  const payload = await fetchJson(`https://api.fda.gov/food/enforcement.json?${params.toString()}`)
  const results: unknown[] = Array.isArray(payload?.results) ? payload.results : []

  return results
    .filter((result): result is Record<string, unknown> => Boolean(result && typeof result === "object"))
    .map((result) => ({
      source: "open_fda",
      productDescription: compact(result.product_description as string) ?? query,
      recallingFirm: compact(result.recalling_firm as string),
      reason: compact(result.reason_for_recall as string),
      classification: compact(result.classification as string),
      status: compact(result.status as string),
      reportDate: compact(result.report_date as string),
      sourceUrl: "https://open.fda.gov/apis/food/enforcement/"
    }))
}

export function productHasKosherEvidence(product: ExternalProductMatch) {
  const searchable = [...product.labels, product.ingredientsText ?? "", product.categories.join(" ")].join(" ").toLowerCase()
  return searchable.includes("kosher")
}
