import { z } from "zod"
import { firestoreCollections } from "@/lib/firestore-schema"
import { mobileEnvelope, mobileError, mobileRecord, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const message = z.object({ id: z.string(), role: z.enum(["user", "assistant"]), text: z.string().max(12000), createdAt: z.string() })
const chat = z.object({ id: z.string(), title: z.string().max(120), createdAt: z.string(), updatedAt: z.string(), messages: z.array(message).max(100), experienceVersion: z.literal(2).default(2) })

export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    const snapshot = await orgCollection(principal, firestoreCollections.assistantChats).where("ownerId", "==", principal.uid).get()
    const chats = snapshot.docs
      .map((item) => mobileRecord(item.id, item.data()))
      .filter((item) => item.experienceVersion === 2)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    return Response.json(mobileEnvelope({ chats }))
  } catch (error) { return mobileError(error) }
}

export async function PUT(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    const parsed = chat.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: { code: "invalid_chat", message: "The conversation could not be saved." } }, { status: 400 })
    await orgCollection(principal, firestoreCollections.assistantChats).doc(parsed.data.id).set({ ...parsed.data, ownerId: principal.uid }, { merge: true })
    return Response.json(mobileEnvelope(parsed.data))
  } catch (error) { return mobileError(error) }
}
