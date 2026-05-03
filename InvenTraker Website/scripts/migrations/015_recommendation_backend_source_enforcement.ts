import { Timestamp } from "firebase-admin/firestore"
import type { MigrationResult } from "../lib/firebase-admin"
import { db } from "../lib/firebase-admin"

export async function run(): Promise<MigrationResult> {
  const result: MigrationResult = {
    id: "015_recommendation_backend_source_enforcement",
    scanned: 0,
    updated: 0,
    skipped: 0,
    notes: []
  }

  const orgs = await db.collection("organizations").get()
  for (const org of orgs.docs) {
    result.scanned += 1
    const settingsRef = db.collection("organizations").doc(org.id).collection("settings").doc("default")
    const settingsSnap = await settingsRef.get()
    const current = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {}
    const currentEngine =
      typeof current.recommendationEngine === "object" && current.recommendationEngine
        ? (current.recommendationEngine as Record<string, unknown>)
        : {}

    await settingsRef.set(
      {
        recommendationEngine: {
          primaryVersion:
            typeof currentEngine.primaryVersion === "string" ? currentEngine.primaryVersion : "rules_v1",
          allowClientFallback:
            typeof currentEngine.allowClientFallback === "boolean" ? currentEngine.allowClientFallback : true,
          enforceBackendPrimary: true,
          schemaVersion: "recommendations_v2",
          updatedAt: Timestamp.now()
        },
        updatedAt: Timestamp.now()
      },
      { merge: true }
    )

    await db.collection("organizations").doc(org.id).set(
      {
        migrationFlags: {
          recommendationBackendPrimaryEnforced: true,
          recommendationBackendPrimaryEnforcedAt: Timestamp.now()
        }
      },
      { merge: true }
    )

    result.updated += 1
  }

  result.notes.push("Enabled recommendationEngine.enforceBackendPrimary for all organizations.")
  result.notes.push("Updated recommendation engine schemaVersion to recommendations_v2.")
  return result
}
