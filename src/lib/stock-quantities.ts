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
  function savedQuantity(value: unknown) {
    const quantity = value ?? 0
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0 || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) >= 0.000001) throw new RangeError("Saved stock must use canonical nonnegative quantities.")
    return quantity
  }
  const frontStock = savedQuantity(record.frontStock), backStock = savedQuantity(record.backStock)
  const onHand = normalizeStockQuantity(frontStock + backStock), revision = record.revision ?? 0
  if (record.onHand !== undefined && Math.abs(savedQuantity(record.onHand) - onHand) > 0.0000001) throw new RangeError("Saved stock total does not match its stock areas.")
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) throw new RangeError("Saved stock revision is invalid.")
  return { frontStock, backStock, onHand, revision }
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
