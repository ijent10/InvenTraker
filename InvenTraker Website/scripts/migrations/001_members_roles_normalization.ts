import type { MigrationResult } from "../lib/firebase-admin"
import { db } from "../lib/firebase-admin"

const roleMap: Record<string, "Owner" | "Manager" | "Staff"> = {
  owner: "Owner",
  manager: "Manager",
  employee: "Staff",
  viewer: "Staff",
  Owner: "Owner",
  Manager: "Manager",
  Staff: "Staff"
}

export async function run(): Promise<MigrationResult> {
  const result: MigrationResult = { id: "001_members_roles_normalization", scanned: 0, updated: 0, skipped: 0, notes: [] }
  const orgs = await db.collection("organizations").get()

  for (const org of orgs.docs) {
    const members = await db.collection(`organizations/${org.id}/members`).get()
    for (const member of members.docs) {
      result.scanned += 1
      const data = member.data() as Record<string, unknown>
      const nextRole = roleMap[String(data.role ?? "Staff")] ?? "Staff"
      const storeIds = Array.isArray(data.storeIds) ? (data.storeIds as string[]) : []
      const patch: Record<string, unknown> = { organizationId: org.id, role: nextRole }
      if (data.userId !== member.id) patch.userId = member.id
      if (!Array.isArray(data.storeIds)) patch.storeIds = storeIds
      if (!data.createdAt) patch.createdAt = new Date()
      if (
        JSON.stringify(patch) ===
        JSON.stringify({
          organizationId: data.organizationId,
          userId: data.userId,
          role: data.role,
          storeIds: data.storeIds,
          createdAt: data.createdAt
        })
      ) {
        result.skipped += 1
      } else {
        await member.ref.set(patch, { merge: true })
        result.updated += 1
      }
    }
  }

  result.notes.push("Normalized member role values to Owner/Manager/Staff.")
  return result
}
