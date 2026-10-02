export type AllocatableBatch = {
  id: string
  remainingQuantity: number
  expirationDate?: string | null
  receivedAt?: string | null
}

function normalizeStockQuantity(value: number) {
  const factor = 1000
  return Math.round(value * factor) / factor
}

export type BatchAllocation = {
  batchId: string
  quantity: number
  remainingQuantity: number
}

export type BatchAvailabilitySummary = {
  totalPhysical: number
  usableDated: number
  expired: number
  unknownExpiration: number
  expiringBeforeDelivery: number
}

function allocationOrder(left: AllocatableBatch, right: AllocatableBatch, preferredBatchId?: string) {
  if (preferredBatchId) {
    if (left.id === preferredBatchId && right.id !== preferredBatchId) return -1
    if (right.id === preferredBatchId && left.id !== preferredBatchId) return 1
  }
  const leftExpiration = left.expirationDate || "9999-12-31"
  const rightExpiration = right.expirationDate || "9999-12-31"
  return leftExpiration.localeCompare(rightExpiration) || String(left.receivedAt ?? "").localeCompare(String(right.receivedAt ?? "")) || left.id.localeCompare(right.id)
}

export function allocateBatches(batches: AllocatableBatch[], requestedQuantity: number, preferredBatchId?: string) {
  let outstanding = normalizeStockQuantity(requestedQuantity)
  const allocations: BatchAllocation[] = []

  for (const batch of [...batches].sort((left, right) => allocationOrder(left, right, preferredBatchId))) {
    if (outstanding <= 0) break
    const available = normalizeStockQuantity(batch.remainingQuantity)
    if (available <= 0) continue
    const quantity = Math.min(available, outstanding)
    allocations.push({
      batchId: batch.id,
      quantity,
      remainingQuantity: normalizeStockQuantity(available - quantity)
    })
    outstanding = normalizeStockQuantity(outstanding - quantity)
  }

  return { allocations, unallocatedQuantity: outstanding }
}

export function reconcileBatchTotal(batches: AllocatableBatch[], countedQuantity: number) {
  const knownQuantity = normalizeStockQuantity(batches.reduce((total, batch) => total + batch.remainingQuantity, 0))
  const targetQuantity = normalizeStockQuantity(countedQuantity)
  if (targetQuantity >= knownQuantity) {
    return {
      allocations: [] as BatchAllocation[],
      addedUnknownQuantity: normalizeStockQuantity(targetQuantity - knownQuantity),
      previousKnownQuantity: knownQuantity
    }
  }
  const reduction = allocateBatches(batches, knownQuantity - targetQuantity)
  return {
    allocations: reduction.allocations,
    addedUnknownQuantity: 0,
    previousKnownQuantity: knownQuantity
  }
}

export function summarizeBatchAvailability(
  batches: AllocatableBatch[],
  now: string,
  nextDelivery?: string | null
): BatchAvailabilitySummary {
  const day = (value: string) => {
    const isoDay = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0]
    if (isoDay) return isoDay
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10)
  }
  const nowDay = day(now) ?? now
  const deliveryDay = nextDelivery ? day(nextDelivery) : null
  return batches.reduce<BatchAvailabilitySummary>((summary, batch) => {
    const quantity = normalizeStockQuantity(batch.remainingQuantity)
    summary.totalPhysical = normalizeStockQuantity(summary.totalPhysical + quantity)
    if (!batch.expirationDate) {
      summary.unknownExpiration = normalizeStockQuantity(summary.unknownExpiration + quantity)
    } else if ((day(batch.expirationDate) ?? batch.expirationDate) < nowDay) {
      summary.expired = normalizeStockQuantity(summary.expired + quantity)
    } else {
      summary.usableDated = normalizeStockQuantity(summary.usableDated + quantity)
      if (deliveryDay && (day(batch.expirationDate) ?? batch.expirationDate) <= deliveryDay) {
        summary.expiringBeforeDelivery = normalizeStockQuantity(summary.expiringBeforeDelivery + quantity)
      }
    }
    return summary
  }, { totalPhysical: 0, usableDated: 0, expired: 0, unknownExpiration: 0, expiringBeforeDelivery: 0 })
}
