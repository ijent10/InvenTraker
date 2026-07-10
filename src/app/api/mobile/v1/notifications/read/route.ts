import { z } from "zod"

import { adminFieldValue } from "@/lib/firebase-admin"
import { firestoreCollections } from "@/lib/firestore-schema"
import { mobileEnvelope, mobileError, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"

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
    const batch = principal.db.batch()
    parsed.data.ids.forEach((id) => batch.set(collection.doc(id), { read: true, readBy: principal.uid, readAt: FieldValue.serverTimestamp() }, { merge: true }))
    await batch.commit()
    return Response.json(mobileEnvelope({ readIds: parsed.data.ids }))
  } catch (error) {
    return mobileError(error)
  }
}
