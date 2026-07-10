import { z } from "zod"

import { adminFieldValue } from "@/lib/firebase-admin"
import { firestoreCollections } from "@/lib/firestore-schema"
import { assertStoreAccess, mobileEnvelope, mobileError, mobileRecord, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  storeId: z.string().min(1),
  lines: z.array(
    z.object({
      itemId: z.string().min(1),
      frontStock: z.number().min(0),
      backStock: z.number().min(0),
      expirationDate: z.string().datetime().optional()
    })
  ).min(1)
})

export async function POST(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "inventory.edit")
    const parsed = requestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: { code: "invalid_request", message: "Valid spot-check counts are required." } }, { status: 400 })
    await assertStoreAccess(principal, parsed.data.storeId)

    const FieldValue = await adminFieldValue()
    const inventory = orgCollection(principal, firestoreCollections.inventory)
    const history = orgCollection(principal, firestoreCollections.history)
    const result = await principal.db.runTransaction(async (transaction) => {
      const refs = parsed.data.lines.map((line) => inventory.doc(line.itemId))
      const snapshots = await Promise.all(refs.map((reference) => transaction.get(reference)))
      const updated: Record<string, unknown>[] = []

      parsed.data.lines.forEach((line, index) => {
        const snapshot = snapshots[index]
        if (!snapshot.exists) throw new Error(`Inventory item ${line.itemId} was not found.`)
        const current = snapshot.data() ?? {}
        if (current.storeId && current.storeId !== parsed.data.storeId) throw new Error("An item belongs to a different store.")
        const onHand = line.frontStock + line.backStock
        const next = {
          frontStock: line.frontStock,
          backStock: line.backStock,
          onHand,
          status: onHand <= Number(current.reorderPoint ?? 0) ? "Low" : "Active",
          lastCountedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: principal.uid,
          ...(current.expires && line.expirationDate ? { lastVerifiedExpiration: line.expirationDate } : {})
        }
        transaction.update(snapshot.ref, next)
        updated.push(mobileRecord(snapshot.id, { ...current, ...next, lastCountedAt: new Date(), updatedAt: new Date() }))
      })

      const historyRef = history.doc()
      transaction.set(historyRef, {
        id: historyRef.id,
        type: "spot-checks",
        label: "Spot check",
        storeId: parsed.data.storeId,
        userId: principal.uid,
        userName: String(principal.member.name ?? principal.email),
        employeeId: String(principal.member.employeeId ?? ""),
        department: String(principal.member.department ?? ""),
        title: String(principal.member.jobTitle ?? principal.member.role ?? ""),
        summary: `${parsed.data.lines.length} item${parsed.data.lines.length === 1 ? "" : "s"} counted`,
        responses: parsed.data.lines.map((line) => ({ label: line.itemId, value: `${line.frontStock + line.backStock}` })),
        createdAt: FieldValue.serverTimestamp()
      })
      return { updated, historyId: historyRef.id }
    })

    return Response.json(mobileEnvelope(result))
  } catch (error) {
    return mobileError(error)
  }
}
