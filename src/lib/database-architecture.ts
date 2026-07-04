import { firestoreCollections } from "@/lib/firestore-schema"

function slugifyDatabaseId(value: string, maxLength = 48) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
}

export function platformDatabaseId() {
  return "(default)"
}

export function organizationDatabaseId(orgId: string) {
  return `org-${slugifyDatabaseId(orgId) || "workspace"}`
}

export function storeDatabaseId(orgId: string, storeId: string) {
  return `store-${slugifyDatabaseId(orgId, 24) || "workspace"}-${slugifyDatabaseId(storeId, 28) || "main"}`
}

export const databaseProvisioningPlan = [
  {
    scope: "Platform database",
    databaseId: platformDatabaseId(),
    owns: "Global InvenTracker records, central catalog, subscription records, legal/admin content, and product approval queues.",
    rule: "Only platform admins can approve new central catalog products."
  },
  {
    scope: "Organization database",
    databaseId: organizationDatabaseId("{orgId}"),
    owns: "Organization-approved products, departments, categories, members, org settings, and product notes.",
    rule: "Organizations can request new products, but requested products stay pending until a platform admin approves them."
  },
  {
    scope: "Store database",
    databaseId: storeDatabaseId("{orgId}", "{storeId}"),
    owns: "Store inventory, vendors, local prices, expiration rules, case quantities, displays, orders, waste, and history.",
    rule: "Stores can only stock products that already exist in their organization product catalog."
  }
] as const

export const productFlowRules = [
  "Central catalog stores the product identity: name, SKU/barcode, nutrition, average price, average expiration, average case quantity, images, and source evidence.",
  "Organization products are approved references to central catalog products, plus organization categories, notes, and defaults.",
  "Store inventory can only reference organization products, then adds store-specific stock, vendor, price, location, expiration, and ordering details.",
  "New organization-created products go to a platform approval queue before becoming central catalog records.",
  "Once approved, the product can be copied into that organization's product catalog and then made available to stores."
] as const

export const productApprovalQueuePath = `${firestoreCollections.platformProductApprovals}/{requestId}`
