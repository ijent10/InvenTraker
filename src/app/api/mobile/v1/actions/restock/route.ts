import { z } from "zod"

import { adminFieldValue } from "@/lib/firebase-admin"
import { firestoreCollections } from "@/lib/firestore-schema"
import { assertStoreAccess, mobileEnvelope, mobileError, mobileRecord, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  storeId: z.string().min(1),
  commit: z.boolean().default(false),
  lines: z.array(z.object({ itemId: z.string().min(1), countedFrontStock: z.number().min(0) })).min(1)
})

export async function POST(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "inventory.edit")
    const parsed = requestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: { code: "invalid_request", message: "Valid restock counts are required." } }, { status: 400 })
    await assertStoreAccess(principal, parsed.data.storeId)

    const FieldValue = await adminFieldValue()
    const inventory = orgCollection(principal, firestoreCollections.inventory)
    const history = orgCollection(principal, firestoreCollections.history)
    const result = await principal.db.runTransaction(async (transaction) => {
      const refs = parsed.data.lines.map((line) => inventory.doc(line.itemId))
      const snapshots = await Promise.all(refs.map((reference) => transaction.get(reference)))
      const recommendations = parsed.data.lines.map((line, index) => {
        const snapshot = snapshots[index]
        if (!snapshot.exists) throw new Error(`Inventory item ${line.itemId} was not found.`)
        const current = snapshot.data() ?? {}
        if (current.storeId && current.storeId !== parsed.data.storeId) throw new Error("An item belongs to a different store.")
        const targetFront = Math.max(0, Number(current.frontCapacity ?? current.frontPar ?? current.par ?? 0))
        const availableBack = Math.max(0, Number(current.backStock ?? 0))
        const pullQuantity = Math.min(Math.max(0, targetFront - line.countedFrontStock), availableBack)
        return {
          itemId: snapshot.id,
          name: String(current.name ?? "Inventory item"),
          countedFrontStock: line.countedFrontStock,
          previousBackStock: availableBack,
          targetFrontStock: targetFront,
          pullQuantity,
          resultingFrontStock: line.countedFrontStock + pullQuantity,
          resultingBackStock: availableBack - pullQuantity,
          current
        }
      })

      if (parsed.data.commit) {
        recommendations.forEach((recommendation, index) => {
          const snapshot = snapshots[index]
          transaction.update(snapshot.ref, {
            frontStock: recommendation.resultingFrontStock,
            backStock: recommendation.resultingBackStock,
            onHand: recommendation.resultingFrontStock + recommendation.resultingBackStock,
            lastRestockedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: principal.uid
          })
        })
        const historyRef = history.doc()
        transaction.set(historyRef, {
          id: historyRef.id,
          type: "restocks",
          label: "Restock",
          storeId: parsed.data.storeId,
          userId: principal.uid,
          userName: String(principal.member.name ?? principal.email),
          employeeId: String(principal.member.employeeId ?? ""),
          department: String(principal.member.department ?? ""),
          title: String(principal.member.jobTitle ?? principal.member.role ?? ""),
          summary: `${recommendations.reduce((total, item) => total + item.pullQuantity, 0)} units moved to the sales floor`,
          responses: recommendations.map((item) => ({ label: item.name, value: `Pull ${item.pullQuantity}` })),
          createdAt: FieldValue.serverTimestamp()
        })
      }

      return {
        committed: parsed.data.commit,
        recommendations: recommendations.map(({ current, ...recommendation }) => ({
          ...recommendation,
          item: mobileRecord(recommendation.itemId, current)
        }))
      }
    })

    return Response.json(mobileEnvelope(result))
  } catch (error) {
    return mobileError(error)
  }
}
