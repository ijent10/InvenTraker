import type { MigrationResult } from "../lib/firebase-admin"
import { db } from "../lib/firebase-admin"

export async function run(): Promise<MigrationResult> {
  const result: MigrationResult = { id: "004_inventory_batches_store_scope", scanned: 0, updated: 0, skipped: 0, notes: [] }
  const orgs = await db.collection("organizations").get()

  for (const org of orgs.docs) {
    const legacyItems = await db.collection(`organizations/${org.id}/items`).get()
    for (const item of legacyItems.docs) {
      const batches = await db.collection(`organizations/${org.id}/items/${item.id}/batches`).get()
      for (const batch of batches.docs) {
        result.scanned += 1
        const data = batch.data() as Record<string, unknown>
        const storeId = String(data.storeId ?? "default-store")
        const storeRef = await db.doc(`organizations/${org.id}/regions/default-region/districts/default-district/stores/${storeId}`).get()
        if (!storeRef.exists) {
          await db.doc(`organizations/${org.id}/regions/default-region/districts/default-district/stores/${storeId}`).set({
            organizationId: org.id,
            regionId: "default-region",
            districtId: "default-district",
            name: storeId,
            status: "active"
          }, { merge: true })
        }

        const nextRef = db.doc(`organizations/${org.id}/regions/default-region/districts/default-district/stores/${storeId}/inventoryBatches/${batch.id}`)
        const next = await nextRef.get()
        if (next.exists) {
          result.skipped += 1
          continue
        }

        await nextRef.set({
          organizationId: org.id,
          storeId,
          itemId: item.id,
          quantity: Number(data.quantity ?? 0),
          unit: data.unit ?? "each",
          expiresAt: data.expirationDate ?? data.expiresAt ?? null,
          lot: data.lot ?? null,
          source: data.source ?? "manual",
          createdAt: data.createdAt ?? new Date(),
          updatedAt: data.updatedAt ?? new Date()
        })
        result.updated += 1
      }
    }
  }

  result.notes.push("Moved legacy item subcollection batches into store-scoped inventoryBatches collections.")
  return result
}
