export type AppModule =
  | "dashboard"
  | "inventory"
  | "healthChecks"
  | "expiration"
  | "waste"
  | "orders"
  | "todo"
  | "notifications"
  | "insights"
  | "production"
  | "howtos"
  | "website"
  | "stores"
  | "users"
  | "orgSettings"
  | "storeSettings"
  | "account"
  | "settings"
  | "admin"

export type MemberRole = "Owner" | "Manager" | "Staff"

export const roleModules: Record<MemberRole, AppModule[]> = {
  Owner: [
    "dashboard",
    "inventory",
    "healthChecks",
    "expiration",
    "waste",
    "orders",
    "todo",
    "notifications",
    "insights",
    "production",
    "howtos",
    "website",
    "stores",
    "users",
    "orgSettings",
    "storeSettings",
    "account",
    "settings"
  ],
  Manager: [
    "dashboard",
    "inventory",
    "healthChecks",
    "expiration",
    "waste",
    "orders",
    "todo",
    "notifications",
    "insights",
    "production",
    "howtos",
    "website",
    "stores",
    "users",
    "storeSettings",
    "account",
    "settings"
  ],
  Staff: [
    "dashboard",
    "inventory",
    "healthChecks",
    "expiration",
    "waste",
    "orders",
    "todo",
    "notifications",
    "insights",
    "production",
    "howtos",
    "account",
    "settings"
  ]
}
