import type { DocumentReference, Transaction } from "firebase-admin/firestore"
import { stockOperationRecord } from "@/lib/stock-operations"
import { outboxRecordSchema, stockCommittedEvent } from "../contracts"

/** This stages the ledger and its event on the caller's existing stock transaction. It never commits independently. */
export function postStockOperation(transaction: Transaction, operationRef: DocumentReference, input: Parameters<typeof stockOperationRecord>[0], metadata?: { commandFingerprint: string; engineResult: unknown; occurredAt: string }) {
  const record = stockOperationRecord(input)
  const event = stockCommittedEvent({ operationId: input.operationId, organizationId: input.principal.orgId, storeId: input.storeId, operationType: input.operationType, itemIds: input.changes.map((change) => change.itemId), occurredAt: metadata?.occurredAt ?? new Date().toISOString() })
  const outboxId = Buffer.from(JSON.stringify([input.principal.orgId, event.eventId])).toString("base64url")
  // Root, Admin-only collection: excluded from organization collection enumeration and denied to client SDKs by default.
  const outboxRef = input.principal.db.collection("engineOutbox").doc(outboxId)
  transaction.create(operationRef, { ...record, ...(metadata ? { commandFingerprint: metadata.commandFingerprint, engineResult: metadata.engineResult } : {}) })
  transaction.create(outboxRef, { ...outboxRecordSchema.parse({ event, status: "pending", attempts: 0 }), createdAt: input.timestamp, nextAttemptAt: input.timestamp })
}
