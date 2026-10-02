import fs from "node:fs"
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore } from "firebase-admin/firestore"

function argValue(name) {
  const prefix = `--${name}=`
  const match = process.argv.find((argument) => argument.startsWith(prefix))
  return match ? match.slice(prefix.length) : undefined
}

function firebaseProjectId() {
  const rcPath = `${process.cwd()}/.firebaserc`
  const rcProject = fs.existsSync(rcPath) ? JSON.parse(fs.readFileSync(rcPath, "utf8")).projects?.default : undefined
  return argValue("project-id") || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || rcProject
}

function credential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (credentialPath && fs.existsSync(credentialPath)) return cert(JSON.parse(fs.readFileSync(credentialPath, "utf8")))
  return applicationDefault()
}

function serialize(value) {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString()
  if (Array.isArray(value)) return value.map(serialize)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialize(entry)]))
  return value
}

function quantity(value) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0
}

const apply = process.argv.includes("--apply")
const orgId = argValue("org-id") || process.env.NEXT_PUBLIC_DEFAULT_ORG_ID || "demo-org"
const backupFile = argValue("backup-file")
if (apply && !backupFile) throw new Error("--apply requires --backup-file=<new JSON file>. Run without --apply first to preview changes.")

const projectId = firebaseProjectId()
if (!projectId) throw new Error("Unable to detect Firebase project id. Set FIREBASE_PROJECT_ID or configure .firebaserc.")
const app = getApps()[0] || initializeApp({ credential: credential(), projectId })
const db = getFirestore(app)
const org = db.collection("orgs").doc(orgId)
const [inventorySnapshot, batchSnapshot] = await Promise.all([
  org.collection("inventory").get(),
  org.collection("inventoryBatches").get()
])
const inventory = inventorySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
const batches = batchSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
const activeByItem = new Map()
for (const batch of batches) {
  if (batch.status === "depleted" || quantity(batch.remainingQuantity) <= 0) continue
  const itemBatches = activeByItem.get(batch.itemId) || []
  itemBatches.push(batch)
  activeByItem.set(batch.itemId, itemBatches)
}

const openingBatches = []
const reviews = []
for (const item of inventory) {
  const frontStock = quantity(item.frontStock)
  const backStock = quantity(item.backStock)
  const existing = activeByItem.get(item.id) || []
  const batchFront = quantity(existing.filter((batch) => batch.area === "front").reduce((sum, batch) => sum + quantity(batch.remainingQuantity), 0))
  const batchBack = quantity(existing.filter((batch) => batch.area === "back").reduce((sum, batch) => sum + quantity(batch.remainingQuantity), 0))
  const ambiguity = !item.storeId
    ? "Inventory item has no store id."
    : !Number.isFinite(Number(item.frontStock ?? 0)) || !Number.isFinite(Number(item.backStock ?? 0)) || Number(item.frontStock ?? 0) < 0 || Number(item.backStock ?? 0) < 0
      ? "Inventory snapshot contains an invalid stock quantity."
      : null
  if (ambiguity) {
    reviews.push({
      id: item.id,
      itemId: item.id,
      itemName: String(item.name || "Inventory item"),
      storeId: String(item.storeId || ""),
      reason: ambiguity,
      snapshot: { frontStock: item.frontStock ?? null, backStock: item.backStock ?? null },
      activeBatchTotals: { frontStock: batchFront, backStock: batchBack },
      activeBatchIds: existing.map((batch) => batch.id),
      status: "quarantined"
    })
  } else if (existing.length === 0) {
    for (const [area, remainingQuantity] of [["front", frontStock], ["back", backStock]]) {
      if (remainingQuantity <= 0) continue
      openingBatches.push({
        id: `opening-${item.id}-${area}`,
        itemId: item.id,
        itemName: String(item.name || "Inventory item"),
        storeId: String(item.storeId || ""),
        remainingQuantity,
        originalQuantity: remainingQuantity,
        unit: String(item.unit || "eaches"),
        area,
        receivedAt: null,
        expirationDate: null,
        expirationKnown: false,
        openedAt: null,
        preparedAt: null,
        sourceOperationId: "opening-balance-migration",
        source: "opening_balance_migration",
        status: "available"
      })
    }
  } else if (frontStock !== batchFront || backStock !== batchBack) {
    reviews.push({
      id: item.id,
      itemId: item.id,
      itemName: String(item.name || "Inventory item"),
      storeId: String(item.storeId || ""),
      reason: "Inventory snapshot does not match existing active batch totals.",
      snapshot: { frontStock, backStock },
      activeBatchTotals: { frontStock: batchFront, backStock: batchBack },
      activeBatchIds: existing.map((batch) => batch.id),
      status: "quarantined"
    })
  }
}

const report = {
  mode: apply ? "apply" : "dry-run",
  projectId,
  orgId,
  inventoryItems: inventory.length,
  existingBatches: batches.length,
  openingBatches: openingBatches.length,
  quarantinedItems: reviews.length
}
console.log(JSON.stringify(report, null, 2))
if (!apply) {
  if (reviews.length) console.log(JSON.stringify({ quarantined: reviews }, null, 2))
  process.exit(0)
}

fs.writeFileSync(backupFile, JSON.stringify({ createdAt: new Date().toISOString(), projectId, orgId, inventory: serialize(inventory), inventoryBatches: serialize(batches) }, null, 2), { flag: "wx" })
const writes = [
  ...openingBatches.map((data) => ({ collection: "inventoryBatches", data })),
  ...reviews.map((data) => ({ collection: "batchMigrationReviews", data }))
]
for (let index = 0; index < writes.length; index += 400) {
  const writeBatch = db.batch()
  for (const write of writes.slice(index, index + 400)) {
    writeBatch.create(org.collection(write.collection).doc(write.data.id), {
      ...write.data,
      migrationAppliedAt: FieldValue.serverTimestamp()
    })
  }
  await writeBatch.commit()
}
console.log(JSON.stringify({ ...report, backupFile, committedWrites: writes.length }, null, 2))
