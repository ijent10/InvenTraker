import type { MigrationResult } from "../lib/firebase-admin"
import { db } from "../lib/firebase-admin"

export async function run(): Promise<MigrationResult> {
  const result: MigrationResult = { id: "007_audit_logs_root_backfill", scanned: 0, updated: 0, skipped: 0, notes: [] }
  const orgs = await db.collection("organizations").get()

  for (const org of orgs.docs) {
    const actions = await db.collection(`organizations/${org.id}/actions`).get()
    for (const action of actions.docs) {
      result.scanned += 1
      const rootLogRef = db.doc(`auditLogs/${org.id}_${action.id}`)
      const rootLogSnap = await rootLogRef.get()
      if (rootLogSnap.exists) {
        result.skipped += 1
        continue
      }
      const actionData = action.data() as Record<string, unknown>
      await rootLogRef.set({
        actorUserId: actionData.actorUid ?? "unknown",
        actorRoleSnapshot: actionData.actorRole ?? "Staff",
        organizationId: org.id,
        storeId: (actionData.objectRefs as { storeId?: string } | undefined)?.storeId ?? null,
        targetPath: String((actionData.objectRefs as { itemId?: string; orderId?: string } | undefined)?.itemId ?? (actionData.objectRefs as { orderId?: string } | undefined)?.orderId ?? `organizations/${org.id}/actions/${action.id}`),
        action: "update",
        before: null,
        after: actionData.payload ?? {},
        createdAt: actionData.createdAt ?? new Date()
      })
      result.updated += 1
    }
  }

  result.notes.push("Mirrored organization actions into root auditLogs collection.")
  return result
}
