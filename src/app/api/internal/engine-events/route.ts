import { Timestamp } from "firebase-admin/firestore"
import { OAuth2Client } from "google-auth-library"
import { adminDb } from "@/lib/firebase-admin"
import { dispatchStockEvents } from "@/lib/engines/events/firestore-dispatcher"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60
const verifier = new OAuth2Client()
export async function POST(request: Request) {
  const audience = process.env.ENGINE_EVENT_DISPATCH_AUDIENCE
  const email = process.env.ENGINE_EVENT_DISPATCH_SERVICE_ACCOUNT
  if (!audience || !email) return Response.json({ error: "Dispatcher configuration unavailable." }, { status: 503 })
  const token = /^Bearer (.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]
  if (!token) return Response.json({ error: "Service identity required." }, { status: 401 })
  try {
    const ticket = await verifier.verifyIdToken({ idToken: token, audience })
    const claims = ticket.getPayload()
    if (claims?.email !== email || claims.email_verified !== true) return Response.json({ error: "Service identity denied." }, { status: 403 })
  } catch { return Response.json({ error: "Service identity denied." }, { status: 403 }) }
  if (process.env.ENGINE_EVENT_DISPATCH_ENABLED !== "true") return Response.json({ error: "Event dispatch is paused." }, { status: 503 })
  const startedAt = Date.now()
  let db: Awaited<ReturnType<typeof adminDb>> = null
  try {
    db = await adminDb()
    if (!db) throw new Error("unavailable")
    const counts = await dispatchStockEvents(db)
    await db.collection("engineDispatchHealth").doc("workspace-stock-v1").set({ schemaVersion: 1, lastSuccessAt: Timestamp.now(), durationMs: Date.now() - startedAt, counts }, { merge: true }).catch(() => console.error("[engine-events] Health recording failed"))
    console.info(JSON.stringify({ severity: counts.deadLettered ? "WARNING" : "INFO", event: "engine_dispatch_completed", durationMs: Date.now() - startedAt, ...counts }))
    return Response.json(counts, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    await db?.collection("engineDispatchHealth").doc("workspace-stock-v1").set({ schemaVersion: 1, lastFailureAt: Timestamp.now(), lastErrorCode: "dispatch_failed" }, { merge: true }).catch(() => undefined)
    console.error(JSON.stringify({ severity: "ERROR", event: "engine_dispatch_failed", durationMs: Date.now() - startedAt }))
    return Response.json({ error: "Dispatch requires retry." }, { status: 503 })
  }
}
