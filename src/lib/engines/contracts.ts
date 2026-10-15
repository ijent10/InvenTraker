import { z } from "zod"

export const engineIdSchema = z.enum(["inventory", "spot-check", "restock", "receiving", "discards", "transfers", "production", "orders", "health-checks", "assistant", "insights"])
export const engineDocumentIdSchema = z.string().trim().min(1).max(200).refine((value) => !value.includes("/") && value !== "." && value !== "..", "Choose a valid record ID.")
export const engineCommandSchema = z.object({
  commandId: z.string().uuid(), organizationId: engineDocumentIdSchema, locationId: engineDocumentIdSchema,
  actorId: engineDocumentIdSchema, payload: z.unknown()
}).strict()
export const domainEventSchema = z.object({
  eventId: z.string().min(1), eventType: z.string().min(1), schemaVersion: z.literal(1), sourceEngine: engineIdSchema,
  organizationId: engineDocumentIdSchema, locationId: engineDocumentIdSchema, aggregateId: engineDocumentIdSchema,
  actorAuditRef: z.string().min(1), occurredAt: z.string().datetime(), correlationId: z.string().uuid(), causationId: z.string().uuid(),
  payload: z.object({ operationType: z.string().min(1), itemIds: z.array(engineDocumentIdSchema).min(1), movementRef: z.string().min(1) }).strict()
}).strict()
export const outboxRecordSchema = z.object({ event: domainEventSchema, status: z.literal("pending"), attempts: z.literal(0) }).strict()
export function engineResultSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({ requestId: z.string().uuid(), schemaVersion: z.literal("1"), committedAt: z.string().datetime(), replayed: z.boolean(), data, degraded: z.boolean().optional() }).strict()
}
export const engineErrorResponseSchema = z.object({ requestId: z.string().uuid().nullable(), schemaVersion: z.literal("1"), serverTime: z.string().datetime(), error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict() }).strict()

export class EngineError extends Error {
  readonly status: number
  readonly code: string
  constructor(message: string, status: number, code: string) { super(message); this.name = "EngineError"; this.status = status; this.code = code }
}
export type EnginePrincipal = { uid: string; organizationId: string; permissions: string[]; isManager: boolean }
export type DomainEvent = z.infer<typeof domainEventSchema>

export function stockCommittedEvent(input: { operationId: string; organizationId: string; storeId: string; operationType: string; itemIds: string[]; occurredAt: string }): DomainEvent {
  const movementRef = `orgs/${input.organizationId}/stockOperations/${input.operationId}`
  return domainEventSchema.parse({
    eventId: `${input.operationId}:inventory.stock-committed.v1`, eventType: "inventory.stock-committed.v1", schemaVersion: 1,
    sourceEngine: "inventory", organizationId: input.organizationId, locationId: input.storeId, aggregateId: input.operationId,
    actorAuditRef: movementRef, occurredAt: input.occurredAt, correlationId: input.operationId, causationId: input.operationId,
    payload: { operationType: input.operationType, itemIds: [...new Set(input.itemIds)], movementRef }
  })
}
