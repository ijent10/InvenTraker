import type { DocumentData, Firestore } from "firebase-admin/firestore"

import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { DEFAULT_ORG_ID, firestoreCollections } from "@/lib/firestore-schema"
import type { PermissionKey } from "@/lib/permissions"

export const MOBILE_API_VERSION = "2026-07-10"

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
  const role = String(member.role ?? member.jobTitle ?? "").toLowerCase()
  return ["owner", "organization owner", "admin", "administrator", "manager"].includes(role)
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

function permittedStoreValues(member: DocumentData) {
  const values = new Set<string>()
  for (const key of ["storeId", "store", "location"]) {
    const value = String(member[key] ?? "").trim().toLowerCase()
    if (value) values.add(value)
  }
  for (const key of ["storeIds", "stores", "locations"]) {
    const entries = member[key]
    if (Array.isArray(entries)) entries.map(String).map((value) => value.trim().toLowerCase()).filter(Boolean).forEach((value) => values.add(value))
  }
  return values
}

export async function assertStoreAccess(principal: MobilePrincipal, storeId?: string) {
  if (!storeId || principal.isManager || principal.permissions.includes("*")) return

  const allowed = permittedStoreValues(principal.member)
  if (["all", "all stores", "all locations"].some((value) => allowed.has(value)) || allowed.has(storeId.toLowerCase())) return

  const storeSnapshot = await principal.db
    .collection(firestoreCollections.orgs)
    .doc(principal.orgId)
    .collection(firestoreCollections.stores)
    .doc(storeId)
    .get()
  const storeName = String(storeSnapshot.data()?.name ?? "").toLowerCase()
  if (storeName && allowed.has(storeName)) return

  throw new MobileApiError("You do not have access to this store.", 403, "store_access_denied")
}

export function canAccessMobileStore(principal: MobilePrincipal, storeId: string, storeName = "") {
  if (principal.isManager || principal.permissions.includes("*")) return true
  const allowed = permittedStoreValues(principal.member)
  if (["all", "all stores", "all locations"].some((value) => allowed.has(value))) return true
  return allowed.has(storeId.toLowerCase()) || Boolean(storeName && allowed.has(storeName.toLowerCase()))
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
