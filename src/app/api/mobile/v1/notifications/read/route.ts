import { z } from "zod"

import { adminFieldValue } from "@/lib/firebase-admin"
import { firestoreCollections } from "@/lib/firestore-schema"
import { MobileApiError, mobileEnvelope, mobileError, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const schema = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) })

export async function POST(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: { code: "invalid_request", message: "Notification ids are required." } }, { status: 400 })
    const FieldValue = await adminFieldValue()
    const collection = orgCollection(principal, firestoreCollections.notifications)
    await principal.db.runTransaction(async (transaction) => {
      const refs = parsed.data.ids.map((id) => collection.doc(id))
      const snapshots = await Promise.all(refs.map((reference) => transaction.get(reference)))
      snapshots.forEach((snapshot) => {
        if (!snapshot.exists) throw new MobileApiError("A notification was not found.", 404, "notification_not_found")
        transaction.update(snapshot.ref, { read: true, readBy: principal.uid, readAt: FieldValue.serverTimestamp() })
      })
    })
    return Response.json(mobileEnvelope({ readIds: parsed.data.ids }))
  } catch (error) {
    return mobileError(error)
  }
}
