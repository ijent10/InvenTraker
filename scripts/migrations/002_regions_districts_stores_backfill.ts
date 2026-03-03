import type { MigrationResult } from "../lib/firebase-admin"
import { db } from "../lib/firebase-admin"

export async function run(): Promise<MigrationResult> {
  const result: MigrationResult = { id: "002_regions_districts_stores_backfill", scanned: 0, updated: 0, skipped: 0, notes: [] }
  const orgs = await db.collection("organizations").get()

  for (const org of orgs.docs) {
    const legacyStores = await db.collection(`organizations/${org.id}/stores`).get()
    if (legacyStores.empty) {
      result.notes.push(`org ${org.id}: no legacy stores`) 
      continue
    }

    const defaultRegionRef = db.doc(`organizations/${org.id}/regions/default-region`)
    const defaultDistrictRef = db.doc(`organizations/${org.id}/regions/default-region/districts/default-district`)
    await defaultRegionRef.set({ organizationId: org.id, name: "Default Region" }, { merge: true })
    await defaultDistrictRef.set({ organizationId: org.id, regionId: "default-region", name: "Default District" }, { merge: true })

    for (const store of legacyStores.docs) {
      result.scanned += 1
      const storeData = store.data()
      const nextStoreRef = db.doc(`organizations/${org.id}/regions/default-region/districts/default-district/stores/${store.id}`)
      const nextSnap = await nextStoreRef.get()
      if (nextSnap.exists) {
        result.skipped += 1
        continue
      }
      await nextStoreRef.set({
        organizationId: org.id,
        regionId: "default-region",
        districtId: "default-district",
        name: storeData.name ?? "Store",
        status: storeData.isActive === false ? "inactive" : "active",
        lastSyncAt: storeData.updatedAt ?? null
      })
      result.updated += 1
    }
  }

  result.notes.push("Backfilled region/district/store hierarchy from legacy stores collection.")
  return result
}
