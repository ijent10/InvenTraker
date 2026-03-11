import { onCall, HttpsError } from "firebase-functions/v2/https"
import type { DocumentReference } from "firebase-admin/firestore"
import { FieldValue } from "firebase-admin/firestore"

import {
  adminAuditLogsRequestSchema,
  adminOrganizationDetailRequestSchema,
  adminListOrganizationsRequestSchema,
  adminStoreDetailRequestSchema,
  adminSafeEditRequestSchema,
  claimOrganizationByCompanyCodeRequestSchema,
  computeFinancialHealthRequestSchema,
  ensurePlatformPreferenceProfileRequestSchema,
  generateOrderSuggestionsRequestSchema,
  listMyOrganizationsRequestSchema,
  pdfToHowtoDraftRequestSchema
} from "@inventracker/shared"

import { adminAuth, adminDb, adminStorage } from "./lib/firebase.js"
import { requireAuth, requireOrgMembership, requirePlatformAdmin, requireStoreAccess } from "./lib/auth.js"
import { filterSafePatch } from "./utils/admin-safe-edit.js"
import { extractHowToDraftFromPdf } from "./utils/pdf.js"
import { resolvePreferenceProfile } from "./utils/preferences.js"
import { findStorePath } from "./utils/store-path.js"
import {
  enhanceFinancialHealth,
  enhanceHowToDraft,
  enhanceOrderSuggestions
} from "./ai/custom-engine.js"
export {
  sendOrgNotification,
  removeOrgNotification,
  sendPlatformNotification
} from "./notifications.js"
export {
  requestStoreAccess,
  reviewStoreAccessRequest
} from "./store-access.js"
export {
  submitItemForVerification,
  reviewItemSubmission
} from "./item-submissions.js"
export {
  createStripeCheckoutSession,
  createStripeEmbeddedCheckoutSession,
  createStripePortalSession,
  getStripeCheckoutSessionStatus,
  reconcileOrganizationBilling,
  listPublicStripePlans,
  syncOrgBillingFromStripeSubscription
} from "./stripe.js"

function profileId(userId: string, orgId: string, platform: "WEB" | "IOS") {
  return `${userId}_${orgId}_${platform}`
}

function normalizeMemberRole(rawRole: unknown, ownerByArray: boolean): "Owner" | "Manager" | "Staff" {
  if (typeof rawRole === "string") {
    const role = rawRole.trim().toLowerCase()
    if (role === "owner") return "Owner"
    if (role === "manager") return "Manager"
    if (role === "staff" || role === "employee" || role === "viewer") return "Staff"
  }
  return ownerByArray ? "Owner" : "Staff"
}

function daysUntilNextOrder(orderingDays: number[] | undefined, now: Date): number {
  if (!orderingDays || orderingDays.length === 0) return 0
  const today = now.getDay()
  const sorted = [...orderingDays].sort((a, b) => a - b)
  const next = sorted.find((day) => day >= today)
  if (next !== undefined) return next - today
  const first = sorted[0]
  return first === undefined ? 0 : 7 - today + first
}

const permissionKeys = [
  "viewDashboard",
  "viewInventory",
  "viewExpiration",
  "viewWaste",
  "viewOrders",
  "viewTodo",
  "viewInsights",
  "viewProduction",
  "viewHowTos",
  "viewHealthChecks",
  "viewNotifications",
  "viewStores",
  "viewUsers",
  "manageInventory",
  "manageSales",
  "manageOrders",
  "generateOrders",
  "manageTodo",
  "sendNotifications",
  "exportData",
  "requestStoreAccess",
  "approveStoreAccessRequests",
  "adjustStoreQuantity",
  "appSpotCheck",
  "appReceive",
  "appWaste",
  "appExpiration",
  "appTransfers",
  "appRework",
  "appProductionRuns",
  "appChop",
  "appHealthChecks",
  "appNotificationsFeed",
  "appManualEntry",
  "appOfflineSync",
  "manageUsers",
  "inviteUsers",
  "editUserRoles",
  "resetUserCredentials",
  "deactivateUsers",
  "manageStores",
  "createStores",
  "editStores",
  "archiveStores",
  "manageOrgSettings",
  "manageStoreSettings",
  "manageHealthChecks",
  "viewOrganizationInventory",
  "editOrgInventoryMeta",
  "editStoreInventory",
  "manageVendors",
  "manageJobTitles",
  "manageCentralCatalog",
  "managePermissions",
  "viewBilling",
  "manageBilling",
  "viewAuditLogs",
  "exportAuditLogs",
  "manageFeatureRequests",
  "manageContactInbox",
  "managePublicContent",
  "managePrivacyContent",
  "manageTermsContent",
  "manageFaqContent",
  "manageIntegrations",
  "manageSecuritySettings"
] as const

function permissionDefaultsForRole(role: "Owner" | "Manager" | "Staff"): Record<string, boolean> {
  const none = Object.fromEntries(permissionKeys.map((key) => [key, false])) as Record<string, boolean>
  if (role === "Owner") {
    return Object.fromEntries(permissionKeys.map((key) => [key, true])) as Record<string, boolean>
  }
  if (role === "Manager") {
    return {
      ...none,
      viewDashboard: true,
      viewInventory: true,
      viewExpiration: true,
      viewWaste: true,
      viewOrders: true,
      viewTodo: true,
      viewInsights: true,
      viewProduction: true,
      viewHowTos: true,
      viewHealthChecks: true,
      viewNotifications: true,
      viewStores: true,
      viewUsers: true,
      manageInventory: true,
      manageSales: true,
      manageOrders: true,
      generateOrders: true,
      manageTodo: true,
      sendNotifications: true,
      exportData: true,
      requestStoreAccess: true,
      approveStoreAccessRequests: true,
      adjustStoreQuantity: true,
      appSpotCheck: true,
      appReceive: true,
      appWaste: true,
      appExpiration: true,
      appTransfers: true,
      appRework: true,
      appProductionRuns: true,
      appChop: true,
      appHealthChecks: true,
      appNotificationsFeed: true,
      appManualEntry: true,
      appOfflineSync: true,
      manageUsers: true,
      inviteUsers: true,
      editUserRoles: true,
      resetUserCredentials: true,
      deactivateUsers: true,
      manageStores: true,
      createStores: false,
      editStores: true,
      archiveStores: false,
      manageOrgSettings: false,
      manageStoreSettings: true,
      manageHealthChecks: true,
      viewOrganizationInventory: false,
      editOrgInventoryMeta: false,
      editStoreInventory: true,
      manageVendors: true,
      manageJobTitles: true,
      manageCentralCatalog: false,
      managePermissions: false,
      viewBilling: true,
      manageBilling: false,
      viewAuditLogs: true,
      exportAuditLogs: true,
      manageIntegrations: true
    }
  }
  return {
    ...none,
    viewDashboard: true,
    viewInventory: true,
    viewExpiration: true,
    viewWaste: true,
    viewOrders: true,
    viewTodo: true,
    viewInsights: true,
    viewProduction: true,
    viewHowTos: true,
    viewHealthChecks: true,
    viewNotifications: true,
    manageInventory: true,
    manageOrders: true,
    generateOrders: true,
    manageTodo: true,
    requestStoreAccess: true,
    appSpotCheck: true,
    appReceive: true,
    appWaste: true,
    appExpiration: true,
    appTransfers: true,
    appRework: true,
    appProductionRuns: true,
    appChop: true,
    appHealthChecks: true,
    appNotificationsFeed: true,
    appManualEntry: true,
    appOfflineSync: true
  }
}

function parseProjectId(): string | null {
  if (process.env.GCLOUD_PROJECT?.trim()) {
    return process.env.GCLOUD_PROJECT.trim()
  }
  const raw = process.env.FIREBASE_CONFIG
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { projectId?: string }
    return parsed.projectId?.trim() || null
  } catch {
    return null
  }
}

function normalizeBucketName(input?: string): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("gs://")) return trimmed.replace(/^gs:\/\//, "").replace(/\/+$/, "")
  return trimmed.replace(/\/+$/, "")
}

function storageBucketCandidates(hint?: string): string[] {
  const candidates = new Set<string>()
  const hinted = normalizeBucketName(hint)
  if (hinted) candidates.add(hinted)

  try {
    const defaultName = normalizeBucketName(adminStorage.bucket().name)
    if (defaultName) candidates.add(defaultName)
  } catch {
    // no-op
  }

  const projectId = parseProjectId()
  if (projectId) {
    candidates.add(`${projectId}.firebasestorage.app`)
    candidates.add(`${projectId}.appspot.com`)
  }

  return [...candidates]
}

async function downloadFromStoragePath(storagePath: string, bucketHint?: string): Promise<Buffer> {
  const normalizedPath = storagePath.trim().replace(/^\/+/, "")
  if (!normalizedPath) throw new Error("Missing storage path.")

  let lastError: unknown = null
  for (const bucketName of storageBucketCandidates(bucketHint)) {
    try {
      const file = adminStorage.bucket(bucketName).file(normalizedPath)
      const [exists] = await file.exists()
      if (!exists) continue
      const [buffer] = await file.download()
      return buffer
    } catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error("PDF file not found in configured storage buckets.")
}

async function writeAuditLog(input: {
  actorUserId: string
  actorRoleSnapshot: string
  organizationId: string | null
  storeId?: string | null
  targetPath: string
  action: "create" | "update" | "delete" | "admin_edit"
  before?: unknown
  after?: unknown
}) {
  const ref = adminDb.collection("auditLogs").doc()
  await ref.set({
    actorUserId: input.actorUserId,
    actorRoleSnapshot: input.actorRoleSnapshot,
    organizationId: input.organizationId,
    storeId: input.storeId ?? null,
    targetPath: input.targetPath,
    action: input.action,
    before: input.before ?? null,
    after: input.after ?? null,
    createdAt: FieldValue.serverTimestamp()
  })
  return ref.id
}

export const listMyOrganizations = onCall(async (request) => {
  const uid = requireAuth(request)
  listMyOrganizationsRequestSchema.parse(request.data ?? {})

  const authUser = await adminAuth.getUser(uid)
  const userRef = adminDb.doc(`users/${uid}`)
  const userSnap = await userRef.get()
  const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {}
  const isPlatformAdmin =
    request.auth?.token.platform_admin === true ||
    ((userData.platformRoles as { platformAdmin?: boolean } | undefined)?.platformAdmin ?? false)

  const orgsSnap = await adminDb.collection("organizations").limit(1000).get()
  const contexts: Array<{
    organizationId: string
    organizationName: string
    role: "Owner" | "Manager" | "Staff"
    storeIds: string[]
    departmentIds: string[]
    locationIds: string[]
    permissionFlags: Record<string, boolean>
  }> = []

  for (const orgDoc of orgsSnap.docs) {
    const orgData = orgDoc.data() as { name?: string; ownerUserIds?: string[]; ownerUid?: string }
    const ownerByArray =
      (Array.isArray(orgData.ownerUserIds) && orgData.ownerUserIds.includes(uid)) || orgData.ownerUid === uid
    const memberRef = adminDb.doc(`organizations/${orgDoc.id}/members/${uid}`)
    const memberSnap = await memberRef.get()

    if (!memberSnap.exists && !ownerByArray && !isPlatformAdmin) {
      continue
    }

    const memberData = memberSnap.exists ? (memberSnap.data() as Record<string, unknown>) : {}
    const role = isPlatformAdmin ? "Owner" : normalizeMemberRole(memberData.role, ownerByArray)
    const storeIds = Array.isArray(memberData.storeIds)
      ? memberData.storeIds.filter((storeId): storeId is string => typeof storeId === "string")
      : []
    const departmentIds = Array.isArray(memberData.departmentIds)
      ? memberData.departmentIds.filter((departmentId): departmentId is string => typeof departmentId === "string")
      : []
    const locationIds = Array.isArray(memberData.locationIds)
      ? memberData.locationIds.filter((locationId): locationId is string => typeof locationId === "string")
      : []
    const permissionFlags = {
      ...permissionDefaultsForRole(role),
      ...(
        typeof memberData.permissionFlags === "object" && memberData.permissionFlags
          ? (memberData.permissionFlags as Record<string, boolean>)
          : {}
      )
    }

    if (!memberSnap.exists && !isPlatformAdmin) {
      await memberRef.set({
        organizationId: orgDoc.id,
        userId: uid,
        role,
        storeIds,
        departmentIds,
        locationIds,
        permissionFlags,
        createdAt: FieldValue.serverTimestamp()
      })
    } else if (memberSnap.exists) {
      const needsNormalization =
        memberData.organizationId !== orgDoc.id ||
        memberData.userId !== uid ||
        memberData.role !== role ||
        !Array.isArray(memberData.storeIds) ||
        !Array.isArray(memberData.departmentIds) ||
        !Array.isArray(memberData.locationIds)

      if (needsNormalization) {
        await memberRef.set(
          {
            organizationId: orgDoc.id,
            userId: uid,
            role,
            storeIds,
            departmentIds,
            locationIds,
            permissionFlags,
            createdAt: memberData.createdAt ?? FieldValue.serverTimestamp()
          },
          { merge: true }
        )
      }
    }

    contexts.push({
      organizationId: orgDoc.id,
      organizationName: orgData.name ?? "Organization",
      role,
      storeIds,
      departmentIds,
      locationIds,
      permissionFlags
    })
  }

  const defaultOrganizationId =
    typeof userData.defaultOrganizationId === "string" && contexts.some((context) => context.organizationId === userData.defaultOrganizationId)
      ? userData.defaultOrganizationId
      : contexts[0]?.organizationId

  await userRef.set(
    {
      email: authUser.email ?? "",
      displayName: authUser.displayName ?? authUser.email ?? "InvenTracker User",
      lastLoginAt: FieldValue.serverTimestamp(),
      defaultOrganizationId: defaultOrganizationId ?? null,
      platformRoles: {
        platformAdmin: isPlatformAdmin
      },
      createdAt: userData.createdAt ?? FieldValue.serverTimestamp()
    },
    { merge: true }
  )

  contexts.sort((a, b) => a.organizationName.localeCompare(b.organizationName))
  return { organizations: contexts, isPlatformAdmin }
})

type SiteFaqEntry = {
  id: string
  question: string
  answer: string
}

function normalizeOptionalString(input: unknown): string | null {
  if (typeof input !== "string") return null
  const value = input.trim()
  return value.length ? value : null
}

function normalizeFaqEntries(input: unknown): SiteFaqEntry[] {
  if (!Array.isArray(input)) return []
  return input
    .slice(0, 100)
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null
      const raw = entry as Record<string, unknown>
      const question = typeof raw.question === "string" ? raw.question.trim() : ""
      const answer = typeof raw.answer === "string" ? raw.answer.trim() : ""
      if (!question && !answer) return null
      const id = typeof raw.id === "string" && raw.id.trim().length ? raw.id.trim() : `faq_${index + 1}`
      return {
        id,
        question,
        answer
      } satisfies SiteFaqEntry
    })
    .filter((entry): entry is SiteFaqEntry => Boolean(entry))
}

export const savePublicSiteContent = onCall(async (request) => {
  const uid = await requirePlatformAdmin(request)
  const raw = (request.data ?? {}) as Record<string, unknown>
  const ref = adminDb.doc("siteContent/public")
  const beforeSnap = await ref.get()
  const patch = {
    privacyContent: normalizeOptionalString(raw.privacyContent),
    termsContent: normalizeOptionalString(raw.termsContent),
    contactEmail: normalizeOptionalString(raw.contactEmail),
    contactPhone: normalizeOptionalString(raw.contactPhone),
    faq: normalizeFaqEntries(raw.faq),
    updatedBy: uid,
    updatedAt: FieldValue.serverTimestamp()
  }

  await ref.set(patch, { merge: true })
  await writeAuditLog({
    actorUserId: uid,
    actorRoleSnapshot: "Platform Admin",
    organizationId: null,
    targetPath: ref.path,
    action: beforeSnap.exists ? "update" : "create",
    before: beforeSnap.exists ? beforeSnap.data() : null,
    after: {
      privacyContent: patch.privacyContent,
      termsContent: patch.termsContent,
      contactEmail: patch.contactEmail,
      contactPhone: patch.contactPhone,
      faq: patch.faq,
      updatedBy: uid
    }
  })

  return { ok: true }
})

export const ensurePlatformPreferenceProfile = onCall(async (request) => {
  const uid = requireAuth(request)
  const input = ensurePlatformPreferenceProfileRequestSchema.parse(request.data)
  const actingAsOtherUser = uid !== input.userId
  if (actingAsOtherUser) {
    await requirePlatformAdmin(request)
  } else {
    await requireOrgMembership(input.orgId, uid)
  }

  const thisId = profileId(input.userId, input.orgId, input.platform)
  const thisRef = adminDb.doc(`platformPreferenceProfiles/${thisId}`)
  const existing = await thisRef.get()
  if (existing.exists) {
    const current = resolvePreferenceProfile(existing.data() as Record<string, unknown>)
    if ((existing.data() as Record<string, unknown>)?.showTips === undefined) {
      await thisRef.set(
        {
          showTips: current.showTips,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      )
    }
    return {
      profileId: thisId,
      profile: {
        ...(existing.data() as Record<string, unknown>),
        theme: current.theme,
        accentColor: current.accentColor,
        boldText: current.boldText,
        showTips: current.showTips
      },
      source: "existing"
    }
  }

  const otherPlatform = input.platform === "WEB" ? "IOS" : "WEB"
  const otherRef = adminDb.doc(`platformPreferenceProfiles/${profileId(input.userId, input.orgId, otherPlatform)}`)
  const other = await otherRef.get()

  const resolved = resolvePreferenceProfile(other.exists ? (other.data() as Record<string, unknown>) : null)
  const profile = {
    userId: input.userId,
    organizationId: input.orgId,
    platform: input.platform,
    theme: resolved.theme,
    accentColor: resolved.accentColor,
    boldText: resolved.boldText,
    showTips: resolved.showTips,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }

  await thisRef.set(profile)

  return {
    profileId: thisId,
    profile,
    source: other.exists ? "cloned" : "default"
  }
})

export const claimOrganizationByCompanyCode = onCall(async (request) => {
  const uid = requireAuth(request)
  const input = claimOrganizationByCompanyCodeRequestSchema.parse(request.data)
  const companyCode = input.companyCode.trim().toUpperCase()
  const employeeId = input.employeeId.trim()
  if (!companyCode || !employeeId) {
    throw new HttpsError("invalid-argument", "Company code and employee ID are required")
  }

  const user = await adminAuth.getUser(uid)
  const userEmail = String(user.email ?? "").trim().toLowerCase()

  const orgByTopLevel = await adminDb
    .collection("organizations")
    .where("companyCodeUpper", "==", companyCode)
    .limit(1)
    .get()

  let orgDoc: DocumentReference | null = orgByTopLevel.docs[0]?.ref ?? null
  if (!orgDoc) {
    const settingsHit = await adminDb
      .collectionGroup("settings")
      .where("companyCode", "==", companyCode)
      .limit(1)
      .get()
    orgDoc = settingsHit.docs[0]?.ref.parent.parent ?? null
  }

  if (!orgDoc) {
    throw new HttpsError(
      "not-found",
      "Company code not found. Contact your company IT department to be added."
    )
  }

  const orgSnap = await orgDoc.get()
  const orgId = orgSnap.id

  const existingMemberRef = adminDb.doc(`organizations/${orgId}/members/${uid}`)
  const existingMember = await existingMemberRef.get()
  if (existingMember.exists) {
    const role = normalizeMemberRole(existingMember.data()?.role, false)
    return {
      orgId,
      orgName: String(orgSnap.data()?.name ?? "Organization"),
      role
    }
  }

  const pendingSnap = await adminDb
    .collection(`organizations/${orgId}/pendingUsers`)
    .where("employeeId", "==", employeeId)
    .where("status", "==", "pending")
    .limit(25)
    .get()

  const pendingDoc =
    pendingSnap.docs.find((entry) => {
      const data = entry.data() as { email?: string }
      return !data.email || String(data.email).trim().toLowerCase() === userEmail
    }) ?? null

  if (!pendingDoc) {
    throw new HttpsError(
      "permission-denied",
      "Employee ID not recognized for this company code. Contact your company IT department to be added."
    )
  }

  const pending = pendingDoc.data() as Record<string, unknown>
  const role = normalizeMemberRole(pending.role, false)

  if (role === "Owner") {
    const ownerMembers = await adminDb
      .collection(`organizations/${orgId}/members`)
      .where("role", "in", ["Owner", "owner"])
      .limit(1)
      .get()
    if (!ownerMembers.empty) {
      throw new HttpsError("failed-precondition", "This organization already has an Owner.")
    }
  }

  await existingMemberRef.set(
    {
      organizationId: orgId,
      userId: uid,
      role,
      storeIds: Array.isArray(pending.storeIds)
        ? pending.storeIds.filter((value): value is string => typeof value === "string")
        : [],
      departmentIds: Array.isArray(pending.departmentIds)
        ? pending.departmentIds.filter((value): value is string => typeof value === "string")
        : [],
      locationIds: Array.isArray(pending.locationIds)
        ? pending.locationIds.filter((value): value is string => typeof value === "string")
        : [],
      email: user.email ?? pending.email ?? null,
      firstName: typeof pending.firstName === "string" ? pending.firstName : null,
      lastName: typeof pending.lastName === "string" ? pending.lastName : null,
      employeeId,
      jobTitle: typeof pending.jobTitle === "string" ? pending.jobTitle : null,
      assignmentType:
        pending.assignmentType === "corporate" || pending.assignmentType === "store"
          ? pending.assignmentType
          : "store",
      permissionFlags:
        pending.permissionFlags && typeof pending.permissionFlags === "object"
          ? pending.permissionFlags
          : permissionDefaultsForRole(role),
      canManageStoreUsersOnly: Boolean(pending.canManageStoreUsersOnly),
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  )

  if (role === "Owner") {
    await adminDb.doc(`organizations/${orgId}`).set(
      {
        ownerUserIds: [uid],
        ownerUid: uid,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    )
  }

  await pendingDoc.ref.set(
    {
      status: "claimed",
      claimedAt: FieldValue.serverTimestamp(),
      claimedBy: uid,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  )

  await adminDb.doc(`users/${uid}`).set(
    {
      email: user.email ?? null,
      displayName: user.displayName ?? user.email ?? "InvenTracker User",
      defaultOrganizationId: orgId,
      lastLoginAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  )

  await writeAuditLog({
    actorUserId: uid,
    actorRoleSnapshot: role,
    organizationId: orgId,
    storeId: null,
    targetPath: `organizations/${orgId}/members/${uid}`,
    action: "create",
    after: { role, employeeId, source: "company_code_claim" }
  })

  return {
    orgId,
    orgName: String(orgSnap.data()?.name ?? "Organization"),
    role
  }
})

export const pdfToHowtoDraft = onCall(async (request) => {
  const uid = requireAuth(request)
  const input = pdfToHowtoDraftRequestSchema.parse(request.data)
  await requireOrgMembership(input.orgId, uid)

  const mediaSnap = await adminDb.doc(`mediaAssets/${input.pdfAssetId}`).get()
  if (!mediaSnap.exists) {
    throw new HttpsError("not-found", "PDF asset not found")
  }

  const media = mediaSnap.data() as { organizationId?: string; storagePath?: string; storageBucket?: string }
  if (media.organizationId !== input.orgId) {
    throw new HttpsError("permission-denied", "Asset organization mismatch")
  }

  try {
    const buffer = await downloadFromStoragePath(media.storagePath ?? "", media.storageBucket)
    const draft = await extractHowToDraftFromPdf(buffer)
    const enhanced = await enhanceHowToDraft({
      orgId: input.orgId,
      storeId: input.storeId,
      title: draft.title,
      steps: draft.steps
    })
    return {
      ok: true,
      fallback: false,
      suggestedTitle: enhanced.title,
      steps: enhanced.steps,
      ai: enhanced.ai
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Couldn't parse PDF—create manually."
    console.error("pdfToHowtoDraft failed", {
      orgId: input.orgId,
      assetId: input.pdfAssetId,
      storagePath: media.storagePath ?? null,
      storageBucket: media.storageBucket ?? null,
      reason
    })
    return {
      ok: false,
      fallback: true,
      reason,
      steps: [],
      ai: {
        intent: "pdf_howto_draft",
        provider: "custom-rules",
        model: "rules-v1",
        usedModel: false,
        fallbackReason: reason
      }
    }
  }
})

export const generateOrderSuggestions = onCall(async (request) => {
  const uid = requireAuth(request)
  const input = generateOrderSuggestionsRequestSchema.parse(request.data)
  await requireStoreAccess(input.orgId, uid, input.storeId)

  const storePath = await findStorePath(input.orgId, input.storeId)
  if (!storePath) throw new HttpsError("not-found", "Store not found")

  const itemsSnap = await adminDb.collection(`organizations/${input.orgId}/items`).get()
  const vendorsSnap = await adminDb.collection(`organizations/${input.orgId}/vendors`).get()
  type VendorRecord = { orderingDays?: number[]; cutoffTimeLocal?: string; leadDays?: number }
  const vendorMap = new Map<string, VendorRecord>(
    vendorsSnap.docs.map((vendor) => [vendor.id, vendor.data() as VendorRecord])
  )

  const batchesSnap = await adminDb
    .collectionGroup("inventoryBatches")
    .where("organizationId", "==", input.orgId)
    .where("storeId", "==", input.storeId)
    .get()

  const onHandByItem = new Map<string, number>()
  batchesSnap.docs.forEach((batch) => {
    const data = batch.data() as { itemId?: string; quantity?: number }
    if (!data.itemId) return
    onHandByItem.set(data.itemId, (onHandByItem.get(data.itemId) ?? 0) + (data.quantity ?? 0))
  })

  const suggestions: Array<{
    itemId: string
    suggestedQty: number
    unit: "each" | "lbs"
    rationale: string
    caseRounded: boolean
    onHand: number
    minQuantity: number
  }> = []
  const now = new Date()

  itemsSnap.docs.forEach((itemDoc) => {
    const item = itemDoc.data() as {
      vendorId?: string
      minQuantity?: number
      unit?: "each" | "lbs"
      qtyPerCase?: number
      caseSize?: number
      weeklyUsage?: number
      name?: string
      archived?: boolean
    }

    if (item.archived) return
    if (input.vendorId && item.vendorId !== input.vendorId) return

    const vendor = item.vendorId ? vendorMap.get(item.vendorId) : null
    const onHand = onHandByItem.get(itemDoc.id) ?? 0
    const min = item.minQuantity ?? 0
    const weeklyUsage = item.weeklyUsage ?? 0

    const deficit = Math.max(0, min - onHand)
    const leadDays = Math.max(0, vendor?.leadDays ?? 0)
    const nextOrderIn = daysUntilNextOrder(vendor?.orderingDays, now)
    const urgencyAdd = Math.max(0, leadDays + Math.max(0, 2 - nextOrderIn))
    const rawSuggested = deficit + Math.max(0, weeklyUsage * 0.25) + urgencyAdd

    if (rawSuggested <= 0) return

    const isLbsDirect = item.unit === "lbs" && (item.caseSize ?? 0) === 1
    if (isLbsDirect) {
      suggestions.push({
        itemId: itemDoc.id,
        suggestedQty: Number(rawSuggested.toFixed(3)),
        unit: "lbs",
        rationale: `${item.name ?? itemDoc.id}: below min, vendor window in ${nextOrderIn} day(s), weight-based caseSize=1 so ordering lbs directly.`,
        caseRounded: false,
        onHand,
        minQuantity: min
      })
      return
    }

    const qtyPerCase = Math.max(1, item.qtyPerCase ?? 1)
    const cases = Math.ceil(rawSuggested / qtyPerCase)
    suggestions.push({
      itemId: itemDoc.id,
      suggestedQty: cases * qtyPerCase,
      unit: item.unit ?? "each",
      rationale: `${item.name ?? itemDoc.id}: below min, vendor window in ${nextOrderIn} day(s), rounded to full cases (${cases} x ${qtyPerCase}).`,
      caseRounded: true,
      onHand,
      minQuantity: min
    })
  })

  const enhancedSuggestions = await enhanceOrderSuggestions({
    orgId: input.orgId,
    storeId: input.storeId,
    vendorId: input.vendorId,
    lines: suggestions
  })

  const orderRef = adminDb
    .collection(
      `organizations/${input.orgId}/regions/${storePath.regionId}/districts/${storePath.districtId}/stores/${storePath.storeId}/orders`
    )
    .doc()

  await orderRef.set({
    organizationId: input.orgId,
    storeId: input.storeId,
    vendorId: input.vendorId ?? "mixed",
    status: "suggested",
    createdAt: FieldValue.serverTimestamp(),
    createdBy: uid,
    vendorCutoffAt: null
  })

  const batch = adminDb.batch()
  enhancedSuggestions.lines.forEach((line) => {
    batch.set(orderRef.collection("lines").doc(), line)
  })

  const todos = [
    {
      organizationId: input.orgId,
      storeId: input.storeId,
      type: "auto",
      title: `Place order ${input.vendorId ? `for ${input.vendorId}` : "for suggested items"}`,
      dueAt: FieldValue.serverTimestamp(),
      status: "open",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid
    },
    {
      organizationId: input.orgId,
      storeId: input.storeId,
      type: "auto",
      title: "Spot check before order in 1 day",
      dueAt: FieldValue.serverTimestamp(),
      status: "open",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid
    }
  ]

  const todoCollection = adminDb.collection(
    `organizations/${input.orgId}/regions/${storePath.regionId}/districts/${storePath.districtId}/stores/${storePath.storeId}/toDo`
  )
  todos.forEach((todo) => batch.set(todoCollection.doc(), todo))

  await batch.commit()

  await writeAuditLog({
    actorUserId: uid,
    actorRoleSnapshot: "Manager",
    organizationId: input.orgId,
    storeId: input.storeId,
    targetPath: orderRef.path,
    action: "create",
    after: { lines: enhancedSuggestions.lines.length, ai: enhancedSuggestions.ai }
  })

  return {
    orderId: orderRef.id,
    lines: enhancedSuggestions.lines,
    todosCreated: todos.length,
    summary: enhancedSuggestions.summary,
    riskAlerts: enhancedSuggestions.riskAlerts,
    questionsForManager: enhancedSuggestions.questionsForManager,
    ai: enhancedSuggestions.ai
  }
})

export const computeFinancialHealth = onCall(async (request) => {
  const uid = requireAuth(request)
  const input = computeFinancialHealthRequestSchema.parse(request.data)

  if (input.storeId) {
    await requireStoreAccess(input.orgId, uid, input.storeId)
  } else {
    await requireOrgMembership(input.orgId, uid)
  }

  const itemsSnap = await adminDb.collection(`organizations/${input.orgId}/items`).get()
  const itemPriceMap = new Map(itemsSnap.docs.map((item) => [item.id, Number(item.data().price ?? 0)]))
  const itemMinMap = new Map(itemsSnap.docs.map((item) => [item.id, Number(item.data().minQuantity ?? 0)]))
  const itemNameMap = new Map(itemsSnap.docs.map((item) => [item.id, String(item.data().name ?? item.id)]))

  const onHandByItem = new Map<string, number>()
  let inventoryValue = 0
  let expiringSoonValue = 0
  let wasteCostWeek = 0
  let wasteCostMonth = 0

  const now = new Date()
  const weekAgo = new Date(now)
  weekAgo.setDate(now.getDate() - 7)
  const monthAgo = new Date(now)
  monthAgo.setDate(now.getDate() - 30)
  const expiringCutoff = new Date(now)
  expiringCutoff.setDate(now.getDate() + (input.expiringDays ?? 7))

  const batchesQuery = input.storeId
    ? adminDb
        .collectionGroup("inventoryBatches")
        .where("organizationId", "==", input.orgId)
        .where("storeId", "==", input.storeId)
    : adminDb.collectionGroup("inventoryBatches").where("organizationId", "==", input.orgId)
  const wasteQuery = input.storeId
    ? adminDb
        .collectionGroup("wasteRecords")
        .where("organizationId", "==", input.orgId)
        .where("storeId", "==", input.storeId)
    : adminDb.collectionGroup("wasteRecords").where("organizationId", "==", input.orgId)

  const [batchesSnap, wasteSnap] = await Promise.all([batchesQuery.get(), wasteQuery.get()])

  batchesSnap.docs.forEach((batch) => {
    const data = batch.data() as { itemId?: string; quantity?: number; expiresAt?: { toDate?: () => Date } | Date }
    if (!data.itemId) return
    const qty = Number(data.quantity ?? 0)
    const price = itemPriceMap.get(data.itemId) ?? 0
    onHandByItem.set(data.itemId, (onHandByItem.get(data.itemId) ?? 0) + qty)
    inventoryValue += qty * price

    const expDate = data.expiresAt instanceof Date ? data.expiresAt : data.expiresAt?.toDate?.()
    if (expDate && expDate <= expiringCutoff) {
      expiringSoonValue += qty * price
    }
  })

  wasteSnap.docs.forEach((waste) => {
    const data = waste.data() as { itemId?: string; quantity?: number; createdAt?: { toDate?: () => Date } | Date }
    if (!data.itemId) return
    const qty = Number(data.quantity ?? 0)
    const price = itemPriceMap.get(data.itemId) ?? 0
    const at = data.createdAt instanceof Date ? data.createdAt : data.createdAt?.toDate?.()
    if (!at) return
    if (at >= weekAgo) wasteCostWeek += qty * price
    if (at >= monthAgo) wasteCostMonth += qty * price
  })

  const overstocked = Array.from(onHandByItem.entries())
    .filter(([itemId, onHand]) => onHand > (itemMinMap.get(itemId) ?? 0) * 2)
    .map(([itemId, onHand]) => ({
      itemId,
      itemName: itemNameMap.get(itemId) ?? itemId,
      onHand,
      minQuantity: itemMinMap.get(itemId) ?? 0
    }))
    .sort((a, b) => b.onHand - a.onHand)
    .slice(0, 25)

  const aiEnhanced = await enhanceFinancialHealth({
    inventoryValue,
    wasteCostWeek,
    wasteCostMonth,
    expiringSoonValue,
    overstocked
  })

  return {
    inventoryValue,
    wasteCostWeek,
    wasteCostMonth,
    expiringSoonValue,
    overstocked,
    summary: aiEnhanced.summary,
    riskAlerts: aiEnhanced.riskAlerts,
    recommendedActions: aiEnhanced.recommendedActions,
    questionsForManager: aiEnhanced.questionsForManager,
    ai: aiEnhanced.ai
  }
})

export const adminSafeEdit = onCall(async (request) => {
  const uid = await requirePlatformAdmin(request)
  const input = adminSafeEditRequestSchema.parse(request.data)

  const targetPath =
    input.targetType === "item"
      ? `organizations/${input.orgId}/items/${input.targetId}`
      : input.targetType === "mediaAsset"
        ? `mediaAssets/${input.targetId}`
        : `organizations/${input.orgId}/members/${input.targetId}`

  const ref = adminDb.doc(targetPath)
  const beforeSnap = await ref.get()
  const before = beforeSnap.exists ? beforeSnap.data() : null

  const patch = filterSafePatch(input.targetType, input.patch as Record<string, unknown>)

  if (Object.keys(patch).length === 0) {
    throw new HttpsError("invalid-argument", "No allowed fields in patch")
  }

  patch.updatedAt = FieldValue.serverTimestamp()
  await ref.set(patch, { merge: true })

  const afterSnap = await ref.get()
  const auditLogId = await writeAuditLog({
    actorUserId: uid,
    actorRoleSnapshot: "PlatformAdmin",
    organizationId: input.orgId,
    storeId: input.storeId ?? null,
    targetPath,
    action: "admin_edit",
    before,
    after: afterSnap.data()
  })

  return { ok: true, targetPath, auditLogId }
})

export const adminListOrganizations = onCall(async (request) => {
  await requirePlatformAdmin(request)
  const input = adminListOrganizationsRequestSchema.parse(request.data)
  const q = String(input.q ?? "").toLowerCase()
  const limitCount = input.limit

  const snap = await adminDb.collection("organizations").limit(Math.min(200, Math.max(1, limitCount))).get()
  const organizations = snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
    .filter((row) => !q || String((row as Record<string, unknown>).name ?? "").toLowerCase().includes(q))

  return { organizations }
})

export const adminGetOrganizationDetail = onCall(async (request) => {
  await requirePlatformAdmin(request)
  const input = adminOrganizationDetailRequestSchema.parse(request.data)
  const orgId = input.orgId

  const [orgSnap, orgSettingsSnap, itemsSnap, membersSnap, regionsSnap] = await Promise.all([
    adminDb.doc(`organizations/${orgId}`).get(),
    adminDb.doc(`organizations/${orgId}/settings/default`).get(),
    adminDb.collection(`organizations/${orgId}/items`).limit(500).get(),
    adminDb.collection(`organizations/${orgId}/members`).limit(500).get(),
    adminDb.collection(`organizations/${orgId}/regions`).get()
  ])

  const stores: Array<Record<string, unknown>> = []
  for (const region of regionsSnap.docs) {
    const districtsSnap = await adminDb.collection(`organizations/${orgId}/regions/${region.id}/districts`).get()
    for (const district of districtsSnap.docs) {
      const storesSnap = await adminDb
        .collection(`organizations/${orgId}/regions/${region.id}/districts/${district.id}/stores`)
        .get()
      for (const store of storesSnap.docs) {
        stores.push({
          id: store.id,
          regionId: region.id,
          districtId: district.id,
          ...(store.data() as Record<string, unknown>)
        })
      }
    }
  }

  return {
    organization: { id: orgSnap.id, stores, ...(orgSnap.data() as Record<string, unknown>) },
    organizationSettings: orgSettingsSnap.exists
      ? (orgSettingsSnap.data() as Record<string, unknown>)
      : null,
    items: itemsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })),
    members: membersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
  }
})

export const adminGetStoreDetail = onCall(async (request) => {
  await requirePlatformAdmin(request)
  const input = adminStoreDetailRequestSchema.parse(request.data)
  const orgId = input.orgId
  const storeId = input.storeId

  const storePath = await findStorePath(orgId, storeId)
  if (!storePath) throw new HttpsError("not-found", "Store not found")

  const basePath = `organizations/${orgId}/regions/${storePath.regionId}/districts/${storePath.districtId}/stores/${storeId}`
  const [storeSnap, storeSettingsSnap, batchesSnap, wasteSnap, ordersSnap, todoSnap] = await Promise.all([
    adminDb.doc(basePath).get(),
    adminDb.doc(`${basePath}/settings/default`).get(),
    adminDb
      .collectionGroup("inventoryBatches")
      .where("organizationId", "==", orgId)
      .where("storeId", "==", storeId)
      .limit(500)
      .get(),
    adminDb
      .collectionGroup("wasteRecords")
      .where("organizationId", "==", orgId)
      .where("storeId", "==", storeId)
      .limit(500)
      .get(),
    adminDb
      .collectionGroup("orders")
      .where("organizationId", "==", orgId)
      .where("storeId", "==", storeId)
      .limit(500)
      .get(),
    adminDb
      .collectionGroup("toDo")
      .where("organizationId", "==", orgId)
      .where("storeId", "==", storeId)
      .limit(500)
      .get()
  ])

  return {
    store: { id: storeSnap.id, ...(storeSnap.data() as Record<string, unknown>) },
    storeSettings: storeSettingsSnap.exists ? (storeSettingsSnap.data() as Record<string, unknown>) : null,
    inventoryBatches: batchesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })),
    wasteRecords: wasteSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })),
    orders: ordersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })),
    toDo: todoSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
  }
})

export const adminListAuditLogs = onCall(async (request) => {
  await requirePlatformAdmin(request)
  const input = adminAuditLogsRequestSchema.parse(request.data)
  const orgId = input.orgId
  const limitCount = input.limit ?? 200
  const snap = await adminDb
    .collection("auditLogs")
    .where("organizationId", "==", orgId)
    .orderBy("createdAt", "desc")
    .limit(limitCount)
    .get()

  return {
    logs: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
  }
})

export const setPlatformAdminClaim = onCall(async (request) => {
  await requirePlatformAdmin(request)
  const uid = String(request.data?.uid ?? "")
  const enabled = Boolean(request.data?.enabled)
  if (!uid) throw new HttpsError("invalid-argument", "uid required")
  await adminAuth.setCustomUserClaims(uid, { platform_admin: enabled })
  return { ok: true }
})
