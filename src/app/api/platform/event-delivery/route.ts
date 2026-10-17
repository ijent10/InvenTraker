import { Timestamp } from "firebase-admin/firestore"
import { requirePlatformPrincipal } from "@/lib/platform/principal"
import { mobileError } from "@/lib/mobile-api"
import { deliveryHealth, deliveryMonitorRow, type DeliveryMonitor } from "@/lib/engines/events/delivery-health"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const millis = (value: unknown): number | null => value instanceof Timestamp ? value.toMillis() : null
const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : null
export async function GET(request: Request) {
  try {
    const { db } = await requirePlatformPrincipal(request)
    const now = Date.now(), outbox = db.collection("engineOutbox")
    const pending = outbox.where("status", "==", "pending"), dead = outbox.where("status", "==", "dead_letter")
    const due = pending.where("nextAttemptAt", "<=", Timestamp.fromMillis(now))
    const [pendingCount, dueCount, scheduledCount, deadCount, pendingRows, deadRows, health] = await Promise.all([
      pending.count().get(), due.count().get(), pending.where("nextAttemptAt", ">=", Timestamp.fromMillis(0)).where("nextAttemptAt", "<=", Timestamp.fromDate(new Date("9999-12-31T23:59:59Z"))).count().get(), dead.count().get(),
      pending.orderBy("nextAttemptAt").select("event", "status", "attempts", "createdAt", "nextAttemptAt", "lastAttemptAt", "lastErrorCode").limit(51).get(),
      dead.select("event", "status", "attempts", "createdAt", "nextAttemptAt", "lastAttemptAt", "lastErrorCode").limit(51).get(),
      db.collection("engineDispatchHealth").doc("workspace-stock-v1").get()
    ])
    const counts = { pending: pendingCount.data().count, due: dueCount.data().count, unscheduled: Math.max(0, pendingCount.data().count - scheduledCount.data().count), deadLetters: deadCount.data().count }
    const report: DeliveryMonitor = { schemaVersion: "1", generatedAt: new Date(now).toISOString(), enabled: process.env.ENGINE_EVENT_DISPATCH_ENABLED === "true", counts,
      state: deliveryHealth({ ...counts, lastSuccessAt: millis(health.data()?.lastSuccessAt), lastFailureAt: millis(health.data()?.lastFailureAt), oldestDueAt: millis(pendingRows.docs[0]?.data().nextAttemptAt), now }),
      worker: { lastSuccessAt: iso(health.data()?.lastSuccessAt), lastFailureAt: iso(health.data()?.lastFailureAt) },
      pending: pendingRows.docs.slice(0, 50).map(doc => deliveryMonitorRow(doc.id, { ...doc.data(), createdAt: millis(doc.data().createdAt), nextAttemptAt: millis(doc.data().nextAttemptAt), lastAttemptAt: millis(doc.data().lastAttemptAt) })),
      deadLetters: deadRows.docs.slice(0, 50).map(doc => deliveryMonitorRow(doc.id, { ...doc.data(), createdAt: millis(doc.data().createdAt), nextAttemptAt: millis(doc.data().nextAttemptAt), lastAttemptAt: millis(doc.data().lastAttemptAt) })),
      pendingPartial: pendingRows.size > 50, deadLettersPartial: deadRows.size > 50 }
    if (!report.enabled) report.state = "attention"
    return Response.json(report, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { const response = mobileError(error); response.headers.set("Cache-Control", "private, no-store"); return response }
}
