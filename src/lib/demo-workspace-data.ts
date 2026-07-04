export type DemoPlanId = "starter" | "growth" | "scale" | "enterprise"

export type DemoFeature =
  | "dashboard"
  | "inventory"
  | "orders"
  | "employees"
  | "files"
  | "insights"
  | "assistant"
  | "advancedPermissions"
  | "webEnrichment"

export type DemoPermission =
  | "*"
  | "inventory.view"
  | "inventory.edit"
  | "orders.view"
  | "orders.edit"
  | "employees.view"
  | "employees.edit"
  | "files.view"
  | "files.edit"
  | "insights.view"
  | "assistant.use"
  | "assistant.enrich"

export type DemoNutrition = {
  servingSize: string
  caloriesKcal: number
  fatG: number
  carbohydratesG: number
  sugarsG: number
  fiberG: number
  proteinG: number
  sodiumMg: number
  ingredients: string
  allergens: string
  dietaryTags: string[]
}

export type DemoProduct = {
  id: string
  name: string
  sku: string
  barcode: string
  department: string
  category: string
  vendor: string
  location: string
  unit: string
  price: number
  cost: number
  marginPercent: number
  caseQuantity: number
  frontStock: number
  backStock: number
  onHand: number
  par: number
  reorderPoint: number
  sevenDaySales: number
  thirtyDayWaste: number
  expires: boolean
  averageExpirationDays?: number
  status: "Healthy" | "Low" | "Overstock" | "Review"
  imageHint: string
  notes: string
  nutrition?: DemoNutrition
}

export type DemoEmployee = {
  id: string
  name: string
  employeeId: string
  email: string
  phone: string
  title: string
  department: string
  store: string
  status: "Active" | "Training" | "Invite sent"
  permissions: DemoPermission[]
}

export type DemoPolicy = {
  id: string
  title: string
  category: string
  department: string
  type: "Policy" | "How-to" | "SOP" | "Vendor sheet"
  audience: string
  updatedAt: string
  openedCount: number
  favorite: boolean
  summary: string
  body: string
}

export type DemoOrder = {
  id: string
  vendor: string
  minimum: number
  currentTotal: number
  dueInHours: number
  status: "Draft" | "Ready" | "Needs review"
  lines: Array<{
    sku: string
    itemName: string
    quantity: number
    unitCost: number
    reason: string
  }>
}

export type DemoInsight = {
  label: string
  value: string
  detail: string
  tone: "good" | "watch" | "risk" | "neutral"
}

export const demoPlans: Array<{
  id: DemoPlanId
  name: string
  tagline: string
  features: DemoFeature[]
}> = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Inventory, basic ordering, and a small team workspace.",
    features: ["dashboard", "inventory", "orders", "employees"]
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Adds files, richer health operations, and assistant basics.",
    features: ["dashboard", "inventory", "orders", "employees", "files", "assistant"]
  },
  {
    id: "scale",
    name: "Scale",
    tagline: "Adds insights, document intelligence, and stronger controls.",
    features: ["dashboard", "inventory", "orders", "employees", "files", "insights", "assistant", "advancedPermissions"]
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Everything unlocked, including advanced enrichment simulation.",
    features: ["dashboard", "inventory", "orders", "employees", "files", "insights", "assistant", "advancedPermissions", "webEnrichment"]
  }
]

const productGroups = [
  {
    department: "Bakery",
    prefix: "BAKE",
    vendor: "In-house Bakery",
    unit: "eaches",
    food: true,
    expires: true,
    categories: ["Bread", "Cookies", "Pastry", "Gluten free", "Cake"],
    names: ["Sourdough loaf", "Everything baguette", "Chocolate chunk cookie", "Blueberry muffin", "Gluten free roll", "Cinnamon coffee cake"],
    ingredients: ["wheat flour", "water", "starter", "salt", "butter", "sugar"],
    allergens: "Wheat, milk"
  },
  {
    department: "Produce",
    prefix: "PROD",
    vendor: "North Valley Farms",
    unit: "cases",
    food: true,
    expires: true,
    categories: ["Berries", "Greens", "Citrus", "Root vegetables", "Herbs"],
    names: ["Strawberry clamshell", "Organic kale bunch", "Navel oranges", "Rainbow carrots", "Fresh basil", "Avocado bag"],
    ingredients: ["fresh produce"],
    allergens: "None recorded"
  },
  {
    department: "Deli",
    prefix: "DELI",
    vendor: "Prepared Foods Kitchen",
    unit: "pounds",
    food: true,
    expires: true,
    categories: ["Prepared salads", "Cheese", "Charcuterie", "Entrées", "Sides"],
    names: ["Mascarpone cup", "Chicken salad", "Mozzarella pearls", "Prosciutto sliced", "Roasted vegetable tray", "Macaroni salad"],
    ingredients: ["milk", "cream", "salt", "herbs", "olive oil"],
    allergens: "Milk"
  },
  {
    department: "Meat & Seafood",
    prefix: "MEAT",
    vendor: "Harbor & Range",
    unit: "pounds",
    food: true,
    expires: true,
    categories: ["Chicken", "Beef", "Pork", "Seafood", "Marinated"],
    names: ["Rotisserie chicken", "Ground beef 85/15", "Atlantic salmon fillet", "Pork tenderloin", "Shrimp skewer", "Turkey burger"],
    ingredients: ["meat", "salt", "seasoning"],
    allergens: "Fish/shellfish on seafood items"
  },
  {
    department: "Grocery",
    prefix: "GROC",
    vendor: "Mediterranean Goods",
    unit: "eaches",
    food: true,
    expires: false,
    categories: ["Pantry", "Pasta", "Sauce", "Snacks", "Breakfast"],
    names: ["Olive oil 1L", "Bronze cut pasta", "Marinara jar", "Sea salt crackers", "Granola pouch", "Local honey"],
    ingredients: ["varies by packaged product"],
    allergens: "Check label"
  },
  {
    department: "Beer & Wine",
    prefix: "WINE",
    vendor: "Vintage Point",
    unit: "eaches",
    food: false,
    expires: false,
    categories: ["Red wine", "White wine", "Sparkling", "IPA", "Hard seltzer"],
    names: ["Cabernet Sauvignon", "Pinot Grigio", "Sparkling rosé", "Local IPA", "Grapefruit hard seltzer", "Non alcoholic lager"],
    ingredients: ["alcoholic beverage"],
    allergens: "Contains sulfites where labeled"
  },
  {
    department: "Dairy",
    prefix: "DAIRY",
    vendor: "Cold Chain Creamery",
    unit: "cases",
    food: true,
    expires: true,
    categories: ["Milk", "Yogurt", "Cheese", "Butter", "Cream"],
    names: ["Whole milk gallon", "Greek yogurt tub", "Sharp cheddar block", "European butter", "Heavy cream quart", "Oat creamer"],
    ingredients: ["milk", "cream", "cultures", "salt"],
    allergens: "Milk"
  },
  {
    department: "Frozen",
    prefix: "FROZ",
    vendor: "Polar Pantry",
    unit: "cases",
    food: true,
    expires: true,
    categories: ["Ice cream", "Vegetables", "Meals", "Dessert", "Pizza"],
    names: ["Vanilla ice cream", "Frozen broccoli", "Vegetable lasagna", "Mochi bites", "Margherita pizza", "Fruit smoothie pack"],
    ingredients: ["varies by packaged product"],
    allergens: "Check label"
  },
  {
    department: "Wellness",
    prefix: "WELL",
    vendor: "Everyday Wellness",
    unit: "eaches",
    food: false,
    expires: true,
    categories: ["Vitamins", "Personal care", "First aid", "Supplements"],
    names: ["Vitamin C gummies", "Mineral sunscreen", "Bandage variety pack", "Electrolyte tablets", "Hand lotion", "Magnesium capsules"],
    ingredients: ["non-food wellness item"],
    allergens: "Check package"
  },
  {
    department: "Household",
    prefix: "HOME",
    vendor: "Clean Supply Co.",
    unit: "eaches",
    food: false,
    expires: false,
    categories: ["Cleaning", "Paper", "Kitchen", "Laundry"],
    names: ["Compostable plates", "Paper towels", "Dish soap", "Laundry pods", "Trash bags", "Glass cleaner"],
    ingredients: ["non-food household item"],
    allergens: "Not applicable"
  }
]

const sizeWords = ["small", "classic", "family", "premium", "organic", "local", "bulk", "seasonal"]
const locations = ["Aisle 1", "Aisle 2", "Aisle 4", "Cooler 1", "Cooler 3", "Bakery rack", "Wine wall", "Backstock B", "Endcap 2", "Display table"]

function dollars(value: number) {
  return Number(value.toFixed(2))
}

function barcodeFor(index: number) {
  return String(738100000000 + index * 37).slice(0, 12)
}

function nutritionFor(index: number, group: (typeof productGroups)[number], productName: string): DemoNutrition | undefined {
  if (!group.food) return undefined
  const calories = productName.toLowerCase().includes("sourdough loaf") ? 120 : 45 + ((index * 23) % 310)
  const protein = 1 + (index % 18)
  const carbs = 5 + ((index * 7) % 52)
  const fat = 1 + ((index * 5) % 24)

  return {
    servingSize: group.unit === "pounds" ? "4 oz" : group.unit === "cases" ? "1 serving" : "1 item",
    caloriesKcal: calories,
    fatG: fat,
    carbohydratesG: carbs,
    sugarsG: Math.max(0, Math.round(carbs * 0.3)),
    fiberG: index % 5,
    proteinG: protein,
    sodiumMg: 20 + ((index * 41) % 620),
    ingredients: group.ingredients.join(", "),
    allergens: group.allergens,
    dietaryTags: [
      index % 6 === 0 ? "vegetarian" : undefined,
      index % 11 === 0 ? "gluten free candidate" : undefined,
      index % 17 === 0 ? "kosher status not recorded" : undefined
    ].filter((tag): tag is string => Boolean(tag))
  }
}

export const demoProducts: DemoProduct[] = Array.from({ length: 250 }, (_, index) => {
  const group = productGroups[index % productGroups.length]
  const category = group.categories[Math.floor(index / productGroups.length) % group.categories.length]
  const baseName = group.names[index % group.names.length]
  const size = sizeWords[index % sizeWords.length]
  const price = dollars(2.49 + ((index * 1.73) % 38))
  const cost = dollars(price * (0.48 + (index % 18) / 100))
  const frontStock = 2 + ((index * 3) % 46)
  const backStock = 1 + ((index * 5) % 84)
  const par = Math.max(frontStock + 4, 18 + ((index * 7) % 110))
  const reorderPoint = Math.max(2, Math.round(par * 0.32))
  const onHand = frontStock + backStock
  const status = onHand <= reorderPoint ? "Low" : onHand > par * 1.35 ? "Overstock" : index % 13 === 0 ? "Review" : "Healthy"

  return {
    id: `demo-prod-${String(index + 1).padStart(3, "0")}`,
    name: `${size[0].toUpperCase()}${size.slice(1)} ${baseName}`,
    sku: `${group.prefix}-${String(index + 1).padStart(4, "0")}`,
    barcode: barcodeFor(index + 1),
    department: group.department,
    category,
    vendor: group.vendor,
    location: locations[index % locations.length],
    unit: group.unit,
    price,
    cost,
    marginPercent: Math.round(((price - cost) / price) * 100),
    caseQuantity: group.unit === "pounds" ? 10 : group.unit === "cases" ? 6 + (index % 8) : 1 + (index % 24),
    frontStock,
    backStock,
    onHand,
    par,
    reorderPoint,
    sevenDaySales: 3 + ((index * 9) % 95),
    thirtyDayWaste: group.expires ? dollars(((index * 1.8) % 24) / 2) : dollars(((index * 0.4) % 6) / 2),
    expires: group.expires,
    averageExpirationDays: group.expires ? 2 + (index % 45) : undefined,
    status,
    imageHint: `${group.department} ${category} product photo placeholder`,
    notes: `${group.department} demo item. Vendor ${group.vendor}. ${status === "Low" ? "Needs replenishment review." : "Normal demo movement."}`,
    nutrition: nutritionFor(index, group, baseName)
  }
})

export const demoEmployees: DemoEmployee[] = [
  ["Avery Brooks", "OWNER-001", "Owner", "Executive", "*"],
  ["Maya Lopez", "MGR-144", "Store Manager", "Store Operations", "inventory.view,inventory.edit,orders.view,orders.edit,employees.view,files.view,insights.view,assistant.use"],
  ["Noah Kim", "ASM-203", "Assistant Manager", "Store Operations", "inventory.view,inventory.edit,orders.view,employees.view,files.view,assistant.use"],
  ["Priya Shah", "INV-092", "Inventory Lead", "Inventory", "inventory.view,inventory.edit,orders.view,orders.edit,insights.view,assistant.use"],
  ["Evan Carter", "REC-118", "Receiver", "Inventory", "inventory.view,inventory.edit,orders.view"],
  ["Lena Ortiz", "BAK-401", "Bakery Lead", "Bakery", "inventory.view,inventory.edit,orders.view,files.view,assistant.use"],
  ["Theo Martin", "BAK-417", "Baker", "Bakery", "inventory.view,files.view"],
  ["Sam Rivera", "PRO-305", "Produce Lead", "Produce", "inventory.view,inventory.edit,orders.view,assistant.use"],
  ["Nia Bennett", "PRO-337", "Produce Clerk", "Produce", "inventory.view"],
  ["Marco Ellis", "DEL-221", "Deli Lead", "Deli", "inventory.view,inventory.edit,files.view,assistant.use"],
  ["Grace Chen", "DEL-229", "Prepared Foods", "Deli", "inventory.view,files.view"],
  ["Harper Stone", "WNE-512", "Beer & Wine Lead", "Beer & Wine", "inventory.view,inventory.edit,orders.view,assistant.use"],
  ["Jules Morgan", "GRO-670", "Grocery Lead", "Grocery", "inventory.view,inventory.edit,orders.view"],
  ["Iris Walker", "FRZ-098", "Frozen Clerk", "Frozen", "inventory.view"],
  ["Owen Patel", "FNT-712", "Front End Lead", "Front End", "employees.view,files.view"],
  ["Riley Adams", "CSR-813", "Customer Service", "Front End", "files.view"],
  ["Quinn James", "HCH-055", "Health Check Coordinator", "Operations", "files.view,insights.view,assistant.use"],
  ["Amara Lewis", "HOU-744", "Household Lead", "Household", "inventory.view,inventory.edit"],
  ["Mateo Cruz", "WEL-633", "Wellness Lead", "Wellness", "inventory.view,inventory.edit,files.view,assistant.use"],
  ["Sky Taylor", "TRN-019", "Team Member", "Training", "inventory.view"]
].map(([name, employeeId, title, department, permissions], index) => ({
  id: `demo-emp-${String(index + 1).padStart(2, "0")}`,
  name,
  employeeId,
  email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@demo.inventracker.com`,
  phone: `(555) 310-${String(1000 + index * 37).slice(-4)}`,
  title,
  department,
  store: index < 14 ? "Liberty Ave" : index < 18 ? "Market Street" : "North End",
  status: index % 9 === 0 ? "Training" : index % 13 === 0 ? "Invite sent" : "Active",
  permissions: permissions === "*" ? ["*"] : (permissions.split(",") as DemoPermission[])
}))

export const demoPolicies: DemoPolicy[] = [
  {
    id: "policy-dress-code",
    title: "Store Dress Code",
    category: "Policies",
    department: "All departments",
    type: "Policy",
    audience: "All employees",
    updatedAt: "Jul 1, 2026",
    openedCount: 146,
    favorite: true,
    summary: "Clean uniform standards, approved layers, name tag rules, and department-specific safety requirements.",
    body: "Employees should arrive in clean, food-safe clothing. Deli, bakery, meat, and prepared foods teams must wear hair restraints and closed-toe nonslip shoes. Hoodies are allowed only when strings are secured and the department manager approves the layer for the workstation."
  },
  {
    id: "howto-bakery-close",
    title: "Bakery Closing Checklist",
    category: "How-tos",
    department: "Bakery",
    type: "How-to",
    audience: "Bakery team",
    updatedAt: "Jun 24, 2026",
    openedCount: 91,
    favorite: false,
    summary: "End-of-day pull, markdown, cleaning, donation, and proofing prep steps.",
    body: "Pull expired product first, separate donation-safe items, clean slicers and racks, record shrink by SKU, then stage morning bake sheets by par priority."
  },
  {
    id: "sop-produce-quality",
    title: "Produce Quality Pull SOP",
    category: "SOPs",
    department: "Produce",
    type: "SOP",
    audience: "Produce leads",
    updatedAt: "Jun 21, 2026",
    openedCount: 78,
    favorite: true,
    summary: "Quality thresholds for berries, greens, wet rack items, and cull logging.",
    body: "Inspect berries for mold, moisture, and soft fruit. Cull questionable product before restocking. Record reason, quantity, and lot when available."
  },
  {
    id: "vendor-vintage-point",
    title: "Vintage Point Ordering Guide",
    category: "Vendor sheets",
    department: "Beer & Wine",
    type: "Vendor sheet",
    audience: "Beer & Wine leads",
    updatedAt: "Jun 18, 2026",
    openedCount: 64,
    favorite: false,
    summary: "Order minimums, lead times, delivery windows, and stable minimum-fill candidates.",
    body: "Minimum order is $750. Orders are due by 3 PM two days before delivery. Stable shelf items may be used to fill minimums when movement supports the extra quantity."
  },
  {
    id: "policy-allergen",
    title: "Allergen Handling Policy",
    category: "Food safety",
    department: "Prepared foods",
    type: "Policy",
    audience: "Food production teams",
    updatedAt: "Jun 15, 2026",
    openedCount: 122,
    favorite: true,
    summary: "Label handling, customer questions, and cross-contact prevention.",
    body: "Do not make allergen-free claims unless the approved product record or package label supports it. Use separate utensils for allergen-sensitive prep and escalate uncertain questions to a manager."
  },
  {
    id: "howto-receiving",
    title: "Receiving Temperature Guide",
    category: "How-tos",
    department: "Inventory",
    type: "How-to",
    audience: "Receivers",
    updatedAt: "Jun 10, 2026",
    openedCount: 88,
    favorite: false,
    summary: "Temperature checks for refrigerated, frozen, and hot prepared deliveries.",
    body: "Record delivery time, vendor, product temperature, and rejection notes. Frozen product should arrive frozen solid. Refrigerated product should remain at safe receiving temperature."
  },
  {
    id: "sop-restock",
    title: "Front Stock Restock Flow",
    category: "SOPs",
    department: "Inventory",
    type: "SOP",
    audience: "Department leads",
    updatedAt: "Jun 8, 2026",
    openedCount: 73,
    favorite: false,
    summary: "Scan floor quantity, compare backstock, pull to max floor capacity, and update counts.",
    body: "Scan the floor item, enter front stock, confirm backstock, and pull only the quantity that fits the floor. Save the restock action so history stays accurate."
  },
  {
    id: "policy-markdowns",
    title: "Markdown Timing Policy",
    category: "Policies",
    department: "All departments",
    type: "Policy",
    audience: "Managers and leads",
    updatedAt: "Jun 2, 2026",
    openedCount: 59,
    favorite: false,
    summary: "When to markdown short-dated or slow-moving products.",
    body: "Markdown perishable items before quality loss. Do not markdown recalled, unsafe, or unlabeled items. Record the reason so future ordering can learn from the pattern."
  }
]

export const demoOrders: DemoOrder[] = [
  {
    id: "demo-order-1",
    vendor: "North Valley Farms",
    minimum: 400,
    currentTotal: 512,
    dueInHours: 5,
    status: "Ready",
    lines: [
      { sku: "PROD-0012", itemName: "Organic kale bunch", quantity: 8, unitCost: 32, reason: "Below par and weekend traffic is elevated." },
      { sku: "PROD-0042", itemName: "Strawberry clamshell", quantity: 6, unitCost: 48, reason: "High rotation and low backstock." }
    ]
  },
  {
    id: "demo-order-2",
    vendor: "Vintage Point",
    minimum: 750,
    currentTotal: 688,
    dueInHours: 29,
    status: "Needs review",
    lines: [
      { sku: "WINE-0006", itemName: "Cabernet Sauvignon", quantity: 36, unitCost: 12.4, reason: "Floor is below display need; extra stable items may fill the minimum." },
      { sku: "WINE-0056", itemName: "Sparkling rosé", quantity: 18, unitCost: 13.45, reason: "Holiday weekend lift candidate." }
    ]
  },
  {
    id: "demo-order-3",
    vendor: "Cold Chain Creamery",
    minimum: 500,
    currentTotal: 541,
    dueInHours: 13,
    status: "Draft",
    lines: [
      { sku: "DAIRY-0037", itemName: "Whole milk gallon", quantity: 10, unitCost: 24, reason: "Staple item, healthy movement, safe minimum fill." },
      { sku: "DAIRY-0077", itemName: "Heavy cream quart", quantity: 7, unitCost: 43, reason: "Bakery production need." }
    ]
  }
]

export const demoInsights: DemoInsight[] = [
  { label: "Out-of-stock ratio", value: "2.8%", detail: "7 of 250 demo items are under zero or unavailable.", tone: "watch" },
  { label: "Waste pressure", value: "$412", detail: "Bakery and produce account for 64% of the demo waste total.", tone: "risk" },
  { label: "Fastest rotation", value: "Strawberry clamshell", detail: "Moves 7.6x faster than the average produce item.", tone: "good" },
  { label: "Slowest rotation", value: "Mineral sunscreen", detail: "Stable inventory, but too much backstock for current movement.", tone: "neutral" },
  { label: "Expiration risk", value: "31 items", detail: "Short-dated products need markdown or production review.", tone: "risk" },
  { label: "Vendor minimum risk", value: "2 drafts", detail: "Two demo orders are below minimum and need manager review.", tone: "watch" }
]

export function createDemoSnapshot() {
  return {
    products: demoProducts,
    employees: demoEmployees,
    policies: demoPolicies,
    orders: demoOrders,
    insights: demoInsights,
    notes: [
      "Demo note: check bakery markdowns before 4 PM.",
      "Demo note: produce wet rack needs one more quality walk.",
      "Demo note: wine table is part of the weekend feature."
    ]
  }
}
