export type SignupStore = {
  location: string
  nickname: string
}

export type SignupEmployee = {
  firstName: string
  lastName: string
  email: string
}

export type SignupPayload = {
  ownerFirstName: string
  ownerLastName: string
  ownerEmail: string
  organizationName: string
  stores: SignupStore[]
  employeeCount: number
  employees: SignupEmployee[]
  businessDescription: string
}

export type SignupPlanId = "starter" | "growth" | "scale"

export type SignupPlanRecommendation = {
  id: SignupPlanId
  name: string
  summary: string
  why: string[]
  seats: number
}

export const signupPlans: Record<SignupPlanId, { name: string; summary: string }> = {
  starter: {
    name: "Starter",
    summary: "Best for one location getting inventory, ordering, and basic team permissions online."
  },
  growth: {
    name: "Growth",
    summary: "Best for multi-department or multi-location teams that need stronger permissions and operating history."
  },
  scale: {
    name: "Scale",
    summary: "Best for larger organizations with many employees, complex stores, and heavier support needs."
  }
}

export function recommendStoreNickname(location: string) {
  const trimmed = location.trim()
  if (!trimmed) return ""
  const streetAddress = trimmed.split(",")[0]?.trim() ?? trimmed
  return streetAddress || trimmed
}

export function slugifySignupId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

export function recommendSignupPlan(payload: SignupPayload): SignupPlanRecommendation {
  const storeCount = Math.max(payload.stores.filter((store) => store.location.trim()).length, 1)
  const employeeCount = Math.max(payload.employeeCount, payload.employees.length, 1)
  const description = payload.businessDescription.toLowerCase()
  const complexKeywords = [
    "grocery",
    "market",
    "restaurant",
    "bakery",
    "wine",
    "beer",
    "catering",
    "warehouse",
    "production",
    "district",
    "region",
    "franchise",
    "chain"
  ]
  const hasComplexOperations = complexKeywords.some((keyword) => description.includes(keyword))

  let id: SignupPlanId = "starter"
  if (storeCount >= 3 || employeeCount > 25 || hasComplexOperations) id = "growth"
  if (storeCount >= 8 || employeeCount > 100 || description.includes("enterprise")) id = "scale"

  const why = [
    `${storeCount} store ${storeCount === 1 ? "location" : "locations"} in the signup details.`,
    `${employeeCount} team ${employeeCount === 1 ? "member" : "members"} to account for in permissions and onboarding.`
  ]

  if (hasComplexOperations) {
    why.push("The business description suggests departments, ordering rules, expiration tracking, or production workflows.")
  }

  if (id === "scale") {
    why.push("The size points to custom rollout, subscription review, and heavier administrator controls.")
  }

  return {
    id,
    name: signupPlans[id].name,
    summary: signupPlans[id].summary,
    why,
    seats: employeeCount
  }
}
