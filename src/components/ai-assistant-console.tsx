"use client"

import { useState } from "react"
import { BookOpen, Database, Download, ExternalLink, FileText, ImageIcon, Loader2, Quote, RefreshCw, Send, ShieldCheck } from "lucide-react"

import { Button, Panel, StatusPill, TextArea } from "@/components/ui"
import type { AiAnswer, NutritionValues, PendingAutofillBatch, ProductCandidate } from "@/lib/ai/types"

const starterPrompts = [
  "Is Cabernet Sauvignon kosher?",
  "What inventory needs attention today?",
  "Find an image for Strawberry clamshell PROD-STRAW-16",
  "How should waste affect my next bakery order?"
]

const suggestionSets = {
  product: [
    "What do we know about this product's allergens?",
    "Find product images and nutrition facts for this item.",
    "Is this product kosher, organic, or gluten free?"
  ],
  ordering: [
    "What should I order for this vendor today?",
    "Which low-stock items need ordering first?",
    "How should waste change the next order?"
  ],
  inventory: [
    "What inventory needs attention today?",
    "Which products are out of stock or close to reorder point?",
    "What items have the most front/back stock imbalance?"
  ],
  waste: [
    "Which products are being wasted the most?",
    "What waste pattern should I fix first?",
    "How does recent waste affect ordering?"
  ]
}

function adaptiveSuggestions(question: string, history: string[]) {
  const text = [question, ...history.slice(-3)].join(" ").toLowerCase()
  if (/(order|vendor|delivery|lead|buy)/.test(text)) return suggestionSets.ordering
  if (/(waste|shrink|expired|spoiled|loss)/.test(text)) return suggestionSets.waste
  if (/(kosher|nutrition|image|ingredient|allergen|barcode|sku|product)/.test(text)) return suggestionSets.product
  if (/(stock|inventory|front|back|reorder|par)/.test(text)) return suggestionSets.inventory
  return starterPrompts
}

function confidenceTone(confidence: AiAnswer["confidence"]) {
  if (confidence === "high") return "green"
  if (confidence === "medium") return "amber"
  return "neutral"
}

function formatNutritionValues(values: NutritionValues | undefined) {
  if (!values) return undefined

  return [
    typeof values.caloriesKcal === "number" ? `${values.caloriesKcal} kcal` : undefined,
    typeof values.fatG === "number" ? `${values.fatG}g fat` : undefined,
    typeof values.carbohydratesG === "number" ? `${values.carbohydratesG}g carbs` : undefined,
    typeof values.sugarsG === "number" ? `${values.sugarsG}g sugars` : undefined,
    typeof values.proteinG === "number" ? `${values.proteinG}g protein` : undefined,
    typeof values.sodiumMg === "number" ? `${values.sodiumMg}mg sodium` : undefined
  ]
    .filter((value): value is string => Boolean(value))
    .join(", ")
}

export function AiAssistantConsole() {
  const [question, setQuestion] = useState(starterPrompts[0])
  const [questionHistory, setQuestionHistory] = useState<string[]>([])
  const [answer, setAnswer] = useState<AiAnswer | null>(null)
  const [learningResult, setLearningResult] = useState<{
    learnedAt: string
    totalProducts: number
    learnedProducts: number
    records: Array<{
      id: string
      productName: string
      externalProducts: unknown[]
      imageCandidates: unknown[]
      learnedFacts: string[]
      verificationGaps: string[]
    }>
    persistence?: {
      attempted: boolean
      persisted: boolean
      orgId: string
      error?: string
    }
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLearning, setIsLearning] = useState(false)
  const [isCreatingPending, setIsCreatingPending] = useState(false)
  const [pendingAutofill, setPendingAutofill] = useState<{
    batch: PendingAutofillBatch
    persistence?: {
      attempted: boolean
      persisted: boolean
      orgId: string
      batchId: string
      error?: string
    }
    message: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function askAi(nextQuestion = question) {
    setQuestion(nextQuestion)
    setIsLoading(true)
    setError(null)
    setPendingAutofill(null)

    try {
      const response = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: nextQuestion })
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? "Assistant request failed.")
      }

      setAnswer(payload)
      setQuestionHistory((history) => [...history.filter((entry) => entry !== nextQuestion), nextQuestion].slice(-8))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Assistant request failed.")
    } finally {
      setIsLoading(false)
    }
  }

  async function learnCatalog() {
    setIsLearning(true)
    setError(null)

    try {
      const response = await fetch("/api/ai/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "all" })
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? "Product learning failed.")
      }

      setLearningResult(payload)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Product learning failed.")
    } finally {
      setIsLearning(false)
    }
  }

  async function createPendingAutofill() {
    const productName = answer?.productName ?? answer?.externalProducts?.[0]?.name ?? question.trim()
    const sku = answer?.externalProducts?.[0]?.barcode

    setIsCreatingPending(true)
    setError(null)

    try {
      const response = await fetch("/api/ai/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          sku,
          reason: "Created from assistant answer for nutrition, image, and product detail review."
        })
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? "Pending autofill request failed.")
      }

      setPendingAutofill(payload)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Pending autofill request failed.")
    } finally {
      setIsCreatingPending(false)
    }
  }

  function askWithCandidate(candidate: ProductCandidate) {
    const nextQuestion = `${question}\n\nProduct selected: ${candidate.name}${candidate.sku ? ` (${candidate.sku})` : ""}`
    void askAi(nextQuestion)
  }

  return (
    <div className="grid gap-6">
      <Panel className="p-4">
        <div className="mb-4">
          <h2 className="font-semibold text-white">Ask InvenTracker Assistant</h2>
          <p className="app-tip mt-1 text-sm leading-6 text-slate-400">
            Ask product, compliance, inventory, waste, reorder, or image-discovery questions.
          </p>
        </div>

        <div className="grid gap-3">
          <TextArea value={question} onChange={(event) => setQuestion(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => askAi()} disabled={isLoading} icon={isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}>
              Ask assistant
            </Button>
            {adaptiveSuggestions(question, questionHistory).map((prompt) => (
              <Button key={prompt} variant="secondary" onClick={() => askAi(prompt)}>
                {prompt}
              </Button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
        ) : null}

        {answer ? (
          <div className="mt-5 rounded-md border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={answer.mode === "openai" ? "blue" : "neutral"}>{answer.mode === "openai" ? "OpenAI" : "Local engine"}</StatusPill>
              <StatusPill tone={confidenceTone(answer.confidence)}>{answer.confidence} confidence</StatusPill>
              {answer.answerMode ? <StatusPill>{answer.answerMode.replace("_", " ")}</StatusPill> : null}
              {answer.productName ? <StatusPill tone="blue">{answer.productName}</StatusPill> : null}
              <Button
                variant="secondary"
                className="ml-auto"
                onClick={createPendingAutofill}
                disabled={isCreatingPending}
                icon={isCreatingPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              >
                Send to pending review
              </Button>
            </div>

            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-100">{answer.answer}</p>

            {answer.transformedAnswer && answer.transformedAnswer !== answer.answer ? (
              <div className="mt-4 rounded-md border border-blue-500/20 bg-blue-500/10 p-3">
                <p className="text-sm font-semibold text-white">Transformed answer</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-blue-100">{answer.transformedAnswer}</p>
              </div>
            ) : null}

            {answer.conflictWarnings && answer.conflictWarnings.length > 0 ? (
              <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-sm font-semibold text-amber-100">Document conflict warning</p>
                <ul className="mt-2 space-y-1 text-sm text-amber-100">
                  {answer.conflictWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {answer.missingInformation && answer.missingInformation.length > 0 ? (
              <div className="mt-4 rounded-md border border-slate-700 bg-slate-950/70 p-3">
                <p className="text-sm font-semibold text-white">Missing information</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-400">
                  {answer.missingInformation.map((missing) => (
                    <li key={missing}>{missing}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {answer.documentCitations && answer.documentCitations.length > 0 ? (
              <div className="mt-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <BookOpen className="h-4 w-4 text-blue-300" />
                  Document citations
                </h3>
                <div className="mt-2 grid gap-3">
                  {answer.documentCitations.map((citation) => (
                    <details key={`${citation.documentId}-${citation.chunkId}`} className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
                      <summary className="cursor-pointer list-none">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <FileText className="h-4 w-4 text-blue-300" />
                              <p className="font-semibold text-white">{citation.documentTitle}</p>
                              <StatusPill tone={citation.approvedStatus === "approved" ? "green" : "amber"}>{citation.approvedStatus}</StatusPill>
                              <StatusPill>{Math.round(citation.confidence * 100)}% match</StatusPill>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {citation.documentType}
                              {citation.sectionTitle ? ` · ${citation.sectionTitle}` : ""}
                              {citation.pageStart ? ` · Page ${citation.pageStart}${citation.pageEnd && citation.pageEnd !== citation.pageStart ? `-${citation.pageEnd}` : ""}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            {citation.viewerUrl ? (
                              <a
                                href={citation.viewerUrl}
                                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-semibold text-blue-300 hover:text-blue-200"
                              >
                                Open <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                            {citation.downloadUrl ? (
                              <a
                                href={citation.downloadUrl}
                                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-semibold text-blue-300 hover:text-blue-200"
                              >
                                Download <Download className="h-3 w-3" />
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </summary>
                      <div className="mt-3 rounded-md border border-slate-800 bg-slate-950 p-3">
                        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <Quote className="h-3.5 w-3.5" />
                          Cited section preview
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{citation.quotePreview}</p>
                        <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                          <p>File: {citation.fileName}</p>
                          <p>Version: {citation.version ?? "Not listed"}</p>
                          <p>Effective: {citation.effectiveDate ?? "Not listed"}</p>
                          <p>Chunk: {citation.chunkId}</p>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ) : null}

            {pendingAutofill ? (
              <div className="mt-4 rounded-md border border-blue-500/30 bg-blue-500/10 p-3">
                <p className="text-sm font-semibold text-white">{pendingAutofill.message}</p>
                <p className="mt-1 text-sm text-blue-100">
                  {pendingAutofill.batch.productName}: {pendingAutofill.batch.fields.length} proposed field
                  {pendingAutofill.batch.fields.length === 1 ? "" : "s"} now need review.
                </p>
                {pendingAutofill.persistence && !pendingAutofill.persistence.persisted ? (
                  <p className="mt-1 text-xs text-amber-200">{pendingAutofill.persistence.error ?? "Pending record was returned in preview mode."}</p>
                ) : null}
              </div>
            ) : null}

            {answer.needsClarification && answer.productCandidates && answer.productCandidates.length > 0 ? (
              <div className="mt-5 rounded-md border border-blue-500/30 bg-blue-500/10 p-3">
                <h3 className="text-sm font-semibold text-white">{answer.clarificationQuestion ?? "Which product do you mean?"}</h3>
                <div className="mt-3 grid gap-2">
                  {answer.productCandidates.map((candidate) => (
                    <button
                      key={`${candidate.source}-${candidate.id}`}
                      type="button"
                      onClick={() => askWithCandidate(candidate)}
                      className="rounded-md border border-slate-700 bg-slate-950/80 p-3 text-left transition hover:border-blue-500 hover:bg-slate-900"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">{candidate.name}</span>
                        <StatusPill tone="blue">{Math.round(candidate.confidence * 100)}% match</StatusPill>
                        <StatusPill>{candidate.source.replace("_", " ")}</StatusPill>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {[candidate.sku, candidate.department, candidate.category].filter(Boolean).join(" · ") || candidate.reason}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-white">Quick facts</h3>
                <ul className="mt-2 space-y-2 text-sm text-slate-400">
                  {answer.quickFacts.map((fact) => (
                    <li key={fact} className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2">
                      {fact}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-white">Recommended actions</h3>
                <ul className="mt-2 space-y-2 text-sm text-slate-400">
                  {answer.recommendedActions.map((action) => (
                    <li key={action} className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2">
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {answer.imageCandidates.length > 0 ? (
              <div className="mt-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <ImageIcon className="h-4 w-4 text-blue-300" />
                  Product image candidates
                </h3>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {answer.imageCandidates.map((candidate) => (
                    <div key={`${candidate.title}-${candidate.query}`} className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
                      {candidate.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={candidate.imageUrl}
                          alt=""
                          className="mb-3 h-32 w-full rounded-md border border-slate-800 object-contain bg-white"
                        />
                      ) : null}
                      <p className="text-sm font-semibold text-white">{candidate.title}</p>
                      <p className="mt-1 text-sm text-blue-200">{candidate.query}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{candidate.reason}</p>
                      {candidate.sourceUrl ? (
                        <a
                          href={candidate.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-300 hover:text-blue-200"
                        >
                          View source <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {answer.externalProducts && answer.externalProducts.length > 0 ? (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-white">External product matches</h3>
                <div className="mt-2 grid gap-2">
                  {answer.externalProducts.map((product) => (
                    <div key={`${product.source}-${product.barcode ?? product.name}`} className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-white">{product.name}</p>
                        <StatusPill tone="blue">Open Food Facts</StatusPill>
                        {product.brand ? <StatusPill>{product.brand}</StatusPill> : null}
                      </div>
                      <div className="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                        <p>Barcode: {product.barcode ?? "Not listed"}</p>
                        <p>Labels: {product.labels.slice(0, 6).join(", ") || "None listed"}</p>
                        <p>Allergens: {product.allergens.join(", ") || "None listed"}</p>
                        <p>Nutrition grade: {product.nutritionGrade ?? "Not listed"}</p>
                      </div>
                      {product.nutrition ? (
                        <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/70 p-3 text-xs leading-5 text-slate-400">
                          <p className="font-semibold text-slate-200">Nutrition facts candidate</p>
                          {product.nutrition.servingSize ? <p className="mt-1">Serving size: {product.nutrition.servingSize}</p> : null}
                          {formatNutritionValues(product.nutrition.perServing) ? (
                            <p className="mt-1">Per serving: {formatNutritionValues(product.nutrition.perServing)}</p>
                          ) : null}
                          {formatNutritionValues(product.nutrition.per100g) ? (
                            <p className="mt-1">Per 100g: {formatNutritionValues(product.nutrition.per100g)}</p>
                          ) : null}
                        </div>
                      ) : null}
                      {product.sourceUrl ? (
                        <a
                          href={product.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-300 hover:text-blue-200"
                        >
                          View product source <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {answer.recallMatches && answer.recallMatches.length > 0 ? (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-white">Recall and safety matches</h3>
                <div className="mt-2 grid gap-2">
                  {answer.recallMatches.map((recall) => (
                    <div key={`${recall.productDescription}-${recall.reportDate}`} className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone="amber">{recall.classification ?? "openFDA"}</StatusPill>
                        {recall.status ? <StatusPill>{recall.status}</StatusPill> : null}
                        {recall.reportDate ? <span className="text-xs text-slate-400">{recall.reportDate}</span> : null}
                      </div>
                      <p className="mt-2 text-sm font-semibold text-white">{recall.productDescription}</p>
                      {recall.reason ? <p className="mt-1 text-xs leading-5 text-slate-400">{recall.reason}</p> : null}
                      <a
                        href={recall.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-300 hover:text-blue-200"
                      >
                        View openFDA source <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {answer.sources.length > 0 ? (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-white">Sources used</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {answer.sources.map((source) =>
                    source.url ? (
                      <a
                        key={source.id}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-semibold text-blue-300 hover:text-blue-200"
                      >
                        {source.label} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <StatusPill key={source.id}>{source.label}</StatusPill>
                    )
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Panel>

      <Panel className="app-tip p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Answer discipline</h2>
            <p className="app-tip mt-1 text-sm leading-6 text-slate-400">
              The assistant separates verified facts from missing evidence, especially for kosher, allergen, recall, organic, and
              customer-facing product claims.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <Button
            className="w-full"
            variant="secondary"
            onClick={learnCatalog}
            disabled={isLearning}
            icon={isLearning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          >
            Learn current catalog
          </Button>

          {learningResult ? (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-emerald-300" />
                <p className="text-sm font-semibold text-white">
                  Learned {learningResult.learnedProducts} of {learningResult.totalProducts} products
                </p>
              </div>
              {learningResult.persistence ? (
                <p className={`mt-2 text-xs ${learningResult.persistence.persisted ? "text-emerald-200" : "text-amber-200"}`}>
                  {learningResult.persistence.persisted
                    ? `Saved to Firestore org ${learningResult.persistence.orgId}.`
                    : learningResult.persistence.error ?? "Learning ran in preview mode."}
                </p>
              ) : null}
              <div className="mt-3 space-y-2">
                {learningResult.records.map((record) => (
                  <div key={record.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-2">
                    <p className="text-xs font-semibold text-white">{record.productName}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {record.externalProducts.length} external matches · {record.imageCandidates.length} image candidates
                    </p>
                    {record.verificationGaps.length > 0 ? (
                      <p className="mt-1 text-xs text-amber-200">{record.verificationGaps[0]}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {[
            ["Local first", "Inventory, waste, product profile, vendor, and store data are checked before generic answers."],
            ["No guessing", "Compliance answers require stored evidence or external source confirmation."],
            ["Search-ready", "Web and image search can be enabled with provider credentials when you are ready."],
            ["Action-focused", "Answers should end with what a store operator should do next."]
          ].map(([title, detail]) => (
            <div key={title} className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
              <p className="text-sm font-semibold text-white">{title}</p>
              <p className="app-tip mt-1 text-sm leading-5 text-slate-400">{detail}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
