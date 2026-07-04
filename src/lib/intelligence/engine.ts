import { buildImageCandidates } from "@/lib/ai/product-intelligence"
import { buildOperationalContext } from "@/lib/ai/context"
import { DEFAULT_ORG_ID } from "@/lib/firestore-schema"
import { generateProductEnrichmentSuggestions } from "@/lib/intelligence/enrichment"
import { generateBusinessRecommendations } from "@/lib/intelligence/recommendations"
import { lookupProductIntelligence } from "@/lib/intelligence/retrieval"
import { confidenceLabel } from "@/lib/intelligence/text"
import type { RetailIntelligenceAnswer } from "@/lib/intelligence/types"
import type { AiOperationalContext, AssistantProductMemory, ProductEvidence } from "@/lib/ai/types"

function queryNeedsRecommendations(query: string) {
  return /(recommend|order|ordering|forecast|trend|waste|stock|inventory|movement|production|markdown|expiration|cost|sales)/i.test(query)
}

function queryNeedsEnrichment(query: string) {
  return /(nutrition|ingredient|allergen|image|photo|picture|label|barcode|enrich|metadata|kosher|halal|organic|gluten[- ]?free|vegan)/i.test(query)
}

function queryNeedsNutrition(query: string) {
  return /(nutrition|nutritional|calorie|calories|protein|carb|carbs|sodium|salt|fat|sugar|fiber|ingredient|ingredients|allergen|allergens)/i.test(query)
}

function queryNeedsCompliance(query: string) {
  return /(kosher|halal|organic|gluten[- ]?free|vegan|dietary|certified|certification)/i.test(query)
}

function internalNutritionAnswer(productName: string, nutrition: NonNullable<NonNullable<Awaited<ReturnType<typeof lookupProductIntelligence>>["resolvedProduct"]>["nutrition"]>, query: string) {
  const normalized = query.toLowerCase()
  const serving = nutrition.servingSize ? ` per ${nutrition.servingSize}` : ""
  const source = nutrition.sourceSummary ? ` Source: ${nutrition.sourceSummary}.` : ""
  const macroFacts = [
    typeof nutrition.fatG === "number" ? `${nutrition.fatG}g fat` : undefined,
    typeof nutrition.carbohydratesG === "number" ? `${nutrition.carbohydratesG}g carbs` : undefined,
    typeof nutrition.sugarsG === "number" ? `${nutrition.sugarsG}g sugar` : undefined,
    typeof nutrition.fiberG === "number" ? `${nutrition.fiberG}g fiber` : undefined,
    typeof nutrition.proteinG === "number" ? `${nutrition.proteinG}g protein` : undefined,
    typeof nutrition.sodiumMg === "number" ? `${nutrition.sodiumMg}mg sodium` : undefined
  ].filter((fact): fact is string => Boolean(fact))

  if (/calorie|calories/.test(normalized) && typeof nutrition.caloriesKcal === "number") {
    return `${productName} has ${nutrition.caloriesKcal} calories${serving} in the stored product nutrition record.${source}`
  }

  if (/ingredient|ingredients/.test(normalized) && nutrition.ingredientsText) {
    return `${productName} has these stored ingredients: ${nutrition.ingredientsText}.${source}`
  }

  if (/allergen|allergens/.test(normalized) && nutrition.allergens) {
    return `${productName} has these stored allergen notes: ${nutrition.allergens}.${source}`
  }

  const calories = typeof nutrition.caloriesKcal === "number" ? `${nutrition.caloriesKcal} calories${serving}` : undefined
  const details = [calories, ...macroFacts].filter(Boolean).join("; ")
  if (details) return `${productName} has stored nutrition details: ${details}.${source}`

  return `${productName} has a nutrition record, but the specific nutrition value you asked for is not filled in yet.`
}

function answerForProductLookup(lookup: Awaited<ReturnType<typeof lookupProductIntelligence>>) {
  if (lookup.status === "resolved" && lookup.resolvedProduct) {
    return `${lookup.resolvedProduct.name} is the strongest match. I used ${lookup.sourceUsed.replace(/_/g, " ")} with ${Math.round(
      lookup.confidenceScore * 100
    )}% confidence.`
  }

  if (lookup.status === "needs_clarification") {
    return `I found possible matches, but I am not confident enough to choose one automatically. Pick one of these: ${lookup.candidates
      .slice(0, 4)
      .map((candidate) => candidate.name)
      .join(", ")}.`
  }

  return "I could not confidently resolve that to a product. Add a product name, SKU/barcode, ingredient, category, or verified phrase mapping."
}

function sameProduct({
  name,
  sku,
  candidateName,
  candidateSku
}: {
  name?: string
  sku?: string
  candidateName?: string
  candidateSku?: string
}) {
  const normalizedName = name?.toLowerCase()
  const normalizedSku = sku?.toLowerCase()

  return Boolean(
    (normalizedSku && candidateSku?.toLowerCase() === normalizedSku) ||
      (normalizedName && candidateName?.toLowerCase() === normalizedName)
  )
}

function productEvidenceForLookup(context: AiOperationalContext, lookup: Awaited<ReturnType<typeof lookupProductIntelligence>>) {
  const resolvedProduct = lookup.resolvedProduct
  if (!resolvedProduct) return undefined

  return context.products.find((product) =>
    sameProduct({
      name: resolvedProduct.name,
      sku: resolvedProduct.sku,
      candidateName: product.productName,
      candidateSku: product.sku
    })
  )
}

function productMemoryForLookup(context: AiOperationalContext, lookup: Awaited<ReturnType<typeof lookupProductIntelligence>>, factType: AssistantProductMemory["factType"]) {
  const resolvedProduct = lookup.resolvedProduct
  if (!resolvedProduct) return undefined

  return context.assistantMemory.find(
    (memory) =>
      memory.factType === factType &&
      sameProduct({
        name: resolvedProduct.name,
        sku: resolvedProduct.sku,
        candidateName: memory.productName,
        candidateSku: memory.sku
      })
  )
}

function readableKosherStatus(value?: ProductEvidence["kosherStatus"] | AssistantProductMemory["normalizedValue"]) {
  if (value === "verified") return "Verified kosher"
  if (value === "not_verified") return "Not verified kosher"
  if (value === "not_recorded") return "Kosher certification not recorded"
  if (value === "not_applicable") return "Kosher status not applicable"
  return "Kosher status unknown"
}

function kosherComplianceAnswer({
  productName,
  evidence,
  memory
}: {
  productName: string
  evidence?: ProductEvidence
  memory?: AssistantProductMemory
}) {
  const status = memory?.normalizedValue ?? evidence?.kosherStatus
  const statusLabel = readableKosherStatus(status)
  const sourceEvidence = [
    ...(memory?.evidence ?? []),
    ...(evidence?.dietaryNotes ?? []),
    ...(evidence?.handlingNotes ?? [])
  ].filter(Boolean)
  const sourceLabels = [
    ...(memory?.sourceLabels ?? []),
    ...(evidence?.sources.map((source) => source.label) ?? [])
  ].filter(Boolean)

  if (status === "verified") {
    return {
      statusLabel,
      answer: `Kosher status: Verified kosher. ${productName} has source-backed kosher evidence in the current product records. Keep the cited certification or package mark on file before using this in customer-facing material.`,
      confidenceScore: memory?.confidence === "high" ? 0.94 : 0.86,
      facts: [
        `Kosher status: ${statusLabel}`,
        sourceLabels.length ? `Source: ${sourceLabels.join(", ")}` : "Source: stored product evidence",
        ...sourceEvidence.slice(0, 3)
      ],
      suggestedFollowUp: "Open the product evidence and keep the certification source attached before publishing the claim."
    }
  }

  if (status === "not_verified" || status === "not_recorded") {
    return {
      statusLabel,
      answer: `Kosher status: ${statusLabel}. Operational answer: do not treat ${productName} as kosher yet. This does not prove the product is non-kosher; it means InvenTracker does not currently have source-backed kosher certification for it.`,
      confidenceScore: status === "not_verified" ? 0.86 : 0.74,
      facts: [
        `Kosher status: ${statusLabel}`,
        sourceLabels.length ? `Source: ${sourceLabels.join(", ")}` : "Source: stored product evidence",
        ...sourceEvidence.slice(0, 3)
      ],
      suggestedFollowUp: "Verify the package hechsher, supplier certificate, or certification database, then save the evidence before telling customers it is kosher."
    }
  }

  return {
    statusLabel,
    answer: `Kosher status: ${statusLabel}. I cannot verify whether ${productName} is kosher from the current product records.`,
    confidenceScore: 0.42,
    facts: [`Kosher status: ${statusLabel}`, "Source-backed kosher evidence is missing."],
    suggestedFollowUp: "Add a supplier certificate, package mark, or approved certification source to the product record."
  }
}

function complianceAnswerForProduct({
  query,
  context,
  lookup
}: {
  query: string
  context: AiOperationalContext
  lookup: Awaited<ReturnType<typeof lookupProductIntelligence>>
}) {
  if (lookup.status !== "resolved" || !lookup.resolvedProduct) return undefined

  if (/kosher/i.test(query)) {
    return kosherComplianceAnswer({
      productName: lookup.resolvedProduct.name,
      evidence: productEvidenceForLookup(context, lookup),
      memory: productMemoryForLookup(context, lookup, "kosher_status")
    })
  }

  return undefined
}

export async function answerRetailIntelligenceQuery({
  query,
  orgId = DEFAULT_ORG_ID,
  allowExternal = true
}: {
  query: string
  orgId?: string
  allowExternal?: boolean
}): Promise<RetailIntelligenceAnswer> {
  const lookup = await lookupProductIntelligence({ query, orgId, allowExternal })
  const resolvedNutrition = lookup.status === "resolved" ? lookup.resolvedProduct?.nutrition : undefined
  const shouldUseStoredNutrition = queryNeedsNutrition(query) && lookup.status === "resolved" && Boolean(resolvedNutrition)
  const [recommendationsResult, enrichmentResult, complianceContext] = await Promise.all([
    queryNeedsRecommendations(query) ? generateBusinessRecommendations({ orgId }) : Promise.resolve(undefined),
    queryNeedsEnrichment(query) && !shouldUseStoredNutrition
      ? generateProductEnrichmentSuggestions({ query, productId: lookup.resolvedProduct?.productId, orgId })
      : Promise.resolve(undefined),
    queryNeedsCompliance(query) ? buildOperationalContext() : Promise.resolve(undefined)
  ])
  const recommendations = recommendationsResult?.recommendations ?? []
  const enrichmentSuggestions = enrichmentResult?.suggestions ?? []
  const externalProducts = lookup.externalProducts ?? enrichmentResult?.externalProducts ?? []
  const complianceAnswer = complianceContext ? complianceAnswerForProduct({ query, context: complianceContext, lookup }) : undefined
  const facts = [
    lookup.resolvedProduct ? `Resolved product: ${lookup.resolvedProduct.name}` : undefined,
    ...(complianceAnswer?.facts ?? []),
    resolvedNutrition && typeof resolvedNutrition.caloriesKcal === "number" ? `Stored calories: ${resolvedNutrition.caloriesKcal}` : undefined,
    resolvedNutrition?.servingSize ? `Serving size: ${resolvedNutrition.servingSize}` : undefined,
    resolvedNutrition?.sourceSummary ? `Nutrition source: ${resolvedNutrition.sourceSummary}` : undefined,
    `Lookup status: ${lookup.status}`,
    `Confidence: ${Math.round(lookup.confidenceScore * 100)}%`,
    `Source used: ${lookup.sourceUsed.replace(/_/g, " ")}`,
    recommendations.length > 0 ? `${recommendations.length} operational recommendation${recommendations.length === 1 ? "" : "s"} generated` : undefined,
    enrichmentSuggestions.length > 0 ? `${enrichmentSuggestions.length} pending enrichment suggestion${enrichmentSuggestions.length === 1 ? "" : "s"} generated` : undefined
  ].filter((fact): fact is string => Boolean(fact))

  const nutritionAnswer =
    queryNeedsNutrition(query) && lookup.status === "resolved" && lookup.resolvedProduct && resolvedNutrition
      ? internalNutritionAnswer(lookup.resolvedProduct.name, resolvedNutrition, query)
      : undefined

  const answer = nutritionAnswer
    ? `${nutritionAnswer} I used internal product data first.`
    : complianceAnswer
      ? `${complianceAnswer.answer} I used internal product data and approved assistant memory first.`
      : recommendations.length > 0
      ? `${answerForProductLookup(lookup)} I also generated ${recommendations.length} operational recommendation${recommendations.length === 1 ? "" : "s"} from inventory, waste, expiration, and external context.`
      : enrichmentSuggestions.length > 0
        ? `${answerForProductLookup(lookup)} I found product enrichment candidates, but they are pending suggestions and will not overwrite product data without approval.`
        : answerForProductLookup(lookup)

  const imageCandidates = [
    ...enrichmentSuggestions
      .filter((suggestion) => suggestion.proposedField === "imageUrl")
      .map((suggestion) => ({
        title: `${suggestion.productName} proposed image`,
        query: suggestion.productName,
        reason: "Pending image enrichment suggestion; review before saving.",
        source: "open_food_facts" as const,
        imageUrl: suggestion.proposedValue,
        sourceUrl: suggestion.sourceUrl
      })),
    ...(lookup.resolvedProduct ? buildImageCandidates(lookup.resolvedProduct.name, lookup.resolvedProduct.sku) : [])
  ]

  return {
    answer,
    confidence: confidenceLabel(complianceAnswer?.confidenceScore ?? lookup.confidenceScore),
    confidenceScore: complianceAnswer?.confidenceScore ?? lookup.confidenceScore,
    sourceUsed: lookup.sourceUsed,
    provenance: lookup.provenance,
    facts,
    sources: [
      {
        id: `source-${lookup.sourceUsed}`,
        label: lookup.sourceUsed.replace(/_/g, " "),
        provenance: lookup.provenance,
        detail: lookup.pipeline.find((stage) => stage.stage === lookup.sourceUsed)?.reason ?? "Retail intelligence retrieval pipeline."
      },
      ...(complianceAnswer
        ? [
            {
              id: "source-compliance-evidence",
              label: "Stored product compliance evidence",
              provenance: "internal" as const,
              detail: complianceAnswer.statusLabel
            }
          ]
        : [])
    ],
    suggestedFollowUp: complianceAnswer?.suggestedFollowUp ?? lookup.suggestedFollowUp,
    retrieval: lookup,
    recommendations,
    enrichmentSuggestions,
    imageCandidates,
    nutritionCandidates: externalProducts.map((product) => product.nutrition).filter((nutrition): nutrition is NonNullable<typeof nutrition> => Boolean(nutrition)),
    externalProducts,
    audit: {
      engine: "retail_product_intelligence",
      version: "2026-06-29",
      generatedAt: new Date().toISOString(),
      requiresHumanApproval: enrichmentSuggestions.length > 0,
      unsupportedClaimsAvoided: Boolean(complianceAnswer) || lookup.confidenceScore < 0.78 || enrichmentSuggestions.length > 0
    }
  }
}
