import { normalizeIntelligenceText, textTokens } from "@/lib/intelligence/text"
import type { ProductLookupRecord } from "@/lib/intelligence/types"

const VECTOR_SIZE = 128

function hashToken(token: string) {
  let hash = 2166136261
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}
function normalizeVector(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1
  return vector.map((value) => value / magnitude)
}

export function createLocalTextEmbedding(text: string) {
  const vector = Array.from({ length: VECTOR_SIZE }, () => 0)
  const tokens = textTokens(text)

  for (const token of tokens) {
    const hash = hashToken(token)
    const index = hash % VECTOR_SIZE
    const sign = hash % 2 === 0 ? 1 : -1
    vector[index] += sign

    if (token.length > 4) {
      const prefixHash = hashToken(token.slice(0, 4))
      vector[prefixHash % VECTOR_SIZE] += 0.35
    }
  }

  return normalizeVector(vector)
}

export function cosineSimilarity(left: number[], right: number[]) {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0)
}

export function recordEmbeddingText(record: ProductLookupRecord) {
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
    .filter(Boolean)
    .join(" ")
}

export function vectorSearchProducts(query: string, records: ProductLookupRecord[]) {
  const normalizedQuery = normalizeIntelligenceText(query)
  if (!normalizedQuery) return []

  const queryEmbedding = createLocalTextEmbedding(normalizedQuery)

  return records
    .map((record) => {
      const recordText = recordEmbeddingText(record)
      const score = cosineSimilarity(queryEmbedding, createLocalTextEmbedding(recordText))
      return {
        record,
        score
      }
    })
    .filter((result) => result.score >= 0.22)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
}
