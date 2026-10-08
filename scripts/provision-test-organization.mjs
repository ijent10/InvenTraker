import fs from "node:fs"
import { applicationDefault, cert, getApps, initializeApp, refreshToken } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || JSON.parse(fs.readFileSync(".firebaserc", "utf8")).projects.default
const orgId = process.env.INVENTRAKER_TEST_ORG_ID || "east-liberty-market-group"
const storeId = "east-liberty-main"
const ownerEmail = process.env.INVENTRAKER_TEST_OWNER_EMAIL || "market.owner@inventraker.app"
const ownerPassword = process.env.INVENTRAKER_TEST_OWNER_PASSWORD || "MarketOwner2026!"
const employeeEmail = process.env.INVENTRAKER_TEST_EMPLOYEE_EMAIL || "market.employee@inventraker.app"
const employeePassword = process.env.INVENTRAKER_TEST_EMPLOYEE_PASSWORD || "MarketEmployee2026!"
const now = new Date()
const iso = (days = 0, hours = 0) => new Date(now.getTime() + days * 86400000 + hours * 3600000).toISOString()

function cliCredential() {
  const path = `${process.env.HOME}/.config/configstore/firebase-tools.json`
  if (!fs.existsSync(path)) return undefined
  const token = JSON.parse(fs.readFileSync(path, "utf8")).tokens?.refresh_token
  return token ? refreshToken({
    type: "authorized_user",
    client_id: "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
    client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi",
    refresh_token: token
  }) : undefined
}

const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
  : cliCredential() ?? applicationDefault()
const app = getApps()[0] || initializeApp({ credential, projectId })
const auth = getAuth(app)

const cliConfigPath = `${process.env.HOME}/.config/configstore/firebase-tools.json`
const cliConfig = JSON.parse(fs.readFileSync(cliConfigPath, "utf8"))
const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
    client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi",
    refresh_token: cliConfig.tokens.refresh_token,
    grant_type: "refresh_token"
  })
})
if (!tokenResponse.ok) throw new Error(`Could not refresh Firebase CLI access: ${tokenResponse.status}`)
const accessToken = (await tokenResponse.json()).access_token

function firestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } }
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreValue(child)])) } }
  if (typeof value === "boolean") return { booleanValue: value }
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  return { stringValue: String(value) }
}

function document(path, value) {
  return {
    update: {
      name: `projects/${projectId}/databases/(default)/documents/${path}`,
      fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreValue(child)]))
    }
  }
}

async function writeDocuments(entries) {
  for (let offset = 0; offset < entries.length; offset += 400) {
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:batchWrite`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ writes: entries.slice(offset, offset + 400).map(([path, value]) => document(path, value)) })
    })
    if (!response.ok) throw new Error(`Firestore batch write failed: ${response.status} ${await response.text()}`)
    const result = await response.json()
    if (result.status?.some((status) => status.code)) throw new Error(`A Firestore write failed: ${JSON.stringify(result.status)}`)
  }
}

async function upsertUser(email, password, displayName) {
  try {
    const existing = await auth.getUserByEmail(email)
    return auth.updateUser(existing.uid, { password, displayName, emailVerified: true, disabled: false })
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error
    return auth.createUser({ email, password, displayName, emailVerified: true })
  }
}

const [owner, employee] = await Promise.all([
  upsertUser(ownerEmail, ownerPassword, "Morgan Reed"),
  upsertUser(employeeEmail, employeePassword, "Taylor Brooks")
])

const productSeeds = [
  { name: "Nutella Hazelnut Spread", sku: "3017620422003", department: "Grocery", category: "Spreads", unit: "eaches", price: 6.99, cost: 4.05, onHand: 18, par: 24, reorder: 8, vendor: "Metro Grocery Distribution" },
  { name: "Coca-Cola Original Taste", sku: "049000028904", department: "Beverage", category: "Soft Drinks", unit: "eaches", price: 2.79, cost: 1.35, onHand: 31, par: 42, reorder: 14, vendor: "Metro Grocery Distribution" },
  { name: "Original Cheerios", sku: "016000275287", department: "Grocery", category: "Cereal", unit: "eaches", price: 5.49, cost: 3.12, onHand: 9, par: 20, reorder: 7, vendor: "Metro Grocery Distribution" },
  { name: "Barilla Thin Spaghetti", sku: "076808280098", department: "Grocery", category: "Pasta", unit: "eaches", price: 2.49, cost: 1.18, onHand: 25, par: 30, reorder: 10, vendor: "Metro Grocery Distribution" },
  { name: "Doritos Nacho Cheese", sku: "028400090896", department: "Grocery", category: "Snacks", unit: "eaches", price: 5.99, cost: 3.31, onHand: 7, par: 24, reorder: 8, vendor: "Metro Grocery Distribution" },
  { name: "Kraft Macaroni & Cheese", sku: "021000658831", department: "Grocery", category: "Prepared Pantry", unit: "eaches", price: 1.49, cost: 0.72, onHand: 38, par: 48, reorder: 16, vendor: "Metro Grocery Distribution" },
  { name: "Di Bruno Bros. Garlic & Herb Cheese Spread", sku: "00810048160037", department: "Deli", category: "Dips & Spreads", unit: "eaches", price: 9.99, cost: 6.4, onHand: 8, par: 14, reorder: 5, vendor: "Artisan Foods Cooperative" },
  { name: "Cubed Pepper Jack", sku: "00211650000009", department: "Deli", category: "Specialty Cheese", unit: "pounds", price: 11.99, cost: 7.15, onHand: 13.4, par: 18, reorder: 6, vendor: "Artisan Foods Cooperative", variableMeasure: { isVariableMeasure: true, symbology: "UPC-A Type 2 / RCN-12", rcnPrefix: "2", itemReference: "11650", lookupPrefix: "211650", embeddedPriceDigits: 4, encodedValue: "price", placeholderBarcode: "00211650000009" }, nutrition: { servingSize: "1 oz (28 g)", servingWeightGrams: 28, caloriesKcal: 110, fatG: 9, saturatedFatG: 6, carbohydratesG: 1, sugarsG: 0, proteinG: 7, sodiumMg: 180, basisAmount: 1, basisUnit: "serving", scalableByWeight: true, dataKind: "representative_product_type", sourceSummary: "Representative pepper jack nutrition; replace with supplier label when available.", sourceUrl: "https://fdc.nal.usda.gov/" } },
  { name: "Honeycrisp Apple", sku: "3283", department: "Produce", category: "Fresh Fruit", unit: "pounds", price: 2.49, cost: 1.37, onHand: 42.6, par: 55, reorder: 18, vendor: "Allegheny Produce Co-op", variableMeasure: { isVariableMeasure: true, symbology: "PLU / scale label", itemReference: "3283", encodedValue: "weight" } },
  { name: "Organic Bananas", sku: "94011", department: "Produce", category: "Fresh Fruit", unit: "pounds", price: 0.99, cost: 0.48, onHand: 56.2, par: 70, reorder: 25, vendor: "Allegheny Produce Co-op", variableMeasure: { isVariableMeasure: true, symbology: "PLU / scale label", itemReference: "94011", encodedValue: "weight" } },
  { name: "Cantaloupe", sku: "4050", department: "Produce", category: "Fresh Fruit", unit: "eaches", price: 4.49, cost: 2.15, onHand: 11, par: 18, reorder: 6, vendor: "Allegheny Produce Co-op" },
  { name: "Red Bell Pepper", sku: "4088", department: "Produce", category: "Fresh Vegetables", unit: "eaches", price: 1.50, cost: 0.81, onHand: 22, par: 28, reorder: 10, vendor: "Allegheny Produce Co-op" }
]

async function openFoodFacts(sku) {
  if (sku.length < 8 || sku.startsWith("002")) return null
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${sku}.json?fields=code,product_name,brands,image_front_url,ingredients_text,allergens,nutriments,serving_size`, {
    headers: { "User-Agent": "InvenTrackerMockSeeder/1.0 (demo@inventraker.app)" }
  })
  if (!response.ok) return null
  const body = await response.json()
  return body.status === 1 ? body.product : null
}

const enriched = await Promise.all(productSeeds.map(async (seed) => {
  const source = await openFoodFacts(seed.sku)
  const nutrients = source?.nutriments ?? {}
  const nutrition = seed.nutrition ?? (source ? {
    servingSize: source.serving_size || "100 g",
    servingWeightGrams: Number.parseFloat(source.serving_size) || 100,
    caloriesKcal: nutrients["energy-kcal_serving"] ?? nutrients["energy-kcal_100g"],
    fatG: nutrients.fat_serving ?? nutrients.fat_100g,
    saturatedFatG: nutrients["saturated-fat_serving"] ?? nutrients["saturated-fat_100g"],
    carbohydratesG: nutrients.carbohydrates_serving ?? nutrients.carbohydrates_100g,
    sugarsG: nutrients.sugars_serving ?? nutrients.sugars_100g,
    fiberG: nutrients.fiber_serving ?? nutrients.fiber_100g,
    proteinG: nutrients.proteins_serving ?? nutrients.proteins_100g,
    sodiumMg: 1000 * (nutrients.sodium_serving ?? nutrients.sodium_100g ?? 0),
    ingredientsText: source.ingredients_text || "",
    allergens: source.allergens || "",
    imageUrl: source.image_front_url || "",
    sourceSummary: "Public product record matched by exact barcode.",
    sourceUrl: `https://world.openfoodfacts.org/product/${seed.sku}`,
    basisAmount: source.serving_size ? 1 : 100,
    basisUnit: source.serving_size ? "serving" : "100g",
    scalableByWeight: true,
    dataKind: "exact_product"
  } : undefined)
  return { ...seed, nutrition, images: source?.image_front_url ? [source.image_front_url] : [] }
}))

const staff = [
  { id: owner.uid, uid: owner.uid, name: "Morgan Reed", email: ownerEmail, employeeId: "MOCK-001", badgeNumber: "1001", phone: "412-555-0101", jobTitle: "Organization Owner", department: "Executive", role: "owner", permissions: ["*"] },
  { id: employee.uid, uid: employee.uid, name: "Taylor Brooks", email: employeeEmail, employeeId: "MOCK-101", badgeNumber: "1101", phone: "412-555-0102", jobTitle: "Inventory Associate", department: "Inventory", role: "employee", permissions: ["inventory.view", "inventory.edit", "orders.view", "health.view", "health.complete", "history.view", "history.viewStore", "ai.use", "insights.view", "products.view", "vendors.view"] },
  { id: "mock-manager", name: "Jordan Kim", email: "jordan.kim@example.invalid", employeeId: "MOCK-010", jobTitle: "Store Manager", department: "Operations", role: "manager", permissions: ["inventory.view", "inventory.edit", "orders.view", "orders.create", "orders.approve", "history.view", "history.viewStore", "insights.view"] },
  { id: "mock-produce", name: "Avery Parker", email: "avery.parker@example.invalid", employeeId: "MOCK-201", jobTitle: "Produce Lead", department: "Produce", role: "employee", permissions: ["inventory.view", "inventory.edit", "history.view"] },
  { id: "mock-deli", name: "Casey Rivera", email: "casey.rivera@example.invalid", employeeId: "MOCK-202", jobTitle: "Deli Specialist", department: "Deli", role: "employee", permissions: ["inventory.view", "inventory.edit", "history.view"] },
  { id: "mock-receiving", name: "Riley Chen", email: "riley.chen@example.invalid", employeeId: "MOCK-203", jobTitle: "Receiver", department: "Receiving", role: "employee", permissions: ["inventory.view", "inventory.edit", "orders.view", "history.view"] }
].map((member) => ({ ...member, store: "East Liberty Market", storeId, storeIds: [storeId], location: "East Liberty", status: "Active", lastActive: iso(-Math.floor(Math.random() * 4)) }))

let randomState = 2662026
function random() { randomState = (randomState * 1664525 + 1013904223) >>> 0; return randomState / 4294967296 }
const sales = []
for (let day = 56; day >= 1; day--) {
  const weekend = [0, 6].includes(new Date(iso(-day)).getDay())
  for (const [index, product] of enriched.entries()) {
    const baseline = [1.1, 2.5, 1.3, 1.7, 1.8, 2.2, 0.7, 0.9, 1.6, 2.3, 0.8, 1.2][index]
    const units = Math.max(0, Math.round(baseline * (weekend ? 1.35 : 1) + random() * 2 - 0.7))
    if (!units) continue
    const weighted = product.unit === "pounds"
    const quantity = weighted ? Number((units * (0.45 + random() * 0.8)).toFixed(2)) : units
    const discount = random() < 0.08 ? 0.9 : 1
    sales.push({
      id: `mock-sale-${String(day).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
      importId: `mock-pos-${iso(-day).slice(0, 10)}`,
      scope: "store",
      storeId,
      businessDate: iso(-day).slice(0, 10),
      transactionId: `MOCK-${iso(-day).slice(5, 10).replace("-", "")}-${String(index + 1).padStart(2, "0")}`,
      sku: product.sku,
      productName: product.name,
      quantity,
      unit: product.unit,
      unitPrice: product.price,
      grossSales: Number((quantity * product.price).toFixed(2)),
      netSales: Number((quantity * product.price * discount).toFixed(2)),
      sourceSystem: "synthetic_mock_pos",
      sourceFile: "public-prices-modeled-sales-v1",
      importedAt: iso(-day, 22),
      isSynthetic: true
    })
  }
}

const organization = {
  ownerId: owner.uid,
  companyName: "East Liberty Market Group",
  headerText: "East Liberty grocery operations",
  accentColor: "#2F6B4F",
  secondaryColor: "#D99A3E",
  defaultMode: "System",
  defaultTheme: "Market green",
  primaryTimezone: "America/New_York",
  schemaVersion: 2,
  dataProvenance: {
    productCatalog: "Open Food Facts exact-barcode records and curated public product identities",
    priceAnchor: "The Fresh Market public online storefront; prices are demo snapshots and may vary by location",
    salesAndStock: "Synthetic records generated for product testing; not actual customer or store transactions",
    sourceUrls: ["https://delivery.thefreshmarket.com/store/the-fresh-market/storefront", "https://world.openfoodfacts.org/", "https://fdc.nal.usda.gov/"]
  },
  createdAt: iso(-90),
  updatedAt: iso()
}

const entries = [
  [`users/${owner.uid}`, { defaultOrgId: orgId, email: ownerEmail, displayName: "Morgan Reed", updatedAt: iso() }],
  [`users/${employee.uid}`, { defaultOrgId: orgId, email: employeeEmail, displayName: "Taylor Brooks", updatedAt: iso() }],
  [`orgs/${orgId}`, organization],
  [`orgs/${orgId}/stores/${storeId}`, { id: storeId, name: "East Liberty Market", code: "ELM-01", address: "East Liberty, Pittsburgh, PA 15206", manager: "Jordan Kim", phone: "412-555-0266", activeItems: enriched.length, employees: staff.length, editableAreas: ["Inventory counts", "Store locations", "Order drafts", "Pricing"] }],
  ...staff.map((member) => [`orgs/${orgId}/members/${member.id}`, member]),
  [`orgs/${orgId}/vendors/vendor-metro`, { id: "vendor-metro", name: "Metro Grocery Distribution", leadTime: "2 days", leadTimeDays: 2, minimum: "$300", minimumAmount: 300, contact: "orders@example.invalid", deliveryDays: [1, 4] }],
  [`orgs/${orgId}/vendors/vendor-produce`, { id: "vendor-produce", name: "Allegheny Produce Co-op", leadTime: "1 day", leadTimeDays: 1, minimum: "$150", minimumAmount: 150, contact: "produce@example.invalid", deliveryDays: [1, 3, 5] }],
  [`orgs/${orgId}/vendors/vendor-artisan`, { id: "vendor-artisan", name: "Artisan Foods Cooperative", leadTime: "3 days", leadTimeDays: 3, minimum: "$225", minimumAmount: 225, contact: "artisan@example.invalid", deliveryDays: [2, 5] }]
]

for (const [index, product] of enriched.entries()) {
  const id = `mock-product-${String(index + 1).padStart(2, "0")}`
  const common = {
    id,
    name: product.name,
    sku: product.sku,
    barcode: product.sku,
    department: product.department,
    category: product.category,
    defaultUnit: product.unit,
    expires: ["Produce", "Deli"].includes(product.department),
    location: `${product.department} ${index % 3 + 1}`,
    images: product.images,
    nutrition: product.nutrition ?? null,
    hasNutritionInfo: Boolean(product.nutrition),
    variableMeasure: product.variableMeasure ?? { isVariableMeasure: false },
    averagePrice: product.price,
    sourceEvidence: [
      { source: "public-storefront-price-anchor", url: "https://delivery.thefreshmarket.com/store/the-fresh-market/storefront", observedAt: iso(), note: "Demo price anchor; location pricing varies" },
      ...(product.nutrition?.sourceUrl ? [{ source: "public-product-data", url: product.nutrition.sourceUrl, exactBarcodeMatch: product.nutrition.dataKind === "exact_product", observedAt: iso() }] : [])
    ],
    schemaVersion: 2,
    updatedAt: iso()
  }
  entries.push([`orgs/${orgId}/products/${id}`, { ...common, centralProductId: `test-central-${product.sku}`, lastCost: `$${product.cost.toFixed(2)}`, organizationNotes: "Product record for operations and scanner testing." }])
  entries.push([`orgs/${orgId}/inventory/${id}`, { ...common, orgProductId: id, storeId, vendor: product.vendor, onHand: product.onHand, frontStock: Number((product.onHand * 0.62).toFixed(2)), backStock: Number((product.onHand * 0.38).toFixed(2)), par: product.par, reorderPoint: product.reorder, price: product.price, unitCostAmount: product.cost, quantityInCase: product.unit === "eaches" ? 6 : 1, unit: product.unit, status: product.onHand <= product.reorder ? "Low" : "Active", revision: 1, lastCountedAt: iso(-1), updatedAt: iso(-1) }])
}

entries.push(
  ...sales.map((sale) => [`orgs/${orgId}/sales/${sale.id}`, sale]),
  [`orgs/${orgId}/waste/mock-waste-doritos`, { id: "mock-waste-doritos", productName: "Doritos Nacho Cheese", sku: "028400090896", quantity: 2, unit: "eaches", reason: "Damaged", storeId, createdAt: iso(-3), isSynthetic: true }],
  [`orgs/${orgId}/waste/mock-waste-bananas`, { id: "mock-waste-bananas", productName: "Organic Bananas", sku: "94011", quantity: 3.2, unit: "pounds", reason: "Quality", storeId, createdAt: iso(-2), isSynthetic: true }],
  [`orgs/${orgId}/history/mock-history-count`, { id: "mock-history-count", type: "spot-checks", label: "Morning inventory count", userName: "Taylor Brooks", employeeId: "MOCK-101", department: "Inventory", title: "Spot check", store: storeId, storeId, district: "Pittsburgh", region: "Mid-Atlantic", date: iso(-1).slice(0, 10), time: "8:12 AM", summary: "Counted low-stock grocery and deli items.", createdAt: iso(-1), isSynthetic: true }],
  [`orgs/${orgId}/notifications/mock-ready`, { id: "mock-ready", title: "Mock store ready", message: `${enriched.length} products and ${sales.length} synthetic sales lines are ready for testing.`, tone: "info", read: false, href: "/dashboard", audience: "owner", createdAt: iso() }]
)

await writeDocuments(entries)

console.log(JSON.stringify({
  projectId,
  orgId,
  storeId,
  owner: { email: ownerEmail, password: ownerPassword },
  employee: { email: employeeEmail, password: employeePassword },
  counts: { products: enriched.length, inventory: enriched.length, sales: sales.length, employees: staff.length },
  scannerChecks: { fullGTIN: "00810048160037", clippedGTIN: "0810048160037", variableMeasureGTIN: "00211650000009", clippedVariableMeasureGTIN: "0211650000009" }
}, null, 2))
