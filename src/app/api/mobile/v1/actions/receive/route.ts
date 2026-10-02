import { z } from "zod"

import { adminFieldValue } from "@/lib/firebase-admin"
import { firestoreCollections } from "@/lib/firestore-schema"
import { applyOrderReceipt } from "@/lib/order-contract"
import { assertStoreAccess, mobileEnvelope, mobileError, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"
import { assertInventoryItemStore, assertUniqueItemLines, derivedStockStatus, nextStockState, operationIdSchema, replayStockOperation, stockChange, stockOperationRecord, stockOperationSource, stockState, type StockChange } from "@/lib/stock-operations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  operationId: operationIdSchema,
  storeId: z.string().min(1),
  lines: z.array(z.object({
    itemId: z.string().min(1),
    quantity: z.number().positive(),
    expirationDate: z.string().datetime().optional(),
    orderId: z.string().min(1).optional(),
    orderLineId: z.string().min(1).optional(),
    receivedOrderQuantity: z.number().positive().optional()
  }).refine((line) => Boolean(line.orderId) === Boolean(line.orderLineId), {
    message: "Order and order line must be provided together."
  })).min(1)
})

export async function POST(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "inventory.edit")
    const parsed = requestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return Response.json({ error: { code: "invalid_request", message: "Valid received quantities are required." } }, { status: 400 })
    }
    await assertStoreAccess(principal, parsed.data.storeId)
    assertUniqueItemLines(parsed.data.lines)

    const FieldValue = await adminFieldValue()
    const inventory = orgCollection(principal, firestoreCollections.inventory)
    const receiving = orgCollection(principal, firestoreCollections.receiving)
    const batches = orgCollection(principal, firestoreCollections.inventoryBatches)
    const history = orgCollection(principal, firestoreCollections.history)
    const operations = orgCollection(principal, firestoreCollections.stockOperations)
    const orders = orgCollection(principal, firestoreCollections.orders)
    const result = await principal.db.runTransaction(async (transaction) => {
      const operationRef = operations.doc(parsed.data.operationId)
      const existingOperation = await transaction.get(operationRef)
      if (existingOperation.exists) return replayStockOperation<{ receivedIds: string[] }>(existingOperation.data(), principal, "receive", parsed.data.storeId)!

      const refs = parsed.data.lines.map((line) => inventory.doc(line.itemId))
      const snapshots = await Promise.all(refs.map((reference) => transaction.get(reference)))
      const orderIds = [...new Set(parsed.data.lines.flatMap((line) => line.orderId ? [line.orderId] : []))]
      const orderSnapshots = await Promise.all(orderIds.map((orderId) => transaction.get(orders.doc(orderId))))
      const orderUpdates = new Map<string, { snapshot: typeof orderSnapshots[number]; lines: Array<Record<string, unknown>> }>()
      orderSnapshots.forEach((snapshot) => {
        if (!snapshot.exists) throw new Error(`Linked order ${snapshot.id} was not found.`)
        const data = snapshot.data() ?? {}
        if (String(data.storeId ?? "") !== parsed.data.storeId) throw new Error("A linked order belongs to another store.")
        if (!["Submitted", "Auto-submitted", "Partially received"].includes(String(data.status))) throw new Error("Only submitted orders can be received.")
        orderUpdates.set(snapshot.id, { snapshot, lines: Array.isArray(data.lines) ? data.lines.map((line) => ({ ...line })) : [] })
      })
      const receivedIds: string[] = []
      const changes: StockChange[] = []

      parsed.data.lines.forEach((line, index) => {
        const snapshot = snapshots[index]
        if (!snapshot.exists) throw new Error(`Inventory item ${line.itemId} was not found.`)
        const current = snapshot.data() ?? {}
        assertInventoryItemStore(current, parsed.data.storeId)
        const before = stockState(current)
        const after = nextStockState(before, before.frontStock, before.backStock + line.quantity)
        if (line.orderId && line.orderLineId) {
          const linked = orderUpdates.get(line.orderId)!
          const linkedLine = linked.lines.find((candidate) => candidate.id === line.orderLineId)
          const pack = Math.max(1, Number(linkedLine?.stockUnitsPerOrderUnit ?? 1))
          const receivedOrderQuantity = line.receivedOrderQuantity ?? line.quantity / pack
          linked.lines = applyOrderReceipt(linked.lines, line.orderLineId, line.itemId, receivedOrderQuantity).lines
        }
        transaction.update(snapshot.ref, {
          ...after,
          status: derivedStockStatus(current, after),
          lastReceivedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: principal.uid,
          updatedByOperationId: parsed.data.operationId,
          ...(current.expires && line.expirationDate ? { lastReceivedExpiration: line.expirationDate } : {})
        })

        const receivedRef = receiving.doc(`${parsed.data.operationId}-${index + 1}`)
        receivedIds.push(receivedRef.id)
        transaction.set(receivedRef, {
          id: receivedRef.id,
          itemId: snapshot.id,
          itemName: String(current.name ?? "Inventory item"),
          storeId: parsed.data.storeId,
          quantity: line.quantity,
          unit: String(current.unit ?? "eaches"),
          expirationDate: current.expires && line.expirationDate ? line.expirationDate : null,
          operationId: parsed.data.operationId,
          orderId: line.orderId ?? null,
          orderLineId: line.orderLineId ?? null,
          receivedOrderQuantity: line.receivedOrderQuantity ?? null,
          userId: principal.uid,
          createdAt: FieldValue.serverTimestamp()
        })
        const batchRef = batches.doc(`${parsed.data.operationId}-${index + 1}`)
        const expirationDate = current.expires && line.expirationDate ? line.expirationDate : null
        transaction.create(batchRef, {
          id: batchRef.id,
          itemId: snapshot.id,
          itemName: String(current.name ?? "Inventory item"),
          storeId: parsed.data.storeId,
          remainingQuantity: line.quantity,
          originalQuantity: line.quantity,
          unit: String(current.unit ?? "eaches"),
          area: "back",
          receivedAt: FieldValue.serverTimestamp(),
          expirationDate,
          expirationKnown: Boolean(expirationDate),
          openedAt: null,
          preparedAt: null,
          sourceOperationId: parsed.data.operationId,
          sourceReceiptId: receivedRef.id,
          status: "available",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        })
        changes.push(stockChange(snapshot.id, String(current.name ?? "Inventory item"), before, after, {
          unit: String(current.unit ?? "eaches"),
          reason: "Inventory received",
          destinationArea: "back",
          expirationDate: current.expires && line.expirationDate ? line.expirationDate : null
        }))
      })

      orderUpdates.forEach(({ snapshot, lines }) => {
        const complete = lines.every((line) => Number(line.receivedQuantity ?? 0) >= Number(line.finalQuantity ?? line.quantity ?? 0))
        transaction.update(snapshot.ref, {
          lines,
          status: complete ? "Received" : "Partially received",
          lastReceivedAt: FieldValue.serverTimestamp(),
          ...(complete ? { receivedAt: FieldValue.serverTimestamp() } : {}),
          updatedAt: FieldValue.serverTimestamp(),
          updatedByUid: principal.uid
        })
      })

      const historyRef = history.doc(parsed.data.operationId)
      transaction.set(historyRef, {
        id: historyRef.id,
        type: "receiving",
        label: "Receiving",
        operationId: parsed.data.operationId,
        storeId: parsed.data.storeId,
        userId: principal.uid,
        userName: String(principal.member.name ?? principal.email),
        employeeId: String(principal.member.employeeId ?? ""),
        department: String(principal.member.department ?? ""),
        title: String(principal.member.jobTitle ?? principal.member.role ?? ""),
        summary: `${parsed.data.lines.reduce((total, line) => total + line.quantity, 0)} units received`,
        responses: parsed.data.lines.map((line) => ({ label: line.itemId, value: `${line.quantity}` })),
        createdAt: FieldValue.serverTimestamp()
      })

      const operationResult = { receivedIds }
      transaction.create(operationRef, stockOperationRecord({
        principal,
        operationId: parsed.data.operationId,
        operationType: "receive",
        storeId: parsed.data.storeId,
        changes,
        result: operationResult,
        timestamp: FieldValue.serverTimestamp(),
        source: stockOperationSource(request)
      }))
      return operationResult
    })

    return Response.json(mobileEnvelope(result))
  } catch (error) {
    return mobileError(error)
  }
}
