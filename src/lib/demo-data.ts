import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Clock,
  History,
  PackageCheck,
  PackageX,
  RotateCw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Truck,
  Trash2,
  Users
} from "lucide-react"

import type { PermissionKey } from "@/lib/permissions"

export type EmployeePermission = PermissionKey | "*"

export type InventoryItem = {
  id: string
  centralProductId?: string
  orgProductId?: string
  storeId?: string
  name: string
  sku: string
  department: string
  category: string
  location: string
  unit: string
  onHand: number
  frontStock: number
  backStock: number
  par: number
  reorderPoint: number
  vendor: string
  price?: number
  quantityInCase?: number
  updatedAt: string
  expires: boolean
  status: "Active" | "Low" | "Archived"
}

export type OrderDraft = {
  id: string
  vendorId: string
  vendor: string
  lines: OrderLine[]
  items: number
  estimatedTotal: string
  minimum: string
  status: "Draft" | "Ready" | "Needs review" | "Submitted" | "Auto-submitted"
  dueBy: string
  dueAt: string
  expectedArrival: string
  submittedAt?: string
  submittedBy?: string
  approvedBy?: string
  notes?: string
  autoSubmitAllowed?: boolean
}

export type OrderLine = {
  id: string
  itemName: string
  sku: string
  quantity: number
  unit: string
  unitCost: string
  reason: string
  vendorOffered: boolean
  aiRecommendedQuantity: number
  minimumFillCandidate?: boolean
}

export type Product = {
  id: string
  centralProductId?: string
  name: string
  sku?: string
  category: string
  department: string
  defaultUnit: string
  expires: boolean
  lastCost: string
  location: string
  organizationNotes?: string
  averagePrice?: number
  averageExpirationDays?: number
  averageQuantityInCase?: number
  images?: string[]
  hasNutritionInfo?: boolean
  nutrition?: ProductNutritionInfo
  displayAssignment?: ProductDisplayAssignment
}

export type CentralCatalogProduct = {
  id: string
  name: string
  sku: string
  nutrition?: ProductNutritionInfo
  averagePrice?: number
  averageExpirationDays?: number
  averageQuantityInCase?: number
  images: string[]
  sourceCount: number
  learnedFacts: string[]
}

export type ProductNutritionInfo = {
  servingSize?: string
  caloriesKcal?: number
  fatG?: number
  saturatedFatG?: number
  carbohydratesG?: number
  sugarsG?: number
  fiberG?: number
  proteinG?: number
  sodiumMg?: number
  saltG?: number
  ingredientsText?: string
  allergens?: string
  labels?: string
  imageUrl?: string
  sourceSummary?: string
}

export type ProductDisplayAssignment = {
  isOnDisplay: boolean
  displayId: string
  displayName: string
  startDate: string
  endDate?: string
  quantityNeeded: number
  changeMode: "Manual" | "Scheduled"
  notes?: string
}

export type Vendor = {
  id: string
  name: string
  leadTime: string
  minimum: string
  contact: string
  catalog?: string[]
  orderDueAt?: string
  autoSubmitAllowed?: boolean
}

export type Employee = {
  id: string
  name: string
  employeeId: string
  phone: string
  email: string
  jobTitle: string
  department: string
  location: string
  store: string
  status: "Active" | "Invite sent" | "Suspended"
  lastActive: string
  permissions: EmployeePermission[]
}

export type StoreRecord = {
  id: string
  name: string
  code: string
  address: string
  manager: string
  phone: string
  activeItems: number
  employees: number
  editableAreas: string[]
}

export type StoreDisplay = {
  id: string
  name: string
  storeId: string
  location: string
  department: string
  capacity: number
  status: "Active" | "Seasonal" | "Draft"
  owner: string
}

export type HealthCheck = {
  id: string
  name: string
  store: string
  schedule: string
  lastCompleted: string
  completedBy: string
  status: "Current" | "Due today" | "Overdue"
  responses: number
  questions: HealthCheckQuestion[]
  responseHistory: HealthCheckResponse[]
}

export type HealthCheckAnswerType = "Number" | "Multiple choice" | "Short answer" | "Long answer" | "Photo upload" | "Signature"

export type HealthCheckQuestion = {
  id: string
  label: string
  answerType: HealthCheckAnswerType
  required: boolean
  reviewRule: string
}

export type HealthCheckResponse = {
  id: string
  completedBy: string
  employeeId: string
  department: string
  title: string
  completedAt: string
  answers: Array<{
    question: string
    value: string
    flagged?: boolean
  }>
}

export type ShiftNote = {
  id: string
  title: string
  body: string
  visibility: "Personal" | "Organization" | "Department" | "People"
  audience: string
  author: string
  authorId?: string
  updatedAt: string
  deleted?: boolean
}

export type CompanyFileApprovalStatus = "draft" | "approved" | "archived" | "expired" | "superseded"

export type CompanyFileType = "pdf" | "docx" | "txt" | "markdown" | "csv" | "json" | "image" | "spreadsheet" | "other"

export type CompanyDocumentType =
  | "employee handbook"
  | "dress code policy"
  | "department SOP"
  | "deli procedure"
  | "bakery procedure"
  | "produce procedure"
  | "meat/seafood procedure"
  | "front-end/customer-service procedure"
  | "food safety document"
  | "allergen policy"
  | "sanitation policy"
  | "recipe document"
  | "vendor document"
  | "product specification sheet"
  | "merchandising guide"
  | "ordering guide"
  | "training guide"
  | "safety data sheet"
  | "operational report"
  | "internal memo"
  | "store-specific policy"
  | "organization-specific policy"

export type CompanyFileVisibilityScope = "organization" | "jobTitle" | "department" | "area" | "store" | "region" | "district" | "individuals"

export type CompanyFileCategory = {
  id: string
  name: string
  parentId?: string
  description: string
  sortOrder: number
}

export type CompanyFile = {
  id: string
  documentId: string
  title: string
  fileName: string
  fileType: CompanyFileType
  documentType: CompanyDocumentType
  categoryId: string
  department: string
  organizationId: string
  storeId?: string
  version: string
  uploadedBy?: string
  uploadedAt: string
  approvedStatus: CompanyFileApprovalStatus
  approvedBy?: string
  approvedAt?: string
  effectiveDate?: string
  expirationDate?: string
  sourceType: "uploaded" | "generated" | "imported" | "linked"
  visibility: {
    scope: CompanyFileVisibilityScope
    labels: string[]
  }
  downloadUrl?: string
  storagePath?: string
  viewerUrl: string
  openedCount: number
  lastOpenedAt?: string
  favoritedBy: string[]
  tags: string[]
  summary: string
  parsingStatus: "uploaded" | "parsing" | "parsed" | "embedded" | "failed"
}

export type CompanyFileChunk = {
  id: string
  chunkId: string
  documentId: string
  title: string
  sectionTitle: string
  headingPath: string[]
  pageStart?: number
  pageEnd?: number
  text: string
  tableData?: string[][]
  embedding?: number[]
  embeddingModel?: string
  approvedStatus?: CompanyFileApprovalStatus
  createdAt: string
  updatedAt: string
}

export type WorkspaceNotification = {
  id: string
  title: string
  detail: string
  href: string
  read: boolean
  createdAt: string
}

export type OrganizationBranding = {
  companyName: string
  logoUrl: string
  headerText?: string
  accentColor: string
  secondaryColor: string
  defaultMode: "Dark" | "Light" | "System"
  defaultTheme: string
}

export type HistoryActionType = "spot-checks" | "restocks" | "waste" | "receive" | "portion" | "orders"

export type HistoryActionRecord = {
  id: string
  type: HistoryActionType
  label: string
  userName: string
  employeeId: string
  department: string
  title: string
  store: string
  district: string
  region: string
  date: string
  time: string
  summary: string
  responses?: Array<{
    label: string
    value: string
  }>
}

export type InsightMetric = {
  label: string
  value: string
  detail: string
  trend: "good" | "watch" | "risk" | "neutral"
}

export type PlatformLegalDocument = {
  id: "terms" | "privacy"
  title: string
  status: "Draft" | "Published" | "Needs review"
  lastUpdated: string
  summary: string
  body: string
}

export type PlatformFeatureRequest = {
  id: string
  title: string
  organization: string
  requestedBy: string
  status: "New" | "Reviewing" | "Planned" | "Shipped"
  priority: "Low" | "Medium" | "High"
  votes: number
}

export type PlatformFaq = {
  id: string
  question: string
  answer: string
  category: string
  status: "Draft" | "Published"
}

export type PlatformSubscription = {
  id: string
  organization: string
  plan: "Trial" | "Starter" | "Growth" | "Enterprise"
  status: "Active" | "Trialing" | "Past due" | "Paused"
  renewal: string
  seats: number
  ownerEmail: string
}

export const metrics = [
  { label: "Active items", value: "1,248", delta: "+36 this week", icon: Boxes },
  { label: "Ready orders", value: "7", delta: "$4.8k estimated", icon: ShoppingCart },
  { label: "Low stock", value: "42", delta: "12 critical", icon: AlertTriangle },
  { label: "Employee access", value: "18", delta: "4 managers, 14 team members", icon: Users }
]

export const inventoryItems: InventoryItem[] = [
  {
    id: "inv-001",
    name: "Cabernet Sauvignon",
    sku: "WINE-CAB-750",
    department: "Beer & Wine",
    category: "Red wine",
    location: "Aisle 4 / Backstock B",
    unit: "eaches",
    onHand: 18,
    frontStock: 6,
    backStock: 12,
    par: 24,
    reorderPoint: 8,
    vendor: "Vintage Point",
    updatedAt: "Today, 9:18 AM",
    expires: false,
    status: "Active"
  },
  {
    id: "inv-002",
    name: "Sourdough loaf",
    sku: "BAKE-SOUR-01",
    department: "Bakery",
    category: "Bread",
    location: "Bakery rack",
    unit: "eaches",
    onHand: 34,
    frontStock: 24,
    backStock: 10,
    par: 40,
    reorderPoint: 12,
    vendor: "In-house bakery",
    updatedAt: "Today, 8:45 AM",
    expires: true,
    status: "Active"
  },
  {
    id: "inv-003",
    name: "Olive oil 1L",
    sku: "GROC-OLIVE-1L",
    department: "Grocery",
    category: "Pantry",
    location: "Aisle 2 / Topstock",
    unit: "eaches",
    onHand: 7,
    frontStock: 3,
    backStock: 4,
    par: 18,
    reorderPoint: 10,
    vendor: "Mediterranean Goods",
    updatedAt: "Yesterday, 5:03 PM",
    expires: false,
    status: "Low"
  },
  {
    id: "inv-004",
    name: "Strawberry clamshell",
    sku: "PROD-STRAW-16",
    department: "Produce",
    category: "Berries",
    location: "Cooler 1",
    unit: "cases",
    onHand: 9,
    frontStock: 4,
    backStock: 5,
    par: 14,
    reorderPoint: 6,
    vendor: "North Valley Farms",
    updatedAt: "Today, 6:55 AM",
    expires: true,
    status: "Active"
  }
]

export const orderDrafts: OrderDraft[] = [
  {
    id: "ord-001",
    vendorId: "vendor-001",
    vendor: "Vintage Point",
    lines: [
      {
        id: "ord-001-line-001",
        itemName: "Cabernet Sauvignon",
        sku: "WINE-CAB-750",
        quantity: 60,
        unit: "eaches",
        unitCost: "$12.40",
        reason: "Sales floor and backstock are below par; order fills the wine wall and stays inside normal movement.",
        vendorOffered: true,
        aiRecommendedQuantity: 60
      },
      {
        id: "ord-001-line-002",
        itemName: "Cabernet Sauvignon feature case",
        sku: "WINE-CAB-750-CASE",
        quantity: 1,
        unit: "case",
        unitCost: "$108.00",
        reason: "Minimum-fill candidate. Extra case is reasonable because the item does not expire and display demand is active.",
        vendorOffered: true,
        aiRecommendedQuantity: 1,
        minimumFillCandidate: true
      }
    ],
    items: 2,
    estimatedTotal: "$852.00",
    minimum: "$750",
    status: "Ready",
    dueBy: "Submit by Jul 2, 3:00 PM",
    dueAt: "2026-07-02T15:00:00-04:00",
    expectedArrival: "Jul 4, 2026",
    submittedAt: undefined,
    submittedBy: undefined,
    notes: "Vintage Point order is ready for owner approval.",
    autoSubmitAllowed: false
  },
  {
    id: "ord-002",
    vendorId: "vendor-002",
    vendor: "North Valley Farms",
    lines: [
      {
        id: "ord-002-line-001",
        itemName: "Strawberry clamshell",
        sku: "PROD-STRAW-16",
        quantity: 9,
        unit: "cases",
        unitCost: "$48.00",
        reason: "Produce par calls for 5 more cases, but upcoming quality pulls justify a safer 9-case draft.",
        vendorOffered: true,
        aiRecommendedQuantity: 9
      }
    ],
    items: 1,
    estimatedTotal: "$432.00",
    minimum: "$400",
    status: "Needs review",
    dueBy: "Submit by Jul 3, 10:00 AM",
    dueAt: "2026-07-03T10:00:00-04:00",
    expectedArrival: "Jul 4, 2026",
    notes: "Review quality risk before submission.",
    autoSubmitAllowed: false
  },
  {
    id: "ord-003",
    vendorId: "vendor-003",
    vendor: "Mediterranean Goods",
    lines: [
      {
        id: "ord-003-line-001",
        itemName: "Olive oil 1L",
        sku: "GROC-OLIVE-1L",
        quantity: 11,
        unit: "eaches",
        unitCost: "$13.20",
        reason: "Below reorder point, but movement is slow; draft does not recommend chasing the vendor minimum.",
        vendorOffered: true,
        aiRecommendedQuantity: 11
      }
    ],
    items: 1,
    estimatedTotal: "$145.20",
    minimum: "$500",
    status: "Draft",
    dueBy: "Submit by Jul 6, 4:00 PM",
    dueAt: "2026-07-06T16:00:00-04:00",
    expectedArrival: "Jul 10, 2026",
    notes: "Minimum not reached. Do not submit unless a manager approves adding stable pantry items.",
    autoSubmitAllowed: false
  }
]

export const products: Product[] = [
  {
    id: "prod-001",
    centralProductId: "central-wine-cab-750",
    name: "Cabernet Sauvignon",
    sku: "WINE-CAB-750",
    category: "Red wine",
    department: "Beer & Wine",
    defaultUnit: "eaches",
    expires: false,
    lastCost: "$12.40",
    location: "Aisle 4 / Wine wall",
    averagePrice: 12.4,
    averageQuantityInCase: 12,
    images: [],
    hasNutritionInfo: false,
    displayAssignment: {
      isOnDisplay: true,
      displayId: "display-001",
      displayName: "Front seasonal wine table",
      startDate: "2026-06-28",
      endDate: "2026-07-12",
      quantityNeeded: 12,
      changeMode: "Scheduled",
      notes: "Keep two full facings on the front table during the summer feature."
    }
  },
  {
    id: "prod-002",
    centralProductId: "central-bake-sour-01",
    name: "Sourdough loaf",
    sku: "BAKE-SOUR-01",
    category: "Bread",
    department: "Bakery",
    defaultUnit: "eaches",
    expires: true,
    lastCost: "$2.85",
    location: "Bakery rack",
    averagePrice: 2.85,
    averageExpirationDays: 2,
    averageQuantityInCase: 1,
    images: [],
    hasNutritionInfo: true,
    nutrition: {
      servingSize: "1 slice",
      caloriesKcal: 120,
      fatG: 1,
      carbohydratesG: 24,
      sugarsG: 1,
      proteinG: 4,
      sodiumMg: 240,
      ingredientsText: "Wheat flour, water, sourdough starter, salt",
      sourceSummary: "Demo supplier label"
    }
  },
  {
    id: "prod-003",
    centralProductId: "central-prod-straw-16",
    name: "Strawberry clamshell",
    sku: "PROD-STRAW-16",
    category: "Berries",
    department: "Produce",
    defaultUnit: "cases",
    expires: true,
    lastCost: "$48.00",
    location: "Produce cooler",
    averagePrice: 48,
    averageExpirationDays: 4,
    averageQuantityInCase: 8,
    images: [],
    hasNutritionInfo: true,
    nutrition: {
      servingSize: "1 cup",
      caloriesKcal: 50,
      carbohydratesG: 12,
      sugarsG: 7,
      fiberG: 3,
      proteinG: 1,
      sodiumMg: 0,
      ingredientsText: "Strawberries",
      sourceSummary: "Demo produce nutrition profile"
    }
  }
]

export const centralCatalog: CentralCatalogProduct[] = [
  {
    id: "central-wine-cab-750",
    name: "Cabernet Sauvignon",
    sku: "WINE-CAB-750",
    averagePrice: 12.4,
    averageQuantityInCase: 12,
    images: [],
    sourceCount: 1,
    learnedFacts: ["Organization catalog reference exists", "No nutrition record expected for alcoholic beverage in demo data"]
  },
  {
    id: "central-bake-sour-01",
    name: "Sourdough loaf",
    sku: "BAKE-SOUR-01",
    nutrition: products[1]?.nutrition,
    averagePrice: 2.85,
    averageExpirationDays: 2,
    averageQuantityInCase: 1,
    images: [],
    sourceCount: 1,
    learnedFacts: ["Bakery product uses expiration tracking", "Nutrition facts require local supplier verification"]
  },
  {
    id: "central-prod-straw-16",
    name: "Strawberry clamshell",
    sku: "PROD-STRAW-16",
    nutrition: products[2]?.nutrition,
    averagePrice: 48,
    averageExpirationDays: 4,
    averageQuantityInCase: 8,
    images: [],
    sourceCount: 1,
    learnedFacts: ["Produce item uses short expiration assumptions", "Quality pulls should influence ordering"]
  }
]

export const vendors: Vendor[] = [
  {
    id: "vendor-001",
    name: "Vintage Point",
    leadTime: "2 days",
    minimum: "$750",
    contact: "orders@vintagepoint.example",
    catalog: ["WINE-CAB-750", "WINE-CAB-750-CASE"],
    orderDueAt: "2026-07-02T15:00:00-04:00",
    autoSubmitAllowed: false
  },
  {
    id: "vendor-002",
    name: "North Valley Farms",
    leadTime: "Next day",
    minimum: "$400",
    contact: "produce@northvalley.example",
    catalog: ["PROD-STRAW-16"],
    orderDueAt: "2026-07-03T10:00:00-04:00",
    autoSubmitAllowed: false
  },
  {
    id: "vendor-003",
    name: "Mediterranean Goods",
    leadTime: "4 days",
    minimum: "$500",
    contact: "sales@medgoods.example",
    catalog: ["GROC-OLIVE-1L"],
    orderDueAt: "2026-07-06T16:00:00-04:00",
    autoSubmitAllowed: false
  }
]

export const employees: Employee[] = [
  {
    id: "emp-001",
    name: "Ian Jenkins",
    employeeId: "OWNER-001",
    phone: "(555) 210-1001",
    email: "ian@example.com",
    jobTitle: "Owner",
    department: "Executive",
    location: "All locations",
    store: "All stores",
    status: "Active",
    lastActive: "Now",
    permissions: [
      "inventory.view",
      "inventory.edit",
      "inventory.archive",
      "orders.view",
      "orders.create",
      "orders.approve",
      "health.view",
      "health.complete",
      "health.manage",
      "history.view",
      "history.viewAll",
      "history.viewRegion",
      "history.viewDistrict",
      "history.viewStore",
      "history.viewDepartment",
      "history.viewIndividual",
      "ai.use",
      "ai.manage",
      "ai.verifyAutofill",
      "files.view",
      "files.upload",
      "files.manage",
      "insights.view",
      "products.view",
      "products.edit",
      "vendors.view",
      "vendors.edit",
      "employees.view",
      "employees.edit",
      "employees.resetPassword",
      "employees.permissions",
      "organization.view",
      "organization.manage",
      "stores.view",
      "stores.manage",
      "settings.view"
    ]
  },
  {
    id: "emp-002",
    name: "Maya Lopez",
    employeeId: "MGR-144",
    phone: "(555) 210-1204",
    email: "maya@example.com",
    jobTitle: "Store Manager",
    department: "Store Operations",
    location: "Liberty Ave",
    store: "Liberty Ave",
    status: "Active",
    lastActive: "Today, 10:14 AM",
    permissions: [
      "inventory.view",
      "inventory.edit",
      "orders.view",
      "orders.create",
      "health.view",
      "health.complete",
      "history.view",
      "history.viewStore",
      "history.viewDepartment",
      "files.view",
      "ai.use",
      "ai.verifyAutofill",
      "employees.view",
      "stores.view"
    ]
  },
  {
    id: "emp-003",
    name: "Evan Carter",
    employeeId: "INV-092",
    phone: "(555) 210-1930",
    email: "evan@example.com",
    jobTitle: "Inventory Lead",
    department: "Inventory",
    location: "Liberty Ave",
    store: "Liberty Ave",
    status: "Invite sent",
    lastActive: "Pending invite",
    permissions: ["inventory.view", "inventory.edit", "health.view", "health.complete", "history.view", "history.viewDepartment", "products.view", "vendors.view"]
  }
]

export const jobTitles = ["Owner", "Store Manager", "Assistant Manager", "Inventory Lead", "Department Lead", "Team Member"]

export const departments = ["Executive", "Store Operations", "Inventory", "Beer & Wine", "Bakery", "Produce", "Grocery", "Customer Service"]

export const organizationBranding: OrganizationBranding = {
  companyName: "InvenTracker Demo",
  logoUrl: "/inventracker-mark.svg",
  headerText: "Inventory operations",
  accentColor: "#2563eb",
  secondaryColor: "#14b8a6",
  defaultMode: "Dark",
  defaultTheme: "Blue steel"
}

export const personalThemePresets = [
  {
    name: "Blue steel",
    mode: "Dark",
    accent: "#2563eb",
    secondary: "#14b8a6",
    background: "#020617",
    backgroundSoft: "#0f172a",
    surface: "#0f172a",
    panelStrong: "#111827",
    controlBg: "#020617",
    controlHover: "#172033",
    controlBorder: "#334155",
    text: "#f8fafc",
    muted: "#94a3b8",
    subtle: "#64748b",
    buttonText: "#ffffff",
    detail: "Current dark operating theme with blue actions and slate surfaces."
  },
  {
    name: "Fresh green",
    mode: "Light",
    accent: "#16a34a",
    secondary: "#0f766e",
    background: "#f0fdf4",
    backgroundSoft: "#dcfce7",
    surface: "#f8fafc",
    panelStrong: "#ffffff",
    controlBg: "#ffffff",
    controlHover: "#ecfdf5",
    controlBorder: "#86efac",
    text: "#052e16",
    muted: "#166534",
    subtle: "#4d7c0f",
    buttonText: "#ffffff",
    detail: "Light mode with fresh green action color and clean work surfaces."
  },
  {
    name: "High contrast",
    mode: "Dark",
    accent: "#f59e0b",
    secondary: "#22c55e",
    background: "#020617",
    backgroundSoft: "#111827",
    surface: "#020617",
    panelStrong: "#030712",
    controlBg: "#000000",
    controlHover: "#1f2937",
    controlBorder: "#f59e0b",
    text: "#fff7ed",
    muted: "#fde68a",
    subtle: "#fbbf24",
    buttonText: "#111827",
    detail: "Darker surfaces and stronger contrast for fast scanning."
  },
  {
    name: "Pride",
    mode: "Dark",
    accent: "#ef4444",
    secondary: "#a855f7",
    background: "#101022",
    backgroundSoft: "#1e1b4b",
    surface: "#17122f",
    panelStrong: "#211844",
    controlBg: "#120f2a",
    controlHover: "#2e245f",
    controlBorder: "#f97316",
    text: "#fff7ed",
    muted: "#fbcfe8",
    subtle: "#fde68a",
    buttonText: "#ffffff",
    detail: "A vivid rainbow-inspired theme with warm action colors and purple night surfaces."
  },
  {
    name: "Valentines",
    mode: "Light",
    accent: "#e11d48",
    secondary: "#db2777",
    background: "#fff1f2",
    backgroundSoft: "#fce7f3",
    surface: "#ffffff",
    panelStrong: "#fff7fb",
    controlBg: "#ffffff",
    controlHover: "#ffe4e6",
    controlBorder: "#fda4af",
    text: "#4c0519",
    muted: "#9f1239",
    subtle: "#be185d",
    buttonText: "#ffffff",
    detail: "Soft pink surfaces with stronger rose buttons for a playful personal view."
  },
  {
    name: "Christmas",
    mode: "Dark",
    accent: "#dc2626",
    secondary: "#22c55e",
    background: "#07130d",
    backgroundSoft: "#052e16",
    surface: "#0f1f17",
    panelStrong: "#13251a",
    controlBg: "#08170f",
    controlHover: "#16351f",
    controlBorder: "#15803d",
    text: "#fef2f2",
    muted: "#bbf7d0",
    subtle: "#fca5a5",
    buttonText: "#ffffff",
    detail: "Deep green surfaces, red actions, and bright holiday contrast."
  },
  {
    name: "Halloween",
    mode: "Dark",
    accent: "#f97316",
    secondary: "#a855f7",
    background: "#120817",
    backgroundSoft: "#2e1065",
    surface: "#1b1024",
    panelStrong: "#24112f",
    controlBg: "#0f0713",
    controlHover: "#321244",
    controlBorder: "#f97316",
    text: "#fff7ed",
    muted: "#fdba74",
    subtle: "#c084fc",
    buttonText: "#111827",
    detail: "Pumpkin orange, electric purple, and dark midnight surfaces."
  },
  {
    name: "Northern lights",
    mode: "Dark",
    accent: "#22d3ee",
    secondary: "#a78bfa",
    background: "#031525",
    backgroundSoft: "#0f766e",
    surface: "#082f49",
    panelStrong: "#0b324e",
    controlBg: "#051923",
    controlHover: "#164e63",
    controlBorder: "#22d3ee",
    text: "#ecfeff",
    muted: "#a5f3fc",
    subtle: "#c4b5fd",
    buttonText: "#06202a",
    detail: "Aurora cyan and violet over deep arctic blue."
  },
  {
    name: "Cosmo and Wanda",
    mode: "Dark",
    accent: "#ff4fd8",
    secondary: "#43ff64",
    background: "#15051d",
    backgroundSoft: "#29143a",
    surface: "#21102f",
    panelStrong: "#2f1544",
    controlBg: "#180820",
    controlHover: "#3b1654",
    controlBorder: "#43ff64",
    text: "#fff5fd",
    muted: "#f0abfc",
    subtle: "#86efac",
    buttonText: "#19051f",
    detail: "Bright pink and green with a saturated cartoon-night dashboard feel."
  }
]

export const organizationCustomizationAreas = [
  ["Branding", "Logo, center-header text, accent colors, default theme, login screen identity"],
  ["Personalization", "Allow employees to pick themes, custom colors, density, and light/dark mode"],
  ["Workflow defaults", "Default units, expiration behavior, departments, categories, and approval rules"],
  ["Access control", "Owner override, permission templates, store-level edit areas, and theme governance"],
  ["Customer-facing surfaces", "Future website branding, public forms, menus, ratings, and feedback styling"]
]

export const stores: StoreRecord[] = [
  {
    id: "store-001",
    name: "Liberty Ave",
    code: "266",
    address: "1200 Liberty Ave, Pittsburgh, PA",
    manager: "Maya Lopez",
    phone: "(555) 210-2660",
    activeItems: 1248,
    employees: 18,
    editableAreas: ["Inventory counts", "Store locations", "Health check assignment", "Order draft notes"]
  },
  {
    id: "store-002",
    name: "Downtown Market",
    code: "104",
    address: "44 Market Street, Pittsburgh, PA",
    manager: "Open role",
    phone: "(555) 210-1040",
    activeItems: 912,
    employees: 12,
    editableAreas: ["Inventory counts", "Health check completion"]
  }
]

export const platformLegalDocuments: PlatformLegalDocument[] = [
  {
    id: "terms",
    title: "Terms and Conditions",
    status: "Draft",
    lastUpdated: "Jun 25, 2026",
    summary: "Rules for account access, subscriptions, acceptable use, data ownership, and service availability.",
    body:
      "These terms outline how organizations use InvenTracker, how subscriptions are administered, and how operational data remains owned by the organization."
  },
  {
    id: "privacy",
    title: "Privacy Policy",
    status: "Draft",
    lastUpdated: "Jun 25, 2026",
    summary: "Explains how user, organization, store, inventory, and assistant-related data are separated and protected.",
    body:
      "InvenTracker separates personal account data from operational product data. The assistant may use product, inventory, imports, store resources, and approved web sources, but not personal identity or task-owner data."
  }
]

export const platformFeatureRequests: PlatformFeatureRequest[] = [
  {
    id: "fr-001",
    title: "Excel export templates by department",
    organization: "InvenTracker Demo",
    requestedBy: "Store operations",
    status: "Reviewing",
    priority: "High",
    votes: 18
  },
  {
    id: "fr-002",
    title: "Assistant product image verification queue",
    organization: "InvenTracker Demo",
    requestedBy: "Inventory leads",
    status: "Planned",
    priority: "Medium",
    votes: 11
  },
  {
    id: "fr-003",
    title: "Customer-facing website builder sections",
    organization: "Fresh Market pilot",
    requestedBy: "Organization owner",
    status: "New",
    priority: "Medium",
    votes: 7
  }
]

export const platformFaqs: PlatformFaq[] = [
  {
    id: "faq-001",
    question: "Can stores have different permissions than the organization defaults?",
    answer: "Yes. Organization owners can choose which store-level settings may be edited locally.",
    category: "Permissions",
    status: "Published"
  },
  {
    id: "faq-002",
    question: "Does the assistant see employee names or task history?",
    answer: "No. The assistant is restricted to operational product, inventory, store resource, import, and approved web verification data.",
    category: "Privacy",
    status: "Published"
  },
  {
    id: "faq-003",
    question: "Can assistant-filled nutrition facts save automatically?",
    answer: "No. Assistant suggestions go to Pending Review and need approval before becoming product data.",
    category: "Assistant",
    status: "Draft"
  }
]

export const platformSubscriptions: PlatformSubscription[] = [
  {
    id: "sub-001",
    organization: "InvenTracker Demo",
    plan: "Trial",
    status: "Trialing",
    renewal: "Jul 25, 2026",
    seats: 25,
    ownerEmail: "owner@example.com"
  },
  {
    id: "sub-002",
    organization: "Fresh Market pilot",
    plan: "Growth",
    status: "Active",
    renewal: "Aug 1, 2026",
    seats: 80,
    ownerEmail: "admin@example.com"
  }
]

export const storeDisplays: StoreDisplay[] = [
  {
    id: "display-001",
    name: "Front seasonal wine table",
    storeId: "store-001",
    location: "Front entry",
    department: "Beer & Wine",
    capacity: 36,
    status: "Active",
    owner: "Maya Lopez"
  },
  {
    id: "display-002",
    name: "Bakery feature rack",
    storeId: "store-001",
    location: "Bakery aisle endcap",
    department: "Bakery",
    capacity: 48,
    status: "Active",
    owner: "Evan Carter"
  },
  {
    id: "display-003",
    name: "Produce seasonal island",
    storeId: "store-001",
    location: "Produce front island",
    department: "Produce",
    capacity: 24,
    status: "Seasonal",
    owner: "Maya Lopez"
  }
]

export const companyFileCategories: CompanyFileCategory[] = [
  {
    id: "cat-policies",
    name: "Policies",
    description: "Approved organization and store policies employees can reference.",
    sortOrder: 1
  },
  {
    id: "cat-policies-dress-code",
    name: "Dress code",
    parentId: "cat-policies",
    description: "Uniform, department appearance, and food-safe clothing policies.",
    sortOrder: 2
  },
  {
    id: "cat-procedures",
    name: "Procedures",
    description: "Department SOPs, opening, closing, sanitation, and production guides.",
    sortOrder: 3
  },
  {
    id: "cat-procedures-deli",
    name: "Deli",
    parentId: "cat-procedures",
    description: "Prepared foods and deli procedures.",
    sortOrder: 4
  },
  {
    id: "cat-vendors",
    name: "Vendor sheets",
    description: "Vendor PDFs, product sheets, safety data, and ordering guides.",
    sortOrder: 5
  }
]

export const companyFiles: CompanyFile[] = [
  {
    id: "file-001",
    documentId: "doc-dress-code-2026",
    title: "Fresh Market Dress Code",
    fileName: "fresh-market-dress-code-2026.pdf",
    fileType: "pdf",
    documentType: "dress code policy",
    categoryId: "cat-policies-dress-code",
    department: "Store Operations",
    organizationId: "demo-org",
    version: "2026.1",
    uploadedBy: "Ian Jenkins",
    uploadedAt: "Jul 1, 2026, 9:12 AM",
    approvedStatus: "approved",
    approvedBy: "Ian Jenkins",
    approvedAt: "Jul 1, 2026, 9:30 AM",
    effectiveDate: "2026-07-01",
    sourceType: "uploaded",
    visibility: {
      scope: "organization",
      labels: ["All employees"]
    },
    downloadUrl: "/files/fresh-market-dress-code-2026.pdf",
    viewerUrl: "/files?document=doc-dress-code-2026",
    openedCount: 42,
    lastOpenedAt: "Today, 9:08 AM",
    favoritedBy: ["emp-001", "emp-002"],
    tags: ["policy", "uniform", "dress code", "food safety"],
    summary: "Organization-wide appearance standards, with stricter rules for prepared foods and deli roles.",
    parsingStatus: "embedded"
  },
  {
    id: "file-002",
    documentId: "doc-deli-closing-2026",
    title: "Deli Closing Procedure",
    fileName: "deli-closing-sop.md",
    fileType: "markdown",
    documentType: "deli procedure",
    categoryId: "cat-procedures-deli",
    department: "Deli",
    organizationId: "demo-org",
    storeId: "store-001",
    version: "2026.2",
    uploadedBy: "Maya Lopez",
    uploadedAt: "Jun 30, 2026, 4:42 PM",
    approvedStatus: "approved",
    approvedBy: "Ian Jenkins",
    approvedAt: "Jul 1, 2026, 8:15 AM",
    effectiveDate: "2026-07-01",
    sourceType: "uploaded",
    visibility: {
      scope: "department",
      labels: ["Deli", "Prepared Foods", "Store Operations"]
    },
    downloadUrl: "/files/deli-closing-sop.md",
    viewerUrl: "/files?document=doc-deli-closing-2026",
    openedCount: 29,
    lastOpenedAt: "Today, 7:44 AM",
    favoritedBy: ["emp-002"],
    tags: ["deli", "closing", "sanitation", "checklist"],
    summary: "Step-by-step deli closing, sanitation, temperature, labeling, and waste review procedure.",
    parsingStatus: "embedded"
  },
  {
    id: "file-003",
    documentId: "doc-vendor-storage-berries",
    title: "North Valley Farms Storage Sheet",
    fileName: "north-valley-berries-storage.csv",
    fileType: "csv",
    documentType: "vendor document",
    categoryId: "cat-vendors",
    department: "Produce",
    organizationId: "demo-org",
    version: "2026.1",
    uploadedBy: "Evan Carter",
    uploadedAt: "Jun 28, 2026, 11:20 AM",
    approvedStatus: "approved",
    approvedBy: "Maya Lopez",
    approvedAt: "Jun 28, 2026, 11:45 AM",
    effectiveDate: "2026-06-28",
    expirationDate: "2027-06-28",
    sourceType: "uploaded",
    visibility: {
      scope: "department",
      labels: ["Produce", "Inventory"]
    },
    downloadUrl: "/files/north-valley-berries-storage.csv",
    viewerUrl: "/files?document=doc-vendor-storage-berries",
    openedCount: 18,
    lastOpenedAt: "Yesterday, 2:16 PM",
    favoritedBy: [],
    tags: ["vendor", "storage", "berries", "temperature"],
    summary: "Vendor guidance for strawberry clamshell storage, receiving temperature, and shelf life.",
    parsingStatus: "embedded"
  },
  {
    id: "file-004",
    documentId: "doc-hoodie-draft",
    title: "Prepared Foods Hoodie Exception Draft",
    fileName: "prepared-foods-hoodie-exception-draft.docx",
    fileType: "docx",
    documentType: "department SOP",
    categoryId: "cat-policies-dress-code",
    department: "Prepared Foods",
    organizationId: "demo-org",
    version: "draft",
    uploadedBy: "Maya Lopez",
    uploadedAt: "Jul 2, 2026, 2:02 PM",
    approvedStatus: "draft",
    effectiveDate: "2026-07-15",
    sourceType: "uploaded",
    visibility: {
      scope: "jobTitle",
      labels: ["Owner", "Store Manager"]
    },
    downloadUrl: "/files/prepared-foods-hoodie-exception-draft.docx",
    viewerUrl: "/files?document=doc-hoodie-draft",
    openedCount: 4,
    favoritedBy: [],
    tags: ["draft", "prepared foods", "hoodie"],
    summary: "Draft exception language for outerwear in prepared foods. Not current approved policy.",
    parsingStatus: "parsed"
  }
]

export const companyFileChunks: CompanyFileChunk[] = [
  {
    id: "chunk-dress-001",
    chunkId: "chunk-dress-001",
    documentId: "doc-dress-code-2026",
    title: "Fresh Market Dress Code",
    sectionTitle: "Prepared foods and deli clothing",
    headingPath: ["Dress code", "Department requirements", "Prepared foods and deli clothing"],
    pageStart: 3,
    pageEnd: 3,
    text:
      "Employees working in deli, bakery production, meat, seafood, and prepared foods must wear clean company-approved shirts or coats, closed-toe non-slip shoes, hair restraint, and a clean apron when handling exposed food. Hoodies, loose sleeves, and dangling accessories are not allowed while handling exposed food because they can create sanitation and safety risks.",
    approvedStatus: "approved",
    createdAt: "2026-07-01T13:30:00.000Z",
    updatedAt: "2026-07-01T13:30:00.000Z",
    embeddingModel: "local-hash-128"
  },
  {
    id: "chunk-dress-002",
    chunkId: "chunk-dress-002",
    documentId: "doc-dress-code-2026",
    title: "Fresh Market Dress Code",
    sectionTitle: "General store appearance",
    headingPath: ["Dress code", "General store appearance"],
    pageStart: 1,
    pageEnd: 2,
    text:
      "Employees should arrive in clean, neat clothing appropriate for their department. Personal outerwear may be worn in non-food handling areas only when it does not cover name badges, create safety risk, or conflict with department-specific rules.",
    approvedStatus: "approved",
    createdAt: "2026-07-01T13:30:00.000Z",
    updatedAt: "2026-07-01T13:30:00.000Z",
    embeddingModel: "local-hash-128"
  },
  {
    id: "chunk-deli-001",
    chunkId: "chunk-deli-001",
    documentId: "doc-deli-closing-2026",
    title: "Deli Closing Procedure",
    sectionTitle: "Closing checklist",
    headingPath: ["Deli closing", "Closing checklist"],
    pageStart: 1,
    pageEnd: 2,
    text:
      "At close, remove expired product from the case, label carryover product, record waste, clean slicers, sanitize prep surfaces, verify cooler temperatures, sweep and mop the department, and sign the closing health check before leaving.",
    approvedStatus: "approved",
    createdAt: "2026-07-01T12:15:00.000Z",
    updatedAt: "2026-07-01T12:15:00.000Z",
    embeddingModel: "local-hash-128"
  },
  {
    id: "chunk-vendor-001",
    chunkId: "chunk-vendor-001",
    documentId: "doc-vendor-storage-berries",
    title: "North Valley Farms Storage Sheet",
    sectionTitle: "Strawberry storage table",
    headingPath: ["Berries", "Storage table"],
    pageStart: 1,
    pageEnd: 1,
    text:
      "Strawberry clamshells should be held at 34-38F after receiving. Do not stack more than five cases high. Inspect for condensation and rotate within four days.",
    tableData: [
      ["Product", "Temperature", "Stack limit", "Shelf life"],
      ["Strawberry clamshell", "34-38F", "5 cases", "4 days"]
    ],
    approvedStatus: "approved",
    createdAt: "2026-06-28T15:45:00.000Z",
    updatedAt: "2026-06-28T15:45:00.000Z",
    embeddingModel: "local-hash-128"
  }
]

export const healthChecks: HealthCheck[] = [
  {
    id: "check-001",
    name: "Opening food safety",
    store: "Liberty Ave",
    schedule: "Daily at open",
    lastCompleted: "Today, 7:02 AM",
    completedBy: "Maya Lopez",
    status: "Current",
    responses: 18,
    questions: [
      { id: "q-001", label: "Are coolers within temperature range?", answerType: "Number", required: true, reviewRule: "Flag below 34F or above 41F." },
      { id: "q-002", label: "Are prep surfaces clean?", answerType: "Multiple choice", required: true, reviewRule: "Flag anything other than clean." },
      { id: "q-003", label: "Corrective action notes", answerType: "Short answer", required: false, reviewRule: "Save with response." }
    ],
    responseHistory: [
      {
        id: "resp-001",
        completedBy: "Maya Lopez",
        employeeId: "MGR-144",
        department: "Store Operations",
        title: "Store Manager",
        completedAt: "Today, 7:02 AM",
        answers: [
          { question: "Are coolers within temperature range?", value: "38F" },
          { question: "Are prep surfaces clean?", value: "Clean" },
          { question: "Corrective action notes", value: "No issues at open." }
        ]
      }
    ]
  },
  {
    id: "check-002",
    name: "Cooler temperature log",
    store: "Liberty Ave",
    schedule: "Every 4 hours",
    lastCompleted: "Today, 11:01 AM",
    completedBy: "Evan Carter",
    status: "Due today",
    responses: 42,
    questions: [
      { id: "q-004", label: "Cooler temperature", answerType: "Number", required: true, reviewRule: "Flag below 34F or above 41F." },
      { id: "q-005", label: "Door seal condition", answerType: "Multiple choice", required: true, reviewRule: "Flag damaged seals." },
      { id: "q-006", label: "Manager notes", answerType: "Long answer", required: false, reviewRule: "Save with response." }
    ],
    responseHistory: [
      {
        id: "resp-002",
        completedBy: "Evan Carter",
        employeeId: "INV-092",
        department: "Inventory",
        title: "Inventory Lead",
        completedAt: "Today, 11:01 AM",
        answers: [
          { question: "Cooler temperature", value: "40F" },
          { question: "Door seal condition", value: "Good" },
          { question: "Manager notes", value: "Recheck produce cooler after lunch rush." }
        ]
      }
    ]
  },
  {
    id: "check-003",
    name: "Closing department walk",
    store: "Downtown Market",
    schedule: "Daily at close",
    lastCompleted: "Yesterday, 9:43 PM",
    completedBy: "Amara Price",
    status: "Overdue",
    responses: 16,
    questions: [
      { id: "q-007", label: "Are expired items removed?", answerType: "Multiple choice", required: true, reviewRule: "Flag if any department remains unchecked." },
      { id: "q-008", label: "Closing walk notes", answerType: "Long answer", required: true, reviewRule: "Require manager review when notes mention blocked aisles." },
      { id: "q-009", label: "Employee confirmation", answerType: "Signature", required: true, reviewRule: "Capture signer and timestamp." }
    ],
    responseHistory: [
      {
        id: "resp-003",
        completedBy: "Amara Price",
        employeeId: "LEAD-218",
        department: "Customer Service",
        title: "Department Lead",
        completedAt: "Yesterday, 9:43 PM",
        answers: [
          { question: "Are expired items removed?", value: "Bakery and produce cleared" },
          { question: "Closing walk notes", value: "Downtown Market needs a follow-up aisle check.", flagged: true },
          { question: "Employee confirmation", value: "Amara Price" }
        ]
      }
    ]
  }
]

export const organizationSettings = [
  ["Organization name", "InvenTracker Demo"],
  ["Default unit", "eaches"],
  ["Expiration default", "No expiration"],
  ["Owner access", "Owners always retain full control"],
  ["Employee auth", "Email/password with future SSO-ready permissions"]
]

export const salesSettings = [
  ["Sales period", "Weekly"],
  ["Sales import", "Manual spreadsheet upload"],
  ["Variance alerts", "Enabled for shrink above 4%"],
  ["Store override", "Allowed only with organization permission"]
]

export const activity = [
  { label: "Spot count posted", detail: "Beer & Wine backstock updated", icon: PackageCheck },
  { label: "Order draft created", detail: "Vintage Point order is ready", icon: ClipboardList },
  { label: "Employee permission changed", detail: "Inventory Lead profile updated", icon: ShieldCheck },
  { label: "Vendor cost changed", detail: "Olive oil increased by 4.1%", icon: Truck },
  { label: "Future AI layer", detail: "Ordering and product details will plug in here", icon: Sparkles }
]

export const shiftNotes: ShiftNote[] = [
  {
    id: "note-001",
    title: "Wine table restock",
    body: "Keep Cabernet full on the front seasonal wine table through the weekend. Watch backstock after the next Vintage Point delivery.",
    visibility: "Department",
    audience: "Beer & Wine",
    author: "Ian Jenkins",
    updatedAt: "Today, 10:22 AM"
  },
  {
    id: "note-002",
    title: "Bakery close",
    body: "Sourdough waste has been creeping up. Closing lead should markdown remaining loaves earlier if movement slows after 6 PM.",
    visibility: "Organization",
    audience: "All stores",
    author: "Maya Lopez",
    updatedAt: "Yesterday, 6:18 PM"
  }
]

export const notifications: WorkspaceNotification[] = [
  {
    id: "notif-001",
    title: "Order due soon",
    detail: "Vintage Point draft is due by 3:00 PM.",
    href: "/orders?draft=ord-001",
    read: false,
    createdAt: "Today, 12:10 PM"
  },
  {
    id: "notif-002",
    title: "Health check due",
    detail: "Cooler temperature log is due again today.",
    href: "/health-checks/check-002",
    read: false,
    createdAt: "Today, 11:30 AM"
  }
]

export const insightCards = [
  {
    title: "Inventory movement",
    value: "+6.2%",
    detail: "Stock movement is trending above the last four-week average.",
    icon: TrendingUp
  },
  {
    title: "Shrink watch",
    value: "12 items",
    detail: "Items with count variance large enough for manager review.",
    icon: AlertTriangle
  },
  {
    title: "AI-ready signals",
    value: "Mapped",
    detail: "Orders, sales, vendors, and item details have a clean place to connect later.",
    icon: Sparkles
  }
]

export const insightMetrics: InsightMetric[] = [
  {
    label: "Waste rate",
    value: "2.8%",
    detail: "Fresh produce and bakery account for 71% of recorded waste this week.",
    trend: "watch"
  },
  {
    label: "Expiration risk",
    value: "18 items",
    detail: "Six items expire within 48 hours; bakery has the highest near-term exposure.",
    trend: "risk"
  },
  {
    label: "Out-of-stock ratio",
    value: "3.4%",
    detail: "Down from 4.1%, but pantry and wine backstock still need attention.",
    trend: "watch"
  },
  {
    label: "Most rotating product",
    value: "Sourdough loaf",
    detail: "Highest movement velocity across current demo data.",
    trend: "good"
  },
  {
    label: "Least rotating product",
    value: "Olive oil 1L",
    detail: "Slow movement and below reorder point; review shelf position before ordering heavy.",
    trend: "neutral"
  },
  {
    label: "Most wasted product",
    value: "Sourdough loaf",
    detail: "Six eaches wasted recently due to expiration before close.",
    trend: "risk"
  },
  {
    label: "Backstock pressure",
    value: "22 units",
    detail: "Items below par with low backstock available for restock.",
    trend: "watch"
  },
  {
    label: "Health check completion",
    value: "91%",
    detail: "Opening checks are current; closing walk is overdue at Downtown Market.",
    trend: "watch"
  }
]

export const insightRankings = [
  ["Fastest rotation", "Sourdough loaf", "42 moves / week", "Bakery"],
  ["Slowest rotation", "Olive oil 1L", "5 moves / week", "Grocery"],
  ["Most wasted", "Sourdough loaf", "6 eaches", "Bakery"],
  ["Highest expiration risk", "Strawberry clamshell", "2 cases quality pull", "Produce"],
  ["Most frequent restock", "Cabernet Sauvignon", "8 restocks / month", "Beer & Wine"]
]

export const dashboardWidgets = [
  {
    id: "inventory",
    title: "Inventory",
    value: "1,248",
    detail: "Low stock, front/back stock, expiration risk",
    href: "/inventory",
    icon: Boxes,
    type: "Tile",
    size: "Medium",
    defaultVisible: true
  },
  {
    id: "orders",
    title: "Orders",
    value: "7 ready",
    detail: "Ready drafts, vendor minimums, upcoming due times",
    href: "/orders",
    icon: ShoppingCart,
    type: "Tile",
    size: "Medium",
    defaultVisible: true
  },
  {
    id: "assistant",
    title: "Assistant",
    value: "Ask",
    detail: "Ask product, nutrition, waste, and ordering questions",
    href: "/ai",
    icon: Sparkles,
    type: "Shortcut",
    size: "Small",
    defaultVisible: true
  },
  {
    id: "insights",
    title: "Insights",
    value: "Adaptive",
    detail: "Waste, stockouts, rotation, and adaptive signals",
    href: "/insights",
    icon: TrendingUp,
    type: "Tile",
    size: "Medium",
    defaultVisible: true
  },
  {
    id: "health",
    title: "Health Checks",
    value: "1 due",
    detail: "Due checks, drafts, and response history",
    href: "/health-checks",
    icon: ClipboardList,
    type: "Tile",
    size: "Medium",
    defaultVisible: true
  },
  {
    id: "history",
    title: "History",
    value: "6 streams",
    detail: "Spot checks, restocks, waste, receiving, portions, orders",
    href: "/history",
    icon: History,
    type: "Shortcut",
    size: "Small",
    defaultVisible: true
  },
  {
    id: "low-stock",
    title: "Low Stock",
    value: "42",
    detail: "Items below reorder point and needing attention",
    href: "/inventory",
    icon: AlertTriangle,
    type: "Metric",
    size: "Small",
    defaultVisible: true
  },
  {
    id: "expiration",
    title: "Expiration Risk",
    value: "18",
    detail: "Items close to expiration by department and store",
    href: "/insights",
    icon: Clock,
    type: "Metric",
    size: "Small",
    defaultVisible: false
  },
  {
    id: "waste",
    title: "Waste Watch",
    value: "2.8%",
    detail: "Most wasted products and recent loss reasons",
    href: "/insights",
    icon: Trash2,
    type: "Metric",
    size: "Small",
    defaultVisible: false
  },
  {
    id: "restocks",
    title: "Restocks",
    value: "8 today",
    detail: "Front/back movement and restock completion history",
    href: "/history/restocks",
    icon: RotateCw,
    type: "History",
    size: "Small",
    defaultVisible: false
  },
  {
    id: "vendors",
    title: "Vendors",
    value: "3 active",
    detail: "Lead times, minimums, contacts, and order readiness",
    href: "/stores",
    icon: Truck,
    type: "Shortcut",
    size: "Small",
    defaultVisible: false
  },
  {
    id: "employees",
    title: "Employees",
    value: "18",
    detail: "Employee records, job titles, and permissions",
    href: "/employees",
    icon: Users,
    type: "Shortcut",
    size: "Small",
    defaultVisible: false
  },
  {
    id: "products",
    title: "Catalog Details",
    value: "Inventory",
    detail: "Product details, nutrition, categories, images, and defaults",
    href: "/inventory",
    icon: PackageCheck,
    type: "Shortcut",
    size: "Small",
    defaultVisible: false
  },
  {
    id: "pending-review",
    title: "Pending Review",
    value: "Assistant fields",
    detail: "Autofilled product details waiting for approval",
    href: "/pending-review",
    icon: ShieldCheck,
    type: "Review",
    size: "Small",
    defaultVisible: false
  },
  {
    id: "notes",
    title: "Notes",
    value: "Shift",
    detail: "Personal shift notes, reminders, and follow-ups",
    href: "/dashboard",
    icon: ClipboardList,
    type: "Note",
    size: "Large",
    defaultVisible: true
  }
]

export const historyTiles = [
  { type: "spot-checks" as const, title: "Spot Checks", detail: "Count adjustments and spot audit trails", icon: ClipboardList },
  { type: "restocks" as const, title: "Restocks", detail: "Front/back movement and restock completion", icon: RotateCw },
  { type: "waste" as const, title: "Waste", detail: "Waste entries by item, user, and department", icon: Trash2 },
  { type: "receive" as const, title: "Receive", detail: "Receiving history and vendor intake", icon: PackageCheck },
  { type: "portion" as const, title: "Portion", detail: "Production and portion activity", icon: PackageX },
  { type: "orders" as const, title: "Order", detail: "Order drafts, approvals, and submissions", icon: ShoppingCart }
]

export const historyRecords: HistoryActionRecord[] = [
  {
    id: "hist-001",
    type: "spot-checks",
    label: "Spot Checks",
    userName: "Maya Lopez",
    employeeId: "MGR-144",
    department: "Store Operations",
    title: "Store Manager",
    store: "Liberty Ave",
    district: "Pittsburgh East",
    region: "Mid-Atlantic",
    date: "Jun 25, 2026",
    time: "8:42 AM",
    summary: "Reviewed wine backstock and updated Cabernet Sauvignon count.",
    responses: [
      { label: "Item", value: "Cabernet Sauvignon" },
      { label: "Front stock", value: "6 eaches" },
      { label: "Backstock", value: "12 eaches" },
      { label: "Result", value: "Count accepted and inventory updated" }
    ]
  },
  {
    id: "hist-002",
    type: "restocks",
    label: "Restocks",
    userName: "Evan Carter",
    employeeId: "INV-092",
    department: "Inventory",
    title: "Inventory Lead",
    store: "Liberty Ave",
    district: "Pittsburgh East",
    region: "Mid-Atlantic",
    date: "Jun 25, 2026",
    time: "9:10 AM",
    summary: "Moved 2 Cabernet Sauvignon from backstock to sales floor.",
    responses: [
      { label: "Item", value: "Cabernet Sauvignon" },
      { label: "Pulled", value: "2 eaches" },
      { label: "Front stock after", value: "8 eaches" },
      { label: "Backstock after", value: "10 eaches" }
    ]
  },
  {
    id: "hist-003",
    type: "waste",
    label: "Waste",
    userName: "Maya Lopez",
    employeeId: "MGR-144",
    department: "Store Operations",
    title: "Store Manager",
    store: "Liberty Ave",
    district: "Pittsburgh East",
    region: "Mid-Atlantic",
    date: "Jun 24, 2026",
    time: "7:04 PM",
    summary: "Approved bakery waste from expired sourdough before close.",
    responses: [
      { label: "Item", value: "Sourdough loaf" },
      { label: "Quantity", value: "6 eaches" },
      { label: "Reason", value: "Expired before close" },
      { label: "Approved by", value: "Maya Lopez" }
    ]
  },
  {
    id: "hist-004",
    type: "receive",
    label: "Receive",
    userName: "Evan Carter",
    employeeId: "INV-092",
    department: "Inventory",
    title: "Inventory Lead",
    store: "Liberty Ave",
    district: "Pittsburgh East",
    region: "Mid-Atlantic",
    date: "Jun 24, 2026",
    time: "6:21 AM",
    summary: "Received North Valley Farms produce delivery.",
    responses: [
      { label: "Vendor", value: "North Valley Farms" },
      { label: "Received", value: "9 strawberry cases" },
      { label: "Quality", value: "Accepted" },
      { label: "Stored at", value: "Cooler 1" }
    ]
  },
  {
    id: "hist-005",
    type: "portion",
    label: "Portion",
    userName: "Ian Jenkins",
    employeeId: "OWNER-001",
    department: "Executive",
    title: "Owner",
    store: "All stores",
    district: "All districts",
    region: "All regions",
    date: "Jun 23, 2026",
    time: "3:35 PM",
    summary: "Reviewed portioning template for bakery production.",
    responses: [
      { label: "Template", value: "Bakery production" },
      { label: "Change", value: "Review only" },
      { label: "Notes", value: "Keep portions aligned to weekly sales imports." }
    ]
  },
  {
    id: "hist-006",
    type: "orders",
    label: "Order",
    userName: "Maya Lopez",
    employeeId: "MGR-144",
    department: "Store Operations",
    title: "Store Manager",
    store: "Liberty Ave",
    district: "Pittsburgh East",
    region: "Mid-Atlantic",
    date: "Jun 23, 2026",
    time: "11:18 AM",
    summary: "Approved Vintage Point order draft.",
    responses: [
      { label: "Vendor", value: "Vintage Point" },
      { label: "Total", value: "$852.00" },
      { label: "Expected arrival", value: "Jul 3, 2026" },
      { label: "Submitted by", value: "Maya Lopez" }
    ]
  }
]

export const historyPermissionScopes = [
  ["Everything", "Can view all history across every organization scope"],
  ["Regions", "Can view selected regions and every district/store inside those regions"],
  ["Districts", "Can view selected districts and stores inside those districts"],
  ["Stores", "Can view selected store activity only"],
  ["Departments", "Can view selected department activity across allowed stores"],
  ["Individuals", "Can view selected employees or direct reports only"]
]

export const healthCheckDraftQuestions = [
  ["Number", "Temperature reading", "Requires numeric range validation and unit display."],
  ["Multiple choice", "Surface condition", "Single-select options for clean, needs attention, or closed."],
  ["Short answer", "Corrective action", "One-line response for quick notes."],
  ["Long answer", "Manager notes", "Longer free-form documentation."],
  ["Photo upload", "Package or cooler proof", "Future attachment field for evidence."],
  ["Signature", "Employee confirmation", "Captures signer and completion timestamp."]
]
