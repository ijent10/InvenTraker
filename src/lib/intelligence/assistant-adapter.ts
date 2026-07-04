import type { AiAnswer, ProductCandidate } from "@/lib/ai/types"
import type { RetailIntelligenceAnswer } from "@/lib/intelligence/types"

function sourceType(provenance: RetailIntelligenceAnswer["provenance"]) {
  if (provenance === "external_enrichment") return "external_search" as const
  if (provenance === "forecast") return "national_signal" as const
  if (provenance === "operations") return "operations" as const
  return "product_profile" as const
}

function candidateFromLookup(candidate: NonNullable<RetailIntelligenceAnswer["retrieval"]>["candidates"][number]): ProductCandidate {
  return {
    id: candidate.productId,
    name: candidate.name,
    sku: candidate.sku,
    department: candidate.department,
    category: candidate.category,
    source:
      candidate.provenance === "external_enrichment"
        ? "external_product"
        : candidate.stage === "exact_match" || candidate.stage === "barcode_lookup"
          ? "central_catalog"
          : "local_catalog",
    confidence: candidate.confidenceScore,
    reason: candidate.reason
  }
}

export function retailAnswerToAiAnswer(answer: RetailIntelligenceAnswer): AiAnswer {
  const needsClarification = answer.retrieval?.status === "needs_clarification" || answer.retrieval?.status === "unresolved"

  return {
    mode: "local",
    answer: answer.answer,
    confidence: answer.confidence,
    productName: answer.retrieval?.resolvedProduct?.name,
    quickFacts: answer.facts,
    recommendedActions: [
      ...(answer.recommendations?.slice(0, 4).map((recommendation) => recommendation.suggestedAction) ?? []),
      ...(answer.suggestedFollowUp ? [answer.suggestedFollowUp] : []),
      ...(answer.enrichmentSuggestions?.length ? ["Review pending enrichment suggestions before saving product data."] : [])
    ].slice(0, 6),
    sources: answer.sources.map((source) => ({
      id: source.id,
      label: source.label,
      type: sourceType(source.provenance),
      detail: source.detail,
      url: source.url
    })),
    imageCandidates: answer.imageCandidates ?? [],
    externalProducts: answer.externalProducts,
    productResolution: answer.retrieval
      ? {
          status: answer.retrieval.status === "resolved" ? "resolved" : answer.retrieval.status,
          productName: answer.retrieval.resolvedProduct?.name ?? "",
          sku: answer.retrieval.resolvedProduct?.sku,
          confidence: answer.retrieval.confidenceScore,
          candidates: answer.retrieval.candidates.map(candidateFromLookup),
          question: answer.retrieval.suggestedFollowUp ?? "Which product did you mean?"
        } as AiAnswer["productResolution"]
      : undefined,
    needsClarification,
    clarificationQuestion: needsClarification ? answer.suggestedFollowUp ?? "Which product did you mean?" : undefined,
    productCandidates: needsClarification ? answer.retrieval?.candidates.map(candidateFromLookup) : undefined
  }
}
