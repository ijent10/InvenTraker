import type { MigrationResult } from "../lib/firebase-admin"
import { db } from "../lib/firebase-admin"

export async function run(): Promise<MigrationResult> {
  const result: MigrationResult = { id: "006_platform_preference_profiles_backfill", scanned: 0, updated: 0, skipped: 0, notes: [] }
  const users = await db.collection("users").get()

  for (const user of users.docs) {
    const userId = user.id
    const userTheme = (user.data().themePreference as { appearanceMode?: string; accentColor?: string } | undefined) ?? {}

    const orgs = await db.collection("organizations").get()
    for (const org of orgs.docs) {
      const member = await db.doc(`organizations/${org.id}/members/${userId}`).get()
      if (!member.exists) continue
      result.scanned += 1

      const webId = `${userId}_${org.id}_WEB`
      const webRef = db.doc(`platformPreferenceProfiles/${webId}`)
      const webSnap = await webRef.get()
      if (!webSnap.exists) {
        await webRef.set({
          userId,
          organizationId: org.id,
          platform: "WEB",
          theme: userTheme.appearanceMode ?? "dark",
          accentColor: userTheme.accentColor ?? "#2563EB",
          boldText: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        result.updated += 1
      } else {
        result.skipped += 1
      }
    }
  }

  result.notes.push("Backfilled WEB platform preference profiles from legacy user theme preferences.")
  return result
}
