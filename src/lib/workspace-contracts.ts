import { z } from "zod"

export const deviceClassSchema = z.enum(["phone", "tablet", "desktop"])
export const widgetSizeSchema = z.enum(["small", "medium", "large", "extra-large"])
export const widgetShapeSchema = z.enum(["circle", "square", "rounded-square"])
export const widgetContentModeSchema = z.enum(["automatic", "pinned", "fixed"])
export const widgetStateSchema = z.enum([
  "loading",
  "loaded",
  "empty",
  "stale",
  "permission-denied",
  "engine-unavailable",
  "network-unavailable",
  "ai-unavailable",
  "error"
])

export const widgetInstanceSchema = z.object({
  id: z.string().min(1),
  engineId: z.string().min(1),
  widgetDefinitionId: z.string().min(1),
  gridX: z.number().int().nonnegative(),
  gridY: z.number().int().nonnegative(),
  gridWidth: z.number().int().positive(),
  gridHeight: z.number().int().positive(),
  size: widgetSizeSchema,
  shapeOverride: widgetShapeSchema.optional(),
  pinnedContentId: z.string().min(1).optional(),
  mode: widgetContentModeSchema.default("automatic"),
  preferences: z.record(z.unknown()).default({})
})

export const dashboardLayoutSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  deviceClass: deviceClassSchema,
  revision: z.number().int().positive(),
  shapePreference: widgetShapeSchema.default("rounded-square"),
  widgets: z.array(widgetInstanceSchema),
  updatedAt: z.string().datetime()
})

export const widgetDefinitionSchema = z.object({
  id: z.string().min(1),
  engineId: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  supportedSizes: z.array(widgetSizeSchema).min(1),
  supportedShapes: z.array(widgetShapeSchema).min(1),
  dataSource: z.string().min(1),
  contentCapabilities: z.array(z.string()),
  permissions: z.array(z.string()),
  availableActions: z.array(z.string()),
  defaultRefreshPolicy: z.object({
    strategy: z.enum(["event", "visibility", "interval", "manual"]),
    staleAfterSeconds: z.number().int().nonnegative()
  }),
  fallbackRenderer: z.string().min(1)
})

export const widgetCandidateSchema = z.object({
  id: z.string().min(1),
  engineId: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  severity: z.enum(["informational", "success", "warning", "critical"]),
  timestamp: z.string().datetime(),
  expiration: z.string().datetime().optional(),
  dataReference: z.string().min(1),
  supportedSizes: z.array(widgetSizeSchema).min(1),
  permittedActions: z.array(z.string()),
  factors: z.object({
    urgency: z.number().min(0).max(1),
    operationalImpact: z.number().min(0).max(1),
    userRelevance: z.number().min(0).max(1),
    actionability: z.number().min(0).max(1),
    recency: z.number().min(0).max(1)
  })
})

export type DeviceClass = z.infer<typeof deviceClassSchema>
export type WidgetSize = z.infer<typeof widgetSizeSchema>
export type WidgetShape = z.infer<typeof widgetShapeSchema>
export type WidgetInstance = z.infer<typeof widgetInstanceSchema>
export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>
export type WidgetDefinition = z.infer<typeof widgetDefinitionSchema>
export type WidgetCandidate = z.infer<typeof widgetCandidateSchema>

export function deterministicCandidateScore(candidate: WidgetCandidate) {
  const { urgency, operationalImpact, userRelevance, actionability, recency } = candidate.factors
  return urgency * 0.3 + operationalImpact * 0.25 + userRelevance * 0.2 + actionability * 0.15 + recency * 0.1
}
