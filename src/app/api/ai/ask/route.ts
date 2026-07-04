import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { z } from "zod"

import {
  INVALID_ASSISTANT_RESPONSE,
  isUnsafePersonalAssistantQuestion,
  isStoreAssistantQuestion
} from "@/lib/ai/question"
import { buildOperationalContext } from "@/lib/ai/context"
import { askOpenAiStructured } from "@/lib/ai/openai-provider"
import { runRetailAssistantTools } from "@/lib/ai/tool-orchestrator"
import { retailAnswerToAiAnswer } from "@/lib/intelligence/assistant-adapter"
import { answerRetailIntelligenceQuery } from "@/lib/intelligence/engine"

const requestSchema = z.object({
  question: z.string().trim().min(2).max(1000)
})

export async function POST(request: Request) {
  const requestId = randomUUID()
  try {
    const body = await request.json().catch(() => null)
    const parsed = requestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Ask a product, inventory, waste, or ordering question." }, { status: 400 })
    }

    if (isUnsafePersonalAssistantQuestion(parsed.data.question)) {
      return NextResponse.json({
        mode: "local",
        answer: INVALID_ASSISTANT_RESPONSE,
        intent: "unsafe",
        confidenceScore: 1,
        confidence: "high",
        quickFacts: ["I cannot expose employee identity, task-owner, account, password, phone, email, or personal records."],
        recommendedActions: ["Ask for non-personal operational history, product movement, inventory changes, order status, or store-level trends."],
        sources: [],
        imageCandidates: [],
        pendingEnrichmentSuggestions: [],
        learningCandidates: [],
        rejectedReason: "Question asks for personal identity or task-owner data that the assistant is not allowed to access."
      })
    }

    if (!isStoreAssistantQuestion(parsed.data.question)) {
      return NextResponse.json({
        mode: "local",
        answer: INVALID_ASSISTANT_RESPONSE,
        intent: "off_topic",
        confidenceScore: 1,
        confidence: "high",
        quickFacts: ["I can only help with store, product, inventory, ordering, waste, vendor, and approved verification work."],
        recommendedActions: ["Ask about a product, SKU, inventory issue, waste pattern, order, vendor, store setting, or health check."],
        sources: [],
        imageCandidates: [],
        pendingEnrichmentSuggestions: [],
        learningCandidates: [],
        rejectedReason: "Question is outside the approved grocery/retail/product/store operations domain."
      })
    }

    const intelligenceAnswer = await answerRetailIntelligenceQuery({
      query: parsed.data.question,
      allowExternal: true
    })
    const fallbackAnswer = retailAnswerToAiAnswer(intelligenceAnswer)
    const [context, orchestration] = await Promise.all([
      buildOperationalContext(),
      runRetailAssistantTools({
        question: parsed.data.question,
        retrievalAnswer: intelligenceAnswer
      })
    ])
    if (orchestration.documentResult) {
      console.info(
        JSON.stringify({
          event: "document_intelligence",
          requestId,
          intent: orchestration.documentResult.answerMode,
          documentsSearched: context.approvedDocuments?.length ?? 0,
          documentIdsRetrieved: Array.from(new Set(orchestration.documentResult.citations.map((citation) => citation.documentId))),
          chunkIdsRetrieved: orchestration.documentResult.citations.map((citation) => citation.chunkId),
          citationsReturned: orchestration.documentResult.citations.length,
          confidenceScore: orchestration.documentResult.confidenceScore,
          answerMode: orchestration.documentResult.answerMode,
          transformationRequested: orchestration.documentResult.answerMode !== "direct_answer",
          permissionDeniedDrafts: orchestration.documentResult.deniedDraftCount,
          conflictWarnings: orchestration.documentResult.conflictWarnings
        })
      )
    }

    const documentResult = orchestration.documentResult
    const documentSources =
      documentResult?.citations.map((citation) => ({
        id: citation.sourceId,
        label: citation.documentTitle,
        type: "document" as const,
        detail: citation.sectionTitle ? `${citation.sectionTitle}: ${citation.quotePreview}` : citation.quotePreview,
        url: citation.viewerUrl
      })) ?? []
    const openAiStatusAction = fallbackAnswer.recommendedActions.find((action) => action.includes("OpenAI reasoning"))
    const documentRecommendedActions = documentResult
      ? [
          documentResult.missingInformation.length
            ? "Ask an authorized manager to upload or approve the missing policy document."
            : "Open the cited document before making policy or compliance decisions.",
          ...(openAiStatusAction ? [openAiStatusAction] : [])
        ]
      : fallbackAnswer.recommendedActions

    const enrichedFallback = {
      ...fallbackAnswer,
      answer: documentResult?.answer ?? fallbackAnswer.answer,
      confidence: documentResult?.confidence ?? fallbackAnswer.confidence,
      confidenceScore: documentResult?.confidenceScore ?? intelligenceAnswer.confidenceScore,
      intent:
        documentResult
          ? documentResult.answerMode === "checklist"
            ? "document_checklist"
            : documentResult.answerMode === "summary"
              ? "document_summary"
              : documentResult.answerMode === "simplified_explanation"
                ? "document_simplify"
                : "document_lookup"
          : (fallbackAnswer.intent ??
            (intelligenceAnswer.recommendations?.length
              ? "reorder_recommendation"
              : "product_lookup")),
      answerMode: documentResult?.answerMode ?? "direct_answer",
      documentCitations: documentResult?.citations,
      documentCandidates: documentResult?.candidates,
      transformedAnswer: documentResult?.answerMode !== "direct_answer" ? documentResult?.answer : undefined,
      citedQuotes: documentResult?.citedQuotes,
      missingInformation: documentResult?.missingInformation,
      conflictWarnings: documentResult?.conflictWarnings,
      sources: documentResult ? documentSources : fallbackAnswer.sources,
      quickFacts: documentResult?.citations.length
        ? documentResult.citations.slice(0, 3).map((citation) => `${citation.documentTitle}${citation.sectionTitle ? `, ${citation.sectionTitle}` : ""}`)
        : fallbackAnswer.quickFacts,
      recommendedActions: documentRecommendedActions.slice(0, 6),
      pendingEnrichmentSuggestions: orchestration.pendingEnrichmentSuggestions.map((suggestion) => ({
        productId: suggestion.productId,
        productName: suggestion.productName,
        proposedField: suggestion.proposedField,
        proposedValue: suggestion.proposedValue,
        sourceLabel: suggestion.sourceLabel,
        sourceUrl: suggestion.sourceUrl,
        confidenceScore: suggestion.confidenceScore,
        status: suggestion.status
      })),
      productResolution: documentResult ? undefined : fallbackAnswer.productResolution,
      needsClarification: documentResult ? false : fallbackAnswer.needsClarification,
      clarificationQuestion: documentResult ? undefined : fallbackAnswer.clarificationQuestion,
      productCandidates: documentResult ? [] : fallbackAnswer.productCandidates,
      learningCandidates:
        documentResult
          ? []
          : intelligenceAnswer.retrieval?.status === "needs_clarification" || intelligenceAnswer.retrieval?.status === "unresolved"
          ? [
              {
                type: "ambiguous_phrase" as const,
                phrase: parsed.data.question,
                resolvedProductId: intelligenceAnswer.retrieval.resolvedProduct?.productId,
                resolvedProductName: intelligenceAnswer.retrieval.resolvedProduct?.name,
                reason: "Question could improve future lookup after a permitted user verifies the intended product.",
                confidenceScore: intelligenceAnswer.confidenceScore,
                approvalStatus: "pending" as const
              }
            ]
          : [],
      toolResults: orchestration.toolResults.map((result) => ({
        toolName: result.toolName,
        status: result.status,
        summary: result.summary,
        confidenceScore: result.confidenceScore,
        sources: result.sources
      }))
    }

    const answer = await askOpenAiStructured({
      question: parsed.data.question,
      context,
      intelligenceAnswer,
      toolResults: orchestration.toolResults,
      fallback: enrichedFallback
    })

    return NextResponse.json(answer)
  } catch (error) {
    return NextResponse.json(
      {
        mode: "local",
        answer: "I ran into an assistant service issue, but I am still here. Try a product, inventory, waste, vendor, or ordering question again.",
        confidence: "low",
        quickFacts: [error instanceof Error ? error.message : "Assistant request failed."],
        recommendedActions: ["Try again with a specific product name or SKU.", "If this keeps happening, check assistant source settings."],
        sources: [],
        imageCandidates: [],
        error: error instanceof Error ? error.message : "Assistant request failed."
      },
      { status: 200 }
    )
  }
}
