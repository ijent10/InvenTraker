import { OPERATIONAL_INTELLIGENCE_VERSION, runOperationalTool, type OperationalDataset, type OperationalResult, type OperationalToolName } from "../operational-intelligence.ts"

/** Stable Inventraker-owned boundary. A shared AI service may implement this interface later. */
export type InventrakerProductAdapter = {
  contractVersion: typeof OPERATIONAL_INTELLIGENCE_VERSION
  capabilities: readonly OperationalToolName[]
  mutationPolicy: { mode: "draft_only"; requiresUiPermission: true; approvalBypass: false }
  execute(tool: OperationalToolName, authorizedData: OperationalDataset): OperationalResult
  draftAction(input: { label: string; href: string; reason: string }): { status: "draft"; label: string; href: string; reason: string; executable: false }
}

export const inventrakerProductAdapter: InventrakerProductAdapter = {
  contractVersion: OPERATIONAL_INTELLIGENCE_VERSION,
  capabilities: ["current_balance", "batch_expiry", "stock_events", "order_explanation", "cost_changes", "comparable_waste", "runout_explanation"],
  mutationPolicy: { mode: "draft_only", requiresUiPermission: true, approvalBypass: false },
  execute: runOperationalTool,
  draftAction: (input) => ({ status: "draft", ...input, executable: false })
}
