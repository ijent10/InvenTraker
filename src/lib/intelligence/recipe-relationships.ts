import { normalizeIntelligenceText, textTokens } from "@/lib/intelligence/text"
import type { ProductLookupCandidate, ProductLookupRecord } from "@/lib/intelligence/types"

type RecipeRelationship = {
  id: string
  phraseHints: string[]
  resolvedIngredient: string
  category: string
  confidenceScore: number
  explanation: string
}

const recipeRelationships: RecipeRelationship[] = [
  {
    id: "recipe-tiramisu-mascarpone",
    phraseHints: ["creamy white stuff in tiramisu", "white cheese starts with m", "white cheese in tiramisu", "tiramisu cheese", "mascarpone cream"],
    resolvedIngredient: "Mascarpone",
    category: "Cheese",
    confidenceScore: 0.84,
    explanation: "Recipe relationship: tiramisu commonly uses mascarpone as the creamy white cheese component."
  },
  {
    id: "recipe-caprese-mozzarella",
    phraseHints: ["white cheese in caprese", "fresh white cheese with tomato basil", "soft cheese in caprese"],
    resolvedIngredient: "Mozzarella",
    category: "Cheese",
    confidenceScore: 0.82,
    explanation: "Recipe relationship: caprese is typically tomato, basil, and mozzarella."
  },
  {
    id: "recipe-hummus-tahini",
    phraseHints: ["sesame paste in hummus", "creamy sesame ingredient", "what makes hummus nutty"],
    resolvedIngredient: "Tahini",
    category: "Ingredient",
    confidenceScore: 0.8,
    explanation: "Recipe relationship: hummus commonly uses tahini for sesame flavor and texture."
  }
]

function phraseScore(query: string, hints: string[]) {
  const queryTokens = new Set(textTokens(query))
  let bestScore = 0

  hints.forEach((hint) => {
    const normalizedHint = normalizeIntelligenceText(hint)
    if (normalizeIntelligenceText(query).includes(normalizedHint) || normalizedHint.includes(normalizeIntelligenceText(query))) {
      bestScore = Math.max(bestScore, 0.94)
      return
    }

    const hintTokens = textTokens(hint)
    const overlap = hintTokens.filter((token) => queryTokens.has(token)).length
    const score = hintTokens.length > 0 ? overlap / hintTokens.length : 0
    bestScore = Math.max(bestScore, score)
  })

  return bestScore
}

export function recipeRelationshipCandidates(query: string, records: ProductLookupRecord[]): ProductLookupCandidate[] {
  return recipeRelationships
    .map<ProductLookupCandidate | undefined>((relationship) => {
      const score = phraseScore(query, relationship.phraseHints)
      if (score < 0.42) return undefined

      const matchedRecord = records.find((record) => normalizeIntelligenceText(record.name) === normalizeIntelligenceText(relationship.resolvedIngredient))
      const confidenceScore = Number(Math.min(0.96, Math.max(score, relationship.confidenceScore)).toFixed(2))

      const candidate: ProductLookupCandidate = {
        productId: matchedRecord?.productId ?? relationship.id,
        name: matchedRecord?.name ?? relationship.resolvedIngredient,
        category: matchedRecord?.category ?? relationship.category,
        confidenceScore,
        stage: "recipe_ingredient_relationship" as const,
        provenance: matchedRecord ? "internal" as const : "learned_mapping" as const,
        reason: matchedRecord ? relationship.explanation : `${relationship.explanation} No matching internal product record is stored yet.`
      }

      if (matchedRecord?.centralProductId) candidate.centralProductId = matchedRecord.centralProductId
      if (matchedRecord?.sku) candidate.sku = matchedRecord.sku
      if (matchedRecord?.barcode) candidate.barcode = matchedRecord.barcode
      if (matchedRecord?.department) candidate.department = matchedRecord.department

      return candidate
    })
    .filter((candidate): candidate is ProductLookupCandidate => Boolean(candidate))
}
