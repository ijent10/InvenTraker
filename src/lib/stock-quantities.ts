export const STOCK_QUANTITY_DECIMALS = 3

export type StockState = {
  frontStock: number
  backStock: number
  onHand: number
  revision: number
}

export function normalizeStockQuantity(value: unknown) {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new RangeError("Stock quantities must be finite positive numbers or zero.")
  }
  const factor = 10 ** STOCK_QUANTITY_DECIMALS
  return Math.round(parsed * factor) / factor
}

export function canonicalStockQuantity(quantity: number, unitsPerContainer = 1) {
  if (unitsPerContainer <= 0) throw new RangeError("Units per container must be greater than zero.")
  return normalizeStockQuantity(quantity * normalizeStockQuantity(unitsPerContainer))
}

export function stockState(record: Record<string, unknown>): StockState {
  const frontStock = normalizeStockQuantity(record.frontStock)
  const backStock = normalizeStockQuantity(record.backStock)
  return {
    frontStock,
    backStock,
    onHand: normalizeStockQuantity(frontStock + backStock),
    revision: Math.max(0, Math.trunc(normalizeStockQuantity(record.revision)))
  }
}

export function nextStockState(before: StockState, frontStock: number, backStock: number): StockState {
  const normalizedFrontStock = normalizeStockQuantity(frontStock)
  const normalizedBackStock = normalizeStockQuantity(backStock)
  return {
    frontStock: normalizedFrontStock,
    backStock: normalizedBackStock,
    onHand: normalizeStockQuantity(normalizedFrontStock + normalizedBackStock),
    revision: before.revision + 1
  }
}

export function derivedStockStatus(record: Record<string, unknown>, state: StockState, reorderPoint = Number(record.reorderPoint ?? 0)) {
  if (String(record.status) === "Archived") return "Archived"
  return state.onHand <= normalizeStockQuantity(reorderPoint) ? "Low" : "Active"
}
