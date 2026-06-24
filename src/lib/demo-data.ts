import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  PackageCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Truck
} from "lucide-react"

export type InventoryItem = {
  id: string
  name: string
  sku: string
  department: string
  location: string
  unit: string
  onHand: number
  par: number
  reorderPoint: number
  vendor: string
  updatedAt: string
}

export type OrderDraft = {
  id: string
  vendor: string
  items: number
  estimatedTotal: string
  status: "Draft" | "Ready" | "Needs review"
  dueBy: string
}

export type Product = {
  id: string
  name: string
  category: string
  defaultUnit: string
  expires: boolean
  lastCost: string
}

export type Vendor = {
  id: string
  name: string
  leadTime: string
  minimum: string
  contact: string
}

export const metrics = [
  { label: "Active items", value: "1,248", delta: "+36 this week", icon: Boxes },
  { label: "Ready orders", value: "7", delta: "$4.8k estimated", icon: ShoppingCart },
  { label: "Low stock", value: "42", delta: "12 critical", icon: AlertTriangle },
  { label: "Fill rate", value: "96%", delta: "+3.2% vs last cycle", icon: TrendingUp }
]

export const inventoryItems: InventoryItem[] = [
  {
    id: "inv-001",
    name: "Cabernet Sauvignon",
    sku: "WINE-CAB-750",
    department: "Beer & Wine",
    location: "Aisle 4 / Backstock B",
    unit: "eaches",
    onHand: 18,
    par: 24,
    reorderPoint: 8,
    vendor: "Vintage Point",
    updatedAt: "Today, 9:18 AM"
  },
  {
    id: "inv-002",
    name: "Sourdough loaf",
    sku: "BAKE-SOUR-01",
    department: "Bakery",
    location: "Bakery rack",
    unit: "eaches",
    onHand: 34,
    par: 40,
    reorderPoint: 12,
    vendor: "In-house bakery",
    updatedAt: "Today, 8:45 AM"
  },
  {
    id: "inv-003",
    name: "Olive oil 1L",
    sku: "GROC-OLIVE-1L",
    department: "Grocery",
    location: "Aisle 2 / Topstock",
    unit: "eaches",
    onHand: 7,
    par: 18,
    reorderPoint: 10,
    vendor: "Mediterranean Goods",
    updatedAt: "Yesterday, 5:03 PM"
  },
  {
    id: "inv-004",
    name: "Strawberry clamshell",
    sku: "PROD-STRAW-16",
    department: "Produce",
    location: "Cooler 1",
    unit: "cases",
    onHand: 9,
    par: 14,
    reorderPoint: 6,
    vendor: "North Valley Farms",
    updatedAt: "Today, 6:55 AM"
  }
]

export const orderDrafts: OrderDraft[] = [
  {
    id: "ord-001",
    vendor: "Vintage Point",
    items: 18,
    estimatedTotal: "$1,842",
    status: "Ready",
    dueBy: "Submit by 3:00 PM"
  },
  {
    id: "ord-002",
    vendor: "North Valley Farms",
    items: 12,
    estimatedTotal: "$864",
    status: "Needs review",
    dueBy: "Submit tomorrow"
  },
  {
    id: "ord-003",
    vendor: "Mediterranean Goods",
    items: 9,
    estimatedTotal: "$612",
    status: "Draft",
    dueBy: "Submit Friday"
  }
]

export const products: Product[] = [
  {
    id: "prod-001",
    name: "Cabernet Sauvignon",
    category: "Red wine",
    defaultUnit: "eaches",
    expires: false,
    lastCost: "$12.40"
  },
  {
    id: "prod-002",
    name: "Sourdough loaf",
    category: "Bread",
    defaultUnit: "eaches",
    expires: true,
    lastCost: "$2.85"
  },
  {
    id: "prod-003",
    name: "Strawberry clamshell",
    category: "Produce",
    defaultUnit: "cases",
    expires: true,
    lastCost: "$48.00"
  }
]

export const vendors: Vendor[] = [
  {
    id: "vendor-001",
    name: "Vintage Point",
    leadTime: "2 days",
    minimum: "$750",
    contact: "orders@vintagepoint.example"
  },
  {
    id: "vendor-002",
    name: "North Valley Farms",
    leadTime: "Next day",
    minimum: "$400",
    contact: "produce@northvalley.example"
  },
  {
    id: "vendor-003",
    name: "Mediterranean Goods",
    leadTime: "4 days",
    minimum: "$500",
    contact: "sales@medgoods.example"
  }
]

export const activity = [
  { label: "Spot count posted", detail: "Beer & Wine backstock updated", icon: PackageCheck },
  { label: "Order draft created", detail: "Vintage Point order is ready", icon: ClipboardList },
  { label: "Vendor cost changed", detail: "Olive oil increased by 4.1%", icon: Truck },
  { label: "Future AI layer", detail: "Ordering and product details will plug in here", icon: Sparkles }
]
