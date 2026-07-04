import Fuse from "fuse.js"

import { buildOperationalContext } from "@/lib/ai/context"
import { lookupOpenFoodFactsProduct } from "@/lib/ai/external-sources"
import type { AiOperationalContext, ExternalProductMatch } from "@/lib/ai/types"
import { readVerifiedLearningRecords } from "@/lib/intelligence/learning-store"
import { recipeRelationshipCandidates } from "@/lib/intelligence/recipe-relationships"
import { normalizeIntelligenceText, textTokens, uniqueStrings } from "@/lib/intelligence/text"
import { vectorSearchProducts } from "@/lib/intelligence/vector-search"
import type {
  ProductLookupCandidate,
  ProductLookupRecord,
  ProductLookupResult,
  RetrievalStage,
  RetrievalStageResult,
  VerifiedLearningRecords
} from "@/lib/intelligence/types"

function stageResult(stage: RetrievalStage, matched: boolean, confidenceScore: number, reason: string): RetrievalStageResult {
  return {
    stage,
    attempted: true,
    matched,
    confidenceScore,
    reason
  }
}

function scoreCandidate(record: ProductLookupRecord, confidenceScore: number, stage: RetrievalStage, reason: string): ProductLookupCandidate {
  return {
    productId: record.productId,
    centralProductId: record.centralProductId,
    name: record.name,
    sku: record.sku,
    barcode: record.barcode,
    department: record.department,
    category: record.category,
    nutrition: record.nutrition,
    confidenceScore: Number(Math.min(1, Math.max(0, confidenceScore)).toFixed(2)),
    stage,
    provenance: record.source === "learned_mapping" || record.source === "recipe_knowledge" ? "learned_mapping" : record.source === "external" ? "external_enrichment" : "internal",
    reason
  }
}

function dedupeCandidates(candidates: ProductLookupCandidate[]) {
  const seen = new Set<string>()
  return candidates
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .filter((candidate) => {
      const key = normalizeIntelligenceText(candidate.sku || candidate.barcode || candidate.name)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
}

function productDescriptionPieces(record: ProductLookupRecord) {
  return [
    record.name,
    record.sku,
    record.barcode,
    record.department,
    record.category,
    record.description,
    record.ingredientsText,
    ...record.aliases
  ]
}

function exactCandidates(query: string, records: ProductLookupRecord[]) {
  const normalizedQuery = normalizeIntelligenceText(query)

  return records
    .filter((record) => {
      const aliases = productDescriptionPieces(record).map(normalizeIntelligenceText).filter(Boolean)
      return aliases.some((alias) => alias === normalizedQuery || normalizedQuery.includes(alias))
    })
    .map((record) => scoreCandidate(record, 0.98, "exact_match", "Exact internal product, SKU, barcode, or name match."))
}

function aliasCandidates(query: string, records: ProductLookupRecord[]) {
  const normalizedQuery = normalizeIntelligenceText(query)

  return records
    .filter((record) =>
      record.aliases
        .map(normalizeIntelligenceText)
        .filter(Boolean)
        .some((alias) => alias === normalizedQuery || normalizedQuery.includes(alias) || alias.includes(normalizedQuery))
    )
    .map((record) => scoreCandidate(record, record.source === "learned_mapping" ? 0.94 : 0.86, "alias_synonym_match", "Alias, synonym, or verified phrase mapping match."))
}

function fuzzyCandidates(query: string, records: ProductLookupRecord[]) {
  const fuse = new Fuse(records, {
    keys: ["name", "sku", "barcode", "department", "category", "description", "ingredientsText", "aliases"],
    threshold: 0.38,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2
  })

  return fuse.search(query).map((result) => scoreCandidate(result.item, Math.max(0, 1 - (result.score ?? 1)), "fuzzy_search", "Fuzzy product search match."))
}

function semanticCandidates(query: string, records: ProductLookupRecord[]) {
  const queryTokens = textTokens(query)
  if (queryTokens.length === 0) return []

  return records
    .map((record) => {
      const recordTokens = new Set(textTokens(productDescriptionPieces(record).join(" ")))
      const overlap = queryTokens.filter((token) => recordTokens.has(token)).length
      const prefixOverlap = queryTokens.filter((token) => Array.from(recordTokens).some((recordToken) => recordToken.startsWith(token) || token.startsWith(recordToken))).length
      const score = Math.max(overlap / queryTokens.length, prefixOverlap > 0 ? 0.48 + prefixOverlap / Math.max(queryTokens.length, 4) : 0)
      if (score < 0.42) return undefined
      return scoreCandidate(record, Math.min(0.78, score), "semantic_search", "Semantic keyword and attribute overlap match.")
    })
    .filter((candidate): candidate is ProductLookupCandidate => Boolean(candidate))
}

function vectorCandidates(query: string, records: ProductLookupRecord[]) {
  return vectorSearchProducts(query, records).map(({ record, score }) =>
    scoreCandidate(record, Math.min(0.84, 0.42 + score), "vector_similarity", "Vector similarity across product names, aliases, descriptions, ingredients, categories, and verified learning records.")
  )
}

function barcodeCandidates(query: string, records: ProductLookupRecord[]) {
  const barcode = query.match(/\b\d{8,14}\b/)?.[0]
  if (!barcode) return []

  return records
    .filter((record) => record.barcode === barcode || record.sku === barcode || record.aliases.includes(barcode))
    .map((record) => scoreCandidate(record, 0.99, "barcode_lookup", "Barcode lookup match."))
}

function recordsFromLearning(learning: VerifiedLearningRecords): ProductLookupRecord[] {
  const phraseRecords = learning.userPhraseMappings
    .filter((mapping) => mapping.resolvedProductName)
    .map((mapping) => ({
      productId: mapping.resolvedProductId ?? `learned-${mapping.id}`,
      name: mapping.resolvedProductName ?? mapping.phrase,
      aliases: [mapping.phrase],
      source: "learned_mapping" as const,
      description: `Verified phrase mapping with confidence ${mapping.confidenceScore}.`
    }))

  const aliasRecords = learning.productAliases.map((alias) => ({
    productId: alias.productId ?? `learned-${alias.id}`,
    name: alias.productName,
    aliases: [alias.alias],
    source: "learned_mapping" as const,
      description: `Verified product alias with confidence ${alias.confidenceScore}.`
    }))

  const acceptedAnswerRecords = learning.acceptedAnswers
    .filter((answer) => answer.resolvedProductName)
    .map((answer) => ({
      productId: answer.resolvedProductId ?? `accepted-${answer.id}`,
      name: answer.resolvedProductName ?? answer.answer,
      aliases: uniqueStrings([answer.query, answer.answer]),
      source: "learned_mapping" as const,
      description: `Accepted answer with confidence ${answer.confidenceScore}.`
    }))

  const correctionRecords = learning.verifiedCorrections
    .filter((correction) => correction.resolvedProductName)
    .map((correction) => ({
      productId: correction.resolvedProductId ?? `correction-${correction.id}`,
      name: correction.resolvedProductName ?? correction.correctedAnswer,
      aliases: uniqueStrings([correction.query, correction.correctedAnswer]),
      source: "learned_mapping" as const,
      description: `Verified correction with confidence ${correction.confidenceScore}.`
    }))

  const terminologyRecords = [...learning.organizationSpecificTerminology, ...learning.storeSpecificTerminology]
    .filter((term) => term.resolvedProductName || term.meaning)
    .map((term) => ({
      productId: term.resolvedProductId ?? `term-${term.id}`,
      name: term.resolvedProductName ?? term.meaning ?? term.term,
      aliases: uniqueStrings([term.term, term.meaning]),
      source: "learned_mapping" as const,
      description: `Verified terminology with confidence ${term.confidenceScore}.`
    }))

  const productFactRecords = learning.productFactNotes
    .filter((note) => note.approvalStatus !== "rejected" && note.productName)
    .map((note) => ({
      productId: note.productId ?? `fact-${note.id}`,
      name: note.productName ?? note.fact,
      aliases: uniqueStrings([note.productName, note.factType, note.fact, note.sourceLabel]),
      source: "learned_mapping" as const,
      description: `Approved product fact note: ${note.fact}`
    }))

  const rejectedAliases = new Set(
    learning.rejectedAliases
      .map((alias) => normalizeIntelligenceText(alias.alias))
      .filter(Boolean)
  )

  return [...phraseRecords, ...aliasRecords, ...acceptedAnswerRecords, ...correctionRecords, ...terminologyRecords, ...productFactRecords].map((record) => ({
    ...record,
    aliases: record.aliases.filter((alias) => !rejectedAliases.has(normalizeIntelligenceText(alias)))
  }))
}

export function buildProductLookupRecords(context: AiOperationalContext, learning: VerifiedLearningRecords, externalProducts: ExternalProductMatch[] = []): ProductLookupRecord[] {
  const centralRecords = context.centralCatalog.map((product) => ({
    productId: product.centralProductId,
    centralProductId: product.centralProductId,
    name: product.name,
    sku: product.sku,
    nutrition: product.nutrition,
    barcode: /^\d{8,14}$/.test(product.sku ?? "") ? product.sku : undefined,
    aliases: uniqueStrings([product.name, product.sku, ...(product.images ?? [])]),
    source: "central_catalog" as const,
    description: [
      product.averagePrice ? `average price ${product.averagePrice}` : undefined,
      product.averageExpirationDays ? `average expiration ${product.averageExpirationDays} days` : undefined,
      product.averageQuantityInCase ? `${product.averageQuantityInCase} per case` : undefined
    ].filter(Boolean).join("; ")
  }))

  const organizationRecords = context.organizationProducts.map((product) => ({
    productId: product.productId,
    centralProductId: product.centralProductId,
    name: product.name,
    sku: product.sku,
    barcode: /^\d{8,14}$/.test(product.sku ?? "") ? product.sku : undefined,
    department: product.department,
    category: product.category,
    nutrition: product.nutrition,
    aliases: uniqueStrings([product.name, product.sku, product.department, product.category, product.centralProductId]),
    source: "organization_product" as const,
    description: `${product.department} ${product.category} default unit ${product.defaultUnit} ${product.expires ? "expires" : "does not expire"}`
  }))

  const inventoryRecords = context.inventory.map((item) => ({
    productId: item.orgProductId ?? item.productId ?? item.sku,
    centralProductId: item.centralProductId,
    name: item.name,
    sku: item.sku,
    barcode: /^\d{8,14}$/.test(item.sku) ? item.sku : undefined,
    department: item.department,
    category: item.category,
    aliases: uniqueStrings([item.name, item.sku, item.department, item.category, item.vendor, item.unit]),
    source: "inventory" as const,
    description: `${item.onHand} ${item.unit} on hand; front ${item.frontStock}; back ${item.backStock}; vendor ${item.vendor}`
  }))

  const evidenceRecords = context.products.map((product) => ({
    productId: product.productId,
    name: product.productName,
    sku: product.sku,
    barcode: /^\d{8,14}$/.test(product.sku ?? "") ? product.sku : undefined,
    aliases: uniqueStrings([product.productName, product.sku, ...product.imageHints, ...product.dietaryNotes, ...product.allergens]),
    source: "product_evidence" as const,
    ingredientsText: product.nutrition?.sourceLabel,
    description: [...product.dietaryNotes, ...product.handlingNotes].join("; ")
  }))

  const externalRecords = externalProducts.map((product) => ({
    productId: product.barcode ?? product.name,
    name: product.name,
    sku: product.barcode,
    barcode: product.barcode,
    department: product.categories[0],
    category: product.categories[1],
    aliases: uniqueStrings([product.name, product.brand, product.barcode, ...product.labels, ...product.categories, ...product.allergens]),
    source: "external" as const,
    ingredientsText: product.ingredientsText,
    description: [product.brand, product.labels.join(" "), product.categories.join(" ")].filter(Boolean).join("; ")
  }))

  return [...centralRecords, ...organizationRecords, ...inventoryRecords, ...evidenceRecords, ...recordsFromLearning(learning), ...externalRecords]
}

export async function lookupProductIntelligence({
  query,
  allowExternal = true,
  orgId
}: {
  query: string
  allowExternal?: boolean
  orgId?: string
}): Promise<ProductLookupResult> {
  const normalizedQuery = normalizeIntelligenceText(query)
  const [context, learning] = await Promise.all([buildOperationalContext(), readVerifiedLearningRecords(orgId)])
  let records = buildProductLookupRecords(context, learning)
  const pipeline: RetrievalStageResult[] = []

  const runStage = (stage: RetrievalStage, candidates: ProductLookupCandidate[], emptyReason: string) => {
    const deduped = dedupeCandidates(candidates)
    const best = deduped[0]
    pipeline.push(stageResult(stage, Boolean(best), best?.confidenceScore ?? 0, best?.reason ?? emptyReason))
    return deduped
  }

  let candidates = runStage("exact_match", exactCandidates(query, records), "No exact internal product, SKU, or barcode match.")
  if (candidates[0]?.confidenceScore >= 0.9) return resolvedResult(query, normalizedQuery, candidates, pipeline)

  candidates = runStage("alias_synonym_match", [...candidates, ...aliasCandidates(query, records)], "No verified alias, synonym, or phrase mapping matched.")
  if (candidates[0]?.confidenceScore >= 0.88) return resolvedResult(query, normalizedQuery, candidates, pipeline)

  candidates = runStage("fuzzy_search", [...candidates, ...fuzzyCandidates(query, records)], "No fuzzy product match was strong enough.")
  if (candidates[0]?.confidenceScore >= 0.76) return resolvedResult(query, normalizedQuery, candidates, pipeline)

  candidates = runStage("semantic_search", [...candidates, ...semanticCandidates(query, records)], "No semantic product/category/ingredient overlap was strong enough.")
  if (candidates[0]?.confidenceScore >= 0.72) return resolvedResult(query, normalizedQuery, candidates, pipeline)

  candidates = runStage("vector_similarity", [...candidates, ...vectorCandidates(query, records)], "No vector similarity product match was strong enough.")
  if (candidates[0]?.confidenceScore >= 0.74) return resolvedResult(query, normalizedQuery, candidates, pipeline)

  candidates = runStage("barcode_lookup", [...candidates, ...barcodeCandidates(query, records)], "No barcode was present or matched internally.")
  if (candidates[0]?.confidenceScore >= 0.9) return resolvedResult(query, normalizedQuery, candidates, pipeline)

  candidates = runStage("recipe_ingredient_relationship", [...candidates, ...recipeRelationshipCandidates(query, records)], "No recipe or ingredient relationship matched.")
  if (candidates[0]?.confidenceScore >= 0.72) return resolvedResult(query, normalizedQuery, candidates, pipeline)

  let externalProducts: ExternalProductMatch[] = []
  if (allowExternal) {
    const bestInternalName = candidates[0]?.name || query
    externalProducts = await lookupOpenFoodFactsProduct({ productName: bestInternalName, sku: candidates[0]?.sku })
    records = buildProductLookupRecords(context, learning, externalProducts)
    candidates = runStage("approved_external_lookup", [...candidates, ...fuzzyCandidates(query, records), ...barcodeCandidates(query, records)], "Approved external lookup did not return a stronger product match.")
  } else {
    pipeline.push(stageResult("approved_external_lookup", false, 0, "External lookup disabled for this request."))
  }

  return resolvedResult(query, normalizedQuery, candidates, pipeline, externalProducts)
}

function resolvedResult(
  query: string,
  normalizedQuery: string,
  candidates: ProductLookupCandidate[],
  pipeline: RetrievalStageResult[],
  externalProducts: ExternalProductMatch[] = []
): ProductLookupResult {
  const deduped = dedupeCandidates(candidates)
  const top = deduped[0]
  const runnerUp = deduped[1]
  const confidenceScore = top?.confidenceScore ?? 0
  const status =
    !top || confidenceScore < 0.42
      ? "unresolved"
      : confidenceScore < 0.72 || (runnerUp && confidenceScore - runnerUp.confidenceScore < 0.12)
        ? "needs_clarification"
        : "resolved"

  return {
    query,
    normalizedQuery,
    status,
    resolvedProduct: status === "resolved" ? top : undefined,
    candidates: deduped,
    pipeline,
    confidenceScore,
    sourceUsed: top ? top.stage : "none",
    provenance: top?.provenance ?? "internal",
    suggestedFollowUp:
      status === "resolved"
        ? undefined
        : status === "needs_clarification"
          ? "Choose the matching product or ask again with SKU/barcode."
          : "Add more product detail, SKU/barcode, ingredient, or category context.",
    externalProducts
  }
}
