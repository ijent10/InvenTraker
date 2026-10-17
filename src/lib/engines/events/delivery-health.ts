import { validateStockEvent } from "./workspace-consumer.ts"
export type DeliveryHealthInput = { pending: number; due: number; unscheduled: number; deadLetters: number; oldestDueAt: number | null; lastSuccessAt: number | null; lastFailureAt: number | null; now: number }
export function deliveryHealth(input: DeliveryHealthInput): "healthy" | "attention" | "unknown" {
  if ([input.pending, input.due, input.unscheduled, input.deadLetters].some(value => !Number.isSafeInteger(value) || value < 0)) return "unknown"
  if (input.deadLetters || input.unscheduled || (input.oldestDueAt !== null && input.now - input.oldestDueAt > 300_000) || (input.lastFailureAt !== null && input.lastFailureAt > (input.lastSuccessAt ?? 0))) return "attention"
  if (input.lastSuccessAt === null || !Number.isFinite(input.lastSuccessAt) || input.lastSuccessAt > input.now + 60_000) return "unknown"
  return input.now - input.lastSuccessAt > 180_000 ? "attention" : "healthy"
}
const errorCodes = new Set(["invalid_event", "event_scope_invalid", "movement_scope_invalid", "invalid_retry_time", "invalid_attempt_count", "delivery_failed"])
const timestamp = (value: unknown) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 8.64e15 ? new Date(value).toISOString() : null
/** Only allowlisted operational fields leave the Admin-only outbox. */
export function deliveryMonitorRow(id: string, record: Record<string, unknown>) {
  let scope: { organizationId: string; storeId: string; operationId: string; operationType: string } | null = null
  try { const event = validateStockEvent(id, record.event); scope = { organizationId: event.organizationId, storeId: event.locationId, operationId: event.aggregateId, operationType: event.payload.operationType } } catch { /* Invalid payload contents are deliberately not echoed. */ }
  return { id, scope, status: record.status === "dead_letter" ? "dead_letter" as const : "pending" as const,
    attempts: typeof record.attempts === "number" && Number.isSafeInteger(record.attempts) && record.attempts >= 0 && record.attempts <= 6 ? record.attempts : null,
    createdAt: timestamp(record.createdAt), nextAttemptAt: timestamp(record.nextAttemptAt), lastAttemptAt: timestamp(record.lastAttemptAt),
    errorCode: typeof record.lastErrorCode === "string" && errorCodes.has(record.lastErrorCode) ? record.lastErrorCode : record.lastErrorCode ? "unknown_error" : null }
}
export type DeliveryMonitorRow = ReturnType<typeof deliveryMonitorRow>
export type DeliveryMonitor = { schemaVersion: "1"; generatedAt: string; state: ReturnType<typeof deliveryHealth>; enabled: boolean; worker: { lastSuccessAt: string | null; lastFailureAt: string | null }; counts: { pending: number; due: number; unscheduled: number; deadLetters: number }; pending: DeliveryMonitorRow[]; deadLetters: DeliveryMonitorRow[]; pendingPartial: boolean; deadLettersPartial: boolean }
