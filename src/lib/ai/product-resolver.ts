import Fuse from "fuse.js"

import { extractProductQuery, questionNeedsProductIdentity } from "@/lib/ai/question"
import type { AiOperationalContext, ExternalProductMatch, ProductCandidate, ProductResolution } from "@/lib/ai/types"

type SearchRecord = {
  id: string
  name: string
  sku?: string
  department?: string
  category?: string
  source: ProductCandidate["source"]
  aliases: string[]
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function productWords(value: string) {
  return normalize(value)
    .split(" ")
    .filter((word) => word.length > 1)
}

function buildSearchRecords(context: AiOperationalContext, externalProducts: ExternalProductMatch[] = []): SearchRecord[] {
  const centralRecords = context.centralCatalog.map((product) => ({
    id: product.centralProductId,
    name: product.name,
    sku: product.sku,
    source: "central_catalog" as const,
    aliases: [product.name, product.sku ?? "", product.averageQuantityInCase ? `${product.averageQuantityInCase} per case` : ""]
  }))

  const organizationRecords = context.organizationProducts.map((product) => ({
    id: product.productId,
    name: product.name,
    sku: product.sku,
    department: product.department,
    category: product.category,
    source: "organization_product" as const,
    aliases: [product.name, product.sku ?? "", product.department, product.category, product.centralProductId ?? ""]
  }))

  const catalogRecords = context.products.map((product) => ({
    id: product.productId,
    name: product.productName,
    sku: product.sku,
    source: "local_catalog" as const,
    aliases: [product.productName, product.sku ?? "", ...product.imageHints]
  }))

  const inventoryRecords = context.inventory.map((item) => ({
    id: item.sku,
    name: item.name,
    sku: item.sku,
    department: item.department,
    category: item.category,
    source: "local_inventory" as const,
    aliases: [item.name, item.sku, item.department, item.category, item.vendor]
  }))

  const externalRecords = externalProducts.map((product) => ({
    id: product.barcode ?? product.name,
    name: product.name,
    sku: product.barcode,
    department: product.categories[0],
    category: product.categories[1],
    source: "external_product" as const,
    aliases: [product.name, product.brand ?? "", product.barcode ?? "", ...product.labels, ...product.categories]
  }))

  return [...centralRecords, ...organizationRecords, ...catalogRecords, ...inventoryRecords, ...externalRecords]
}

function scoreCandidate(query: string, record: SearchRecord, fuseScore?: number): ProductCandidate {
  const normalizedQuery = normalize(query)
  const aliases = [record.name, record.sku ?? "", record.department ?? "", record.category ?? "", ...record.aliases]
  const exactAlias = aliases.some((alias) => alias && normalize(alias) === normalizedQuery)
  const containsAlias = aliases.some((alias) => alias && normalize(alias).includes(normalizedQuery))
  const queryTokens = productWords(query)
  const aliasTokens = new Set(aliases.flatMap((alias) => productWords(alias)))
  const overlap = queryTokens.filter((word) => aliasTokens.has(word)).length
  const prefixOverlap = queryTokens.filter((word) => Array.from(aliasTokens).some((aliasToken) => aliasToken.startsWith(word) || word.startsWith(aliasToken))).length
  const hasTokenSignal = overlap > 0 || prefixOverlap > 0 || exactAlias || containsAlias
  const tokenConfidence = queryTokens.length > 0 ? overlap / queryTokens.length : 0
  const rawFuzzyConfidence = typeof fuseScore === "number" ? Math.max(0, 1 - fuseScore) : 0
  const fuzzyConfidence = hasTokenSignal ? rawFuzzyConfidence : Math.min(rawFuzzyConfidence, 0.35)

  const confidence = Math.max(exactAlias ? 0.98 : 0, containsAlias ? 0.86 : 0, tokenConfidence * 0.82, prefixOverlap > 0 ? 0.68 : 0, fuzzyConfidence)

  return {
    id: record.id,
    name: record.name,
    sku: record.sku,
    department: record.department,
    category: record.category,
    source: record.source,
    confidence: Number(confidence.toFixed(2)),
    reason: exactAlias
      ? "Exact local/product match"
      : containsAlias
        ? "Product text contains the question terms"
        : overlap > 0
          ? `${overlap} matching keyword${overlap === 1 ? "" : "s"}`
          : "Fuzzy product match"
  }
}

function dedupeCandidates(candidates: ProductCandidate[]) {
  const seen = new Set<string>()
  return candidates
    .sort((a, b) => b.confidence - a.confidence)
    .filter((candidate) => {
      const key = (candidate.sku ?? candidate.name).toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 5)
}

export function resolveProductFromQuestion({
  question,
  context,
  externalProducts = []
}: {
  question: string
  context: AiOperationalContext
  externalProducts?: ExternalProductMatch[]
}): ProductResolution {
  const records = buildSearchRecords(context, externalProducts)
  const localExactRecords = records.filter(
    (record) => record.source !== "external_product" && normalize(question).includes(normalize(record.name))
  )
  const knownExactRecord = localExactRecords[0] ?? records.find((record) => normalize(question).includes(normalize(record.name)))
  const query = extractProductQuery(question, knownExactRecord?.name)

  if (localExactRecords.length > 0) {
    const candidates = dedupeCandidates(localExactRecords.map((record) => scoreCandidate(query || record.name, record)))
    const top = candidates[0]
    return {
      status: "resolved",
      productName: top.name,
      sku: top.sku,
      confidence: top.confidence,
      candidates
    }
  }

  if (!questionNeedsProductIdentity(question)) {
    return {
      status: "resolved",
      productName: knownExactRecord?.name,
      sku: knownExactRecord?.sku,
      confidence: knownExactRecord ? 0.98 : 0.5,
      candidates: knownExactRecord ? [scoreCandidate(query || knownExactRecord.name, knownExactRecord)] : []
    }
  }

  if (!query) {
    return {
      status: "unresolved",
      question: "Which product should I look up? Please include the product name, SKU, barcode, or supplier item number.",
      candidates: []
    }
  }

  const fuse = new Fuse(records, {
    keys: ["name", "sku", "department", "category", "aliases"],
    threshold: 0.42,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2
  })

  const directCandidates = records
    .filter((record) => {
      const haystack = normalize([record.name, record.sku, record.department, record.category, ...record.aliases].filter(Boolean).join(" "))
      return productWords(query).some((word) => haystack.includes(word))
    })
    .map((record) => scoreCandidate(query, record))

  const fuzzyCandidates = fuse.search(query).map((result) => scoreCandidate(query, result.item, result.score))
  const candidates = dedupeCandidates([...directCandidates, ...fuzzyCandidates])
  const top = candidates[0]
  const runnerUp = candidates[1]

  if (!top || top.confidence < 0.42) {
    return {
      status: "unresolved",
      question: "Which product should I look up? I could not confidently match that question to a product.",
      candidates: candidates.filter((candidate) => candidate.confidence >= 0.42)
    }
  }

  if (top.confidence < 0.72 || (runnerUp && top.confidence - runnerUp.confidence < 0.12)) {
    return {
      status: "needs_clarification",
      question: `Which product do you mean by "${query}"?`,
      candidates
    }
  }

  return {
    status: "resolved",
    productName: top.name,
    sku: top.sku,
    confidence: top.confidence,
    candidates
  }
}
