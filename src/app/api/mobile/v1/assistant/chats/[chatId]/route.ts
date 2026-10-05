import { firestoreCollections } from "@/lib/firestore-schema"
import { mobileEnvelope, mobileError, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function DELETE(request: Request, { params }: { params: { chatId: string } }) {
  try {
    const principal = await requireMobilePrincipal(request)
    const reference = orgCollection(principal, firestoreCollections.assistantChats).doc(params.chatId)
    const snapshot = await reference.get()
    if (snapshot.exists && snapshot.data()?.ownerId === principal.uid) await reference.delete()
    return Response.json(mobileEnvelope({ deleted: true }))
  } catch (error) { return mobileError(error) }
}
