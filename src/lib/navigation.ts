import { LayoutDashboard, PackageSearch, Settings, ShoppingCart, Tags, Truck } from "lucide-react"

export const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: PackageSearch },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/products", label: "Products", icon: Tags },
  { href: "/vendors", label: "Vendors", icon: Truck },
  { href: "/settings", label: "Settings", icon: Settings }
]
