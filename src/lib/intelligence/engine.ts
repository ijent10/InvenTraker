import { buildImageCandidates } from "@/lib/ai/product-intelligence"
import { buildOperationalContext } from "@/lib/ai/context"
import { DEFAULT_ORG_ID } from "@/lib/firestore-schema"
import { generateProductEnrichmentSuggestions } from "@/lib/intelligence/enrichment"
import { generateBusinessRecommendations } from "@/lib/intelligence/recommendations"
import { lookupProductIntelligence } from "@/lib/intelligence/retrieval"
import { confidenceLabel } from "@/lib/intelligence/text"
import type { BusinessRecommendation, ProductLookupResult, RetailIntelligenceAnswer } from "@/lib/intelligence/types"
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

function queryNeedsOperationalContext(query: string) {
  return /(vendor|supplier|comes from|stock|backstock|back stock|front stock|floor|on hand|quantity|how many|how much|have|carry|location|where|rack|aisle|cooler|display|featured|feature|expire|expiration|low|restock|pull|order|reorder|waste|wasting|markdown|par|inventory)/i.test(query)
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

function answerForProductLookup(lookup: Awaited<ReturnType<typeof lookupProductIntelligence>>, query = "") {
  const normalized = query.toLowerCase()

  if (lookup.status === "resolved" && lookup.resolvedProduct) {
    if (/(creamy|tiramisu|white stuff|starts with|recipe|ingredient)/.test(normalized)) {
      return `${lookup.resolvedProduct.name} is the likely answer. I matched it from recipe, alias, or product-relationship context with ${Math.round(
        lookup.confidenceScore * 100
      )}% confidence.`
    }

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

function itemForLookup(context: AiOperationalContext, lookup: ProductLookupResult) {
  const product = lookup.resolvedProduct
  if (!product) return undefined

  return context.inventory.find((item) =>
    sameProduct({
      name: product.name,
      sku: product.sku,
      candidateName: item.name,
      candidateSku: item.sku
    })
  )
}

function orgProductForLookup(context: AiOperationalContext, lookup: ProductLookupResult) {
  const product = lookup.resolvedProduct
  if (!product) return undefined

  return context.organizationProducts.find((item) =>
    sameProduct({
      name: product.name,
      sku: product.sku,
      candidateName: item.name,
      candidateSku: item.sku
    })
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

type OperationalAnswer = {
  answer: string
  confidenceScore: number
  facts: string[]
  suggestedFollowUp?: string
  sourceDetail: string
}

function formatRecommendation(recommendation: BusinessRecommendation) {
  return `${recommendation.title}: ${recommendation.detail} Suggested action: ${recommendation.suggestedAction}`
}

function broadOperationalAnswer({
  query,
  context,
  recommendations
}: {
  query: string
  context: AiOperationalContext
  recommendations: BusinessRecommendation[]
}): OperationalAnswer | undefined {
  const normalized = query.toLowerCase()

  if (/(what|which).*(low|out of stock)|low right now|low stock|what is low/.test(normalized)) {
    const lowItems = context.inventory
      .filter((item) => item.status.toLowerCase() === "low" || item.onHand <= item.reorderPoint)
      .sort((a, b) => a.onHand - a.reorderPoint - (b.onHand - b.reorderPoint))

    if (!lowItems.length) {
      return {
        answer: "No item is currently below its reorder point in the store inventory I can see.",
        confidenceScore: 0.78,
        facts: ["No low-stock item matched current on-hand versus reorder point."],
        sourceDetail: "Store inventory on-hand and reorder-point comparison."
      }
    }

    return {
      answer: `Lowest stock right now: ${lowItems
        .slice(0, 4)
        .map((item) => `${item.name} has ${item.onHand} ${item.unit} on hand against a reorder point of ${item.reorderPoint}`)
        .join("; ")}.`,
      confidenceScore: 0.86,
      facts: lowItems.slice(0, 4).map((item) => `${item.name}: ${item.onHand} on hand, reorder point ${item.reorderPoint}`),
      suggestedFollowUp: "Open the inventory list before ordering, because pending receives or recent spot checks may change the final count.",
      sourceDetail: "Store inventory status, on-hand quantities, and reorder points."
    }
  }

  if (/(pull|restock|replenish).*(back|backstock|back stock)|pull from the back|stock from the back/.test(normalized)) {
    const restockItems = context.inventory
      .map((item) => {
        const targetFloor = Math.min(item.par, item.reorderPoint + 2)
        const needed = Math.max(0, targetFloor - item.frontStock)
        return {
          item,
          needed: Math.min(needed, item.backStock)
        }
      })
      .filter((entry) => entry.needed > 0)
      .sort((a, b) => b.needed - a.needed)

    if (!restockItems.length) {
      return {
        answer: "I do not see anything that clearly needs to be pulled from back stock right now.",
        confidenceScore: 0.74,
        facts: ["No front-stock record is below its floor target while back stock is available."],
        sourceDetail: "Front stock, back stock, par, and reorder point comparison."
      }
    }

    return {
      answer: `Pull these from back stock first: ${restockItems
        .slice(0, 4)
        .map(({ item, needed }) => `${needed} ${item.unit} of ${item.name}`)
        .join("; ")}.`,
      confidenceScore: 0.84,
      facts: restockItems.slice(0, 4).map(({ item, needed }) => `${item.name}: front ${item.frontStock}, back ${item.backStock}, pull ${needed}`),
      suggestedFollowUp: "Confirm the sales floor count before moving product, especially if someone recently restocked.",
      sourceDetail: "Front stock, back stock, par, and reorder point comparison."
    }
  }

  if (/(waste|wasting|wasted|shrink).*(most|highest)|most wasted|wasting the most/.test(normalized)) {
    const wasteByProduct = new Map<string, { quantity: number; unit: string; reasons: string[] }>()
    context.waste.forEach((waste) => {
      const current = wasteByProduct.get(waste.productName) ?? { quantity: 0, unit: waste.unit, reasons: [] }
      current.quantity += waste.quantity
      current.reasons.push(waste.reason)
      wasteByProduct.set(waste.productName, current)
    })
    const top = Array.from(wasteByProduct.entries()).sort((a, b) => b[1].quantity - a[1].quantity)[0]
    if (!top) return undefined

    return {
      answer: `${top[0]} is currently the highest waste item in the available waste signals: ${top[1].quantity} ${top[1].unit}. Main reason: ${top[1].reasons[0]}.`,
      confidenceScore: 0.82,
      facts: [`${top[0]} waste quantity: ${top[1].quantity} ${top[1].unit}`, `Reason: ${top[1].reasons.join(", ")}`],
      suggestedFollowUp: "Compare the waste unit against sales volume before changing ordering or production.",
      sourceDetail: "Recent store waste records."
    }
  }

  if (/(display|featured|feature table|on display)/.test(normalized)) {
    const displayItems = context.organizationProducts.filter((product) => product.displayAssignment?.isOnDisplay)
    if (!displayItems.length) {
      return {
        answer: "I do not see any active display assignments in the product records I can access.",
        confidenceScore: 0.74,
        facts: ["No organization product has an active display assignment."],
        sourceDetail: "Organization product display assignments."
      }
    }

    return {
      answer: `Currently on display: ${displayItems
        .slice(0, 5)
        .map((product) => `${product.name} on ${product.displayAssignment?.displayName} with ${product.displayAssignment?.quantityNeeded} needed`)
        .join("; ")}.`,
      confidenceScore: 0.86,
      facts: displayItems.map((product) => `${product.name}: ${product.displayAssignment?.displayName}`),
      suggestedFollowUp: "Open the product display assignment if you need to change the start date, end date, or quantity needed.",
      sourceDetail: "Organization product display assignments."
    }
  }

  if (/(what|which).*(order|reorder|buy)|order more|reorder more/.test(normalized) && !/(berries|bread|wine|olive|sourdough|cabernet|strawberr)/.test(normalized)) {
    const orderRecommendations = recommendations.filter((recommendation) =>
      ["stockout_risk", "increase_production", "abnormal_movement"].includes(recommendation.type)
    )
    if (!orderRecommendations.length) return undefined

    return {
      answer: `Top ordering or replenishment priorities: ${orderRecommendations
        .slice(0, 4)
        .map(formatRecommendation)
        .join(" ")}`,
      confidenceScore: orderRecommendations[0]?.confidenceScore ?? 0.72,
      facts: orderRecommendations.slice(0, 4).flatMap((recommendation) => [recommendation.title, ...recommendation.evidence.slice(0, 2)]),
      suggestedFollowUp: "Check vendor minimums and pending receives before submitting an order.",
      sourceDetail: "Inventory, waste, expiration, weather, holiday, and ordering recommendation signals."
    }
  }

  return undefined
}

function productOperationalAnswer({
  query,
  context,
  lookup,
  recommendations
}: {
  query: string
  context: AiOperationalContext
  lookup: ProductLookupResult
  recommendations: BusinessRecommendation[]
}): OperationalAnswer | undefined {
  if (lookup.status !== "resolved" || !lookup.resolvedProduct) return undefined

  const normalized = query.toLowerCase()
  const item = itemForLookup(context, lookup)
  const product = orgProductForLookup(context, lookup)
  const name = lookup.resolvedProduct.name

  if (/(vendor|supplier|comes from|who supplies|who supply)/.test(normalized) && item?.vendor) {
    return {
      answer: `${name} comes from ${item.vendor}.`,
      confidenceScore: 0.9,
      facts: [`Vendor: ${item.vendor}`, `SKU: ${item.sku}`],
      sourceDetail: "Store inventory vendor association."
    }
  }

  if (/(backstock|back stock|in back|back room|back)/.test(normalized) && item) {
    return {
      answer: `${name} has ${item.backStock} ${item.unit} in back stock, ${item.frontStock} on the floor, and ${item.onHand} total on hand.`,
      confidenceScore: 0.9,
      facts: [`Back stock: ${item.backStock}`, `Front stock: ${item.frontStock}`, `On hand: ${item.onHand}`],
      sourceDetail: "Store inventory front/back stock record."
    }
  }

  if (/(front stock|floor|out on the floor|sales floor|on floor)/.test(normalized) && item) {
    return {
      answer: `${name} has ${item.frontStock} ${item.unit} on the floor and ${item.backStock} in back stock.`,
      confidenceScore: 0.9,
      facts: [`Front stock: ${item.frontStock}`, `Back stock: ${item.backStock}`, `Par: ${item.par}`],
      sourceDetail: "Store inventory front/back stock record."
    }
  }

  if (/(how many|how much|quantity|on hand|stock|have|carry|do we have)/.test(normalized) && item) {
    return {
      answer: `Yes. ${name} is in inventory with ${item.onHand} ${item.unit} on hand: ${item.frontStock} front stock and ${item.backStock} back stock.`,
      confidenceScore: 0.88,
      facts: [`On hand: ${item.onHand}`, `Front stock: ${item.frontStock}`, `Back stock: ${item.backStock}`, `Status: ${item.status}`],
      sourceDetail: "Store inventory on-hand record."
    }
  }

  if (/(expir|shelf life|date)/.test(normalized)) {
    const expires = item?.expires ?? product?.expires
    const days = context.centralCatalog.find((entry) => sameProduct({ name, sku: lookup.resolvedProduct?.sku, candidateName: entry.name, candidateSku: entry.sku }))?.averageExpirationDays

    return {
      answer: expires
        ? `${name} is tracked as an expiring item${days ? ` with an average expiration window of about ${days} day${days === 1 ? "" : "s"}` : ""}.`
        : `${name} is not tracked as an expiring item in the current product records.`,
      confidenceScore: 0.84,
      facts: [`Expires: ${expires ? "yes" : "no"}`, ...(days ? [`Average expiration: ${days} days`] : [])],
      suggestedFollowUp: expires ? "Check the batch/date record before selling or wasting product." : undefined,
      sourceDetail: "Organization product and central catalog expiration defaults."
    }
  }

  if (/(where|location|aisle|rack|cooler|shelf)/.test(normalized) && (item?.location || product?.location)) {
    return {
      answer: `${name} is located at ${item?.location ?? product?.location}.`,
      confidenceScore: 0.86,
      facts: [`Location: ${item?.location ?? product?.location}`],
      sourceDetail: "Store inventory and organization product location records."
    }
  }

  if (/(display|featured|feature table|on display)/.test(normalized) && product?.displayAssignment) {
    return {
      answer: product.displayAssignment.isOnDisplay
        ? `${name} is on display at ${product.displayAssignment.displayName}. The display needs ${product.displayAssignment.quantityNeeded} ${item?.unit ?? product.defaultUnit}.`
        : `${name} is not currently marked as on display.`,
      confidenceScore: 0.86,
      facts: [`Display: ${product.displayAssignment.displayName}`, `Quantity needed: ${product.displayAssignment.quantityNeeded}`],
      sourceDetail: "Organization product display assignment."
    }
  }

  if (/(order|reorder|buy|more|delivery|minimum)/.test(normalized)) {
    const matchingRecommendations = recommendations.filter((recommendation) => recommendation.productName === name)
    const currentStock = item ? `${item.onHand} ${item.unit} on hand, reorder point ${item.reorderPoint}, par ${item.par}` : "current item stock not found"
    return {
      answer: matchingRecommendations.length
        ? `${name}: ${formatRecommendation(matchingRecommendations[0])} Current stock: ${currentStock}.`
        : `${name}: I do not see a specific order recommendation for this item right now. Current stock: ${currentStock}.`,
      confidenceScore: matchingRecommendations[0]?.confidenceScore ?? (item ? 0.72 : 0.48),
      facts: [currentStock, ...(matchingRecommendations[0]?.evidence ?? [])],
      suggestedFollowUp: "Check the vendor order draft and pending receives before submitting.",
      sourceDetail: "Inventory, waste, expiration, and recommendation signals."
    }
  }

  return undefined
}

function operationalAnswerForQuery({
  query,
  context,
  lookup,
  recommendations
}: {
  query: string
  context: AiOperationalContext
  lookup: ProductLookupResult
  recommendations: BusinessRecommendation[]
}) {
  const broadFirst = /(^|\b)(what|which).*(low|display|order|reorder|buy|pull|restock|wast|shrink)|what is on display|what should i pull|what should i order/i.test(query)
  const broad = broadOperationalAnswer({ query, context, recommendations })
  const product = productOperationalAnswer({ query, context, lookup, recommendations })

  return broadFirst ? broad ?? product : product ?? broad
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
  const needsOperationalContext = queryNeedsOperationalContext(query) || queryNeedsCompliance(query)
  const [recommendationsResult, enrichmentResult, answerContext] = await Promise.all([
    queryNeedsRecommendations(query) || queryNeedsOperationalContext(query) ? generateBusinessRecommendations({ orgId }) : Promise.resolve(undefined),
    queryNeedsEnrichment(query) && !shouldUseStoredNutrition
      ? generateProductEnrichmentSuggestions({ query, productId: lookup.resolvedProduct?.productId, orgId })
      : Promise.resolve(undefined),
    needsOperationalContext ? buildOperationalContext() : Promise.resolve(undefined)
  ])
  const recommendations = recommendationsResult?.recommendations ?? []
  const enrichmentSuggestions = enrichmentResult?.suggestions ?? []
  const externalProducts = lookup.externalProducts ?? enrichmentResult?.externalProducts ?? []
  const complianceAnswer = answerContext ? complianceAnswerForProduct({ query, context: answerContext, lookup }) : undefined
  const operationalAnswer = answerContext ? operationalAnswerForQuery({ query, context: answerContext, lookup, recommendations }) : undefined
  const facts = [
    lookup.resolvedProduct ? `Resolved product: ${lookup.resolvedProduct.name}` : undefined,
    ...(complianceAnswer?.facts ?? []),
    ...(operationalAnswer?.facts ?? []),
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
      : operationalAnswer
        ? `${operationalAnswer.answer} I used store operating data first.`
      : queryNeedsRecommendations(query) && recommendations.length > 0
      ? `${answerForProductLookup(lookup, query)} I also generated ${recommendations.length} operational recommendation${recommendations.length === 1 ? "" : "s"} from inventory, waste, expiration, and external context.`
      : enrichmentSuggestions.length > 0
        ? `${answerForProductLookup(lookup, query)} I found product enrichment candidates, but they are pending suggestions and will not overwrite product data without approval.`
        : answerForProductLookup(lookup, query)

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
    confidence: confidenceLabel(complianceAnswer?.confidenceScore ?? operationalAnswer?.confidenceScore ?? lookup.confidenceScore),
    confidenceScore: complianceAnswer?.confidenceScore ?? operationalAnswer?.confidenceScore ?? lookup.confidenceScore,
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
        : []),
      ...(operationalAnswer
        ? [
            {
              id: "source-operational-answer",
              label: "Store operating data",
              provenance: "operations" as const,
              detail: operationalAnswer.sourceDetail
            }
          ]
        : [])
    ],
    suggestedFollowUp: complianceAnswer?.suggestedFollowUp ?? operationalAnswer?.suggestedFollowUp ?? lookup.suggestedFollowUp,
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
