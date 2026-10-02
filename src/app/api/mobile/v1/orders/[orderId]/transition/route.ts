import { z } from "zod"

import { adminFieldValue } from "@/lib/firebase-admin"
import { firestoreCollections } from "@/lib/firestore-schema"
import { assertOrderTransition, type OrderStatus } from "@/lib/order-contract"
import { assertStoreAccess, MobileApiError, mobileEnvelope, mobileError, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"
import { operationIdSchema } from "@/lib/stock-operations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  operationId: operationIdSchema,
  storeId: z.string().min(1),
  action: z.enum(["approve", "submit", "reconcile", "cancel"]),
  reason: z.string().max(1000).optional(),
  sentMethod: z.enum(["recorded", "email", "edi", "portal"]).optional()
})

const destination: Record<string, OrderStatus> = { approve: "Approved", submit: "Submitted", reconcile: "Reconciled", cancel: "Cancelled" }

export async function POST(request: Request, { params }: { params: { orderId: string } }) {
  try {
    const principal = await requireMobilePrincipal(request, "orders.approve")
    const parsed = requestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message ?? "Valid order action is required." } }, { status: 400 })
    await assertStoreAccess(principal, parsed.data.storeId)
    const FieldValue = await adminFieldValue()
    const orders = orgCollection(principal, firestoreCollections.orders)
    const operations = orgCollection(principal, firestoreCollections.orderOperations)
    const history = orgCollection(principal, firestoreCollections.history)
    const result = await principal.db.runTransaction(async (transaction) => {
      const operationRef = operations.doc(parsed.data.operationId)
      const orderRef = orders.doc(params.orderId)
      const [existingOperation, orderSnapshot] = await Promise.all([transaction.get(operationRef), transaction.get(orderRef)])
      if (existingOperation.exists) return existingOperation.data()?.result
      if (!orderSnapshot.exists) throw new MobileApiError("Order was not found.", 404, "order_not_found")
      const order = orderSnapshot.data() ?? {}
      if (String(order.storeId ?? "") !== parsed.data.storeId) throw new MobileApiError("Order belongs to another store.", 403, "store_access_denied")
      const storedStatus = String(order.status ?? "Draft")
      const from = storedStatus === "Ready" ? "Draft" : storedStatus
      const to = destination[parsed.data.action]
      try { assertOrderTransition(from, to) } catch (error) { throw new MobileApiError(error instanceof Error ? error.message : "Invalid order transition.", 409, "invalid_order_transition") }
      if (parsed.data.action === "approve" && Number(order.minimumGapAmount ?? 0) > 0 && !parsed.data.reason?.trim()) {
        throw new MobileApiError("Explain why this below-minimum order should be approved.", 400, "minimum_override_reason_required")
      }
      if (parsed.data.action === "submit" && !parsed.data.sentMethod) {
        throw new MobileApiError("Record how the order was sent to the vendor.", 400, "sent_method_required")
      }
      if (parsed.data.action === "reconcile") {
        const lines = Array.isArray(order.lines) ? order.lines : []
        if (lines.some((line) => Number(line.receivedQuantity ?? 0) !== Number(line.finalQuantity ?? line.quantity ?? 0))) {
          throw new MobileApiError("All order lines must be fully received before reconciliation.", 409, "receipt_incomplete")
        }
      }
      const actor = { uid: principal.uid, name: String(principal.member.name ?? principal.email), email: principal.email }
      const changes: Record<string, unknown> = { status: to, updatedAt: FieldValue.serverTimestamp(), updatedByUid: principal.uid }
      if (to === "Approved") Object.assign(changes, { approvedAt: FieldValue.serverTimestamp(), approvedBy: actor.name, approvedByUid: principal.uid, approvalReason: parsed.data.reason ?? null })
      if (to === "Submitted") Object.assign(changes, { submittedAt: FieldValue.serverTimestamp(), submittedBy: actor.name, submittedByUid: principal.uid, sentMethod: parsed.data.sentMethod })
      if (to === "Reconciled") Object.assign(changes, { reconciledAt: FieldValue.serverTimestamp(), reconciledBy: actor.name, reconciledByUid: principal.uid })
      if (to === "Cancelled") Object.assign(changes, { cancelledAt: FieldValue.serverTimestamp(), cancelledBy: actor.name, cancelledByUid: principal.uid, cancellationReason: parsed.data.reason ?? null })
      transaction.update(orderRef, changes)
      const historyRef = history.doc(parsed.data.operationId)
      transaction.set(historyRef, {
        id: historyRef.id, type: "orders", label: `Order ${to.toLowerCase()}`, orderId: params.orderId,
        storeId: parsed.data.storeId, userId: principal.uid, userName: actor.name,
        summary: `${String(order.vendor ?? "Vendor")} order moved from ${storedStatus} to ${to}.`, responses: parsed.data.reason ? [{ label: "Reason", value: parsed.data.reason }] : [],
        createdAt: FieldValue.serverTimestamp()
      })
      const result = { orderId: params.orderId, previousStatus: storedStatus, status: to, sentMethod: parsed.data.sentMethod ?? null }
      transaction.create(operationRef, {
        id: parsed.data.operationId, operationId: parsed.data.operationId, operationType: `order_${parsed.data.action}`,
        orderId: params.orderId, storeId: parsed.data.storeId, actor, result, createdAt: FieldValue.serverTimestamp()
      })
      return result
    })
    return Response.json(mobileEnvelope(result))
  } catch (error) {
    return mobileError(error)
  }
}
