type AiProvider = "custom-rules" | "openai-chat"
type AiIntent = "pdf_howto_draft" | "order_suggestions" | "financial_health"

type AiMeta = {
  intent: AiIntent
  provider: AiProvider
  model: string
  usedModel: boolean
  fallbackReason?: string
}

export type AiDraftStep = {
  stepNumber: number
  title?: string
  blocks: Array<{ type: "text"; text: string; orderIndex: number }>
}

export type AiOrderLine = {
  itemId: string
  suggestedQty: number
  unit: "each" | "lbs"
  rationale: string
  caseRounded: boolean
  onHand: number
  minQuantity: number
}

export type FinancialHealthSnapshot = {
  inventoryValue: number
  wasteCostWeek: number
  wasteCostMonth: number
  expiringSoonValue: number
  overstocked: Array<{
    itemId: string
    itemName: string
    onHand: number
    minQuantity: number
  }>
}

export type EnhancedHowToDraft = {
  title?: string
  steps: AiDraftStep[]
  ai: AiMeta
}

export type EnhancedOrderSuggestions = {
  lines: AiOrderLine[]
  summary: string
  riskAlerts: string[]
  questionsForManager: string[]
  ai: AiMeta
}

export type EnhancedFinancialHealth = {
  summary: string
  riskAlerts: string[]
  recommendedActions: string[]
  questionsForManager: string[]
  ai: AiMeta
}

const defaultModel = process.env.INVENTRAKER_AI_MODEL?.trim() || "gpt-4o-mini"
const providerFromEnv = (process.env.INVENTRAKER_AI_PROVIDER?.trim().toLowerCase() || "custom-rules") as
  | "custom-rules"
  | "openai-chat"

function aiProvider(): AiProvider {
  if (providerFromEnv === "openai-chat") return "openai-chat"
  return "custom-rules"
}

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error("Model returned empty content.")
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const firstBrace = trimmed.indexOf("{")
  const lastBrace = trimmed.lastIndexOf("}")
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }
  throw new Error("Could not extract JSON from model response.")
}

async function callOpenAiJson<T>(intent: AiIntent, systemPrompt: string, userPrompt: string): Promise<{ payload: T; model: string }> {
  const key = process.env.OPENAI_API_KEY?.trim() || process.env.INVENTRAKER_OPENAI_API_KEY?.trim()
  if (!key) throw new Error("OPENAI_API_KEY is not configured.")

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model: defaultModel,
      temperature: 0.15,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI call failed (${response.status}): ${body.slice(0, 400)}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    model?: string
  }

  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error(`No content from model for ${intent}.`)
  const payload = JSON.parse(extractJsonPayload(content)) as T
  return { payload, model: data.model || defaultModel }
}

function normalizeDraftSteps(steps: AiDraftStep[]): AiDraftStep[] {
  const safeSteps = Array.isArray(steps) ? steps : []
  const normalized: AiDraftStep[] = []
  safeSteps.forEach((step, index) => {
    const blocks = Array.isArray(step.blocks) ? step.blocks : []
    const normalizedBlocks = blocks
      .filter((block) => block && typeof block.text === "string" && block.text.trim().length > 0)
      .map((block, blockIndex) => ({
        type: "text" as const,
        text: block.text.trim(),
        orderIndex: Number.isFinite(block.orderIndex) ? block.orderIndex : blockIndex
      }))
      .sort((a, b) => a.orderIndex - b.orderIndex)

    if (normalizedBlocks.length === 0) {
      return
    }

    normalized.push({
      stepNumber: index + 1,
      title: typeof step.title === "string" && step.title.trim() ? step.title.trim() : `Step ${index + 1}`,
      blocks: normalizedBlocks
    })
  })

  if (normalized.length > 0) return normalized
  return [
    {
      stepNumber: 1,
      title: "Step 1",
      blocks: [{ type: "text", text: "Review instructions and add steps manually.", orderIndex: 0 }]
    }
  ]
}

function buildHeuristicOrderInsights(lines: AiOrderLine[]): Omit<EnhancedOrderSuggestions, "lines" | "ai"> {
  const risky = lines
    .filter((line) => line.onHand <= 0 || line.suggestedQty >= line.minQuantity * 2)
    .slice(0, 3)
    .map((line) => `${line.itemId}: on-hand ${line.onHand}, suggested ${line.suggestedQty}.`)

  const questions = [
    "Any known promotion or event this week that will increase demand?",
    "Are case pack sizes still accurate for your current vendors?",
    "Did any items recently change shelf life or spoilage rate?"
  ]

  return {
    summary: lines.length
      ? `Generated ${lines.length} order suggestions from min levels, current on-hand, and vendor cadence.`
      : "No order suggestions were generated from the current inventory state.",
    riskAlerts: risky,
    questionsForManager: questions
  }
}

export async function enhanceHowToDraft(input: {
  orgId: string
  storeId?: string
  title?: string
  steps: AiDraftStep[]
}): Promise<EnhancedHowToDraft> {
  const fallback: EnhancedHowToDraft = {
    title: input.title,
    steps: normalizeDraftSteps(input.steps),
    ai: {
      intent: "pdf_howto_draft",
      provider: "custom-rules",
      model: "rules-v1",
      usedModel: false
    }
  }

  if (aiProvider() !== "openai-chat") return fallback

  try {
    const systemPrompt =
      "You are InvenTraker's internal AI engine. Improve procedural instructions while preserving exact operational meaning."
    const userPrompt = JSON.stringify({
      task: "Normalize and tighten a how-to draft into concise step-based text blocks.",
      constraints: [
        "Do not invent ingredients or quantities.",
        "Keep step count same or lower.",
        "Return only valid JSON.",
        "JSON shape: {\"title\": string, \"steps\": [{\"title\": string, \"blocks\": [{\"text\": string}]}]}"
      ],
      input
    })

    const { payload, model } = await callOpenAiJson<{
      title?: string
      steps?: Array<{ title?: string; blocks?: Array<{ text?: string }> }>
    }>("pdf_howto_draft", systemPrompt, userPrompt)

    const steps = (payload.steps ?? []).map((step, index) => ({
      stepNumber: index + 1,
      title: typeof step.title === "string" && step.title.trim() ? step.title.trim() : `Step ${index + 1}`,
      blocks: (step.blocks ?? [])
        .map((block, blockIndex) => ({
          type: "text" as const,
          text: typeof block.text === "string" ? block.text.trim() : "",
          orderIndex: blockIndex
        }))
        .filter((block) => block.text.length > 0)
    }))

    return {
      title: typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : input.title,
      steps: normalizeDraftSteps(steps),
      ai: {
        intent: "pdf_howto_draft",
        provider: "openai-chat",
        model,
        usedModel: true
      }
    }
  } catch (error) {
    return {
      ...fallback,
      ai: {
        ...fallback.ai,
        fallbackReason: error instanceof Error ? error.message : "AI enhancement failed"
      }
    }
  }
}

export async function enhanceOrderSuggestions(input: {
  orgId: string
  storeId: string
  vendorId?: string
  lines: AiOrderLine[]
}): Promise<EnhancedOrderSuggestions> {
  const heuristics = buildHeuristicOrderInsights(input.lines)
  const fallback: EnhancedOrderSuggestions = {
    lines: input.lines,
    ...heuristics,
    ai: {
      intent: "order_suggestions",
      provider: "custom-rules",
      model: "rules-v1",
      usedModel: false
    }
  }

  if (aiProvider() !== "openai-chat" || input.lines.length === 0) return fallback

  try {
    const systemPrompt =
      "You are InvenTraker's internal ordering AI. Improve rationale text and produce concise risk alerts for managers."
    const userPrompt = JSON.stringify({
      task: "Rewrite suggestion rationales for clarity and produce actionable summary/alerts/questions.",
      constraints: [
        "Do not change suggestedQty or units.",
        "Keep rationale factual and concise.",
        "Return only valid JSON.",
        "JSON shape: {\"lines\": [{\"itemId\": string, \"rationale\": string}], \"summary\": string, \"riskAlerts\": string[], \"questionsForManager\": string[]}"
      ],
      input
    })

    const { payload, model } = await callOpenAiJson<{
      lines?: Array<{ itemId?: string; rationale?: string }>
      summary?: string
      riskAlerts?: string[]
      questionsForManager?: string[]
    }>("order_suggestions", systemPrompt, userPrompt)

    const rationaleById = new Map(
      (payload.lines ?? [])
        .filter((line): line is { itemId: string; rationale: string } => typeof line.itemId === "string" && typeof line.rationale === "string")
        .map((line) => [line.itemId, line.rationale.trim()])
    )

    const lines = input.lines.map((line) => ({
      ...line,
      rationale: rationaleById.get(line.itemId) || line.rationale
    }))

    return {
      lines,
      summary: typeof payload.summary === "string" && payload.summary.trim() ? payload.summary.trim() : heuristics.summary,
      riskAlerts: Array.isArray(payload.riskAlerts) ? payload.riskAlerts.filter((entry) => typeof entry === "string").slice(0, 8) : heuristics.riskAlerts,
      questionsForManager: Array.isArray(payload.questionsForManager)
        ? payload.questionsForManager.filter((entry) => typeof entry === "string").slice(0, 8)
        : heuristics.questionsForManager,
      ai: {
        intent: "order_suggestions",
        provider: "openai-chat",
        model,
        usedModel: true
      }
    }
  } catch (error) {
    return {
      ...fallback,
      ai: {
        ...fallback.ai,
        fallbackReason: error instanceof Error ? error.message : "AI enhancement failed"
      }
    }
  }
}

function buildHeuristicFinancialNarrative(snapshot: FinancialHealthSnapshot): Omit<EnhancedFinancialHealth, "ai"> {
  const riskAlerts: string[] = []
  if (snapshot.expiringSoonValue > 0) {
    riskAlerts.push(`$${snapshot.expiringSoonValue.toFixed(2)} is expiring soon.`)
  }
  if (snapshot.wasteCostWeek > 0) {
    riskAlerts.push(`Weekly waste is $${snapshot.wasteCostWeek.toFixed(2)}.`)
  }
  if (snapshot.overstocked.length > 0) {
    riskAlerts.push(`${snapshot.overstocked.length} items are overstocked beyond 2x minimum.`)
  }

  const recommendedActions = [
    "Prioritize markdowns for near-expiration inventory.",
    "Review top overstocked items against upcoming order cadence.",
    "Audit waste reasons for top-cost items and adjust prep levels."
  ]

  return {
    summary: `Inventory value is $${snapshot.inventoryValue.toFixed(2)} with ${snapshot.overstocked.length} overstock risks detected.`,
    riskAlerts,
    recommendedActions,
    questionsForManager: [
      "Any one-time events expected to change demand this week?",
      "Do current minimum quantities match actual movement?",
      "Are waste reasons accurately categorized for all departments?"
    ]
  }
}

export async function enhanceFinancialHealth(
  snapshot: FinancialHealthSnapshot
): Promise<EnhancedFinancialHealth> {
  const heuristics = buildHeuristicFinancialNarrative(snapshot)
  const fallback: EnhancedFinancialHealth = {
    ...heuristics,
    ai: {
      intent: "financial_health",
      provider: "custom-rules",
      model: "rules-v1",
      usedModel: false
    }
  }

  if (aiProvider() !== "openai-chat") return fallback

  try {
    const systemPrompt =
      "You are InvenTraker's internal finance operations AI. Produce practical insights from inventory health metrics."
    const userPrompt = JSON.stringify({
      task: "Generate concise summary, risk alerts, recommended actions, and manager questions.",
      constraints: [
        "Use only provided metrics.",
        "Do not invent numbers.",
        "Return only valid JSON.",
        "JSON shape: {\"summary\": string, \"riskAlerts\": string[], \"recommendedActions\": string[], \"questionsForManager\": string[]}"
      ],
      snapshot
    })

    const { payload, model } = await callOpenAiJson<{
      summary?: string
      riskAlerts?: string[]
      recommendedActions?: string[]
      questionsForManager?: string[]
    }>("financial_health", systemPrompt, userPrompt)

    return {
      summary: typeof payload.summary === "string" && payload.summary.trim() ? payload.summary.trim() : heuristics.summary,
      riskAlerts: Array.isArray(payload.riskAlerts) ? payload.riskAlerts.filter((entry) => typeof entry === "string").slice(0, 10) : heuristics.riskAlerts,
      recommendedActions: Array.isArray(payload.recommendedActions)
        ? payload.recommendedActions.filter((entry) => typeof entry === "string").slice(0, 10)
        : heuristics.recommendedActions,
      questionsForManager: Array.isArray(payload.questionsForManager)
        ? payload.questionsForManager.filter((entry) => typeof entry === "string").slice(0, 10)
        : heuristics.questionsForManager,
      ai: {
        intent: "financial_health",
        provider: "openai-chat",
        model,
        usedModel: true
      }
    }
  } catch (error) {
    return {
      ...fallback,
      ai: {
        ...fallback.ai,
        fallbackReason: error instanceof Error ? error.message : "AI enhancement failed"
      }
    }
  }
}
