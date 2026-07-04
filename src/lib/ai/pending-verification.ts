import { lookupOpenFoodFactsProduct } from "@/lib/ai/external-sources"
import { adminDb } from "@/lib/firebase-admin"
import type { AiConfidence, ExternalProductMatch, NutritionValues, PendingAutofillBatch, PendingAutofillField } from "@/lib/ai/types"

type PendingAutofillInput = {
  productName: string
  sku?: string
  productId?: string
  reason?: string
}

export type PendingAutofillPersistenceResult = {
  attempted: boolean
  persisted: boolean
  orgId: string
  batchId: string
  error?: string
}

function compact(value?: string) {
  return value?.trim() || undefined
}

function confidenceForMatch(match: ExternalProductMatch | undefined, sku?: string): AiConfidence {
  if (match?.barcode && sku && match.barcode === sku) return "high"
  if (match) return "medium"
  return "low"
}

function valueText(value: number | string | undefined, suffix = "") {
  if (typeof value === "number") return `${value}${suffix}`
  return compact(value)
}

function nutritionValueFields({
  nutrition,
  prefix,
  labelPrefix,
  sourceLabel,
  sourceUrl,
  confidence
}: {
  nutrition: NutritionValues | undefined
  prefix: string
  labelPrefix: string
  sourceLabel: string
  sourceUrl?: string
  confidence: AiConfidence
}): PendingAutofillField[] {
  if (!nutrition) return []

  const candidates: Array<[keyof NutritionValues, string, string, string]> = [
    ["caloriesKcal", "Calories", "nutrition.caloriesKcal", " kcal"],
    ["fatG", "Total fat", "nutrition.fatG", "g"],
    ["saturatedFatG", "Saturated fat", "nutrition.saturatedFatG", "g"],
    ["carbohydratesG", "Carbohydrates", "nutrition.carbohydratesG", "g"],
    ["sugarsG", "Sugars", "nutrition.sugarsG", "g"],
    ["fiberG", "Fiber", "nutrition.fiberG", "g"],
    ["proteinG", "Protein", "nutrition.proteinG", "g"],
    ["sodiumMg", "Sodium", "nutrition.sodiumMg", "mg"],
    ["saltG", "Salt", "nutrition.saltG", "g"]
  ]

  const fields: PendingAutofillField[] = []

  for (const [key, label, field, suffix] of candidates) {
    const proposedValue = valueText(nutrition[key], suffix)
    if (!proposedValue) continue

    fields.push({
      field: `${prefix}.${field}`,
      label: `${labelPrefix} ${label}`,
      proposedValue,
      sourceLabel,
      sourceUrl,
      confidence
    })
  }

  return fields
}

function fieldsFromMatch(match: ExternalProductMatch | undefined, sku?: string): PendingAutofillField[] {
  if (!match) return []

  const confidence = confidenceForMatch(match, sku)
  const sourceLabel = "Open Food Facts"
  const sourceUrl = match.sourceUrl
  const fields: PendingAutofillField[] = []

  function add(field: string, label: string, proposedValue?: string, currentValue?: string, fieldConfidence = confidence) {
    const proposed = compact(proposedValue)
    if (!proposed) return
    fields.push({
      field,
      label,
      proposedValue: proposed,
      currentValue,
      sourceLabel,
      sourceUrl,
      confidence: fieldConfidence
    })
  }

  add("product.name", "Product name", match.name)
  add("product.brand", "Brand", match.brand)
  add("product.barcode", "Barcode", match.barcode)
  add("product.imageUrl", "Product image", match.imageUrl)
  add("product.labels", "Labels", match.labels.slice(0, 12).join(", "))
  add("product.allergens", "Allergens", match.allergens.slice(0, 12).join(", "))
  add("product.categories", "Categories", match.categories.slice(0, 10).join(", "))
  add("product.ingredientsText", "Ingredients", match.ingredientsText)

  if (match.nutrition?.servingSize) {
    add("product.nutrition.servingSize", "Serving size", match.nutrition.servingSize)
  }

  if (match.nutrition?.nutriScoreGrade) {
    add("product.nutrition.nutriScoreGrade", "Nutri-Score", match.nutrition.nutriScoreGrade.toUpperCase())
  }

  if (match.nutrition?.novaGroup) {
    add("product.nutrition.novaGroup", "NOVA group", String(match.nutrition.novaGroup))
  }

  fields.push(
    ...nutritionValueFields({
      nutrition: match.nutrition?.perServing,
      prefix: "product.nutrition.perServing",
      labelPrefix: "Per serving",
      sourceLabel,
      sourceUrl,
      confidence
    }),
    ...nutritionValueFields({
      nutrition: match.nutrition?.per100g,
      prefix: "product.nutrition.per100g",
      labelPrefix: "Per 100g",
      sourceLabel,
      sourceUrl,
      confidence
    })
  )

  return fields
}

function summarizeSource(match: ExternalProductMatch | undefined) {
  if (!match) return "No external product match found yet."
  return [match.name, match.brand, match.barcode ? `barcode ${match.barcode}` : undefined].filter(Boolean).join(" · ")
}

export async function createPendingAutofillBatch(input: PendingAutofillInput) {
  const externalProducts = await lookupOpenFoodFactsProduct({
    productName: input.productName,
    sku: input.sku
  })
  const bestMatch = externalProducts[0]
  const fields = fieldsFromMatch(bestMatch, input.sku)

  const batch: PendingAutofillBatch = {
    id: `pending-${crypto.randomUUID()}`,
    productId: input.productId,
    productName: bestMatch?.name ?? input.productName,
    sku: bestMatch?.barcode ?? input.sku,
    createdAt: new Date().toISOString(),
    createdBy: "assistant",
    status: "pending",
    reason: input.reason ?? "The assistant proposed product details, nutrition facts, and image fields from public product sources.",
    sourceSummary: summarizeSource(bestMatch),
    fields
  }

  return {
    batch,
    externalProducts
  }
}

export async function persistPendingAutofillBatch(
  batch: PendingAutofillBatch,
  orgId = process.env.AI_AUTOFILL_ORG_ID || process.env.AI_LEARNING_ORG_ID || "demo-org"
): Promise<PendingAutofillPersistenceResult> {
  const result: PendingAutofillPersistenceResult = {
    attempted: true,
    persisted: false,
    orgId,
    batchId: batch.id
  }

  try {
    const db = await adminDb()
    if (!db) {
      return {
        ...result,
        error: "Preview mode: pending review is shown here, but it was not saved to Firestore yet."
      }
    }
    const { FieldValue } = await import("firebase-admin/firestore")

    await db.collection("orgs").doc(orgId).collection("aiPendingAutofills").doc(batch.id).set(
      {
        ...batch,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    )

    return {
      ...result,
      persisted: true
    }
  } catch (error) {
    return {
      ...result,
      error: error instanceof Error ? error.message : "Failed to persist pending autofill."
    }
  }
}

export const demoPendingAutofillBatches: PendingAutofillBatch[] = [
  {
    id: "pending-demo-001",
    productId: "prod-003",
    productName: "Strawberry clamshell",
    sku: "PROD-STRAW-16",
    createdAt: new Date().toISOString(),
    createdBy: "assistant",
    status: "pending",
    reason: "The assistant found public product and nutrition hints. A manager should verify the package or supplier sheet before saving.",
    sourceSummary: "Open Food Facts candidate · image and nutrition fields need review",
    fields: [
      {
        field: "product.imageUrl",
        label: "Product image",
        proposedValue: "https://example.com/strawberry-clamshell.jpg",
        sourceLabel: "Open Food Facts",
        confidence: "medium"
      },
      {
        field: "product.nutrition.perServing.caloriesKcal",
        label: "Per serving Calories",
        proposedValue: "50 kcal",
        sourceLabel: "Open Food Facts",
        confidence: "low"
      },
      {
        field: "product.ingredientsText",
        label: "Ingredients",
        proposedValue: "Strawberries",
        sourceLabel: "Open Food Facts",
        confidence: "medium"
      }
    ]
  }
]
