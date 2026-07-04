import { lookupOpenFoodFactsProduct } from "@/lib/ai/external-sources"
import type { NutritionFacts } from "@/lib/ai/types"
import { adminDb } from "@/lib/firebase-admin"
import { DEFAULT_ORG_ID, firestoreCollections } from "@/lib/firestore-schema"
import { buildProductLookupRecords, lookupProductIntelligence } from "@/lib/intelligence/retrieval"
import { slugifyIntelligenceId } from "@/lib/intelligence/text"
import type { ProductEnrichmentSuggestion } from "@/lib/intelligence/types"
import { buildOperationalContext } from "@/lib/ai/context"
import { readVerifiedLearningRecords } from "@/lib/intelligence/learning-store"

type PersistSuggestionsResult = {
  attempted: boolean
  persisted: boolean
  orgId: string
  suggestionIds: string[]
  error?: string
}

function nutritionSummary(nutrition: NutritionFacts | undefined) {
  if (!nutrition) return undefined
  const serving = nutrition.servingSize ? `Serving size: ${nutrition.servingSize}` : undefined
  const calories = nutrition.perServing?.caloriesKcal ?? nutrition.per100g?.caloriesKcal
  const protein = nutrition.perServing?.proteinG ?? nutrition.per100g?.proteinG
  const sodium = nutrition.perServing?.sodiumMg ?? nutrition.per100g?.sodiumMg

  return [serving, typeof calories === "number" ? `${calories} calories` : undefined, typeof protein === "number" ? `${protein}g protein` : undefined, typeof sodium === "number" ? `${sodium}mg sodium` : undefined]
    .filter(Boolean)
    .join("; ")
}

function suggestionId(productName: string, field: string, value: string) {
  return `enrich-${slugifyIntelligenceId(`${productName}-${field}-${value}`)}`
}

function suggestion(input: Omit<ProductEnrichmentSuggestion, "id" | "status" | "createdAt" | "retrievedAt"> & { retrievedAt?: string }): ProductEnrichmentSuggestion {
  const timestamp = new Date().toISOString()
  return {
    ...input,
    id: suggestionId(input.productName, input.proposedField, input.proposedValue),
    status: "pending",
    createdAt: timestamp,
    retrievedAt: input.retrievedAt ?? timestamp
  }
}

export async function generateProductEnrichmentSuggestions({
  query,
  productId,
  orgId = DEFAULT_ORG_ID
}: {
  query?: string
  productId?: string
  orgId?: string
}) {
  const [lookup, context, learning] = await Promise.all([
    query ? lookupProductIntelligence({ query, orgId, allowExternal: true }) : Promise.resolve(undefined),
    buildOperationalContext(),
    readVerifiedLearningRecords(orgId)
  ])
  const records = buildProductLookupRecords(context, learning)
  const targetRecord =
    (productId ? records.find((record) => record.productId === productId || record.centralProductId === productId) : undefined) ??
    (lookup?.resolvedProduct ? records.find((record) => record.productId === lookup.resolvedProduct?.productId || record.name === lookup.resolvedProduct?.name) : undefined)
  const productName = targetRecord?.name ?? lookup?.resolvedProduct?.name ?? query ?? "Unknown product"
  const sku = targetRecord?.sku ?? lookup?.resolvedProduct?.sku
  const externalProducts = lookup?.externalProducts?.length
    ? lookup.externalProducts
    : await lookupOpenFoodFactsProduct({ productName, sku })
  const bestExternal = externalProducts[0]
  const suggestions: ProductEnrichmentSuggestion[] = []

  if (bestExternal?.imageUrl) {
    suggestions.push(
      suggestion({
        productId: targetRecord?.productId ?? lookup?.resolvedProduct?.productId,
        productName,
        sku,
        proposedField: "imageUrl",
        proposedValue: bestExternal.imageUrl,
        sourceUrl: bestExternal.sourceUrl,
        sourceLabel: "Open Food Facts",
        confidenceScore: bestExternal.barcode && sku && bestExternal.barcode === sku ? 0.86 : 0.68
      })
    )
  }

  if (bestExternal?.ingredientsText) {
    suggestions.push(
      suggestion({
        productId: targetRecord?.productId ?? lookup?.resolvedProduct?.productId,
        productName,
        sku,
        proposedField: "ingredientsText",
        proposedValue: bestExternal.ingredientsText,
        sourceUrl: bestExternal.sourceUrl,
        sourceLabel: "Open Food Facts",
        confidenceScore: 0.66
      })
    )
  }

  if (bestExternal?.allergens.length) {
    suggestions.push(
      suggestion({
        productId: targetRecord?.productId ?? lookup?.resolvedProduct?.productId,
        productName,
        sku,
        proposedField: "allergens",
        proposedValue: bestExternal.allergens.join(", "),
        sourceUrl: bestExternal.sourceUrl,
        sourceLabel: "Open Food Facts",
        confidenceScore: 0.64
      })
    )
  }

  const nutrition = nutritionSummary(bestExternal?.nutrition)
  if (nutrition) {
    suggestions.push(
      suggestion({
        productId: targetRecord?.productId ?? lookup?.resolvedProduct?.productId,
        productName,
        sku,
        proposedField: "nutrition",
        proposedValue: nutrition,
        sourceUrl: bestExternal?.nutrition?.sourceUrl ?? bestExternal?.sourceUrl,
        sourceLabel: bestExternal?.nutrition?.sourceLabel ?? "Open Food Facts",
        confidenceScore: 0.62
      })
    )
  }

  return {
    productName,
    productId: targetRecord?.productId ?? lookup?.resolvedProduct?.productId,
    sku,
    lookup,
    externalProducts,
    suggestions
  }
}

export async function persistProductEnrichmentSuggestions(suggestions: ProductEnrichmentSuggestion[], orgId = DEFAULT_ORG_ID): Promise<PersistSuggestionsResult> {
  const result: PersistSuggestionsResult = {
    attempted: true,
    persisted: false,
    orgId,
    suggestionIds: suggestions.map((item) => item.id)
  }

  try {
    const db = await adminDb()
    if (!db) {
      return {
        ...result,
        error: "Preview mode: enrichment suggestions were generated but not saved to Firestore yet."
      }
    }

    const { FieldValue } = await import("firebase-admin/firestore")
    const batch = db.batch()
    const collectionRef = db.collection(firestoreCollections.orgs).doc(orgId).collection(firestoreCollections.productEnrichmentSuggestions)

    suggestions.forEach((item) => {
      batch.set(
        collectionRef.doc(item.id),
        {
          product_id: item.productId,
          product_name: item.productName,
          sku: item.sku,
          proposed_field: item.proposedField,
          proposed_value: item.proposedValue,
          current_value: item.currentValue,
          source_url: item.sourceUrl,
          source_label: item.sourceLabel,
          confidence_score: item.confidenceScore,
          status: item.status,
          retrieved_at: item.retrievedAt,
          approved_by: item.approvedBy,
          approved_at: item.approvedAt,
          superseded_by: item.supersededBy,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp()
        },
        { merge: true }
      )
    })

    await batch.commit()

    return {
      ...result,
      persisted: true
    }
  } catch (error) {
    return {
      ...result,
      error: error instanceof Error ? error.message : "Failed to persist enrichment suggestions."
    }
  }
}
