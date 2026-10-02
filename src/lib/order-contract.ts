import type { OrderLine } from "./demo-data.ts"

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
  const nextLines = lines.map((line) => ({ ...line }))
  const line = nextLines.find((candidate) => candidate.id === orderLineId)
  if (!line || String(line.itemId ?? "") !== itemId) throw new Error("The selected order line does not match this inventory item.")
  const ordered = Number(line.finalQuantity ?? line.quantity ?? 0)
  const previouslyReceived = Number(line.receivedQuantity ?? 0)
  if (!Number.isFinite(receivedOrderQuantity) || receivedOrderQuantity <= 0) throw new Error("Received order quantity must be positive.")
  if (previouslyReceived + receivedOrderQuantity > ordered + 0.0001) throw new Error("Received quantity is greater than the order line's outstanding quantity.")
  line.receivedQuantity = Math.round((previouslyReceived + receivedOrderQuantity) * 1000) / 1000
  const complete = nextLines.every((candidate) => Number(candidate.receivedQuantity ?? 0) >= Number(candidate.finalQuantity ?? candidate.quantity ?? 0))
  return { lines: nextLines, status: complete ? "Received" as const : "Partially received" as const }
}
