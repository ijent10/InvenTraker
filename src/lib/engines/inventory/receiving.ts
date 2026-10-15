import { createHash } from "node:crypto"
import { z } from "zod"
import { applyStockOrderReceipt } from "../../order-contract.ts"
import { derivedStockStatus, nextStockState, normalizeStockQuantity, stockState } from "../../stock-quantities.ts"
import { engineCommandSchema, engineDocumentIdSchema, engineResultSchema, EngineError, type EnginePrincipal } from "../contracts.ts"
import type { InventoryRecord } from "./transfer.ts"

const quantitySchema = z.number().finite().positive().max(1_000_000_000).refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001, "Use at most three decimal places for stock quantities.").transform(normalizeStockQuantity).refine((value) => value > 0, "Receive at least 0.001 units.")
export const receivingLineObjectSchema = z.object({ itemId: engineDocumentIdSchema, quantity: quantitySchema, expirationDate: z.string().datetime().optional(), orderId: engineDocumentIdSchema.optional(), orderLineId: engineDocumentIdSchema.optional(), receivedOrderQuantity: z.number().finite().positive().optional() }).strict()
export const receivingPayloadSchema = z.object({ lines: z.array(receivingLineObjectSchema).min(1).max(159) }).strict().superRefine((value, context) => {
  if (new Set(value.lines.map((line) => line.itemId)).size !== value.lines.length) context.addIssue({ code: "custom", message: "Each inventory item can appear only once in an operation." })
  for (const line of value.lines) if (Boolean(line.orderId) !== Boolean(line.orderLineId) || (line.receivedOrderQuantity !== undefined && !line.orderId)) context.addIssue({ code: "custom", message: "Order and order line must be provided together for order quantities." })
})
export const receivingRequestSchema = z.object({ commandId: z.string().uuid(), locationId: engineDocumentIdSchema, payload: receivingPayloadSchema }).strict()
export const receivingCommandSchema = engineCommandSchema.extend({ payload: receivingPayloadSchema })
export const receivingResultSchema = z.object({ receivedIds: z.array(engineDocumentIdSchema).min(1) }).strict()
export const receivingResponseSchema = engineResultSchema(receivingResultSchema)
export type ReceivingCommand = z.infer<typeof receivingCommandSchema>
export type ReceivingResponse = z.infer<typeof receivingResponseSchema>
export type ReceivingPlan = ReturnType<typeof planReceiving>
export type ReceivingRepository = { runTransaction<T>(work: (transaction: {
  readOperation(id: string): Promise<Record<string, unknown> | undefined>
  readItems(ids: string[]): Promise<InventoryRecord[]>
  readOrders(ids: string[]): Promise<InventoryRecord[]>
  readReceipts(ids: string[]): Promise<InventoryRecord[]>
  write(command: ReceivingCommand, plan: ReceivingPlan, response: ReceivingResponse, fingerprint: string): void
}) => Promise<T>): Promise<T> }

export function receivingFingerprint(command: ReceivingCommand) {
  const lines = [...command.payload.lines].sort((a, b) => a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0).map((line) => ({ itemId: line.itemId, quantity: line.quantity, expirationDate: line.expirationDate ?? null, orderId: line.orderId ?? null, orderLineId: line.orderLineId ?? null, receivedOrderQuantity: line.receivedOrderQuantity ?? null }))
  return createHash("sha256").update(JSON.stringify({ operationType: "receive", storeId: command.locationId, lines })).digest("hex")
}

export function planReceiving(command: ReceivingCommand, items: InventoryRecord[], orders: InventoryRecord[]) {
  const orderUpdates = new Map<string, { id: string; lines: Record<string, unknown>[]; status: "Received" | "Partially received" }>()
  for (const id of new Set(command.payload.lines.flatMap((line) => line.orderId ? [line.orderId] : []))) {
    const order = orders.find((entry) => entry.id === id)
    if (!order) throw new EngineError(`Linked order ${id} was not found.`, 404, "order_not_found")
    if (order.storeId !== command.locationId) throw new EngineError("A linked order belongs to another store.", 403, "store_access_denied")
    if (!["Submitted", "Auto-submitted", "Partially received"].includes(String(order.status))) throw new EngineError("Only submitted orders can be received.", 409, "order_not_receivable")
    if (!Array.isArray(order.lines) || !order.lines.length || order.lines.some((line) => !line || typeof line !== "object" || Array.isArray(line))) throw new EngineError("The linked order has invalid lines.", 409, "invalid_order")
    orderUpdates.set(id, { id, lines: order.lines.map((line) => ({ ...line })), status: "Partially received" })
  }
  const receipts = command.payload.lines.map((line, index) => {
    const current = items.find((item) => item.id === line.itemId)
    if (!current) throw new EngineError(`Inventory item ${line.itemId} was not found.`, 404, "inventory_not_found")
    if (String(current.storeId ?? "").trim() !== command.locationId) throw new EngineError("This inventory item is not assigned to the selected store.", 403, "store_access_denied")
    let before
    try { before = stockState(current) } catch { throw new EngineError("This item has invalid stock balances. Correct them before receiving.", 409, "invalid_stock_balance") }
    const after = nextStockState(before, before.frontStock, before.backStock + line.quantity)
    if (normalizeStockQuantity(after.onHand - before.onHand) !== line.quantity) throw new EngineError("This item cannot represent the received quantity accurately. Correct its balances before receiving.", 409, "invalid_stock_balance")
    let receivedOrderQuantity: number | null = null
    if (line.orderId && line.orderLineId) {
      const order = orderUpdates.get(line.orderId)!
      try {
        const applied = applyStockOrderReceipt(order.lines, line.orderLineId, line.itemId, line.quantity, line.receivedOrderQuantity)
        order.lines = applied.lines; order.status = applied.status; receivedOrderQuantity = applied.receivedOrderQuantity
      } catch (error) { throw new EngineError(error instanceof Error ? error.message : "The order receipt is invalid.", 409, "invalid_order_receipt") }
    }
    return { id: `${command.commandId}-${index + 1}`, line, current, before, after, status: derivedStockStatus(current, after), expirationDate: current.expires && line.expirationDate ? line.expirationDate : null, receivedOrderQuantity }
  })
  if (3 + receipts.length * 3 + orderUpdates.size > 480) throw new EngineError("This receipt is too large for one save. Receive fewer items at a time.", 400, "receipt_too_large")
  return { receipts, orders: [...orderUpdates.values()] }
}

export async function executeReceiving(input: unknown, principal: EnginePrincipal, repository: ReceivingRepository, authorizeStore: (storeId: string) => Promise<void>, now = () => new Date().toISOString()): Promise<ReceivingResponse> {
  const parsed = receivingCommandSchema.safeParse(input)
  if (!parsed.success) throw new EngineError(parsed.error.issues[0]?.message ?? "Valid received quantities are required.", 400, "invalid_request")
  const command = parsed.data
  if (command.actorId !== principal.uid || command.organizationId !== principal.organizationId) throw new EngineError("The command does not belong to this session.", 403, "command_scope_denied")
  if (!principal.isManager && !principal.permissions.includes("*") && !principal.permissions.includes("inventory.edit")) throw new EngineError("You do not have permission to receive stock.", 403, "permission_denied")
  await authorizeStore(command.locationId)
  const fingerprint = receivingFingerprint(command)
  return repository.runTransaction(async (transaction) => {
    const existing = await transaction.readOperation(command.commandId)
    if (existing) {
      const conflict = () => new EngineError("This operation ID was already used for different receiving details.", 409, "operation_conflict")
      if (existing.operationType !== "receive" || existing.storeId !== command.locationId || (existing.actor as { uid?: string } | undefined)?.uid !== principal.uid) throw conflict()
      if (existing.commandFingerprint || existing.engineResult) {
        if (existing.commandFingerprint !== fingerprint) throw conflict()
        const result = receivingResponseSchema.safeParse({ ...(existing.engineResult as Record<string, unknown>), data: existing.result })
        if (!result.success || result.data.requestId !== command.commandId) throw new EngineError("The saved receiving result could not be verified.", 409, "operation_result_invalid")
        return { ...result.data, replayed: true }
      }
      const result = receivingResultSchema.safeParse(existing.result)
      if (!result.success || result.data.receivedIds.length !== command.payload.lines.length || new Set(result.data.receivedIds).size !== result.data.receivedIds.length) throw conflict()
      const receipts = await transaction.readReceipts(result.data.receivedIds)
      if (receipts.length !== command.payload.lines.length) throw conflict()
      for (const line of command.payload.lines) {
        const record = receipts.find((receipt) => receipt.itemId === line.itemId)
        if (!record || record.storeId !== command.locationId || record.operationId !== command.commandId || record.userId !== principal.uid || record.quantity !== line.quantity || (record.expirationDate ?? null) !== (line.expirationDate ?? null) || (record.orderId ?? null) !== (line.orderId ?? null) || (record.orderLineId ?? null) !== (line.orderLineId ?? null) || (record.receivedOrderQuantity ?? null) !== (line.receivedOrderQuantity ?? null)) throw conflict()
      }
      const committedAt = z.string().datetime().safeParse(existing.createdAt)
      if (!committedAt.success) throw new EngineError("The saved receipt timestamp could not be verified.", 409, "operation_result_invalid")
      return receivingResponseSchema.parse({ requestId: command.commandId, schemaVersion: "1", committedAt: committedAt.data, replayed: true, data: result.data })
    }
    const items = await transaction.readItems(command.payload.lines.map((line) => line.itemId))
    for (const line of command.payload.lines) {
      const item = items.find((entry) => entry.id === line.itemId)
      if (!item) throw new EngineError(`Inventory item ${line.itemId} was not found.`, 404, "inventory_not_found")
      if (String(item.storeId ?? "").trim() !== command.locationId) throw new EngineError("This inventory item is not assigned to the selected store.", 403, "store_access_denied")
    }
    const orders = await transaction.readOrders([...new Set(command.payload.lines.flatMap((line) => line.orderId ? [line.orderId] : []))])
    const plan = planReceiving(command, items, orders)
    const response = receivingResponseSchema.parse({ requestId: command.commandId, schemaVersion: "1", committedAt: now(), replayed: false, data: { receivedIds: plan.receipts.map((receipt) => receipt.id) } })
    transaction.write(command, plan, response, fingerprint)
    return response
  })
}
