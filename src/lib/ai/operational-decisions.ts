import { z } from "zod"

import { askOllamaJson } from "./ollama.ts"
import type { OrderRecommendationRun } from "../ordering-engine.ts"
import type { TodayIssue } from "../today-issues.ts"

const todayDecisionSchema = z.object({
  issues: z.array(z.object({
    id: z.string(), priorityScore: z.number().min(0).max(1000),
    reason: z.string().min(1).max(400), suggestedAction: z.string().min(1).max(300)
  })).max(12)
})

const todayJsonSchema = {
  type: "object", additionalProperties: false, required: ["issues"],
  properties: { issues: { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false,
    required: ["id", "priorityScore", "reason", "suggestedAction"], properties: {
      id: { type: "string" }, priorityScore: { type: "number", minimum: 0, maximum: 1000 },
      reason: { type: "string" }, suggestedAction: { type: "string" }
    } } } }
}

export async function selectTodayIssues(candidates: TodayIssue[]) {
  if (!candidates.length) return candidates
  const result = await askOllamaJson({
    system: `You select the shared InvenTracker Today list for store staff. Use only supplied candidates and evidence. Return only candidate IDs. Rank urgent stockouts, expiry, count variances, and order cutoffs by operational impact and deadline. You may omit low-value noise. Never invent inventory facts. Keep actions concrete.`,
    input: { candidates: candidates.map(({ id, type, title, detail, evidence, severity, priorityScore, deadline, freshness, suggestedAction }) => ({ id, type, title, detail, evidence, severity, deterministicPriority: priorityScore, deadline, freshness, suggestedAction })) },
    schema: todayDecisionSchema,
    jsonSchema: todayJsonSchema
  })
  if (!result) return candidates.sort((a, b) => b.priorityScore - a.priorityScore)
  const byId = new Map(candidates.map((issue) => [issue.id, issue]))
  const selected = result.data.issues.flatMap((decision) => {
    const candidate = byId.get(decision.id)
    return candidate ? [{ ...candidate, priorityScore: Math.round(decision.priorityScore), detail: `${candidate.detail} AI priority: ${decision.reason}`, suggestedAction: decision.suggestedAction,
      aiDecision: { model: result.model, promptVersion: result.promptVersion, reason: decision.reason } }] : []
  })
  return selected.length ? selected.sort((a, b) => b.priorityScore - a.priorityScore) : candidates.sort((a, b) => b.priorityScore - a.priorityScore)
}

const orderDecisionSchema = z.object({ adjustments: z.array(z.object({
  itemId: z.string(), quantity: z.number().int().min(0), reason: z.string().min(1).max(400)
})) })
const orderJsonSchema = { type: "object", additionalProperties: false, required: ["adjustments"], properties: {
  adjustments: { type: "array", items: { type: "object", additionalProperties: false, required: ["itemId", "quantity", "reason"], properties: {
    itemId: { type: "string" }, quantity: { type: "integer", minimum: 0 }, reason: { type: "string" }
  } } }
} }

export async function assistOrderRecommendation(run: OrderRecommendationRun): Promise<OrderRecommendationRun & { aiDecision?: unknown }> {
  if (!run.lines.length) return run
  const result = await askOllamaJson({
    system: `You assist with a draft retail order using only supplied verified calculations. Recommend quantities in order units. Respect confirmed incoming, expiration exclusions, vendor packs, minimums and increments. Never place or approve an order. Missing sales velocity means you should normally preserve the deterministic quantity. Every change needs a concrete evidence-based reason.`,
    input: { run }, schema: orderDecisionSchema, jsonSchema: orderJsonSchema
  })
  if (!result) return run
  const adjustments = new Map(result.data.adjustments.map((item) => [item.itemId, item]))
  const lines = run.lines.map((line) => {
    const adjustment = adjustments.get(line.itemId)
    if (!adjustment) return line
    const increment = Math.max(1, line.stockUnitsPerOrderUnit > 0 ? 1 : 1)
    const ceiling = Math.max(line.suggestedQuantity * 2, line.suggestedQuantity + 4)
    const quantity = Math.min(ceiling, Math.max(0, Math.round(adjustment.quantity / increment) * increment))
    return { ...line, finalQuantity: quantity, overrideReason: quantity === line.suggestedQuantity ? null : `AI-assisted draft: ${adjustment.reason}`, calculation: `${line.calculation}. AI review: ${adjustment.reason}` }
  })
  const subtotalAmount = Math.round(lines.reduce((sum, line) => sum + line.finalQuantity * line.unitCostAmount, 0) * 1000) / 1000
  return { ...run, lines, subtotalAmount, minimumGapAmount: Math.max(0, Math.round((run.minimumAmount - subtotalAmount) * 1000) / 1000),
    aiDecision: { model: result.model, promptVersion: result.promptVersion, role: "draft_quantity_review", requiresHumanApproval: true } }
}
