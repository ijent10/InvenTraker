import { Timestamp } from "firebase-admin/firestore"
import type { MigrationResult } from "../lib/firebase-admin"
import { db } from "../lib/firebase-admin"

export async function run(): Promise<MigrationResult> {
  const result: MigrationResult = {
    id: "014_recommendation_engine_bootstrap",
    scanned: 0,
    updated: 0,
    skipped: 0,
    notes: []
  }

  const orgs = await db.collection("organizations").get()
  for (const org of orgs.docs) {
    result.scanned += 1
    const runtimeRef = db.collection("organizations").doc(org.id).collection("settings").doc("default")
    const runtimeSnap = await runtimeRef.get()
    const current = runtimeSnap.exists ? (runtimeSnap.data() as Record<string, unknown>) : {}
    const recommendationConfig =
      typeof current.recommendationEngine === "object" && current.recommendationEngine
        ? (current.recommendationEngine as Record<string, unknown>)
        : null

    const next = {
      primaryVersion: typeof recommendationConfig?.primaryVersion === "string" ? recommendationConfig.primaryVersion : "rules_v1",
      allowClientFallback:
        typeof recommendationConfig?.allowClientFallback === "boolean"
          ? recommendationConfig.allowClientFallback
          : true,
      enforceBackendPrimary:
        typeof recommendationConfig?.enforceBackendPrimary === "boolean"
          ? recommendationConfig.enforceBackendPrimary
          : true,
      schemaVersion: "recommendations_v2",
      updatedAt: Timestamp.now()
    }

    await runtimeRef.set(
      {
        recommendationEngine: next,
        updatedAt: Timestamp.now()
      },
      { merge: true }
    )

    await db.collection("organizations").doc(org.id).set(
      {
        migrationFlags: {
          recommendationEngineBootstrapped: true,
          recommendationEngineBootstrappedAt: Timestamp.now()
        }
      },
      { merge: true }
    )

    result.updated += 1
  }

  result.notes.push("Bootstrapped organizations/{orgId}/settings/default.recommendationEngine with rules_v1 defaults.")
  result.notes.push("Set migration flag recommendationEngineBootstrapped on each organization.")
  return result
}
