import { createHash } from "node:crypto"
import { z } from "zod"
import { calculateBillingQuantities } from "./quantities.ts"

export const billingTierSchema = z.enum(["builder", "basic", "pro"])
export type BillingTier = z.infer<typeof billingTierSchema>
export const BILLING_CATALOG_VERSION = 1
import { billingPlans } from "./tiers.ts"
export { billingPlans } from "./tiers.ts"
export type BillingUsage = { stores: { id: string }[]; employees: { id: string; storeIds: string[]; primaryStoreId?: string }[] }

export function quoteBilling(tierInput: unknown, usage: BillingUsage) {
  const tierId = billingTierSchema.parse(tierInput)
  const plan = billingPlans[tierId]
  const quantities = calculateBillingQuantities({ allowances: { includedStores: plan.includedStores, includedEmployeesPerStore: plan.includedEmployeesPerStore }, ...usage })
  if (quantities.unassignedEmployees) throw new Error("Assign a primary store to every active employee before starting billing.")
  const storeCents = quantities.additionalStoreQuantity * plan.extraStoreCents
  const employeeCents = quantities.additionalEmployeeQuantity * plan.extraEmployeeCents
  const totalCents = plan.baseCents + storeCents + employeeCents
  if (!Number.isSafeInteger(totalCents)) throw new Error("This billing total cannot be represented safely.")
  const canonical = { version: BILLING_CATALOG_VERSION, tierId, plan, stores: [...usage.stores].sort((a, b) => a.id.localeCompare(b.id)), employees: [...usage.employees].map((employee) => ({ id: employee.id, storeIds: [...employee.storeIds].sort(), primaryStoreId: employee.primaryStoreId ?? null })).sort((a, b) => a.id.localeCompare(b.id)) }
  const fingerprint = createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
  return { tierId, name: plan.name, catalogVersion: BILLING_CATALOG_VERSION, currency: "usd" as const, interval: "month" as const, baseCents: plan.baseCents, extraStoreUnitCents: plan.extraStoreCents, extraEmployeeUnitCents: plan.extraEmployeeCents, storeCents, employeeCents, totalCents, includedStores: plan.includedStores, includedEmployeesPerStore: plan.includedEmployeesPerStore, features: plan.features, quantities, fingerprint, taxIncluded: false }
}

/** Stable active-member snapshot. Owners and pending invitations do not count as employees. */
export function usageFromRecords(stores: (Record<string, unknown> & { id: string })[], members: (Record<string, unknown> & { id: string })[]): BillingUsage {
  const activeStores = stores.filter((store) => store.active !== false && !store.archived && !["archived", "inactive", "deleted", "draft"].includes(String(store.status ?? "active").toLowerCase()))
  const activeIds = new Set(activeStores.map((store) => store.id))
  const employees = members.filter((member) => String(member.status ?? "active").toLowerCase() === "active" && !["owner", "organization owner"].includes(String(member.role ?? member.jobTitle ?? "").toLowerCase())).map((member) => {
    const assignments = [...new Set([...(Array.isArray(member.storeIds) ? member.storeIds.map(String) : []), String(member.storeId ?? ""), String(member.primaryStoreId ?? "")].filter((id) => activeIds.has(id)))]
    const primary = String(member.primaryStoreId ?? member.storeId ?? "").trim() || (assignments.length === 1 ? assignments[0] : undefined)
    if (primary && !activeIds.has(primary)) throw new Error("An employee's primary store is inactive or unavailable. Update the assignment before billing.")
    return { id: member.id, storeIds: assignments, ...(primary ? { primaryStoreId: primary } : {}) }
  })
  return { stores: activeStores.map((store) => ({ id: store.id })), employees }
}
