import fs from "node:fs"
import { applicationDefault, cert, getApps, initializeApp, refreshToken } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || JSON.parse(fs.readFileSync(".firebaserc", "utf8")).projects.default
function firebaseCliCredential() {
  const path = `${process.env.HOME}/.config/configstore/firebase-tools.json`
  if (!fs.existsSync(path)) return undefined
  const token = JSON.parse(fs.readFileSync(path, "utf8")).tokens?.refresh_token
  return token ? refreshToken({ type: "authorized_user", client_id: "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com", client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi", refresh_token: token }) : undefined
}
const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) : firebaseCliCredential() ?? applicationDefault()
const app = getApps()[0] || initializeApp({ credential, projectId })
const auth = getAuth(app)
const cliConfig = JSON.parse(fs.readFileSync(`${process.env.HOME}/.config/configstore/firebase-tools.json`, "utf8"))
const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com", client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi", refresh_token: cliConfig.tokens.refresh_token, grant_type: "refresh_token" }) })
if (!tokenResponse.ok) throw new Error(`Could not refresh Firebase CLI access: ${tokenResponse.status}`)
const accessToken = (await tokenResponse.json()).access_token
function firestoreValue(value) {
  if (value === null) return { nullValue: null }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } }
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreValue(child)])) } }
  if (typeof value === "boolean") return { booleanValue: value }
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  return { stringValue: String(value) }
}
async function writeDocument(path, value) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`
  const response = await fetch(url, { method: "PATCH", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreValue(child)])) }) })
  if (!response.ok) throw new Error(`Firestore write failed for ${path}: ${response.status} ${await response.text()}`)
}
function docRef(path) { return { path, set: (value) => writeDocument(path, value), collection: (name) => collectionRef(`${path}/${name}`) } }
function collectionRef(path) { return { doc: (id) => docRef(`${path}/${id}`) } }
const db = {
  collection: (name) => collectionRef(name),
  batch: () => { const writes = []; return { set: (ref, value) => writes.push(() => writeDocument(ref.path, value)), commit: () => Promise.all(writes.map((write) => write())) } }
}
const orgId = "inventraker-test-store"
const storeId = "harbor-market-main"
const email = process.env.INVENTRAKER_DEMO_EMAIL || "demo.owner@inventraker.app"
const password = process.env.INVENTRAKER_DEMO_PASSWORD || "InventoryLab2026!"
const now = new Date()
const iso = (days = 0) => new Date(now.getTime() + days * 86400000).toISOString()

let user
try { user = await auth.getUserByEmail(email); user = await auth.updateUser(user.uid, { password, displayName: "Alex Morgan", emailVerified: true, disabled: false }) }
catch (error) { if (error.code !== "auth/user-not-found") throw error; user = await auth.createUser({ email, password, displayName: "Alex Morgan", emailVerified: true }) }

await db.collection("users").doc(user.uid).set({ defaultOrgId: orgId, email, displayName: "Alex Morgan", updatedAt: iso() }, { merge: true })
await db.collection("orgs").doc(orgId).set({ ownerId: user.uid, companyName: "Harbor & Pine Market", headerText: "Test grocery operations", accentColor: "#7c3aed", secondaryColor: "#0ea5e9", defaultMode: "Dark", defaultTheme: "Custom organization theme", primaryTimezone: "America/New_York", schemaVersion: 2, createdAt: iso(-90), updatedAt: iso() }, { merge: true })

const records = {
  members: [{ id: user.uid, uid: user.uid, name: "Alex Morgan", employeeId: "DEMO-OWNER", badgeNumber: "D-100", email, phone: "555-0100", jobTitle: "Owner", department: "Executive", store: "Harbor & Pine Market", storeId, role: "owner", status: "Active", permissions: ["*"], lastActive: iso() }],
  stores: [{ id: storeId, name: "Harbor & Pine Market", code: "HPM-01", address: "42 Harbor Lane, Portland, ME", manager: "Jordan Lee", phone: "207-555-0142", activeItems: 18, employees: 7, editableAreas: ["Inventory counts", "Store locations", "Order draft notes"] }],
  vendors: [
    { id: "vendor-coastal", name: "Coastal Foods Distribution", leadTime: "2 days", minimum: "$350", contact: "orders@coastal.example", leadTimeDays: 2, minimumAmount: 350, deliveryDays: [1,4] },
    { id: "vendor-farm", name: "Pine State Farm Co-op", leadTime: "1 day", minimum: "$150", contact: "sales@pinestate.example", leadTimeDays: 1, minimumAmount: 150, deliveryDays: [1,3,5] },
    { id: "vendor-bakery", name: "North Shore Bakery Supply", leadTime: "3 days", minimum: "$225", contact: "dispatch@northshore.example", leadTimeDays: 3, minimumAmount: 225, deliveryDays: [2,5] }
  ],
  displays: [{ id: "front-seasonal", name: "Front Seasonal Table", storeId, location: "Entrance", department: "Produce", capacity: 48, status: "Active", owner: "Produce" }, { id: "bakery-feature", name: "Bakery Feature", storeId, location: "Aisle 1", department: "Bakery", capacity: 30, status: "Active", owner: "Bakery" }],
  healthChecks: [{ id: "opening-food-safety", name: "Opening food safety walk", store: storeId, schedule: "Daily at 7:00 AM", lastCompleted: iso(-1), completedBy: "redacted", status: "Due today", responses: 42, questions: [{ id: "temp", label: "Cooler temperature", answerType: "Number", required: true, reviewRule: "Flag above 41F" }], responseHistory: [] }],
  shiftNotes: [{ id: "note-weekend", title: "Weekend feature", body: "Move sparkling water and picnic snacks to the entrance display before Friday afternoon.", visibility: "Organization", audience: "All stores", updatedAt: iso(-1), defaultTheme: "purple" }]
}

const productNames = [
  ["Organic Bananas", "4011", "Produce", "Fresh Fruit", "Pine State Farm Co-op", 34, 18, 16, 40, 14, 0.79],
  ["Honeycrisp Apples", "4103", "Produce", "Fresh Fruit", "Pine State Farm Co-op", 22, 12, 10, 30, 10, 2.49],
  ["Baby Spinach 5oz", "85010001", "Produce", "Packaged Greens", "Pine State Farm Co-op", 8, 5, 3, 18, 7, 4.99],
  ["Sourdough Boule", "85010002", "Bakery", "Bread", "North Shore Bakery Supply", 6, 4, 2, 14, 5, 6.49],
  ["Blueberry Muffin 4pk", "85010003", "Bakery", "Pastry", "North Shore Bakery Supply", 3, 2, 1, 10, 4, 7.99],
  ["Whole Milk Gallon", "85010004", "Dairy", "Milk", "Coastal Foods Distribution", 11, 7, 4, 20, 8, 5.29],
  ["Greek Yogurt Vanilla", "85010005", "Dairy", "Yogurt", "Coastal Foods Distribution", 19, 12, 7, 24, 9, 1.79],
  ["Free Range Eggs Dozen", "85010006", "Dairy", "Eggs", "Coastal Foods Distribution", 7, 5, 2, 16, 6, 5.99],
  ["Sparkling Water Lime 8pk", "85010007", "Beverage", "Water", "Coastal Foods Distribution", 5, 3, 2, 18, 6, 6.99],
  ["Cold Brew Coffee 32oz", "85010008", "Beverage", "Coffee", "Coastal Foods Distribution", 9, 6, 3, 15, 5, 8.49],
  ["Sea Salt Potato Chips", "85010009", "Grocery", "Snacks", "Coastal Foods Distribution", 27, 16, 11, 30, 10, 4.29],
  ["Peanut Butter Creamy", "85010010", "Grocery", "Spreads", "Coastal Foods Distribution", 13, 8, 5, 16, 6, 5.49],
  ["Tomato Basil Pasta Sauce", "85010011", "Grocery", "Pasta", "Coastal Foods Distribution", 10, 6, 4, 14, 5, 6.29],
  ["Black Beans 15oz", "85010012", "Grocery", "Canned Goods", "Coastal Foods Distribution", 31, 18, 13, 36, 12, 1.69],
  ["Frozen Cheese Pizza", "85010013", "Frozen", "Pizza", "Coastal Foods Distribution", 4, 3, 1, 12, 5, 8.99],
  ["Vanilla Ice Cream Pint", "85010014", "Frozen", "Dessert", "Coastal Foods Distribution", 12, 8, 4, 16, 6, 5.99],
  ["Paper Towels 6 Roll", "85010015", "Household", "Paper", "Coastal Foods Distribution", 8, 5, 3, 10, 4, 12.99],
  ["Dish Soap Lemon", "85010016", "Household", "Cleaning", "Coastal Foods Distribution", 14, 8, 6, 16, 5, 4.79]
]

records.products = productNames.map(([name, sku, department, category], index) => ({ id: `product-${index+1}`, name, sku, department, category, defaultUnit: "eaches", expires: !["Grocery","Household"].includes(department), location: `${department} ${index % 4 + 1}`, createdAt: iso(-80) }))
records.inventory = productNames.map(([name, sku, department, category, vendor, onHand, frontStock, backStock, par, reorderPoint, price], index) => ({ id: `inventory-${index+1}`, orgProductId: `product-${index+1}`, storeId, name, sku, department, category, vendor, onHand, frontStock, backStock, par, reorderPoint, price, quantityInCase: 6, unit: "eaches", location: `${department} ${index % 4 + 1}`, expires: !["Grocery","Household"].includes(department), status: onHand <= reorderPoint ? "Low" : "Active", updatedAt: iso(-1), revision: 1 }))
records.orders = [{ id: "order-coastal-001", vendorId: "vendor-coastal", vendor: "Coastal Foods Distribution", lines: [{ id: "line-1", itemName: "Sparkling Water Lime 8pk", sku: "85010007", quantity: 4, unit: "cases", unitCost: "$25.00", reason: "Below reorder point", vendorOffered: true, aiRecommendedQuantity: 4 }], items: 1, estimatedTotal: "$100.00", minimum: "$350.00", status: "Needs review", dueBy: "Today 3:00 PM", dueAt: iso(0), expectedArrival: iso(2), storeId }]
records.history = [{ id: "history-spot-1", type: "spot-checks", label: "Produce morning count", userName: "redacted", employeeId: "redacted", department: "Produce", title: "Spot check", store: storeId, district: "Maine", region: "Northeast", date: iso(-1).slice(0,10), time: "8:15 AM", summary: "Bananas and apples reconciled; spinach adjusted down by two." }, { id: "history-receive-1", type: "receive", label: "Coastal delivery", userName: "redacted", employeeId: "redacted", department: "Receiving", title: "Receiving", store: storeId, district: "Maine", region: "Northeast", date: iso(-2).slice(0,10), time: "10:40 AM", summary: "Dairy and grocery delivery received with one short case." }]
records.operationalIssues = [{ id: "issue-spinach-low", type: "stockout_risk", title: "Baby Spinach is low", detail: "8 on hand against a reorder point of 7 with recent sales movement.", priority: "medium", status: "open", storeId, createdAt: iso(-1), updatedAt: iso(-1) }]
records.notifications = [{ id: "notification-demo-ready", title: "Test store ready", message: "Harbor & Pine Market has complete fake records for testing.", tone: "info", read: false, href: "/dashboard", audience: "owner", createdAt: iso() }]
records.sales = Array.from({ length: 42 }, (_, index) => { const product = productNames[index % productNames.length]; const quantity = index % 4 + 1; const price = Number(product[10]); return { id: `sale-${index+1}`, importId: `seed-day-${Math.floor(index/7)}`, scope: "store", storeId, businessDate: iso(-Math.floor(index/7)-1).slice(0,10), transactionId: `TEST-${1000+index}`, sku: product[1], productName: product[0], quantity, grossSales: quantity * price, netSales: quantity * price, sourceSystem: index % 2 ? "square_test_export" : "toast_test_export", sourceFile: "seeded-test-sales.csv", importedAt: iso(-Math.floor(index/7)-1) } })
records.waste = [{ id: "waste-spinach", productName: "Baby Spinach 5oz", quantity: 2, unit: "eaches", reason: "Expired", storeId, createdAt: iso(-2) }, { id: "waste-muffin", productName: "Blueberry Muffin 4pk", quantity: 1, unit: "pack", reason: "Quality", storeId, createdAt: iso(-1) }]

for (const [collection, entries] of Object.entries(records)) {
  for (let index = 0; index < entries.length; index += 400) {
    const batch = db.batch()
    entries.slice(index, index + 400).forEach((entry) => batch.set(db.collection("orgs").doc(orgId).collection(collection).doc(entry.id), entry, { merge: true }))
    await batch.commit()
  }
}

console.log(JSON.stringify({ projectId, orgId, storeId, uid: user.uid, email, password, collections: Object.fromEntries(Object.entries(records).map(([key,value]) => [key,value.length])) }, null, 2))
