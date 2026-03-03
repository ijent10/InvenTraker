export type AppModule =
  | "dashboard"
  | "inventory"
  | "expiration"
  | "waste"
  | "orders"
  | "todo"
  | "notifications"
  | "insights"
  | "production"
  | "howtos"
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
    "expiration",
    "waste",
    "orders",
    "todo",
    "notifications",
    "insights",
    "production",
    "howtos",
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
    "expiration",
    "waste",
    "orders",
    "todo",
    "notifications",
    "insights",
    "production",
    "howtos",
    "stores",
    "users",
    "storeSettings",
    "account",
    "settings"
  ],
  Staff: [
    "dashboard",
    "inventory",
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
