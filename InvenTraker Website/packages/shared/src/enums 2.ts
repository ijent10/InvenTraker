export const memberRoles = ["Owner", "Manager", "Staff"] as const
export type MemberRole = (typeof memberRoles)[number]

export const platforms = ["WEB", "IOS"] as const
export type Platform = (typeof platforms)[number]

export const units = ["each", "lbs"] as const
export type Unit = (typeof units)[number]

export const orderStatuses = ["draft", "suggested", "placed", "received", "closed"] as const
export type OrderStatus = (typeof orderStatuses)[number]

export const todoTypes = ["manual", "auto"] as const
export type TodoType = (typeof todoTypes)[number]

export const todoStatuses = ["open", "done", "snoozed"] as const
export type TodoStatus = (typeof todoStatuses)[number]

export const auditActions = ["create", "update", "delete", "admin_edit"] as const
export type AuditAction = (typeof auditActions)[number]

export const platformsWithDefaultTheme = ["WEB", "IOS"] as const

export const recommendationEngineVersions = ["rules_v1", "hybrid_v2", "ml_v3"] as const
export type RecommendationEngineVersion = (typeof recommendationEngineVersions)[number]

export const recommendationDomains = ["orders", "production"] as const
export type RecommendationDomain = (typeof recommendationDomains)[number]

export const recommendationFallbackSources = ["server", "client"] as const
export type RecommendationFallbackSource = (typeof recommendationFallbackSources)[number]

export const recommendationFallbackTriggers = [
  "backend_unavailable",
  "input_incomplete",
  "degraded_mode"
] as const
export type RecommendationFallbackTrigger = (typeof recommendationFallbackTriggers)[number]

export const exportDatasets = ["inventory", "orders", "waste", "expiration", "production", "todo"] as const
export type ExportDataset = (typeof exportDatasets)[number]
