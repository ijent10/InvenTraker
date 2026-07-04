import { z } from "zod"

import type {
  AiAnswer,
  AiConfidence,
  AiSource,
  DocumentCandidate,
  DocumentCitation,
  ProductCandidate,
  RetailAssistantIntent
} from "@/lib/ai/types"

export const retailAssistantIntentValues = [
  "product_lookup",
  "barcode_lookup",
  "inventory_lookup",
  "vendor_lookup",
  "nutrition_lookup",
  "allergen_lookup",
  "recipe_ingredient_lookup",
  "stock_risk_analysis",
  "reorder_recommendation",
  "waste_risk_analysis",
  "markdown_recommendation",
  "external_enrichment",
  "event_demand_analysis",
  "memory_lookup",
  "document_lookup",
  "document_summary",
  "document_reword",
  "document_simplify",
  "document_checklist",
  "document_compare",
  "document_citation_lookup",
  "off_topic",
  "unsafe",
  "unknown"
] as const

export const assistantAnswerModeValues = [
  "direct_answer",
  "simplified_explanation",
  "rewritten_policy",
  "summary",
  "checklist",
  "comparison",
  "clarification",
  "rejection"
] as const

export const learningCandidateTypeValues = [
  "verified_phrase_mapping",
  "product_alias",
  "rejected_alias",
  "accepted_answer",
  "rejected_answer",
  "correction",
  "store_specific_term",
  "organization_specific_term",
  "product_fact_note",
  "operational_note",
  "intent_pattern",
  "ambiguous_phrase"
] as const

const sourceSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    type: z.enum(["local_inventory", "product_profile", "compliance", "operations", "external_search", "national_signal", "document"]),
    detail: z.string(),
    url: z.string().nullable().optional()
  })
  .strict()

const productCandidateSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    sku: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    source: z.enum(["central_catalog", "organization_product", "local_catalog", "local_inventory", "external_product"]),
    confidence: z.number().min(0).max(1),
    reason: z.string()
  })
  .strict()

const documentCitationSchema = z
  .object({
    source_id: z.string(),
    type: z.literal("document"),
    document_id: z.string(),
    document_title: z.string(),
    file_name: z.string(),
    document_type: z.string(),
    section_title: z.string().nullable().optional(),
    page_start: z.number().nullable().optional(),
    page_end: z.number().nullable().optional(),
    chunk_id: z.string(),
    quote_preview: z.string(),
    viewer_url: z.string().nullable().optional(),
    download_url: z.string().nullable().optional(),
    confidence: z.number().min(0).max(1),
    approved_status: z.enum(["draft", "approved", "archived", "expired", "superseded"]),
    effective_date: z.string().nullable().optional(),
    version: z.string().nullable().optional()
  })
  .strict()

const documentCandidateSchema = z
  .object({
    document_id: z.string(),
    document_title: z.string(),
    file_name: z.string(),
    document_type: z.string(),
    section_title: z.string().nullable().optional(),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
    approved_status: z.enum(["draft", "approved", "archived", "expired", "superseded"]),
    viewer_url: z.string().nullable().optional()
  })
  .strict()

export const assistantStructuredResponseSchema = z
  .object({
    answer: z.string().min(1),
    intent: z.enum(retailAssistantIntentValues),
    answer_mode: z.enum(assistantAnswerModeValues),
    confidence_label: z.enum(["high", "medium", "low"]),
    confidence_score: z.number().min(0).max(1),
    product_candidates: z.array(productCandidateSchema).default([]),
    sources: z.array(sourceSchema).default([]),
    clarification_needed: z.boolean(),
    clarification_question: z.string().nullable().optional(),
    suggested_actions: z.array(z.string()).default([]),
    quick_facts: z.array(z.string()).default([]),
    document_citations: z.array(documentCitationSchema).default([]),
    document_candidates: z.array(documentCandidateSchema).default([]),
    transformed_answer: z.string().nullable().optional(),
    cited_quotes: z.array(z.string()).default([]),
    missing_information: z.array(z.string()).default([]),
    conflict_warnings: z.array(z.string()).default([]),
    pending_enrichment_suggestions: z
      .array(
        z
          .object({
            product_id: z.string().nullable().optional(),
            product_name: z.string(),
            proposed_field: z.string(),
            proposed_value: z.string(),
            source_label: z.string(),
            source_url: z.string().nullable().optional(),
            confidence_score: z.number().min(0).max(1),
            status: z.enum(["pending", "approved", "rejected"]).default("pending")
          })
          .strict()
      )
      .default([]),
    learning_candidates: z
      .array(
        z
          .object({
            type: z.enum(learningCandidateTypeValues),
            phrase: z.string().nullable().optional(),
            resolved_product_id: z.string().nullable().optional(),
            resolved_product_name: z.string().nullable().optional(),
            reason: z.string(),
            confidence_score: z.number().min(0).max(1),
            approval_status: z.enum(["pending", "approved", "rejected"]).default("pending")
          })
          .strict()
      )
      .default([]),
    rejected_reason: z.string().nullable().optional()
  })
  .strict()

export type AssistantStructuredResponse = z.infer<typeof assistantStructuredResponseSchema>

export const assistantStructuredResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "answer",
    "intent",
    "answer_mode",
    "confidence_label",
    "confidence_score",
    "product_candidates",
    "sources",
    "clarification_needed",
    "clarification_question",
    "suggested_actions",
    "quick_facts",
    "document_citations",
    "document_candidates",
    "transformed_answer",
    "cited_quotes",
    "missing_information",
    "conflict_warnings",
    "pending_enrichment_suggestions",
    "learning_candidates",
    "rejected_reason"
  ],
  properties: {
    answer: { type: "string" },
    intent: { type: "string", enum: retailAssistantIntentValues },
    answer_mode: { type: "string", enum: assistantAnswerModeValues },
    confidence_label: { type: "string", enum: ["high", "medium", "low"] },
    confidence_score: { type: "number", minimum: 0, maximum: 1 },
    product_candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "sku", "department", "category", "source", "confidence", "reason"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          sku: { type: ["string", "null"] },
          department: { type: ["string", "null"] },
          category: { type: ["string", "null"] },
          source: { type: "string", enum: ["central_catalog", "organization_product", "local_catalog", "local_inventory", "external_product"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" }
        }
      }
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "type", "detail", "url"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: ["local_inventory", "product_profile", "compliance", "operations", "external_search", "national_signal", "document"] },
          detail: { type: "string" },
          url: { type: ["string", "null"] }
        }
      }
    },
    clarification_needed: { type: "boolean" },
    clarification_question: { type: ["string", "null"] },
    suggested_actions: { type: "array", items: { type: "string" } },
    quick_facts: { type: "array", items: { type: "string" } },
    document_citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "source_id",
          "type",
          "document_id",
          "document_title",
          "file_name",
          "document_type",
          "section_title",
          "page_start",
          "page_end",
          "chunk_id",
          "quote_preview",
          "viewer_url",
          "download_url",
          "confidence",
          "approved_status",
          "effective_date",
          "version"
        ],
        properties: {
          source_id: { type: "string" },
          type: { type: "string", enum: ["document"] },
          document_id: { type: "string" },
          document_title: { type: "string" },
          file_name: { type: "string" },
          document_type: { type: "string" },
          section_title: { type: ["string", "null"] },
          page_start: { type: ["number", "null"] },
          page_end: { type: ["number", "null"] },
          chunk_id: { type: "string" },
          quote_preview: { type: "string" },
          viewer_url: { type: ["string", "null"] },
          download_url: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          approved_status: { type: "string", enum: ["draft", "approved", "archived", "expired", "superseded"] },
          effective_date: { type: ["string", "null"] },
          version: { type: ["string", "null"] }
        }
      }
    },
    document_candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["document_id", "document_title", "file_name", "document_type", "section_title", "confidence", "reason", "approved_status", "viewer_url"],
        properties: {
          document_id: { type: "string" },
          document_title: { type: "string" },
          file_name: { type: "string" },
          document_type: { type: "string" },
          section_title: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" },
          approved_status: { type: "string", enum: ["draft", "approved", "archived", "expired", "superseded"] },
          viewer_url: { type: ["string", "null"] }
        }
      }
    },
    transformed_answer: { type: ["string", "null"] },
    cited_quotes: { type: "array", items: { type: "string" } },
    missing_information: { type: "array", items: { type: "string" } },
    conflict_warnings: { type: "array", items: { type: "string" } },
    pending_enrichment_suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["product_id", "product_name", "proposed_field", "proposed_value", "source_label", "source_url", "confidence_score", "status"],
        properties: {
          product_id: { type: ["string", "null"] },
          product_name: { type: "string" },
          proposed_field: { type: "string" },
          proposed_value: { type: "string" },
          source_label: { type: "string" },
          source_url: { type: ["string", "null"] },
          confidence_score: { type: "number", minimum: 0, maximum: 1 },
          status: { type: "string", enum: ["pending", "approved", "rejected"] }
        }
      }
    },
    learning_candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "phrase", "resolved_product_id", "resolved_product_name", "reason", "confidence_score", "approval_status"],
        properties: {
          type: { type: "string", enum: learningCandidateTypeValues },
          phrase: { type: ["string", "null"] },
          resolved_product_id: { type: ["string", "null"] },
          resolved_product_name: { type: ["string", "null"] },
          reason: { type: "string" },
          confidence_score: { type: "number", minimum: 0, maximum: 1 },
          approval_status: { type: "string", enum: ["pending", "approved", "rejected"] }
        }
      }
    },
    rejected_reason: { type: ["string", "null"] }
  }
} as const

function normalizeProductCandidates(candidates: AssistantStructuredResponse["product_candidates"]): ProductCandidate[] {
  return candidates.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    sku: candidate.sku ?? undefined,
    department: candidate.department ?? undefined,
    category: candidate.category ?? undefined,
    source: candidate.source,
    confidence: candidate.confidence,
    reason: candidate.reason
  }))
}

function normalizeSources(sources: AssistantStructuredResponse["sources"]): AiSource[] {
  return sources.map((source) => ({
    id: source.id,
    label: source.label,
    type: source.type,
    detail: source.detail,
    url: source.url ?? undefined
  }))
}

function normalizeDocumentCitations(citations: AssistantStructuredResponse["document_citations"]): DocumentCitation[] {
  return citations.map((citation) => ({
    sourceId: citation.source_id,
    type: "document",
    documentId: citation.document_id,
    documentTitle: citation.document_title,
    fileName: citation.file_name,
    documentType: citation.document_type,
    sectionTitle: citation.section_title ?? undefined,
    pageStart: citation.page_start ?? undefined,
    pageEnd: citation.page_end ?? undefined,
    chunkId: citation.chunk_id,
    quotePreview: citation.quote_preview,
    viewerUrl: citation.viewer_url ?? undefined,
    downloadUrl: citation.download_url ?? undefined,
    confidence: citation.confidence,
    approvedStatus: citation.approved_status,
    effectiveDate: citation.effective_date ?? undefined,
    version: citation.version ?? undefined
  }))
}

function normalizeDocumentCandidates(candidates: AssistantStructuredResponse["document_candidates"]): DocumentCandidate[] {
  return candidates.map((candidate) => ({
    documentId: candidate.document_id,
    documentTitle: candidate.document_title,
    fileName: candidate.file_name,
    documentType: candidate.document_type,
    sectionTitle: candidate.section_title ?? undefined,
    confidence: candidate.confidence,
    reason: candidate.reason,
    approvedStatus: candidate.approved_status,
    viewerUrl: candidate.viewer_url ?? undefined
  }))
}

export function structuredResponseToAiAnswer({
  response,
  fallback,
  mode
}: {
  response: AssistantStructuredResponse
  fallback: AiAnswer
  mode: "local" | "openai"
}): AiAnswer {
  const candidates = response.product_candidates.length > 0 ? normalizeProductCandidates(response.product_candidates) : fallback.productCandidates ?? []
  const sources = response.sources.length > 0 ? normalizeSources(response.sources) : fallback.sources
  const confidence = response.confidence_label as AiConfidence
  const clarificationNeeded = response.clarification_needed || fallback.needsClarification || response.intent === "unknown"

  return {
    ...fallback,
    mode,
    answer: response.answer,
    confidence,
    confidenceScore: response.confidence_score,
    intent: response.intent as RetailAssistantIntent,
    answerMode: response.answer_mode,
    quickFacts: response.quick_facts.length > 0 ? response.quick_facts : fallback.quickFacts,
    recommendedActions: response.suggested_actions.length > 0 ? response.suggested_actions : fallback.recommendedActions,
    sources,
    needsClarification: clarificationNeeded,
    clarificationQuestion: response.clarification_question ?? fallback.clarificationQuestion,
    productCandidates: candidates,
    rejectedReason: response.rejected_reason ?? undefined,
    documentCitations: response.document_citations.length > 0 ? normalizeDocumentCitations(response.document_citations) : fallback.documentCitations,
    documentCandidates: response.document_candidates.length > 0 ? normalizeDocumentCandidates(response.document_candidates) : fallback.documentCandidates,
    transformedAnswer: response.transformed_answer ?? fallback.transformedAnswer,
    citedQuotes: response.cited_quotes.length > 0 ? response.cited_quotes : fallback.citedQuotes,
    missingInformation: response.missing_information.length > 0 ? response.missing_information : fallback.missingInformation,
    conflictWarnings: response.conflict_warnings.length > 0 ? response.conflict_warnings : fallback.conflictWarnings,
    pendingEnrichmentSuggestions: response.pending_enrichment_suggestions.map((suggestion) => ({
      productId: suggestion.product_id ?? undefined,
      productName: suggestion.product_name,
      proposedField: suggestion.proposed_field,
      proposedValue: suggestion.proposed_value,
      sourceLabel: suggestion.source_label,
      sourceUrl: suggestion.source_url ?? undefined,
      confidenceScore: suggestion.confidence_score,
      status: suggestion.status
    })),
    learningCandidates: response.learning_candidates.map((candidate) => ({
      type: candidate.type,
      phrase: candidate.phrase ?? undefined,
      resolvedProductId: candidate.resolved_product_id ?? undefined,
      resolvedProductName: candidate.resolved_product_name ?? undefined,
      reason: candidate.reason,
      confidenceScore: candidate.confidence_score,
      approvalStatus: candidate.approval_status
    }))
  }
}
