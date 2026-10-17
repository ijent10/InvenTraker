import type { Firestore } from "firebase-admin/firestore"
import { Timestamp } from "firebase-admin/firestore"
import { consumeWorkspaceEvent, DeliveryError, deliveryFailure, receiptDocumentId, workspaceConsumer, workspaceCursorId } from "./workspace-consumer"

function millis(value: unknown) { return value instanceof Timestamp ? value.toMillis() : value }
export async function dispatchStockEvents(db: Firestore, now = () => Date.now()) {
  const startedAt = now()
  const snapshot = await db.collection("engineOutbox").where("status", "==", "pending").where("nextAttemptAt", "<=", Timestamp.fromMillis(startedAt)).orderBy("nextAttemptAt").limit(25).get()
  const counts = { delivered: 0, replayed: 0, skipped: 0, retried: 0, deadLettered: 0 }
  for (const candidate of snapshot.docs) {
    if (now() - startedAt > 40_000) break
    const ref = candidate.ref
    try {
      const outcome = await db.runTransaction(async tx => consumeWorkspaceEvent(ref.id, {
        readOutbox: async () => { const saved = await tx.get(ref); const data = saved.data(); return data ? { ...data, nextAttemptAt: millis(data.nextAttemptAt) } : undefined },
        readMovement: async event => (await tx.get(db.doc(event.payload.movementRef))).data(),
        readReceipt: async event => (await tx.get(db.collection("engineConsumerReceipts").doc(receiptDocumentId(event)))).exists,
        readCursor: async event => (await tx.get(db.collection("workspaceInvalidations").doc(workspaceCursorId(event.organizationId, event.locationId)))).data(),
        complete: (event, revision, attempts, timestamp) => {
          const processedAt = Timestamp.fromMillis(timestamp)
          if (revision !== null) {
            tx.create(db.collection("engineConsumerReceipts").doc(receiptDocumentId(event)), { consumer: workspaceConsumer, eventId: event.eventId, organizationId: event.organizationId, storeId: event.locationId, processedAt })
            tx.set(db.collection("workspaceInvalidations").doc(workspaceCursorId(event.organizationId, event.locationId)), { organizationId: event.organizationId, storeId: event.locationId, revision, updatedAt: processedAt })
          }
          tx.update(ref, { status: "delivered", attempts, deliveredAt: processedAt, consumer: workspaceConsumer })
        }
      }, now()))
      counts[outcome]++
    } catch (error) {
      const status = await db.runTransaction<"skipped" | "deadLettered" | "retried">(async tx => {
        const saved = await tx.get(ref), data = saved.data()
        if (!data || data.status !== "pending" || Number(millis(data.nextAttemptAt)) > now()) return "skipped"
        const failure = deliveryFailure(data.attempts, now(), error instanceof DeliveryError)
        tx.update(ref, { ...failure, nextAttemptAt: Timestamp.fromMillis(failure.nextAttemptAt), lastAttemptAt: Timestamp.fromMillis(now()), lastErrorCode: error instanceof DeliveryError ? error.code : "delivery_failed" })
        return failure.status === "dead_letter" ? "deadLettered" : "retried"
      })
      counts[status]++
    }
  }
  return counts
}
