import { z } from "zod"
import { engineDocumentIdSchema } from "../contracts.ts"
export const inventoryMovementTypes = { receive: "receipt", transfer: "area_transfer", restock: "restock_reconciliation", waste: "discard", portion: "portion_reclassification", spot_check: "count_adjustment", par_change: "threshold_change" } as const
export type InventoryMovementType = typeof inventoryMovementTypes[keyof typeof inventoryMovementTypes] | "unknown"
export function movementTypeFor(operationType: unknown): InventoryMovementType {
  return typeof operationType === "string" && Object.hasOwn(inventoryMovementTypes, operationType) ? inventoryMovementTypes[operationType as keyof typeof inventoryMovementTypes] : "unknown"
}
const quantity = z.number().finite().nonnegative().refine(value => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.00001)
const stock = z.object({ frontStock: quantity, backStock: quantity, onHand: quantity, revision: z.number().int().safe().nonnegative() }).refine(value => Math.abs(value.frontStock + value.backStock - value.onHand) < 0.0000001)
const policy = z.object({ par: quantity, reorderPoint: quantity, revision: z.number().int().safe().nonnegative() })
const delta = z.object({ frontStock: z.number().finite(), backStock: z.number().finite(), onHand: z.number().finite() })
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
export function projectItemMovement(operationId: string, record: Record<string, unknown>, itemId: string) {
  if (!Array.isArray(record.changes)) return null
  const changes = record.changes.map(object).filter(change => change.itemId === itemId)
  if (!changes.length) return null
  const change = changes[0], type = movementTypeFor(record.operationType), isPolicy = type === "threshold_change"
  const before = (isPolicy ? policy : stock).safeParse(change.before), after = (isPolicy ? policy : stock).safeParse(change.after), parsedDelta = delta.safeParse(change.delta)
  let verified = changes.length === 1 && type !== "unknown" && before.success && after.success && after.data.revision === before.data.revision + 1 && (!record.movementType || record.movementType === type)
  if (!isPolicy) {
    if (!parsedDelta.success || !before.success || !after.success) verified = false
    else {
      const d = parsedDelta.data, b = before.data as Record<string, number>, a = after.data as Record<string, number>
      verified = verified && (["frontStock", "backStock", "onHand"] as const).every(key => Math.abs(d[key] - (a[key] - b[key])) < 0.0000001)
    }
  }
  return { operationId, type, kind: isPolicy ? "policy" as const : type === "unknown" ? "unknown" as const : "physical" as const,
    before: before.success ? before.data : null, after: after.success ? after.data : null,
    delta: !isPolicy && parsedDelta.success ? parsedDelta.data : null,
    unit: typeof change.unit === "string" && change.unit.length <= 40 ? change.unit : null,
    createdAt: typeof record.createdAt === "string" && !Number.isNaN(Date.parse(record.createdAt)) ? record.createdAt : null, verified }
}
export type ItemMovement = NonNullable<ReturnType<typeof projectItemMovement>>
const cursorSchema = z.object({ organizationId: engineDocumentIdSchema, storeId: engineDocumentIdSchema, itemId: engineDocumentIdSchema, revision: z.number().int().safe().nonnegative().nullable(), after: engineDocumentIdSchema }).strict()
export type MovementCursor = z.infer<typeof cursorSchema>
export function encodeMovementCursor(cursor: MovementCursor) { return Buffer.from(JSON.stringify(cursorSchema.parse(cursor))).toString("base64url") }
export function decodeMovementCursor(raw: string, scope: Pick<MovementCursor, "organizationId" | "storeId" | "itemId">) {
  if (raw.length > 1800 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error("Invalid movement cursor.")
  const result = cursorSchema.parse(JSON.parse(Buffer.from(raw, "base64url").toString()))
  if (result.organizationId !== scope.organizationId || result.storeId !== scope.storeId || result.itemId !== scope.itemId) throw new Error("This cursor belongs to a different inventory context.")
  return result
}
