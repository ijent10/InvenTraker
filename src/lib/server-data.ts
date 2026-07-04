import { unstable_noStore as noStore } from "next/cache"

import { adminDb } from "@/lib/firebase-admin"
import {
  employees,
  centralCatalog,
  companyFileCategories,
  companyFileChunks,
  companyFiles,
  healthChecks,
  historyRecords,
  inventoryItems,
  notifications,
  orderDrafts,
  organizationBranding,
  platformFaqs,
  platformFeatureRequests,
  platformLegalDocuments,
  platformSubscriptions,
  products,
  shiftNotes,
  storeDisplays,
  stores,
  vendors,
  type Employee,
  type CentralCatalogProduct,
  type CompanyFile,
  type CompanyFileCategory,
  type CompanyFileChunk,
  type HealthCheck,
  type HistoryActionRecord,
  type InventoryItem,
  type OrderDraft,
  type OrganizationBranding,
  type PlatformFaq,
  type PlatformFeatureRequest,
  type PlatformLegalDocument,
  type PlatformSubscription,
  type Product,
  type ShiftNote,
  type StoreDisplay,
  type StoreRecord,
  type Vendor,
  type WorkspaceNotification
} from "@/lib/demo-data"
import { DEFAULT_ORG_ID, firestoreCollections, type FirestoreCollectionKey } from "@/lib/firestore-schema"
import { demoPendingAutofillBatches } from "@/lib/ai/pending-verification"
import type { PendingAutofillBatch } from "@/lib/ai/types"

type FirestoreRecord = {
  id: string
}

function serializeFirestoreValue(value: unknown): unknown {
  if (value == null) return value

  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString()
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) return value.map(serializeFirestoreValue)

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeFirestoreValue(entry)]))
  }

  return value
}

async function readOrgCollection<T extends FirestoreRecord>(collectionKey: FirestoreCollectionKey, fallback: T[], orgId = DEFAULT_ORG_ID) {
  noStore()

  const db = await adminDb()
  if (!db) return fallback

  try {
    const snapshot = await db.collection(firestoreCollections.orgs).doc(orgId).collection(firestoreCollections[collectionKey]).get()
    return snapshot.docs.map((document) => ({ id: document.id, ...(serializeFirestoreValue(document.data()) as Record<string, unknown>) }) as T)
  } catch {
    return fallback
  }
}

async function readTopCollection<T extends FirestoreRecord>(collectionKey: FirestoreCollectionKey, fallback: T[]) {
  noStore()

  const db = await adminDb()
  if (!db) return fallback

  try {
    const snapshot = await db.collection(firestoreCollections[collectionKey]).get()
    return snapshot.docs.map((document) => ({ id: document.id, ...(serializeFirestoreValue(document.data()) as Record<string, unknown>) }) as T)
  } catch {
    return fallback
  }
}

export function defaultOrgId() {
  return DEFAULT_ORG_ID
}

export function getInventoryItems(orgId = DEFAULT_ORG_ID) {
  return readOrgCollection<InventoryItem>("inventory", inventoryItems, orgId)
}

export function getProducts(orgId = DEFAULT_ORG_ID) {
  return readOrgCollection<Product>("products", products, orgId)
}

export function getCentralCatalogProducts() {
  return readTopCollection<CentralCatalogProduct>("centralCatalog", centralCatalog)
}

export function getVendors(orgId = DEFAULT_ORG_ID) {
  return readOrgCollection<Vendor>("vendors", vendors, orgId)
}

export function getOrderDrafts(orgId = DEFAULT_ORG_ID) {
  return readOrgCollection<OrderDraft>("orders", orderDrafts, orgId)
}

export function getEmployees(orgId = DEFAULT_ORG_ID) {
  return readOrgCollection<Employee>("members", employees, orgId)
}

export function getStores(orgId = DEFAULT_ORG_ID) {
  return readOrgCollection<StoreRecord>("stores", stores, orgId)
}

export function getStoreDisplays(orgId = DEFAULT_ORG_ID) {
  return readOrgCollection<StoreDisplay>("displays", storeDisplays, orgId)
}

export function getCompanyFiles(orgId = DEFAULT_ORG_ID) {
  return readOrgCollection<CompanyFile>("companyFiles", companyFiles, orgId)
}

export function getCompanyFileCategories(orgId = DEFAULT_ORG_ID) {
  return readOrgCollection<CompanyFileCategory>("fileCategories", companyFileCategories, orgId)
}

export function getCompanyFileChunks(orgId = DEFAULT_ORG_ID) {
  return readOrgCollection<CompanyFileChunk>("documentChunks", companyFileChunks, orgId)
}

export function getHealthChecks(orgId = DEFAULT_ORG_ID) {
  return readOrgCollection<HealthCheck>("healthChecks", healthChecks, orgId)
}

export function getHistoryRecords(orgId = DEFAULT_ORG_ID) {
  return readOrgCollection<HistoryActionRecord>("history", historyRecords, orgId)
}

export function getShiftNotes(orgId = DEFAULT_ORG_ID) {
  return readOrgCollection<ShiftNote>("shiftNotes", shiftNotes, orgId).then((notes) => notes.filter((note) => !note.deleted))
}

export function getNotifications(orgId = DEFAULT_ORG_ID) {
  return readOrgCollection<WorkspaceNotification>("notifications", notifications, orgId)
}

export function getPendingAutofillBatches(orgId = DEFAULT_ORG_ID) {
  return readOrgCollection<PendingAutofillBatch>("aiPendingAutofills", demoPendingAutofillBatches, orgId)
}

export function getPlatformLegalDocuments() {
  return readTopCollection<PlatformLegalDocument>("platformLegal", platformLegalDocuments)
}

export function getPlatformFeatureRequests() {
  return readTopCollection<PlatformFeatureRequest>("platformFeatureRequests", platformFeatureRequests)
}

export function getPlatformFaqs() {
  return readTopCollection<PlatformFaq>("platformFaqs", platformFaqs)
}

export function getPlatformSubscriptions() {
  return readTopCollection<PlatformSubscription>("platformSubscriptions", platformSubscriptions)
}

export async function getOrganizationBranding(orgId = DEFAULT_ORG_ID): Promise<OrganizationBranding> {
  noStore()

  const db = await adminDb()
  if (!db) return organizationBranding

  try {
    const snapshot = await db.collection(firestoreCollections.orgs).doc(orgId).get()
    if (!snapshot.exists) return organizationBranding
    const data = snapshot.data() ?? {}
    const branding = "branding" in data && typeof data.branding === "object" && data.branding ? data.branding : data
    return { ...organizationBranding, ...(serializeFirestoreValue(branding) as Partial<OrganizationBranding>) }
  } catch {
    return organizationBranding
  }
}
