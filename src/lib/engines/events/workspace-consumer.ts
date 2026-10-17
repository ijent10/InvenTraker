import { domainEventSchema, type DomainEvent } from "../contracts.ts"
export const workspaceConsumer = "workspace-stock-v1"
export class DeliveryError extends Error { readonly code: string; constructor(code: string) { super(code); this.name = "DeliveryError"; this.code = code } }
export const eventDocumentId = (organizationId: string, eventId: string) => Buffer.from(JSON.stringify([organizationId, eventId])).toString("base64url")
export const workspaceCursorId = (organizationId: string, storeId: string) => Buffer.from(JSON.stringify([organizationId, storeId])).toString("base64url")
export const receiptDocumentId = (event: DomainEvent) => Buffer.from(JSON.stringify([workspaceConsumer, event.organizationId, event.eventId])).toString("base64url")
export function validateStockEvent(id: string, value: unknown) {
  const parsed = domainEventSchema.safeParse(value)
  if (!parsed.success) throw new DeliveryError("invalid_event")
  const e = parsed.data
  const path = `orgs/${e.organizationId}/stockOperations/${e.aggregateId}`
  if (e.eventType !== "inventory.stock-committed.v1" || e.sourceEngine !== "inventory" || e.eventId !== `${e.aggregateId}:inventory.stock-committed.v1` || e.aggregateId !== e.correlationId || e.aggregateId !== e.causationId || e.actorAuditRef !== path || e.payload.movementRef !== path || id !== eventDocumentId(e.organizationId, e.eventId) || new Set(e.payload.itemIds).size !== e.payload.itemIds.length || !["spot_check", "restock", "waste", "receive", "transfer", "portion", "par_change"].includes(e.payload.operationType)) throw new DeliveryError("event_scope_invalid")
  return e
}
export function verifyMovement(event: DomainEvent, movement: Record<string, unknown> | undefined) {
  if (!movement) throw new Error("movement_unavailable")
  const ids = Array.isArray(movement.changes) ? movement.changes.map(change => String((change as { itemId?: unknown })?.itemId ?? "")).sort() : []
  if (movement.operationId !== event.aggregateId || movement.storeId !== event.locationId || movement.operationType !== event.payload.operationType || JSON.stringify([...new Set(ids)]) !== JSON.stringify([...event.payload.itemIds].sort())) throw new DeliveryError("movement_scope_invalid")
}
export function nextWorkspaceRevision(current: unknown) {
  const revision = current ?? 0
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER) throw new Error("invalid_workspace_revision")
  return revision + 1
}
export function deliveryFailure(attempts: unknown, now: number, permanent: boolean) {
  const count = typeof attempts === "number" && Number.isSafeInteger(attempts) && attempts >= 0 ? Math.min(attempts + 1, 6) : 1
  return { attempts: count, status: permanent || count >= 6 ? "dead_letter" as const : "pending" as const, nextAttemptAt: now + Math.min(3600, 30 * 2 ** Math.min(count - 1, 7)) * 1000 }
}
export type DeliveryTransaction = {
  readOutbox(): Promise<Record<string, unknown> | undefined>
  readMovement(event: DomainEvent): Promise<Record<string, unknown> | undefined>
  readReceipt(event: DomainEvent): Promise<boolean>
  readCursor(event: DomainEvent): Promise<Record<string, unknown> | undefined>
  complete(event: DomainEvent, revision: number | null, attempts: number, now: number): void
}
export async function consumeWorkspaceEvent(id: string, transaction: DeliveryTransaction, now: number): Promise<"skipped" | "replayed" | "delivered"> {
  const record = await transaction.readOutbox()
  if (!record || record.status !== "pending") return "skipped"
  const due = record.nextAttemptAt
  if (typeof due !== "number" || !Number.isFinite(due)) throw new DeliveryError("invalid_retry_time")
  if (due > now) return "skipped"
  const event = validateStockEvent(id, record.event)
  const [movement, receipt, cursor] = await Promise.all([transaction.readMovement(event), transaction.readReceipt(event), transaction.readCursor(event)])
  verifyMovement(event, movement)
  if (typeof record.attempts !== "number" || !Number.isSafeInteger(record.attempts) || record.attempts < 0 || record.attempts >= 6) throw new DeliveryError("invalid_attempt_count")
  const revision = receipt ? null : nextWorkspaceRevision(cursor?.revision)
  transaction.complete(event, revision, record.attempts + 1, now)
  return receipt ? "replayed" : "delivered"
}
