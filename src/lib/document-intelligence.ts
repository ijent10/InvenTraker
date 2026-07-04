import type { AiConfidence, DocumentCandidate, DocumentCitation } from "@/lib/ai/types"
import type { CompanyFile, CompanyFileChunk } from "@/lib/demo-data"
import { getCompanyFileChunks, getCompanyFiles } from "@/lib/server-data"
import { cosineSimilarity, createLocalTextEmbedding } from "@/lib/intelligence/vector-search"
import { textTokens } from "@/lib/intelligence/text"

export const documentToolNames = [
  "document_lookup",
  "document_section_lookup",
  "document_policy_lookup",
  "document_table_lookup",
  "document_summary",
  "document_reword",
  "document_simplify",
  "document_checklist",
  "document_compare",
  "document_citation_lookup",
  "document_download_link",
  "document_viewer_link"
] as const

export type DocumentToolName = (typeof documentToolNames)[number]

export type DocumentAnswerMode =
  | "direct_answer"
  | "simplified_explanation"
  | "rewritten_policy"
  | "summary"
  | "checklist"
  | "comparison"
  | "clarification"
  | "rejection"

export type DocumentRetrievalMatch = {
  file: CompanyFile
  chunk: CompanyFileChunk
  score: number
  reason: string
}

export type DocumentRetrievalResult = {
  query: string
  matches: DocumentRetrievalMatch[]
  citations: DocumentCitation[]
  candidates: DocumentCandidate[]
  answerMode: DocumentAnswerMode
  answer?: string
  confidence: AiConfidence
  confidenceScore: number
  citedQuotes: string[]
  missingInformation: string[]
  conflictWarnings: string[]
  toolsUsed: DocumentToolName[]
  deniedDraftCount: number
}

const documentQuestionTerms = [
  "handbook",
  "policy",
  "policies",
  "procedure",
  "procedures",
  "sop",
  "guide",
  "training",
  "document",
  "documents",
  "file",
  "files",
  "dress code",
  "hoodie",
  "closing",
  "opening",
  "checklist",
  "simpler",
  "simplify",
  "summarize",
  "summary",
  "reword",
  "rewrite",
  "vendor sheet",
  "storage temperature",
  "safety sheet",
  "where in the document",
  "what does the document say",
  "what does the vendor sheet say"
]

export function questionNeedsDocumentRetrieval(question: string) {
  const normalized = question.toLowerCase()
  return documentQuestionTerms.some((term) => normalized.includes(term))
}

function answerModeFromQuestion(question: string): DocumentAnswerMode {
  const normalized = question.toLowerCase()
  if (/(checklist|step list|to-do|todo)/.test(normalized)) return "checklist"
  if (/(simpler|simple|plain language|explain|easy to understand)/.test(normalized)) return "simplified_explanation"
  if (/(reword|rewrite|make this say)/.test(normalized)) return "rewritten_policy"
  if (/(summarize|summary|short version)/.test(normalized)) return "summary"
  if (/(compare|difference between|conflict)/.test(normalized)) return "comparison"
  return "direct_answer"
}

function currentApproved(file: CompanyFile) {
  if (file.approvedStatus !== "approved") return false
  if (file.expirationDate && new Date(file.expirationDate).getTime() < Date.now()) return false
  return true
}

function fileChunkText(file: CompanyFile, chunk: CompanyFileChunk) {
  return [
    file.title,
    file.fileName,
    file.documentType,
    file.department,
    file.summary,
    file.tags.join(" "),
    chunk.title,
    chunk.sectionTitle,
    chunk.headingPath.join(" "),
    chunk.text,
    chunk.tableData?.flat().join(" ")
  ]
    .filter(Boolean)
    .join(" ")
}

function scoreDocumentChunk(question: string, file: CompanyFile, chunk: CompanyFileChunk) {
  const normalizedQuestion = question.toLowerCase()
  const text = fileChunkText(file, chunk).toLowerCase()
  const questionTokens = textTokens(question)
  const chunkTokens = new Set(textTokens(fileChunkText(file, chunk)))
  const headingText = [chunk.sectionTitle, ...chunk.headingPath, file.documentType, file.department, file.tags.join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  const headingTokens = new Set(textTokens(headingText))
  const exactPhrase = normalizedQuestion.length > 8 && text.includes(normalizedQuestion)
  const headingHit = [chunk.sectionTitle, ...chunk.headingPath, file.documentType, file.department]
    .filter(Boolean)
    .some((value) => normalizedQuestion.includes(String(value).toLowerCase()) || String(value).toLowerCase().includes(normalizedQuestion))
  const headingOverlap = questionTokens.filter((token) => headingTokens.has(token)).length
  const overlap = questionTokens.filter((token) => chunkTokens.has(token)).length
  const semanticScore = questionTokens.length ? overlap / questionTokens.length : 0
  const vectorScore = cosineSimilarity(createLocalTextEmbedding(question), createLocalTextEmbedding(fileChunkText(file, chunk)))
  const recencyBoost = file.effectiveDate ? 0.04 : 0
  const approvedBoost = currentApproved(file) ? 0.12 : -0.16
  const headingOverlapBoost = Math.min(headingOverlap * 0.08, 0.24)
  const score = Math.min(
    1,
    (exactPhrase ? 0.62 : 0) + (headingHit ? 0.2 : 0) + headingOverlapBoost + semanticScore * 0.42 + vectorScore * 0.42 + recencyBoost + approvedBoost
  )

  const reason = exactPhrase
    ? "Exact document phrase match."
    : headingHit || headingOverlap > 0
      ? "Relevant heading, department, or policy type match."
      : semanticScore >= 0.35
        ? "Semantic keyword match inside approved document text."
        : "Vector similarity match against document text."

  return { score: Number(Math.max(0, score).toFixed(2)), reason }
}

function citationFromMatch(match: DocumentRetrievalMatch): DocumentCitation {
  const { file, chunk, score } = match
  return {
    sourceId: `document-${chunk.chunkId}`,
    type: "document",
    documentId: file.documentId,
    documentTitle: file.title,
    fileName: file.fileName,
    documentType: file.documentType,
    sectionTitle: chunk.sectionTitle,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    chunkId: chunk.chunkId,
    quotePreview: chunk.text.length > 260 ? `${chunk.text.slice(0, 257)}...` : chunk.text,
    viewerUrl: `${file.viewerUrl}#${chunk.chunkId}`,
    downloadUrl: file.downloadUrl,
    confidence: score,
    approvedStatus: file.approvedStatus,
    effectiveDate: file.effectiveDate,
    version: file.version
  }
}

function candidateFromMatch(match: DocumentRetrievalMatch): DocumentCandidate {
  return {
    documentId: match.file.documentId,
    documentTitle: match.file.title,
    fileName: match.file.fileName,
    documentType: match.file.documentType,
    sectionTitle: match.chunk.sectionTitle,
    confidence: match.score,
    reason: match.reason,
    approvedStatus: match.file.approvedStatus,
    viewerUrl: match.file.viewerUrl
  }
}

function confidenceFrom(score: number): AiConfidence {
  if (score >= 0.78) return "high"
  if (score >= 0.52) return "medium"
  return "low"
}

function formatPolicyAnswer(result: Pick<DocumentRetrievalResult, "answerMode" | "matches" | "conflictWarnings" | "missingInformation">) {
  const top = result.matches[0]
  if (!top) return "I could not find an approved document that answers that."

  const section = top.chunk.sectionTitle ? ` in ${top.chunk.sectionTitle}` : ""
  const base = top.chunk.text

  if (result.answerMode === "checklist") {
    const clauses = base
      .split(/\.|;|\n/)
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 8)
    return [`Checklist from ${top.file.title}${section}:`, ...clauses.map((clause) => `- ${clause}.`)].join("\n")
  }

  if (result.answerMode === "summary") {
    return `${top.file.title}${section} says: ${base}`
  }

  if (result.answerMode === "simplified_explanation") {
    return `Simpler version from ${top.file.title}${section}: ${base}`
  }

  if (result.answerMode === "rewritten_policy") {
    return `Reworded from ${top.file.title}${section}, without changing the policy meaning: ${base}`
  }

  return `${top.file.title}${section}: ${base}`
}

export async function retrieveApprovedDocuments({
  query,
  orgId,
  allowDrafts = false
}: {
  query: string
  orgId?: string
  allowDrafts?: boolean
}): Promise<DocumentRetrievalResult> {
  const [files, chunks] = await Promise.all([getCompanyFiles(orgId), getCompanyFileChunks(orgId)])
  const answerMode = answerModeFromQuestion(query)
  const filesByDocumentId = new Map(files.map((file) => [file.documentId, file]))
  const deniedDraftCount = files.filter((file) => file.approvedStatus === "draft").length
  const searchableFiles = files.filter((file) => currentApproved(file) || (allowDrafts && file.approvedStatus === "draft"))
  const searchableIds = new Set(searchableFiles.map((file) => file.documentId))
  const matches = chunks
    .filter((chunk) => searchableIds.has(chunk.documentId))
    .map((chunk) => {
      const file = filesByDocumentId.get(chunk.documentId)
      if (!file) return undefined
      const scored = scoreDocumentChunk(query, file, chunk)
      if (scored.score < 0.2) return undefined
      return {
        file,
        chunk,
        score: scored.score,
        reason: scored.reason
      }
    })
    .filter((match): match is DocumentRetrievalMatch => Boolean(match))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (b.file.effectiveDate ?? "").localeCompare(a.file.effectiveDate ?? "")
    })
    .slice(0, 6)

  const authoritativeMatches = (matches[0]?.score ?? 0) >= 0.5 ? matches : []
  const top = authoritativeMatches[0]
  const samePolicyMatches = authoritativeMatches.filter((match) => top && match.file.documentType === top.file.documentType && match.file.documentId !== top.file.documentId)
  const conflictWarnings =
    samePolicyMatches.length > 0
      ? [`Multiple approved ${top?.file.documentType} documents matched. Prefer the newest effective approved document and have a manager review conflicts.`]
      : []
  const missingInformation = [
    ...(!top ? ["No current approved document matched the question. Draft, expired, archived, or superseded files were not treated as authoritative."] : []),
    ...(matches.length > 0 && !top ? ["The nearest document result was too loosely related to answer as policy."] : []),
    ...(deniedDraftCount > 0 && query.toLowerCase().includes("draft")
      ? ["Draft documents were excluded from authoritative retrieval because draft access was not granted for this assistant request."]
      : [])
  ]

  return {
    query,
    matches: authoritativeMatches,
    citations: authoritativeMatches.map(citationFromMatch),
    candidates: authoritativeMatches.map(candidateFromMatch),
    answerMode,
    answer: formatPolicyAnswer({ answerMode, matches: authoritativeMatches, conflictWarnings, missingInformation }),
    confidence: confidenceFrom(top?.score ?? 0),
    confidenceScore: top?.score ?? 0,
    citedQuotes: matches.slice(0, 3).map((match) => match.chunk.text),
    missingInformation,
    conflictWarnings,
    toolsUsed: [
      "document_lookup",
      "document_section_lookup",
      answerMode === "checklist" ? "document_checklist" : answerMode === "summary" ? "document_summary" : answerMode === "simplified_explanation" ? "document_simplify" : "document_citation_lookup"
    ],
    deniedDraftCount
  }
}
