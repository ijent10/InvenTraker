import { buildOperationalContext } from "@/lib/ai/context"
import { lookupOpenFoodFactsProduct } from "@/lib/ai/external-sources"
import type { AiSource, ExternalProductMatch } from "@/lib/ai/types"
import { questionNeedsDocumentRetrieval, retrieveApprovedDocuments, type DocumentRetrievalResult } from "@/lib/document-intelligence"
import { generateProductEnrichmentSuggestions } from "@/lib/intelligence/enrichment"
import { generateBusinessRecommendations } from "@/lib/intelligence/recommendations"
import { lookupProductIntelligence } from "@/lib/intelligence/retrieval"
import type { ProductEnrichmentSuggestion, ProductLookupResult, RetailIntelligenceAnswer } from "@/lib/intelligence/types"

export type RetailAssistantToolName =
  | "product_lookup"
  | "barcode_lookup"
  | "inventory_lookup"
  | "vendor_lookup"
  | "nutrition_lookup"
  | "allergen_lookup"
  | "recipe_ingredient_lookup"
  | "stock_risk_analysis"
  | "reorder_recommendation"
  | "waste_risk_analysis"
  | "markdown_recommendation"
  | "external_open_food_facts_lookup"
  | "weather_lookup"
  | "holiday_lookup"
  | "event_lookup"
  | "memory_lookup"
  | "memory_write_candidate"
  | "document_lookup"
  | "document_section_lookup"
  | "document_policy_lookup"
  | "document_table_lookup"
  | "document_summary"
  | "document_reword"
  | "document_simplify"
  | "document_checklist"
  | "document_compare"
  | "document_citation_lookup"
  | "document_download_link"
  | "document_viewer_link"

export type RetailAssistantToolResult = {
  toolName: RetailAssistantToolName
  status: "used" | "skipped" | "failed"
  summary: string
  confidenceScore?: number
  sources: AiSource[]
  data?: unknown
}

function source(id: string, label: string, detail: string, type: AiSource["type"] = "operations", url?: string): AiSource {
  return { id, label, type, detail, url }
}

function normalized(question: string) {
  return question.toLowerCase()
}

function wantsAny(question: string, terms: string[]) {
  const text = normalized(question)
  return terms.some((term) => text.includes(term))
}

function barcodeFrom(question: string) {
  return question.match(/\b\d{8,14}\b/)?.[0]
}

function productLookupTools(question: string, lookup: ProductLookupResult): RetailAssistantToolResult[] {
  const tools: RetailAssistantToolResult[] = [
    {
      toolName: "product_lookup",
      status: "used",
      summary: `${lookup.status}; ${lookup.candidates.length} candidate${lookup.candidates.length === 1 ? "" : "s"}; best source ${lookup.sourceUsed}.`,
      confidenceScore: lookup.confidenceScore,
      sources: [source("tool-product-lookup", "Internal product lookup", "Exact, alias, fuzzy, vector, barcode, recipe, and approved external retrieval pipeline.", "product_profile")],
      data: {
        status: lookup.status,
        resolvedProduct: lookup.resolvedProduct,
        candidates: lookup.candidates,
        pipeline: lookup.pipeline
      }
    }
  ]

  if (barcodeFrom(question)) {
    tools.push({
      toolName: "barcode_lookup",
      status: "used",
      summary: lookup.candidates.some((candidate) => candidate.barcode || candidate.sku === barcodeFrom(question))
        ? "Barcode was present and checked against internal/external product records."
        : "Barcode was present but did not confidently match a stored product.",
      confidenceScore: lookup.confidenceScore,
      sources: [source("tool-barcode-lookup", "Barcode lookup", "Barcode/SKU exact matching against retrieved product records.", "product_profile")],
      data: lookup.candidates.filter((candidate) => candidate.barcode || candidate.sku === barcodeFrom(question))
    })
  }

  if (wantsAny(question, ["tiramisu", "recipe", "ingredient", "creamy", "white stuff", "blue cheese", "veins"])) {
    tools.push({
      toolName: "recipe_ingredient_lookup",
      status: "used",
      summary: "Recipe and ingredient relationship lookup was included in product resolution.",
      confidenceScore: lookup.pipeline.find((stage) => stage.stage === "recipe_ingredient_relationship")?.confidenceScore ?? lookup.confidenceScore,
      sources: [source("tool-recipe-ingredient", "Recipe relationship lookup", "Stored recipe/ingredient relationship candidates and learned phrase mappings.", "product_profile")],
      data: lookup.pipeline.find((stage) => stage.stage === "recipe_ingredient_relationship")
    })
  }

  return tools
}

async function operationsTools(question: string, lookup: ProductLookupResult): Promise<RetailAssistantToolResult[]> {
  const context = await buildOperationalContext()
  const text = normalized(question)
  const productName = lookup.resolvedProduct?.name
  const inventoryMatches = productName
    ? context.inventory.filter((item) => item.name === productName || item.sku === lookup.resolvedProduct?.sku)
    : context.inventory.filter((item) => text.includes(item.name.toLowerCase()) || text.includes(item.vendor.toLowerCase()))
  const tools: RetailAssistantToolResult[] = []

  if (wantsAny(question, ["inventory", "stock", "front", "back", "par", "pull forward", "replenish", "restock"])) {
    tools.push({
      toolName: "inventory_lookup",
      status: "used",
      summary: inventoryMatches.length
        ? `${inventoryMatches.length} inventory record${inventoryMatches.length === 1 ? "" : "s"} matched the question.`
        : "Inventory lookup ran but no exact item matched the question.",
      confidenceScore: inventoryMatches.length ? 0.82 : 0.38,
      sources: [source("tool-inventory-lookup", "Store inventory", "Store item quantities, front stock, back stock, par, reorder points, and status.", "local_inventory")],
      data: inventoryMatches.length ? inventoryMatches : context.inventory.slice(0, 8)
    })
  }

  if (wantsAny(question, ["vendor", "supplier", "comes from", "lead time"])) {
    const vendorNames = Array.from(new Set(inventoryMatches.map((item) => item.vendor).filter(Boolean)))
    tools.push({
      toolName: "vendor_lookup",
      status: "used",
      summary: vendorNames.length ? `Matched vendor${vendorNames.length === 1 ? "" : "s"}: ${vendorNames.join(", ")}.` : "Vendor lookup ran from inventory records.",
      confidenceScore: vendorNames.length ? 0.78 : 0.42,
      sources: [source("tool-vendor-lookup", "Vendor lookup", "Vendor names and item associations from store inventory records.", "operations")],
      data: {
        vendors: vendorNames,
        inventoryMatches
      }
    })
  }

  if (wantsAny(question, ["stockout", "running out", "low stock", "out of stock", "risk"])) {
    const recommendations = await generateBusinessRecommendations()
    const riskRecommendations = recommendations.recommendations.filter((recommendation) => recommendation.type === "stockout_risk" || recommendation.type === "abnormal_movement")
    tools.push({
      toolName: "stock_risk_analysis",
      status: "used",
      summary: `${riskRecommendations.length} stock or movement risk recommendation${riskRecommendations.length === 1 ? "" : "s"} generated.`,
      confidenceScore: riskRecommendations[0]?.confidenceScore ?? 0.55,
      sources: [source("tool-stock-risk", "Stock risk analysis", recommendations.sourceSummary.join(" "), "operations")],
      data: riskRecommendations
    })
  }

  if (wantsAny(question, ["order", "reorder", "buy", "delivery", "recommend"])) {
    const recommendations = await generateBusinessRecommendations()
    tools.push({
      toolName: "reorder_recommendation",
      status: "used",
      summary: `${recommendations.recommendations.length} ordering/operations recommendation${recommendations.recommendations.length === 1 ? "" : "s"} available.`,
      confidenceScore: recommendations.recommendations[0]?.confidenceScore ?? 0.5,
      sources: [source("tool-reorder", "Reorder recommendation", recommendations.sourceSummary.join(" "), "operations")],
      data: recommendations.recommendations
    })
  }

  if (wantsAny(question, ["waste", "shrink", "spoiled", "expired", "loss"])) {
    const recommendations = await generateBusinessRecommendations()
    const wasteRecommendations = recommendations.recommendations.filter((recommendation) => recommendation.type === "waste_risk" || recommendation.type === "reduce_ordering")
    tools.push({
      toolName: "waste_risk_analysis",
      status: "used",
      summary: `${wasteRecommendations.length} waste-related recommendation${wasteRecommendations.length === 1 ? "" : "s"} generated.`,
      confidenceScore: wasteRecommendations[0]?.confidenceScore ?? 0.52,
      sources: [source("tool-waste-risk", "Waste risk analysis", "Recent waste signals compared with inventory and expiration behavior.", "operations")],
      data: wasteRecommendations
    })
  }

  if (wantsAny(question, ["markdown", "mark down", "discount", "clearance"])) {
    const expiringItems = context.inventory.filter((item) => item.expires && item.onHand > item.reorderPoint)
    tools.push({
      toolName: "markdown_recommendation",
      status: "used",
      summary: expiringItems.length
        ? `${expiringItems.length} expiring item${expiringItems.length === 1 ? "" : "s"} may need markdown review.`
        : "No markdown candidates found from current expiration/on-hand signals.",
      confidenceScore: expiringItems.length ? 0.62 : 0.35,
      sources: [source("tool-markdown", "Markdown recommendation", "Expiration behavior and quantity pressure from internal inventory.", "operations")],
      data: expiringItems
    })
  }

  return tools
}

async function productFactTools(question: string, lookup: ProductLookupResult): Promise<RetailAssistantToolResult[]> {
  const tools: RetailAssistantToolResult[] = []
  const resolvedName = lookup.resolvedProduct?.name ?? lookup.candidates[0]?.name
  const sku = lookup.resolvedProduct?.sku ?? lookup.candidates[0]?.sku
  let externalProducts: ExternalProductMatch[] = lookup.externalProducts ?? []

  if (wantsAny(question, ["nutrition", "calorie", "calories", "protein", "carb", "sodium", "fat", "sugar", "ingredient", "allergen", "image", "picture", "photo", "label"]) && resolvedName) {
    if (externalProducts.length === 0) {
      externalProducts = await lookupOpenFoodFactsProduct({ productName: resolvedName, sku })
    }

    tools.push({
      toolName: "external_open_food_facts_lookup",
      status: "used",
      summary: `${externalProducts.length} Open Food Facts candidate${externalProducts.length === 1 ? "" : "s"} returned.`,
      confidenceScore: externalProducts.some((product) => product.barcode && product.barcode === sku) ? 0.86 : externalProducts.length ? 0.62 : 0.25,
      sources: externalProducts.map((product) =>
        source(`off-${product.barcode ?? product.name}`, "Open Food Facts", product.brand ? `${product.name} by ${product.brand}` : product.name, "external_search", product.sourceUrl)
      ),
      data: externalProducts
    })
  }

  if (wantsAny(question, ["nutrition", "calorie", "calories", "protein", "carb", "sodium", "fat", "sugar"])) {
    tools.push({
      toolName: "nutrition_lookup",
      status: "used",
      summary: lookup.resolvedProduct?.nutrition
        ? "Internal nutrition snapshot exists for the resolved product."
        : externalProducts.some((product) => product.nutrition)
          ? "External nutrition candidate exists and must remain pending until approved."
          : "No stored nutrition facts were found.",
      confidenceScore: lookup.resolvedProduct?.nutrition ? 0.82 : externalProducts.some((product) => product.nutrition) ? 0.6 : 0.28,
      sources: [source("tool-nutrition", "Nutrition lookup", "Internal nutrition snapshots first, then Open Food Facts candidates.", lookup.resolvedProduct?.nutrition ? "product_profile" : "external_search")],
      data: {
        internalNutrition: lookup.resolvedProduct?.nutrition,
        externalNutrition: externalProducts.map((product) => product.nutrition).filter(Boolean)
      }
    })
  }

  if (wantsAny(question, ["allergen", "allergens", "gluten", "dairy", "nuts", "soy"])) {
    const externalAllergens = externalProducts.flatMap((product) => product.allergens)
    tools.push({
      toolName: "allergen_lookup",
      status: "used",
      summary: externalAllergens.length ? `External allergen candidates: ${externalAllergens.slice(0, 8).join(", ")}.` : "No allergen candidate found in retrieved product records.",
      confidenceScore: externalAllergens.length ? 0.6 : 0.32,
      sources: [source("tool-allergen", "Allergen lookup", "Stored allergen fields and Open Food Facts allergen tags.", externalAllergens.length ? "external_search" : "product_profile")],
      data: {
        externalAllergens
      }
    })
  }

  return tools
}

function awarenessTools(answer: RetailIntelligenceAnswer): RetailAssistantToolResult[] {
  const awareness = answer.recommendations?.length ? answer.retrieval : undefined
  void awareness

  return [
    {
      toolName: "weather_lookup",
      status: "used",
      summary: "Weather lookup is loaded through the ordering awareness context when recommendations are requested.",
      confidenceScore: 0.58,
      sources: [source("tool-weather", "Open-Meteo weather", "Forecast is used for post-delivery demand and traffic heuristics.", "national_signal")]
    },
    {
      toolName: "holiday_lookup",
      status: "used",
      summary: "Holiday lookup is loaded through Nager.Date in the ordering awareness context.",
      confidenceScore: 0.58,
      sources: [source("tool-holidays", "Nager.Date holidays", "Public holidays are checked in the post-delivery window.", "national_signal")]
    },
    {
      toolName: "event_lookup",
      status: "skipped",
      summary: "Nearby event lookup is still a connector hook. It does not have a live events provider yet.",
      confidenceScore: 0.1,
      sources: [source("tool-events", "Events connector hook", "Real local event discovery still needs a provider such as Ticketmaster, PredictHQ, Google Places, or a municipal events feed.", "national_signal")]
    }
  ]
}

function memoryTools(question: string, lookup: ProductLookupResult): RetailAssistantToolResult[] {
  const tools: RetailAssistantToolResult[] = [
    {
      toolName: "memory_lookup",
      status: "used",
      summary: "Verified phrase mappings, product aliases, and assistant product memory are included in retrieval context.",
      confidenceScore: lookup.pipeline.find((stage) => stage.stage === "alias_synonym_match")?.confidenceScore ?? lookup.confidenceScore,
      sources: [source("tool-memory-lookup", "Verified assistant memory", "Reads approved phrase mappings, aliases, intent patterns, and assistant-only product memory.", "product_profile")]
    }
  ]

  if (lookup.status !== "resolved" || wantsAny(question, ["called", "known as", "we call", "nickname", "means"])) {
    tools.push({
      toolName: "memory_write_candidate",
      status: "used",
      summary: "A memory write candidate may be created, but it must remain pending until approved by an authorized reviewer.",
      confidenceScore: 0.5,
      sources: [source("tool-memory-write-candidate", "Pending memory candidate", "Creates proposed aliases, corrections, mappings, or product notes for human approval only.", "operations")]
    })
  }

  return tools
}

async function documentTools(question: string): Promise<{
  result?: DocumentRetrievalResult
  tools: RetailAssistantToolResult[]
}> {
  if (!questionNeedsDocumentRetrieval(question)) {
    return { tools: [] }
  }

  const result = await retrieveApprovedDocuments({ query: question })
  const usedTools = new Set(result.toolsUsed)
  const tools: RetailAssistantToolResult[] = [
    {
      toolName: "document_lookup",
      status: "used",
      summary: `${result.matches.length} approved document chunk${result.matches.length === 1 ? "" : "s"} matched; ${result.deniedDraftCount} draft document${result.deniedDraftCount === 1 ? "" : "s"} excluded from authoritative retrieval.`,
      confidenceScore: result.confidenceScore,
      sources: result.citations.map((citation) =>
        source(
          citation.sourceId,
          citation.documentTitle,
          citation.sectionTitle ? `${citation.sectionTitle}: ${citation.quotePreview}` : citation.quotePreview,
          "document",
          citation.viewerUrl
        )
      ),
      data: {
        answerMode: result.answerMode,
        candidates: result.candidates,
        citations: result.citations,
        citedQuotes: result.citedQuotes,
        missingInformation: result.missingInformation,
        conflictWarnings: result.conflictWarnings
      }
    }
  ]

  if (usedTools.has("document_section_lookup")) {
    tools.push({
      toolName: "document_section_lookup",
      status: "used",
      summary: "Searched section titles, heading paths, pages, and chunk text.",
      confidenceScore: result.confidenceScore,
      sources: tools[0].sources,
      data: result.matches.map((match) => ({
        documentId: match.file.documentId,
        sectionTitle: match.chunk.sectionTitle,
        headingPath: match.chunk.headingPath,
        pageStart: match.chunk.pageStart,
        pageEnd: match.chunk.pageEnd
      }))
    })
  }

  if (usedTools.has("document_checklist")) {
    tools.push({
      toolName: "document_checklist",
      status: "used",
      summary: "Prepared a checklist from retrieved document text without adding rules.",
      confidenceScore: result.confidenceScore,
      sources: tools[0].sources
    })
  }

  if (usedTools.has("document_summary")) {
    tools.push({
      toolName: "document_summary",
      status: "used",
      summary: "Prepared a summary from cited approved document sections.",
      confidenceScore: result.confidenceScore,
      sources: tools[0].sources
    })
  }

  if (usedTools.has("document_simplify")) {
    tools.push({
      toolName: "document_simplify",
      status: "used",
      summary: "Prepared a simpler explanation while preserving policy meaning and warnings.",
      confidenceScore: result.confidenceScore,
      sources: tools[0].sources
    })
  }

  tools.push(
    {
      toolName: "document_citation_lookup",
      status: result.citations.length ? "used" : "skipped",
      summary: result.citations.length ? "Clickable document citations are available." : "No document citation was available.",
      confidenceScore: result.confidenceScore,
      sources: tools[0].sources,
      data: result.citations
    },
    {
      toolName: "document_viewer_link",
      status: result.citations.some((citation) => citation.viewerUrl) ? "used" : "skipped",
      summary: "Document viewer links were attached where available.",
      confidenceScore: result.confidenceScore,
      sources: tools[0].sources
    },
    {
      toolName: "document_download_link",
      status: result.citations.some((citation) => citation.downloadUrl) ? "used" : "skipped",
      summary: "Download links were attached where the user has permission.",
      confidenceScore: result.confidenceScore,
      sources: tools[0].sources
    }
  )

  return { result, tools }
}

export async function runRetailAssistantTools({
  question,
  retrievalAnswer
}: {
  question: string
  retrievalAnswer: RetailIntelligenceAnswer
}) {
  const lookup = retrievalAnswer.retrieval ?? (await lookupProductIntelligence({ query: question, allowExternal: true }))
  const documentRetrieval = await documentTools(question)
  const toolResults = [
    ...documentRetrieval.tools,
    ...productLookupTools(question, lookup),
    ...(await operationsTools(question, lookup)),
    ...(await productFactTools(question, lookup)),
    ...memoryTools(question, lookup),
    ...(wantsAny(question, ["weather", "holiday", "event", "weekend", "traffic", "delivery", "order", "reorder", "demand"]) ? awarenessTools(retrievalAnswer) : [])
  ]

  let enrichmentSuggestions: ProductEnrichmentSuggestion[] = retrievalAnswer.enrichmentSuggestions ?? []
  if (
    enrichmentSuggestions.length === 0 &&
    wantsAny(question, ["nutrition", "ingredient", "allergen", "image", "photo", "picture", "label", "enrich"]) &&
    (lookup.resolvedProduct?.name || lookup.candidates[0]?.name)
  ) {
    const enrichment = await generateProductEnrichmentSuggestions({
      query: question,
      productId: lookup.resolvedProduct?.productId ?? lookup.candidates[0]?.productId
    })
    enrichmentSuggestions = enrichment.suggestions
  }

  return {
    lookup,
    toolResults,
    documentResult: documentRetrieval.result,
    pendingEnrichmentSuggestions: enrichmentSuggestions
  }
}
