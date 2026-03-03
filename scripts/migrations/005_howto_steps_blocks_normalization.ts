import type { MigrationResult } from "../lib/firebase-admin"
import { db } from "../lib/firebase-admin"

export async function run(): Promise<MigrationResult> {
  const result: MigrationResult = { id: "005_howto_steps_blocks_normalization", scanned: 0, updated: 0, skipped: 0, notes: [] }
  const orgs = await db.collection("organizations").get()

  for (const org of orgs.docs) {
    const legacy = await db.collection(`organizations/${org.id}/howToGuides`).get()
    for (const guide of legacy.docs) {
      result.scanned += 1
      const data = guide.data() as { title?: string; summary?: string; steps?: string[]; sourceText?: string }
      const nextGuideRef = db.doc(`organizations/${org.id}/howtos/${guide.id}`)
      const nextGuideSnap = await nextGuideRef.get()
      if (nextGuideSnap.exists) {
        result.skipped += 1
        continue
      }
      await nextGuideRef.set({
        organizationId: org.id,
        title: data.title ?? "Guide",
        description: data.summary ?? "",
        tags: [],
        scope: "org",
        storeId: null,
        version: 1,
        updatedAt: new Date(),
        updatedBy: "migration",
        createdAt: new Date(),
        createdBy: "migration"
      })

      const steps = data.steps ?? [data.sourceText ?? ""]
      for (let i = 0; i < steps.length; i += 1) {
        const stepRef = db.collection(`organizations/${org.id}/howtos/${guide.id}/steps`).doc()
        await stepRef.set({
          organizationId: org.id,
          stepNumber: i + 1,
          title: `Step ${i + 1}`,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        await stepRef.collection("blocks").doc().set({
          organizationId: org.id,
          type: "text",
          text: steps[i],
          orderIndex: 0
        })
      }
      result.updated += 1
    }
  }

  result.notes.push("Normalized legacy howToGuides into howtos/steps/blocks structure.")
  return result
}
