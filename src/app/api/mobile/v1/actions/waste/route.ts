import { z } from "zod"

import { adminFieldValue } from "@/lib/firebase-admin"
import { firestoreCollections } from "@/lib/firestore-schema"
import { assertStoreAccess, mobileEnvelope, mobileError, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  storeId: z.string().min(1),
  lines: z.array(z.object({
    itemId: z.string().min(1),
    quantity: z.number().positive(),
    area: z.enum(["front", "back"]),
    reason: z.string().min(1).max(240)
  })).min(1)
})

export async function POST(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "inventory.edit")
    const parsed = requestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: { code: "invalid_request", message: "Valid waste quantities and reasons are required." } }, { status: 400 })
    await assertStoreAccess(principal, parsed.data.storeId)

    const FieldValue = await adminFieldValue()
    const inventory = orgCollection(principal, firestoreCollections.inventory)
    const waste = orgCollection(principal, firestoreCollections.waste)
    const history = orgCollection(principal, firestoreCollections.history)
    const wasteIds = await principal.db.runTransaction(async (transaction) => {
      const refs = parsed.data.lines.map((line) => inventory.doc(line.itemId))
      const snapshots = await Promise.all(refs.map((reference) => transaction.get(reference)))
      const ids: string[] = []

      parsed.data.lines.forEach((line, index) => {
        const snapshot = snapshots[index]
        if (!snapshot.exists) throw new Error(`Inventory item ${line.itemId} was not found.`)
        const current = snapshot.data() ?? {}
        if (current.storeId && current.storeId !== parsed.data.storeId) throw new Error("An item belongs to a different store.")
        const frontStock = Math.max(0, Number(current.frontStock ?? 0) - (line.area === "front" ? line.quantity : 0))
        const backStock = Math.max(0, Number(current.backStock ?? 0) - (line.area === "back" ? line.quantity : 0))
        if (line.quantity > Number(current[line.area === "front" ? "frontStock" : "backStock"] ?? 0)) throw new Error("Waste quantity is greater than available stock.")
        transaction.update(snapshot.ref, {
          frontStock,
          backStock,
          onHand: frontStock + backStock,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: principal.uid
        })
        const wasteRef = waste.doc()
        ids.push(wasteRef.id)
        transaction.set(wasteRef, {
          id: wasteRef.id,
          itemId: snapshot.id,
          itemName: String(current.name ?? "Inventory item"),
          storeId: parsed.data.storeId,
          quantity: line.quantity,
          unit: String(current.unit ?? "eaches"),
          area: line.area,
          reason: line.reason,
          userId: principal.uid,
          createdAt: FieldValue.serverTimestamp()
        })
      })

      const historyRef = history.doc()
      transaction.set(historyRef, {
        id: historyRef.id,
        type: "waste",
        label: "Waste",
        storeId: parsed.data.storeId,
        userId: principal.uid,
        userName: String(principal.member.name ?? principal.email),
        employeeId: String(principal.member.employeeId ?? ""),
        department: String(principal.member.department ?? ""),
        title: String(principal.member.jobTitle ?? principal.member.role ?? ""),
        summary: `${parsed.data.lines.length} waste entr${parsed.data.lines.length === 1 ? "y" : "ies"} recorded`,
        createdAt: FieldValue.serverTimestamp()
      })
      return ids
    })

    return Response.json(mobileEnvelope({ wasteIds }))
  } catch (error) {
    return mobileError(error)
  }
}
