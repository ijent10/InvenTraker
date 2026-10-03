import { z } from "zod"

import type { MobilePrincipal } from "@/lib/mobile-api"
import { MobileApiError } from "@/lib/mobile-api"
export {
  STOCK_QUANTITY_DECIMALS,
  canonicalStockQuantity,
  derivedStockStatus,
  nextStockState,
  normalizeStockQuantity,
  stockState,
  type StockState
} from "@/lib/stock-quantities"
import type { StockState } from "@/lib/stock-quantities"

export const operationIdSchema = z.string().uuid()

export type StockChange = {
  itemId: string
  itemName: string
  unit: string
  before: StockState
  after: StockState
  delta: {
    frontStock: number
    backStock: number
    onHand: number
  }
  reason?: string
  sourceArea?: "front" | "back"
  destinationArea?: "front" | "back"
  expirationDate?: string | null
}

export type ParChange = {
  itemId: string
  itemName: string
  unit: string
  before: { par: number; reorderPoint: number; revision: number }
  after: { par: number; reorderPoint: number; revision: number }
  reason: string
}

export type InventoryOperationChange = StockChange | ParChange
export type InventoryOperationType = "spot_check" | "restock" | "waste" | "receive" | "transfer" | "portion" | "par_change"
export type InventoryOperationSource = "web" | "mobile_api"

export function stockOperationSource(request: Request): InventoryOperationSource {
  return request.headers.get("x-inventracker-client") === "web" ? "web" : "mobile_api"
}

export function stockChange(
  itemId: string,
  itemName: string,
  before: StockState,
  after: StockState,
  details: Omit<StockChange, "itemId" | "itemName" | "before" | "after" | "delta">
): StockChange {
  return {
    itemId,
    itemName,
    before,
    after,
    delta: {
      frontStock: after.frontStock - before.frontStock,
      backStock: after.backStock - before.backStock,
      onHand: after.onHand - before.onHand
    },
    ...details
  }
}

export function assertInventoryItemStore(record: Record<string, unknown>, storeId: string) {
  if (String(record.storeId ?? "").trim() !== storeId) {
    throw new MobileApiError("This inventory item is not assigned to the selected store.", 403, "store_access_denied")
  }
}

export function assertUniqueItemLines(lines: Array<{ itemId: string }>) {
  const ids = new Set<string>()
  for (const line of lines) {
    if (ids.has(line.itemId)) {
      throw new MobileApiError("Each inventory item can appear only once in an operation.", 400, "duplicate_item")
    }
    ids.add(line.itemId)
  }
}

export function replayStockOperation<T>(
  data: Record<string, unknown> | undefined,
  principal: MobilePrincipal,
  operationType: InventoryOperationType,
  storeId: string
) {
  if (!data) return undefined
  const actor = data.actor && typeof data.actor === "object" ? data.actor as Record<string, unknown> : {}
  if (data.operationType !== operationType || data.storeId !== storeId || actor.uid !== principal.uid) {
    throw new MobileApiError("This operation ID was already used for a different stock change.", 409, "operation_conflict")
  }
  return data.result as T
}

export function stockOperationRecord({
  principal,
  operationId,
  operationType,
  storeId,
  changes,
  result,
  timestamp,
  source = "mobile_api"
}: {
  principal: MobilePrincipal
  operationId: string
  operationType: InventoryOperationType
  storeId: string
  changes: InventoryOperationChange[]
  result: unknown
  timestamp: unknown
  source?: InventoryOperationSource
}) {
  return {
    id: operationId,
    operationId,
    operationType,
    storeId,
    actor: {
      uid: principal.uid,
      email: principal.email,
      name: String(principal.member.name ?? principal.email),
      employeeId: String(principal.member.employeeId ?? ""),
      department: String(principal.member.department ?? ""),
      title: String(principal.member.jobTitle ?? principal.member.role ?? "")
    },
    changes,
    result,
    source,
    quantityBasis: operationType === "spot_check" ? "observed" : operationType === "par_change" ? "policy" : "transactional",
    schemaVersion: 1,
    createdAt: timestamp
  }
}
