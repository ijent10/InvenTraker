export const billingPlans = {
  builder: { name: "Builder", baseCents: 4999, extraStoreCents: 2000, extraEmployeeCents: 500, includedStores: 1, includedEmployeesPerStore: 5, features: { assistant: false, branding: false, healthChecks: false, files: false } },
  basic: { name: "Basic", baseCents: 9999, extraStoreCents: 1000, extraEmployeeCents: 300, includedStores: 2, includedEmployeesPerStore: 10, features: { assistant: false, branding: false, healthChecks: true, files: true } },
  pro: { name: "Pro", baseCents: 19999, extraStoreCents: 700, extraEmployeeCents: 200, includedStores: 5, includedEmployeesPerStore: 30, features: { assistant: true, branding: true, healthChecks: true, files: true } }
} as const
