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
  try {
    const db = await adminDb()
    if (!db) throw new Error("unavailable")
    return Response.json(await dispatchStockEvents(db), { headers: { "Cache-Control": "private, no-store" } })
  } catch { console.error("[engine-events] Dispatch requires retry"); return Response.json({ error: "Dispatch requires retry." }, { status: 503 }) }
}
