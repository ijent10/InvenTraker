import { FieldValue, Timestamp } from "firebase-admin/firestore"
import type { MigrationResult } from "../lib/firebase-admin"
import { db } from "../lib/firebase-admin"

type StorePath = {
  regionId: string
  districtId: string
  storeId: string
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

async function listStorePaths(orgId: string): Promise<Map<string, StorePath>> {
  const byStoreId = new Map<string, StorePath>()
  const regions = await db.collection("organizations").doc(orgId).collection("regions").get()
  for (const region of regions.docs) {
    const districts = await region.ref.collection("districts").get()
    for (const district of districts.docs) {
      const stores = await district.ref.collection("stores").get()
      for (const store of stores.docs) {
        byStoreId.set(store.id, {
          regionId: region.id,
          districtId: district.id,
          storeId: store.id
        })
      }
    }
  }
  return byStoreId
}

function canonicalBatchRef(orgId: string, path: StorePath, batchId: string) {
  return db
    .collection("organizations")
    .doc(orgId)
    .collection("regions")
    .doc(path.regionId)
    .collection("districts")
    .doc(path.districtId)
    .collection("stores")
    .doc(path.storeId)
    .collection("inventoryBatches")
    .doc(batchId)
}

export async function run(): Promise<MigrationResult> {
  const result: MigrationResult = {
    id: "012_store_inventory_unscoped_cleanup",
    scanned: 0,
    updated: 0,
    skipped: 0,
    notes: []
  }

  let unresolvedLegacyBatches = 0
  let unresolvedLegacyItems = 0

  const orgs = await db.collection("organizations").get()
  for (const org of orgs.docs) {
    const orgId = org.id
    const storePaths = await listStorePaths(orgId)

    const legacyStoreRoots = await db.collection("organizations").doc(orgId).collection("stores").get()
    for (const legacyStoreDoc of legacyStoreRoots.docs) {
      const storeId = legacyStoreDoc.id
      const nested = storePaths.get(storeId)
      const legacyBatches = await legacyStoreDoc.ref.collection("inventoryBatches").get()
      for (const legacyBatch of legacyBatches.docs) {
        result.scanned += 1
        if (!nested) {
          unresolvedLegacyBatches += 1
          result.skipped += 1
          continue
        }
        const canonicalRef = canonicalBatchRef(orgId, nested, legacyBatch.id)
        const canonical = await canonicalRef.get()
        if (!canonical.exists) {
          unresolvedLegacyBatches += 1
          result.skipped += 1
          continue
        }
        await legacyBatch.ref.delete()
        result.updated += 1
      }
    }

    const legacyOrgBatchSnap = await db.collection("organizations").doc(orgId).collection("inventoryBatches").get()
    for (const legacyBatch of legacyOrgBatchSnap.docs) {
      result.scanned += 1
      const data = legacyBatch.data() as Record<string, unknown>
      const storeId = asString(data.storeId)
      const nested = storePaths.get(storeId)
      if (!storeId || !nested) {
        unresolvedLegacyBatches += 1
        result.skipped += 1
        continue
      }
      const canonicalRef = canonicalBatchRef(orgId, nested, legacyBatch.id)
      const canonical = await canonicalRef.get()
      if (!canonical.exists) {
        unresolvedLegacyBatches += 1
        result.skipped += 1
        continue
      }
      await legacyBatch.ref.delete()
      result.updated += 1
    }

    const orgItems = await db.collection("organizations").doc(orgId).collection("items").get()
    for (const itemDoc of orgItems.docs) {
      result.scanned += 1
      const data = itemDoc.data() as Record<string, unknown>
      const scopedStore = asString(data.storeId)
      const hasEmbeddedBatches = Array.isArray(data.batches) && data.batches.length > 0
      const hasLegacyQuantity = typeof data.totalQuantity === "number"
      if (!scopedStore && !hasEmbeddedBatches && !hasLegacyQuantity) {
        result.skipped += 1
        continue
      }
      if (scopedStore && !storePaths.has(scopedStore)) {
        unresolvedLegacyItems += 1
      }
      await itemDoc.ref.set(
        {
          storeId: FieldValue.delete(),
          totalQuantity: FieldValue.delete(),
          batches: FieldValue.delete(),
          updatedAt: Timestamp.now()
        },
        { merge: true }
      )
      result.updated += 1
    }

    await db
      .collection("organizations")
      .doc(orgId)
      .collection("settings")
      .doc("runtime")
      .set(
        {
          legacyInventoryFallbackEnabled: false,
          legacyInventoryFallbackDisabled: true,
          updatedAt: Timestamp.now()
        },
        { merge: true }
      )

    await db.collection("organizations").doc(orgId).set(
      {
        migrationFlags: {
          storeInventoryCanonicalization: true,
          storeInventoryCanonicalizedAt: Timestamp.now(),
          storeInventoryUnscopedCleanup: true,
          storeInventoryUnscopedCleanupAt: Timestamp.now()
        }
      },
      { merge: true }
    )
  }

  if (unresolvedLegacyBatches > 0) {
    result.notes.push(
      `Skipped ${unresolvedLegacyBatches} legacy batch documents because canonical targets were missing.`
    )
  }
  if (unresolvedLegacyItems > 0) {
    result.notes.push(
      `Found ${unresolvedLegacyItems} org items with storeId values that did not match known nested stores.`
    )
  }
  result.notes.push("Legacy unscoped inventory payloads were cleaned and fallback reads were disabled.")
  return result
}
