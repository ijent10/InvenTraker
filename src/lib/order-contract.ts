import type { OrderLine } from "./demo-data.ts"
import { normalizeStockQuantity } from "./stock-quantities.ts"

export const ORDER_STATUSES = ["Draft", "Needs review", "Approved", "Submitted", "Partially received", "Received", "Reconciled", "Cancelled"] as const
export type OrderStatus = typeof ORDER_STATUSES[number]

export function money(value: unknown) {
  const amount = typeof value === "number" ? value : Number(String(value ?? "0").replace(/[^0-9.-]/g, ""))
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0
}

export function orderLineTotal(line: Partial<OrderLine>) {
  return money(line.unitCostAmount ?? line.unitCost) * Math.max(0, Number(line.finalQuantity ?? line.quantity ?? 0))
}

export function calculateOrderTotal(lines: Array<Partial<OrderLine>>) {
  return Math.round(lines.reduce((total, line) => total + orderLineTotal(line), 0) * 100) / 100
}

export function validateOrderLines(lines: Array<Partial<OrderLine>>) {
  if (!lines.length) throw new Error("Add at least one vendor item before saving the order.")
  for (const line of lines) {
    const quantity = Number(line.finalQuantity ?? line.quantity ?? 0)
    if (!line.id || !line.itemName || !line.sku || !line.vendorOffered || !Number.isFinite(quantity) || quantity < 0) {
      throw new Error("Every order line must be a valid vendor-offered item with a non-negative quantity.")
    }
    const suggested = Number(line.suggestedQuantity ?? line.aiRecommendedQuantity ?? quantity)
    if (quantity !== suggested && !String(line.overrideReason ?? "").trim()) {
      throw new Error(`Explain the quantity override for ${line.itemName}.`)
    }
  }
}

export function assertOrderTransition(from: string, to: OrderStatus) {
  const allowed: Record<string, OrderStatus[]> = {
    Draft: ["Approved", "Cancelled"],
    "Needs review": ["Approved", "Cancelled"],
    Approved: ["Submitted", "Cancelled"],
    Submitted: ["Partially received", "Received", "Cancelled"],
    "Partially received": ["Partially received", "Received", "Cancelled"],
    Received: ["Reconciled"],
    Reconciled: [],
    Cancelled: []
  }
  if (!(allowed[from] ?? []).includes(to)) throw new Error(`Order cannot move from ${from} to ${to}.`)
}

export function applyOrderReceipt(
  lines: Array<Record<string, unknown>>,
  orderLineId: string,
  itemId: string,
  receivedOrderQuantity: number
) {
  const line = lines.find((entry) => entry.id === orderLineId)
  if (!line || String(line.itemId ?? "") !== itemId) throw new Error("The selected order line does not match this inventory item.")
  if (!Number.isFinite(receivedOrderQuantity) || receivedOrderQuantity <= 0) throw new Error("Received order quantity must be positive.")
  const pack = Number(line.stockUnitsPerOrderUnit ?? 1)
  if (!Number.isFinite(pack) || pack < 1) throw new Error("The order has invalid quantities or pack sizes.")
  return applyStockOrderReceipt(lines, orderLineId, itemId, normalizeStockQuantity(receivedOrderQuantity * pack), receivedOrderQuantity)
}

/** Receive canonical stock units without rounding fractional cases on every delivery. */
export function applyStockOrderReceipt(lines: Array<Record<string, unknown>>, orderLineId: string, itemId: string, stockQuantity: number, explicitOrderQuantity?: number) {
  const nextLines = lines.map((line) => ({ ...line }))
  const matches = nextLines.filter((line) => line.id === orderLineId)
  if (matches.length !== 1 || String(matches[0].itemId ?? "") !== itemId) throw new Error("The selected order line does not match this inventory item.")
  const amounts = (line: Record<string, unknown>) => {
    const pack = Number(line.stockUnitsPerOrderUnit ?? 1)
    const ordered = Number(line.finalQuantity ?? line.quantity ?? 0)
    const received = Number(line.receivedQuantity ?? 0)
    const previousStock = line.receivedStockQuantity == null ? received * pack : Number(line.receivedStockQuantity)
    if (![pack, ordered, received, previousStock, ordered * pack].every(Number.isFinite) || pack < 1 || ordered < 0 || received < 0 || previousStock < 0) throw new Error("The order has invalid quantities or pack sizes.")
    if (line.receivedStockQuantity != null && normalizeStockQuantity(received * pack) !== normalizeStockQuantity(previousStock)) throw new Error("The order has inconsistent received quantities.")
    return { pack, orderedStock: normalizeStockQuantity(ordered * pack), receivedStock: normalizeStockQuantity(previousStock) }
  }
  if (!Number.isFinite(stockQuantity) || stockQuantity <= 0) throw new Error("Received stock quantity must be positive.")
  if (normalizeStockQuantity(stockQuantity) === 0 || Math.abs(normalizeStockQuantity(stockQuantity) - stockQuantity) > 0.000000001) throw new Error("Received stock quantity must use three decimal places.")
  const line = matches[0]
  const before = amounts(line)
  if (explicitOrderQuantity !== undefined && (!Number.isFinite(explicitOrderQuantity) || explicitOrderQuantity <= 0 || normalizeStockQuantity(explicitOrderQuantity * before.pack) !== stockQuantity)) throw new Error("Order units do not match the received stock quantity.")
  const receivedStock = normalizeStockQuantity(before.receivedStock + stockQuantity)
  if (receivedStock > before.orderedStock) throw new Error("Received quantity is greater than the order line's outstanding quantity.")
  line.receivedStockQuantity = receivedStock
  line.receivedQuantity = receivedStock / before.pack
  const complete = nextLines.every((entry) => { const value = amounts(entry); return value.receivedStock >= value.orderedStock })
  return { lines: nextLines, status: complete ? "Received" as const : "Partially received" as const, receivedOrderQuantity: stockQuantity / before.pack }
}
