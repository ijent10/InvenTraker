import { z } from "zod"

import { adminFieldValue } from "@/lib/firebase-admin"
import { firestoreCollections } from "@/lib/firestore-schema"
import { calculateOrderTotal, money, validateOrderLines } from "@/lib/order-contract"
import { assertStoreAccess, MobileApiError, mobileEnvelope, mobileError, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"
import { operationIdSchema } from "@/lib/stock-operations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const lineSchema = z.object({
  id: z.string().min(1), itemId: z.string().min(1), itemName: z.string().min(1), sku: z.string().min(1),
  unit: z.string().min(1), orderUnit: z.string().min(1), stockUnitsPerOrderUnit: z.number().positive(),
  unitCostAmount: z.number().min(0), vendorOffered: z.boolean(), suggestedQuantity: z.number().min(0),
  finalQuantity: z.number().min(0), overrideReason: z.string().nullable().optional(), calculation: z.string().optional(),
  sourceRefs: z.array(z.string()).optional(), dataFreshness: z.string().nullable().optional(), degradedFlags: z.array(z.string()).optional(),
  usableOnHand: z.number().optional(), physicalOnHand: z.number().optional(), expiredQuantity: z.number().optional(),
  unknownExpirationQuantity: z.number().optional(), confirmedIncoming: z.number().optional(), projectedDemand: z.number().optional(),
  targetEndingStock: z.number().optional()
})
const requestSchema = z.object({
  operationId: operationIdSchema,
  storeId: z.string().min(1),
  vendorId: z.string().min(1),
  lines: z.array(lineSchema),
  recommendation: z.record(z.unknown()),
  notes: z.string().max(2000).optional(),
  dueAt: z.string().optional(),
  expectedArrival: z.string().optional()
})

export async function PUT(request: Request, { params }: { params: { orderId: string } }) {
  try {
    const principal = await requireMobilePrincipal(request, "orders.create")
    const parsed = requestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: { code: "invalid_request", message: parsed.error.issues[0]?.message ?? "Valid order details are required." } }, { status: 400 })
    await assertStoreAccess(principal, parsed.data.storeId)
    validateOrderLines(parsed.data.lines)
    const FieldValue = await adminFieldValue()
    const orders = orgCollection(principal, firestoreCollections.orders)
    const vendors = orgCollection(principal, firestoreCollections.vendors)
    const operations = orgCollection(principal, firestoreCollections.orderOperations)
    const result = await principal.db.runTransaction(async (transaction) => {
      const operationRef = operations.doc(parsed.data.operationId)
      const [existingOperation, existingOrder, vendorSnapshot] = await Promise.all([
        transaction.get(operationRef), transaction.get(orders.doc(params.orderId)), transaction.get(vendors.doc(parsed.data.vendorId))
      ])
      if (existingOperation.exists) return existingOperation.data()?.result
      if (!vendorSnapshot.exists) throw new MobileApiError("Vendor was not found.", 404, "vendor_not_found")
      const previous = existingOrder.data() ?? {}
      if (existingOrder.exists && !["Draft", "Needs review"].includes(String(previous.status))) {
        throw new MobileApiError("Only an unapproved draft can be edited.", 409, "order_locked")
      }
      const vendor = vendorSnapshot.data() ?? {}
      const catalog = new Set(Array.isArray(vendor.catalog) ? vendor.catalog.map((entry) => String(entry).toLowerCase()) : [])
      if (catalog.size && parsed.data.lines.some((line) => !catalog.has(line.sku.toLowerCase()))) {
        throw new MobileApiError("The order contains an item outside this vendor's catalog.", 400, "vendor_item_unavailable")
      }
      const totalAmount = calculateOrderTotal(parsed.data.lines)
      const minimumAmount = money(vendor.minimumAmount ?? vendor.minimum)
      const status = totalAmount >= minimumAmount ? "Draft" : "Needs review"
      const lines = parsed.data.lines.map((line) => ({
        ...line,
        quantity: line.finalQuantity,
        aiRecommendedQuantity: line.suggestedQuantity,
        unitCost: `$${line.unitCostAmount.toFixed(2)}`,
        receivedQuantity: 0,
        reason: line.calculation ?? "Server recommendation",
        lineTotalAmount: Math.round(line.finalQuantity * line.unitCostAmount * 100) / 100
      }))
      const record = {
        id: params.orderId,
        storeId: parsed.data.storeId,
        vendorId: vendorSnapshot.id,
        vendor: String(vendor.name ?? "Vendor"),
        lines,
        items: lines.length,
        totalAmount,
        estimatedTotal: `$${totalAmount.toFixed(2)}`,
        minimumAmount,
        minimum: `$${minimumAmount.toFixed(2)}`,
        minimumGapAmount: Math.max(0, minimumAmount - totalAmount),
        status,
        notes: parsed.data.notes ?? "",
        dueAt: parsed.data.dueAt ?? vendor.orderDueAt ?? "",
        dueBy: parsed.data.dueAt ?? vendor.orderDueAt ?? "Not scheduled",
        expectedArrival: parsed.data.expectedArrival ?? vendor.expectedArrival ?? "",
        recommendation: parsed.data.recommendation,
        createdAt: existingOrder.exists ? previous.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
        createdByUid: previous.createdByUid ?? principal.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: principal.uid
      }
      transaction.set(orders.doc(params.orderId), record)
      const result = { order: record }
      transaction.create(operationRef, {
        id: parsed.data.operationId, operationId: parsed.data.operationId, operationType: "order_draft_saved",
        orderId: params.orderId, storeId: parsed.data.storeId, actor: { uid: principal.uid, name: String(principal.member.name ?? principal.email) },
        result, createdAt: FieldValue.serverTimestamp()
      })
      return result
    })
    return Response.json(mobileEnvelope(result))
  } catch (error) {
    return mobileError(error)
  }
}
