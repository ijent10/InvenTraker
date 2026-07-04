import { adminDb } from "@/lib/firebase-admin"
import type { ProductKnowledgeRecord } from "@/lib/ai/knowledge-base"

export type KnowledgePersistenceResult = {
  attempted: boolean
  persisted: boolean
  orgId: string
  error?: string
}

export async function persistKnowledgeRecords(records: ProductKnowledgeRecord[], orgId = process.env.AI_LEARNING_ORG_ID || "demo-org") {
  const result: KnowledgePersistenceResult = {
    attempted: true,
    persisted: false,
    orgId
  }

  try {
    const db = await adminDb()
    if (!db) {
      return {
        ...result,
        error: "Preview mode: product learning completed here, but it was not saved to Firestore yet."
      }
    }
    const { FieldValue } = await import("firebase-admin/firestore")

    const batch = db.batch()
    const runRef = db.collection("orgs").doc(orgId).collection("aiLearningRuns").doc()

    batch.set(runRef, {
      createdAt: FieldValue.serverTimestamp(),
      productCount: records.length,
      sourceTypes: ["local_inventory", "local_catalog", "open_food_facts"],
      status: "completed"
    })

    for (const record of records) {
      const recordRef = db.collection("orgs").doc(orgId).collection("aiProductKnowledge").doc(record.id)
      batch.set(
        recordRef,
        {
          ...record,
          updatedAt: FieldValue.serverTimestamp(),
          learningRunId: runRef.id
        },
        { merge: true }
      )
    }

    await batch.commit()

    return {
      ...result,
      attempted: true,
      persisted: true
    }
  } catch (error) {
    return {
      ...result,
      attempted: true,
      persisted: false,
      error: error instanceof Error ? error.message : "Failed to persist knowledge records."
    }
  }
}
