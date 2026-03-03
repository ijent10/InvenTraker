import { Timestamp } from "firebase-admin/firestore"
import type { MigrationResult } from "../lib/firebase-admin"
import { db } from "../lib/firebase-admin"

type StorePath = {
  regionId: string
  districtId: string
  storeId: string
}

function normalizeUnit(value: unknown): "each" | "lbs" {
  return String(value ?? "each").trim().toLowerCase() === "lbs" ? "lbs" : "each"
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function asTimestamp(value: unknown): Timestamp {
  if (value instanceof Timestamp) return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) return Timestamp.fromDate(value)
  if (typeof value === "number") {
    const asDate = new Date(value > 10_000_000_000 ? value : value * 1000)
    if (!Number.isNaN(asDate.getTime())) return Timestamp.fromDate(asDate)
  }
  if (typeof value === "string") {
    const asDate = new Date(value)
    if (!Number.isNaN(asDate.getTime())) return Timestamp.fromDate(asDate)
  }
  if (typeof value === "object" && value) {
    const map = value as { seconds?: number; _seconds?: number }
    const seconds = typeof map.seconds === "number" ? map.seconds : map._seconds
    if (typeof seconds === "number") return Timestamp.fromDate(new Date(seconds * 1000))
  }
  return Timestamp.now()
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

async function canonicalBatchRef(orgId: string, path: StorePath, batchId: string) {
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
    id: "010_store_inventory_canonicalization",
    scanned: 0,
    updated: 0,
    skipped: 0,
    notes: []
  }

  const orgs = await db.collection("organizations").get()
  let collisionCount = 0
  let unresolvedStoreCount = 0

  for (const org of orgs.docs) {
    const orgId = org.id
    const storePaths = await listStorePaths(orgId)
    if (storePaths.size === 0) {
      result.notes.push(`Org ${orgId}: no nested store paths; skipped inventory canonicalization.`)
      continue
    }

    const legacyByStoreRoots = await db.collection("organizations").doc(orgId).collection("stores").get()
    for (const storeDoc of legacyByStoreRoots.docs) {
      const storeId = storeDoc.id
      const nestedPath = storePaths.get(storeId)
      if (!nestedPath) {
        unresolvedStoreCount += 1
        continue
      }
      const legacyBatches = await storeDoc.ref.collection("inventoryBatches").get()
      for (const legacyBatch of legacyBatches.docs) {
        result.scanned += 1
        const data = legacyBatch.data() as Record<string, unknown>
        const targetRef = await canonicalBatchRef(orgId, nestedPath, legacyBatch.id)
        const existing = await targetRef.get()
        if (existing.exists) {
          const existingData = existing.data() as Record<string, unknown>
          const sameItem = asString(existingData.itemId) == asString(data.itemId)
          const sameStore = asString(existingData.storeId) == storeId
          if (!sameItem || !sameStore) {
            collisionCount += 1
          }
          result.skipped += 1
          continue
        }

        await targetRef.set({
          organizationId: orgId,
          storeId,
          itemId: asString(data.itemId),
          quantity: Math.max(0, asNumber(data.quantity, 0)),
          unit: normalizeUnit(data.unit),
          expiresAt: data.expiresAt ?? data.expirationDate ?? null,
          lot: asString(data.lot) || null,
          source: asString(data.source) || "manual",
          stockAreaRaw: asString(data.stockAreaRaw) || null,
          createdAt: asTimestamp(data.createdAt),
          updatedAt: asTimestamp(data.updatedAt)
        })
        result.updated += 1
      }
    }

    const orgLegacy = await db.collection("organizations").doc(orgId).collection("inventoryBatches").get()
    for (const legacyBatch of orgLegacy.docs) {
      result.scanned += 1
      const data = legacyBatch.data() as Record<string, unknown>
      const storeId = asString(data.storeId)
      if (!storeId) {
        result.skipped += 1
        continue
      }
      const nestedPath = storePaths.get(storeId)
      if (!nestedPath) {
        unresolvedStoreCount += 1
        result.skipped += 1
        continue
      }

      const targetRef = await canonicalBatchRef(orgId, nestedPath, legacyBatch.id)
      const existing = await targetRef.get()
      if (existing.exists) {
        const existingData = existing.data() as Record<string, unknown>
        if (asString(existingData.itemId) != asString(data.itemId)) {
          collisionCount += 1
        }
        result.skipped += 1
        continue
      }

      await targetRef.set({
        organizationId: orgId,
        storeId,
        itemId: asString(data.itemId),
        quantity: Math.max(0, asNumber(data.quantity, 0)),
        unit: normalizeUnit(data.unit),
        expiresAt: data.expiresAt ?? data.expirationDate ?? null,
        lot: asString(data.lot) || null,
        source: asString(data.source) || "manual",
        stockAreaRaw: asString(data.stockAreaRaw) || null,
        createdAt: asTimestamp(data.createdAt),
        updatedAt: asTimestamp(data.updatedAt)
      })
      result.updated += 1
    }

    await db.collection("organizations").doc(orgId).set(
      {
        migrationFlags: {
          storeInventoryCanonicalization: true,
          storeInventoryCanonicalizedAt: Timestamp.now()
        }
      },
      { merge: true }
    )
    await db
      .collection("organizations")
      .doc(orgId)
      .collection("settings")
      .doc("runtime")
      .set(
        {
          legacyInventoryFallbackDisabled: true,
          updatedAt: Timestamp.now()
        },
        { merge: true }
      )
  }

  if (collisionCount > 0) {
    result.notes.push(`Detected ${collisionCount} batch-id collisions; existing canonical docs were preserved.`)
  }
  if (unresolvedStoreCount > 0) {
    result.notes.push(`Skipped ${unresolvedStoreCount} legacy rows because matching nested store paths were missing.`)
  }
  result.notes.push("Canonical store inventory now lives under nested regions/districts/stores/inventoryBatches.")
  return result
}
