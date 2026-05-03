export const accentPalette = [
  { name: "Blue", value: "#2563EB" },
  { name: "Purple", value: "#A855F7" },
  { name: "Green", value: "#22C55E" },
  { name: "Orange", value: "#F97316" },
  { name: "Red", value: "#EF4444" },
  { name: "Pink", value: "#EC4899" },
  { name: "Teal", value: "#14B8A6" },
  { name: "Indigo", value: "#6366F1" }
] as const

export type ModuleSemantic =
  | "dashboard"
  | "received"
  | "expiration"
  | "waste"
  | "inventory"
  | "healthChecks"
  | "orders"
  | "todo"
  | "insights"
  | "production"
  | "howtos"

export function getModuleAccent(module: ModuleSemantic, accentColor: string): string {
  if (module === "waste") return "#EF4444"
  if (module === "received") return "#22C55E"
  if (module === "expiration") return "#F97316"
  return accentColor
}
