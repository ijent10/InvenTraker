import { z } from "zod"

const id = z.string().trim().min(1).max(200)
const uniqueIds = z.array(id).max(10_000).refine((values) => new Set(values).size === values.length, "Store assignments must be unique.")
export const billingQuantityInputSchema = z.object({
  allowances: z.object({ includedStores: z.number().int().nonnegative().max(10_000), includedEmployeesPerStore: z.number().int().nonnegative().max(100_000) }).strict(),
  seatPolicy: z.literal("primary_store").default("primary_store"),
  stores: z.array(z.object({ id }).strict()).max(10_000),
  employees: z.array(z.object({ id, storeIds: uniqueIds, primaryStoreId: id.optional() }).strict()).max(100_000)
}).strict().superRefine((input, context) => {
  const stores = new Set(input.stores.map((store) => store.id))
  if (stores.size !== input.stores.length) context.addIssue({ code: "custom", message: "Store records must be unique." })
  if (new Set(input.employees.map((employee) => employee.id)).size !== input.employees.length) context.addIssue({ code: "custom", message: "Employee records must be unique." })
  for (const employee of input.employees) {
    if (employee.storeIds.some((storeId) => !stores.has(storeId))) context.addIssue({ code: "custom", message: "Employee assignments must reference an included store." })
    if (employee.primaryStoreId && !employee.storeIds.includes(employee.primaryStoreId)) context.addIssue({ code: "custom", message: "A primary store must be one of the employee's assignments." })
    if (employee.storeIds.length > 0 && !employee.primaryStoreId) context.addIssue({ code: "custom", message: "Choose a primary store for every assigned employee before calculating primary-store billing." })
  }
})

/** Preview only. Callers must supply a complete, server-authorized snapshot of billable stores/employees. No Stripe calls or prices are configured here. */
export function calculateBillingQuantities(input: unknown) {
  const snapshot = billingQuantityInputSchema.parse(input)
  const counts = new Map(snapshot.stores.map((store) => [store.id, 0]))
  for (const employee of snapshot.employees) {
    const assignments = employee.primaryStoreId ? [employee.primaryStoreId] : []
    for (const storeId of assignments) counts.set(storeId, counts.get(storeId)! + 1)
  }
  const stores = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([storeId, employees]) => ({ storeId, employees, includedEmployees: Math.min(employees, snapshot.allowances.includedEmployeesPerStore), additionalEmployees: Math.max(0, employees - snapshot.allowances.includedEmployeesPerStore) }))
  return {
    baseQuantity: 1,
    additionalStoreQuantity: Math.max(0, stores.length - snapshot.allowances.includedStores),
    additionalEmployeeQuantity: stores.reduce((sum, store) => sum + store.additionalEmployees, 0),
    unassignedEmployees: snapshot.employees.filter((employee) => !employee.storeIds.length).length,
    seatPolicy: snapshot.seatPolicy,
    stores
  }
}
