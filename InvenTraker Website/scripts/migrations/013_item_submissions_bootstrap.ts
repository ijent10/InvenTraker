import { FieldValue, Timestamp } from "firebase-admin/firestore"
import type { MigrationResult } from "../lib/firebase-admin"
import { db } from "../lib/firebase-admin"

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export async function run(): Promise<MigrationResult> {
  const result: MigrationResult = {
    id: "013_item_submissions_bootstrap",
    scanned: 0,
    updated: 0,
    skipped: 0,
    notes: []
  }

  let createdReviewQueues = 0
  const orgs = await db.collection("organizations").get()

  for (const org of orgs.docs) {
    const orgId = org.id

    await db
      .collection("organizations")
      .doc(orgId)
      .collection("settings")
      .doc("runtime")
      .set(
        {
          itemSubmissionWorkflowEnabled: true,
          itemSubmissionWorkflowBootstrappedAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        },
        { merge: true }
      )

    await db.collection("organizations").doc(orgId).set(
      {
        migrationFlags: {
          itemSubmissionsBootstrapped: true,
          itemSubmissionsBootstrappedAt: Timestamp.now()
        }
      },
      { merge: true }
    )

    const submissionsSnap = await db.collection("organizations").doc(orgId).collection("itemSubmissions").get()
    if (submissionsSnap.empty) {
      createdReviewQueues += 1
      continue
    }

    for (const submissionDoc of submissionsSnap.docs) {
      result.scanned += 1
      const data = submissionDoc.data() as Record<string, unknown>
      const patch: Record<string, unknown> = {}

      if (!asString(data.organizationId)) patch.organizationId = orgId
      if (!asString(data.status)) patch.status = "pending"
      if (!("createdAt" in data)) patch.createdAt = FieldValue.serverTimestamp()
      if (!("updatedAt" in data)) patch.updatedAt = FieldValue.serverTimestamp()
      if (!("reviewedByUid" in data)) patch.reviewedByUid = null
      if (!("reviewedAt" in data)) patch.reviewedAt = null

      if (Object.keys(patch).length === 0) {
        result.skipped += 1
        continue
      }

      await submissionDoc.ref.set(patch, { merge: true })
      result.updated += 1
    }
  }

  result.notes.push("Enabled item submission review workflow under organizations/{orgId}/itemSubmissions.")
  result.notes.push(`Item submission queues already present for ${Math.max(0, orgs.size - createdReviewQueues)} organization(s).`)
  return result
}
