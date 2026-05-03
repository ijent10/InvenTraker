import type { MigrationResult } from "../lib/firebase-admin"
import { db } from "../lib/firebase-admin"

export async function run(): Promise<MigrationResult> {
  const result: MigrationResult = { id: "003_items_field_backfill", scanned: 0, updated: 0, skipped: 0, notes: [] }
  const orgs = await db.collection("organizations").get()

  for (const org of orgs.docs) {
    const items = await db.collection(`organizations/${org.id}/items`).get()
    for (const item of items.docs) {
      result.scanned += 1
      const data = item.data() as Record<string, unknown>
      const patch: Record<string, unknown> = {
        organizationId: org.id,
        unit: data.unit ?? "each",
        defaultExpirationDays: data.defaultExpirationDays ?? data.defaultExpiration ?? 7,
        minQuantity: data.minQuantity ?? data.minimumQuantity ?? 0,
        qtyPerCase: data.qtyPerCase ?? data.casePack ?? 1,
        caseSize: data.caseSize ?? 1,
        price: data.price ?? 0,
        tags: Array.isArray(data.tags) ? data.tags : [],
        archived: Boolean(data.archived)
      }
      await item.ref.set(patch, { merge: true })
      result.updated += 1
    }
  }

  result.notes.push("Ensured required item fields exist for ordering and financial health.")
  return result
}
