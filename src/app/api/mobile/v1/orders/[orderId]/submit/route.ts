import { adminFieldValue } from "@/lib/firebase-admin"
import { firestoreCollections } from "@/lib/firestore-schema"
import { assertStoreAccess, MobileApiError, mobileEnvelope, mobileError, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function currency(value: unknown) {
  const amount = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""))
  return Number.isFinite(amount) ? amount : 0
}

export async function POST(request: Request, { params }: { params: { orderId: string } }) {
  try {
    const principal = await requireMobilePrincipal(request, "orders.approve")
    const FieldValue = await adminFieldValue()
    const orders = orgCollection(principal, firestoreCollections.orders)
    const history = orgCollection(principal, firestoreCollections.history)
    const accessSnapshot = await orders.doc(params.orderId).get()
    if (!accessSnapshot.exists) throw new MobileApiError("Order was not found.", 404, "order_not_found")
    await assertStoreAccess(principal, String(accessSnapshot.data()?.storeId ?? "") || undefined)
    const result = await principal.db.runTransaction(async (transaction) => {
      const orderRef = orders.doc(params.orderId)
      const snapshot = await transaction.get(orderRef)
      if (!snapshot.exists) throw new Error("Order was not found.")
      const order = snapshot.data() ?? {}
      const storeId = String(order.storeId ?? "") || undefined
      if (["Submitted", "Auto-submitted"].includes(String(order.status))) return { alreadySubmitted: true, order: { id: snapshot.id, ...order } }
      const lines = Array.isArray(order.lines) ? order.lines : []
      if (!lines.length || lines.some((line) => !line.vendorOffered)) throw new Error("The order contains unavailable vendor items.")
      if (currency(order.estimatedTotal) < currency(order.minimum)) throw new Error("The vendor minimum has not been reached.")

      transaction.update(orderRef, {
        status: "Submitted",
        submittedAt: FieldValue.serverTimestamp(),
        submittedBy: String(principal.member.name ?? principal.email),
        submittedByUid: principal.uid,
        updatedAt: FieldValue.serverTimestamp()
      })
      const historyRef = history.doc()
      transaction.set(historyRef, {
        id: historyRef.id,
        type: "orders",
        label: "Order submitted",
        storeId: storeId ?? "",
        orderId: snapshot.id,
        userId: principal.uid,
        userName: String(principal.member.name ?? principal.email),
        employeeId: String(principal.member.employeeId ?? ""),
        department: String(principal.member.department ?? ""),
        title: String(principal.member.jobTitle ?? principal.member.role ?? ""),
        summary: `${String(order.vendor ?? "Vendor")} order submitted for ${String(order.estimatedTotal ?? "")}`,
        createdAt: FieldValue.serverTimestamp()
      })
      return {
        alreadySubmitted: false,
        order: { ...order, id: snapshot.id, status: "Submitted", submittedBy: String(principal.member.name ?? principal.email) }
      }
    })
    return Response.json(mobileEnvelope(result))
  } catch (error) {
    return mobileError(error)
  }
}
