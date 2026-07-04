import {
  BarChart3,
  BrainCircuit,
  Building2,
  ClipboardCheck,
  FolderOpen,
  History,
  LayoutDashboard,
  PackageSearch,
  ShieldCheck,
  ShoppingCart,
  Store,
  Users
} from "lucide-react"
import type { ComponentType } from "react"

import type { PermissionKey } from "@/lib/permissions"

export type NavigationItem = {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
  permission?: PermissionKey
}

export const navigation: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/administrator", label: "Administrator", icon: ShieldCheck, permission: "platform.admin" },
  { href: "/inventory", label: "Inventory", icon: PackageSearch, permission: "inventory.view" },
  { href: "/orders", label: "Orders", icon: ShoppingCart, permission: "orders.view" },
  { href: "/health-checks", label: "Health Checks", icon: ClipboardCheck, permission: "health.view" },
  { href: "/files", label: "Files", icon: FolderOpen, permission: "files.view" },
  { href: "/ai", label: "Assistant", icon: BrainCircuit, permission: "ai.use" },
  { href: "/insights", label: "Insights", icon: BarChart3, permission: "insights.view" },
  { href: "/history", label: "History", icon: History, permission: "history.view" },
  { href: "/employees", label: "Employees", icon: Users, permission: "employees.view" },
  { href: "/organization", label: "Organization", icon: Building2, permission: "organization.view" },
  { href: "/stores", label: "Stores", icon: Store, permission: "stores.view" }
]

const publicPaths = new Set(["/", "/signin", "/demo"])

export function requiredPermissionForPath(pathname: string): PermissionKey | undefined {
  if (publicPaths.has(pathname)) return undefined
  const match = navigation
    .filter((item) => item.permission && (pathname === item.href || pathname.startsWith(`${item.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]

  return match?.permission
}

export function isPublicPath(pathname: string) {
  return publicPaths.has(pathname)
}
