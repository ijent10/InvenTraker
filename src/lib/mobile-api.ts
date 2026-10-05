import type { DocumentData, Firestore } from "firebase-admin/firestore"

import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { DEFAULT_ORG_ID, firestoreCollections } from "@/lib/firestore-schema"
import type { PermissionKey } from "@/lib/permissions"

export const MOBILE_API_VERSION = "2026-09-30"
export const MOBILE_WORK_SHORTCUTS = ["work", "assistant", "inventory", "spotCheck", "restock", "receiving", "waste", "transfer", "portion", "orders", "healthChecks", "insights"] as const

export type MobileWorkShortcut = (typeof MOBILE_WORK_SHORTCUTS)[number]

export type MobileCapabilities = {
  canViewInventory: boolean
  canUpdateInventory: boolean
  canTransferInventory: boolean
  canViewOrders: boolean
  canSubmitOrders: boolean
  canViewHealthChecks: boolean
  canCompleteHealthChecks: boolean
  canViewInsights: boolean
}

export class MobileApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message)
  }
}

export type MobilePrincipal = {
  uid: string
  email: string
  orgId: string
  db: Firestore
  member: DocumentData & { id: string }
  permissions: string[]
  isManager: boolean
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? ""
  const [scheme, token] = authorization.split(" ")
  return scheme?.toLowerCase() === "bearer" ? token?.trim() : ""
}

function memberIsManager(member: DocumentData) {
  const managerRoles = new Set(["owner", "organization owner", "admin", "administrator", "manager"])
  return [member.role, member.jobTitle].some((value) => managerRoles.has(String(value ?? "").trim().toLowerCase()))
}

export async function requireMobilePrincipal(request: Request, permission?: PermissionKey): Promise<MobilePrincipal> {
  const token = bearerToken(request)
  if (!token) throw new MobileApiError("Sign in is required.", 401, "unauthenticated")

  const [auth, db] = await Promise.all([adminAuth(), adminDb()])
  if (!auth || !db) {
    throw new MobileApiError("The InvenTracker data service is not configured.", 503, "service_unavailable")
  }

  let decoded: Awaited<ReturnType<typeof auth.verifyIdToken>>
  try {
    decoded = await auth.verifyIdToken(token, true)
  } catch {
    throw new MobileApiError("Your session has expired. Sign in again.", 401, "invalid_session")
  }

  const userSnapshot = await db.collection(firestoreCollections.users).doc(decoded.uid).get()
  const requestedOrgId = request.headers.get("x-inventracker-org")?.trim()
  const orgId = requestedOrgId || String(decoded.orgId ?? userSnapshot.data()?.defaultOrgId ?? DEFAULT_ORG_ID)
  const memberSnapshot = await db
    .collection(firestoreCollections.orgs)
    .doc(orgId)
    .collection(firestoreCollections.members)
    .doc(decoded.uid)
    .get()

  if (!memberSnapshot.exists) {
    throw new MobileApiError("You do not have access to this organization.", 403, "membership_required")
  }

  const member: DocumentData & { id: string } = { id: memberSnapshot.id, ...(memberSnapshot.data() ?? {}) }
  if (String(member.status ?? "Active").toLowerCase() === "suspended") {
    throw new MobileApiError("This account is suspended.", 403, "account_suspended")
  }

  const permissions = Array.isArray(member.permissions) ? member.permissions.map(String) : []
  const isManager = memberIsManager(member)
  if (permission && !isManager && !permissions.includes("*") && !permissions.includes(permission)) {
    throw new MobileApiError("You do not have permission to perform this action.", 403, "permission_denied")
  }

  return {
    uid: decoded.uid,
    email: String(decoded.email ?? member.email ?? ""),
    orgId,
    db,
    member,
    permissions,
    isManager
  }
}

export function canMobile(principal: MobilePrincipal, permission: PermissionKey) {
  return principal.isManager || principal.permissions.includes("*") || principal.permissions.includes(permission)
}

export function mobileCapabilities(principal: MobilePrincipal): MobileCapabilities {
  const canUpdateInventory = canMobile(principal, "inventory.edit")
  const canSubmitOrders = canMobile(principal, "orders.approve")
  const canCompleteHealthChecks = canMobile(principal, "health.complete")

  return {
    canViewInventory: canMobile(principal, "inventory.view") || canUpdateInventory,
    canUpdateInventory,
    canTransferInventory: canUpdateInventory,
    canViewOrders: canMobile(principal, "orders.view") || canSubmitOrders,
    canSubmitOrders,
    canViewHealthChecks: canMobile(principal, "health.view") || canCompleteHealthChecks,
    canCompleteHealthChecks,
    canViewInsights: canMobile(principal, "insights.view")
  }
}

export function canUseMobileWorkShortcut(principal: MobilePrincipal, shortcut: MobileWorkShortcut) {
  const capabilities = mobileCapabilities(principal)
  switch (shortcut) {
    case "work":
      return capabilities.canViewInventory || capabilities.canUpdateInventory || capabilities.canViewOrders || capabilities.canViewHealthChecks || capabilities.canViewInsights
    case "assistant":
      return true
    case "inventory":
      return capabilities.canViewInventory
    case "spotCheck":
    case "restock":
    case "receiving":
    case "waste":
    case "transfer":
    case "portion":
      return capabilities.canUpdateInventory
    case "orders":
      return capabilities.canViewOrders
    case "healthChecks":
      return capabilities.canViewHealthChecks
    case "insights":
      return capabilities.canViewInsights
  }
}

function normalizedStoreValue(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
}

function addStoreAssignment(values: Set<string>, entry: unknown) {
  if (entry == null) return
  if (Array.isArray(entry)) {
    entry.forEach((value) => addStoreAssignment(values, value))
    return
  }
  if (typeof entry === "object") {
    const record = entry as Record<string, unknown>
    for (const key of ["id", "storeId", "name", "label", "value", "code", "location", "address"]) {
      addStoreAssignment(values, record[key])
    }
    return
  }
  const raw = String(entry).trim()
  if (!raw) return
  values.add(raw.toLowerCase())
  const normalized = normalizedStoreValue(raw)
  if (normalized) values.add(normalized)
}

function permittedStoreValues(member: DocumentData) {
  const values = new Set<string>()
  for (const key of ["storeId", "store", "location", "assignedStoreId", "assignedStore", "assignedLocation", "primaryStoreId", "homeStoreId"]) {
    addStoreAssignment(values, member[key])
  }
  for (const key of ["storeIds", "stores", "locations", "assignedStoreIds", "assignedStores", "assignedLocations"]) {
    addStoreAssignment(values, member[key])
  }
  return values
}

export function mobileAssignedStores(member: DocumentData) {
  const assignments: Array<{ id: string; name: string }> = []
  const seen = new Set<string>()
  const add = (entry: unknown) => {
    if (entry == null) return
    if (Array.isArray(entry)) {
      entry.forEach(add)
      return
    }
    if (typeof entry === "object") {
      const record = entry as Record<string, unknown>
      const id = String(record.id ?? record.storeId ?? record.value ?? record.code ?? record.name ?? record.label ?? "").trim()
      const name = String(record.name ?? record.label ?? record.location ?? record.address ?? id).trim()
      if (id && !seen.has(normalizedStoreValue(id))) {
        seen.add(normalizedStoreValue(id))
        assignments.push({ id, name: name || id })
      }
      return
    }
    const value = String(entry).trim()
    const normalized = normalizedStoreValue(value)
    if (!value || ["all", "allstores", "alllocations"].includes(normalized) || seen.has(normalized)) return
    seen.add(normalized)
    assignments.push({ id: value, name: value })
  }

  for (const key of ["storeId", "store", "assignedStoreId", "assignedStore", "primaryStoreId", "homeStoreId"]) add(member[key])
  for (const key of ["storeIds", "stores", "assignedStoreIds", "assignedStores"]) add(member[key])
  return assignments
}

export async function assertStoreAccess(principal: MobilePrincipal, storeId: string) {
  if (principal.isManager || principal.permissions.includes("*")) return

  const allowed = permittedStoreValues(principal.member)
  if (["all", "all stores", "all locations", "allstores", "alllocations"].some((value) => allowed.has(value)) || allowed.has(storeId.toLowerCase()) || allowed.has(normalizedStoreValue(storeId))) return

  const storeSnapshot = await principal.db
    .collection(firestoreCollections.orgs)
    .doc(principal.orgId)
    .collection(firestoreCollections.stores)
    .doc(storeId)
    .get()
  const store = storeSnapshot.data() ?? {}
  const candidates = [storeId, store.name, store.code, store.address, store.location]
  if (candidates.some((value) => allowed.has(String(value ?? "").trim().toLowerCase()) || allowed.has(normalizedStoreValue(value)))) return

  throw new MobileApiError("You do not have access to this store.", 403, "store_access_denied")
}

export function requireMobileStoreId(value: string | null | undefined) {
  const storeId = value?.trim()
  if (!storeId) {
    throw new MobileApiError("A store is required.", 400, "store_required")
  }
  return storeId
}

export function mobileRecordMatchesStore(record: Record<string, unknown>, storeId: string) {
  return String(record.storeId ?? "").trim() === storeId
}

export function canAccessMobileStore(principal: MobilePrincipal, storeId: string, ...storeAliases: unknown[]) {
  if (principal.isManager || principal.permissions.includes("*")) return true
  const allowed = permittedStoreValues(principal.member)
  if (["all", "all stores", "all locations", "allstores", "alllocations"].some((value) => allowed.has(value))) return true
  return [storeId, ...storeAliases].some((value) => {
    const raw = String(value ?? "").trim().toLowerCase()
    return Boolean(raw && (allowed.has(raw) || allowed.has(normalizedStoreValue(raw))))
  })
}

export function serializeMobileValue(value: unknown): unknown {
  if (value == null) return value
  if (value instanceof Date) return value.toISOString()
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString()
  }
  if (Array.isArray(value)) return value.map(serializeMobileValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeMobileValue(entry)]))
  }
  return value
}

export function mobileRecord(id: string, data?: DocumentData) {
  return serializeMobileValue({ id, ...(data ?? {}) }) as Record<string, unknown>
}

export function mobileEnvelope<T>(data: T) {
  return {
    apiVersion: MOBILE_API_VERSION,
    serverTime: new Date().toISOString(),
    data
  }
}

export function mobileError(error: unknown) {
  if (error instanceof MobileApiError) {
    return Response.json(
      { apiVersion: MOBILE_API_VERSION, error: { code: error.code, message: error.message } },
      { status: error.status }
    )
  }
  console.error("[mobile-api]", error)
  return Response.json(
    { apiVersion: MOBILE_API_VERSION, error: { code: "internal", message: "The request could not be completed." } },
    { status: 500 }
  )
}

export function orgCollection(principal: MobilePrincipal, collection: string) {
  return principal.db.collection(firestoreCollections.orgs).doc(principal.orgId).collection(collection)
}
