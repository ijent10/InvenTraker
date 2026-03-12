import { Timestamp } from "firebase-admin/firestore"
import type { DocumentReference } from "firebase-admin/firestore"
import type { MigrationResult } from "../lib/firebase-admin"
import { db } from "../lib/firebase-admin"

type DepartmentConfig = {
  name: string
  locations: string[]
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return Array.from(new Set(value.map((entry) => String(entry ?? "").trim()).filter(Boolean))).sort()
}

function normalizeDepartmentConfigs(value: unknown): DepartmentConfig[] {
  if (!Array.isArray(value)) {
    return []
  }
  const normalized: DepartmentConfig[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue
    }
    const record = entry as Record<string, unknown>
    const name = String(record.name ?? "").trim()
    if (!name) {
      continue
    }
    normalized.push({
      name,
      locations: cleanStringList(record.locations)
    })
  }
  return normalized
}

function deriveDepartmentConfigsFromLegacy(data: Record<string, unknown>): DepartmentConfig[] {
  const legacyDepartments = cleanStringList(data.departments)
  const legacyLocations = cleanStringList(data.locationTemplates)
  if (legacyDepartments.length === 0 && legacyLocations.length === 0) {
    return []
  }
  if (legacyDepartments.length === 0) {
    return [
      {
        name: "General",
        locations: legacyLocations
      }
    ]
  }
  return legacyDepartments.map((name) => ({
    name,
    locations: legacyLocations
  }))
}

function needsBackfill(data: Record<string, unknown>): DepartmentConfig[] {
  const existing = normalizeDepartmentConfigs(data.departmentConfigs)
  if (existing.length > 0) {
    return []
  }
  return deriveDepartmentConfigsFromLegacy(data)
}

async function maybeBackfillSettingsDoc(
  settingsRef: DocumentReference,
  organizationId: string,
  storeId: string | null,
  result: MigrationResult
) {
  const snapshot = await settingsRef.get()
  if (!snapshot.exists) {
    result.skipped += 1
    return
  }

  result.scanned += 1
  const data = (snapshot.data() ?? {}) as Record<string, unknown>
  const departmentConfigs = needsBackfill(data)
  if (departmentConfigs.length === 0) {
    result.skipped += 1
    return
  }

  const departments = departmentConfigs.map((entry) => entry.name)
  const locationTemplates = Array.from(new Set(departmentConfigs.flatMap((entry) => entry.locations))).sort()

  await settingsRef.set(
    {
      organizationId,
      ...(storeId ? { storeId } : {}),
      departmentConfigs,
      departments,
      locationTemplates,
      updatedAt: Timestamp.now()
    },
    { merge: true }
  )
  result.updated += 1
}

export async function run(): Promise<MigrationResult> {
  const result: MigrationResult = {
    id: "016_department_configs_backfill",
    scanned: 0,
    updated: 0,
    skipped: 0,
    notes: []
  }

  const organizations = await db.collection("organizations").get()
  for (const organization of organizations.docs) {
    const organizationId = organization.id
    await maybeBackfillSettingsDoc(
      organization.ref.collection("settings").doc("default"),
      organizationId,
      null,
      result
    )

    const legacyStores = await organization.ref.collection("stores").get()
    for (const store of legacyStores.docs) {
      await maybeBackfillSettingsDoc(
        store.ref.collection("settings").doc("default"),
        organizationId,
        store.id,
        result
      )
    }

    const regions = await organization.ref.collection("regions").get()
    for (const region of regions.docs) {
      const districts = await region.ref.collection("districts").get()
      for (const district of districts.docs) {
        const stores = await district.ref.collection("stores").get()
        for (const store of stores.docs) {
          await maybeBackfillSettingsDoc(
            store.ref.collection("settings").doc("default"),
            organizationId,
            store.id,
            result
          )
        }
      }
    }
  }

  result.notes.push("Backfilled missing departmentConfigs from legacy departments/locationTemplates.")
  result.notes.push("Applied to organization settings and both legacy + nested store settings paths.")
  return result
}
