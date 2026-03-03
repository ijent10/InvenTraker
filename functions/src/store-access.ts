import { onCall, HttpsError } from "firebase-functions/v2/https"
import { FieldValue } from "firebase-admin/firestore"
import { z } from "zod"

import { adminDb } from "./lib/firebase.js"
import { requireAuth, requirePermission } from "./lib/auth.js"
import { findStorePath } from "./utils/store-path.js"

const requestStoreAccessSchema = z.object({
  orgId: z.string().trim().min(1),
  storeId: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(500).optional()
})

const reviewStoreAccessSchema = z.object({
  orgId: z.string().trim().min(1),
  requestId: z.string().trim().min(1),
  decision: z.enum(["approved", "denied"]),
  note: z.string().trim().max(500).optional()
})

export const requestStoreAccess = onCall(async (request) => {
  const uid = requireAuth(request)
  const input = requestStoreAccessSchema.parse(request.data ?? {})
  const membership = await requirePermission(input.orgId, uid, "requestStoreAccess")

  const storePath = await findStorePath(input.orgId, input.storeId)
  if (!storePath) {
    throw new HttpsError("not-found", "Store not found.")
  }

  if (membership.role === "Owner") {
    throw new HttpsError("failed-precondition", "Owners already have access to all stores.")
  }

  const currentStoreIds = Array.isArray(membership.storeIds) ? membership.storeIds : []
  if (currentStoreIds.includes(input.storeId)) {
    throw new HttpsError("already-exists", "You already have access to this store.")
  }

  const existingPending = await adminDb
    .collection("organizations")
    .doc(input.orgId)
    .collection("storeAccessRequests")
    .where("requesterUid", "==", uid)
    .where("targetStoreId", "==", input.storeId)
    .where("status", "==", "pending")
    .limit(1)
    .get()

  if (!existingPending.empty) {
    const ref = existingPending.docs[0]!.ref
    await ref.set(
      {
        reason: input.reason?.trim() || null,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    )
    return { ok: true, requestId: ref.id, status: "pending" }
  }

  const ref = adminDb.collection("organizations").doc(input.orgId).collection("storeAccessRequests").doc()
  await ref.set({
    organizationId: input.orgId,
    requesterUid: uid,
    targetStoreId: input.storeId,
    reason: input.reason?.trim() || null,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    reviewedByUid: null,
    reviewedAt: null,
    note: null
  })

  return { ok: true, requestId: ref.id, status: "pending" }
})

export const reviewStoreAccessRequest = onCall(async (request) => {
  const reviewerUid = requireAuth(request)
  const input = reviewStoreAccessSchema.parse(request.data ?? {})

  await requirePermission(input.orgId, reviewerUid, "approveStoreAccessRequests")

  const requestRef = adminDb
    .collection("organizations")
    .doc(input.orgId)
    .collection("storeAccessRequests")
    .doc(input.requestId)
  const requestSnap = await requestRef.get()
  if (!requestSnap.exists) {
    throw new HttpsError("not-found", "Store access request not found.")
  }

  const data = requestSnap.data() as {
    requesterUid?: string
    targetStoreId?: string
    status?: string
  }
  if (!data.requesterUid || !data.targetStoreId) {
    throw new HttpsError("failed-precondition", "Store access request is missing required fields.")
  }
  if (data.status && data.status !== "pending") {
    throw new HttpsError("failed-precondition", "Store access request has already been reviewed.")
  }

  const memberRef = adminDb.collection("organizations").doc(input.orgId).collection("members").doc(data.requesterUid)
  const memberSnap = await memberRef.get()
  if (!memberSnap.exists) {
    throw new HttpsError("not-found", "Requested user membership not found.")
  }

  if (input.decision === "approved") {
    const memberData = memberSnap.data() as { storeIds?: string[] }
    const currentStoreIds = Array.isArray(memberData.storeIds) ? memberData.storeIds : []
    const mergedStoreIds = Array.from(new Set([...currentStoreIds, data.targetStoreId]))

    await memberRef.set(
      {
        storeIds: mergedStoreIds,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    )
  }

  await requestRef.set(
    {
      status: input.decision,
      reviewedByUid: reviewerUid,
      reviewedAt: FieldValue.serverTimestamp(),
      note: input.note?.trim() || null,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  )

  return { ok: true, status: input.decision }
})
