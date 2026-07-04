import { adminDb } from "@/lib/firebase-admin"
import { DEFAULT_ORG_ID, firestoreCollections } from "@/lib/firestore-schema"
import { slugifyIntelligenceId } from "@/lib/intelligence/text"
import type {
  AcceptedAnswerRecord,
  IntentPatternRecord,
  LearnedPhraseMapping,
  ProductFactNoteRecord,
  ProductAliasRecord,
  RejectedAliasRecord,
  RejectedAnswerRecord,
  TerminologyRecord,
  VerifiedLearningInput,
  VerifiedLearningRecords,
  VerifiedCorrectionRecord,
  VerifiedLearningResult
} from "@/lib/intelligence/types"

const demoLearningRecords: VerifiedLearningRecords = {
  userPhraseMappings: [
    {
      id: "phrase-white-cheese-starts-with-m",
      phrase: "white cheese that starts with M",
      resolvedProductName: "Mascarpone",
      confidenceScore: 1,
      verifiedByUser: true
    }
  ],
  productAliases: [
    {
      id: "alias-mascarpone-tiramisu-white-cheese",
      productName: "Mascarpone",
      alias: "creamy white stuff in tiramisu",
      confidenceScore: 0.92,
      verifiedByUser: true
    }
  ],
  rejectedAliases: [],
  intentPatterns: [
    {
      id: "intent-product-lookup-white-cheese",
      pattern: "what is that white cheese",
      intent: "product_lookup",
      confidenceScore: 0.86
    }
  ],
  acceptedAnswers: [],
  rejectedAnswers: [],
  verifiedCorrections: [],
  storeSpecificTerminology: [],
  organizationSpecificTerminology: [],
  productFactNotes: [],
  operationalNotes: [],
  ambiguousPhraseHistory: []
}

function serializeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString()
  }

  if (Array.isArray(value)) return value.map(serializeFirestoreValue)

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeFirestoreValue(entry)]))
  }

  return value
}

async function readLearningCollection<T>(orgId: string, collectionName: string, fallback: T[]) {
  try {
    const db = await adminDb()
    if (!db) return fallback

    const snapshot = await db.collection(firestoreCollections.orgs).doc(orgId).collection(collectionName).limit(500).get()
    return snapshot.docs.map((document) => ({ id: document.id, ...(serializeFirestoreValue(document.data()) as Record<string, unknown>) }) as T)
  } catch {
    return fallback
  }
}

export async function readVerifiedLearningRecords(orgId = DEFAULT_ORG_ID): Promise<VerifiedLearningRecords> {
  const [
    userPhraseMappings,
    productAliases,
    rejectedAliases,
    intentPatterns,
    acceptedAnswers,
    rejectedAnswers,
    verifiedCorrections,
    storeSpecificTerminology,
    organizationSpecificTerminology,
    productFactNotes,
    operationalNotes,
    ambiguousPhraseHistory
  ] = await Promise.all([
    readLearningCollection<LearnedPhraseMapping>(orgId, firestoreCollections.userPhraseMappings, demoLearningRecords.userPhraseMappings),
    readLearningCollection<ProductAliasRecord>(orgId, firestoreCollections.productAliases, demoLearningRecords.productAliases),
    readLearningCollection<RejectedAliasRecord>(orgId, firestoreCollections.rejectedAliases, demoLearningRecords.rejectedAliases),
    readLearningCollection<IntentPatternRecord>(orgId, firestoreCollections.intentPatterns, demoLearningRecords.intentPatterns),
    readLearningCollection<AcceptedAnswerRecord>(orgId, firestoreCollections.acceptedAnswers, demoLearningRecords.acceptedAnswers),
    readLearningCollection<RejectedAnswerRecord>(orgId, firestoreCollections.rejectedAnswers, demoLearningRecords.rejectedAnswers),
    readLearningCollection<VerifiedCorrectionRecord>(orgId, firestoreCollections.verifiedCorrections, demoLearningRecords.verifiedCorrections),
    readLearningCollection<TerminologyRecord>(orgId, firestoreCollections.storeSpecificTerminology, demoLearningRecords.storeSpecificTerminology),
    readLearningCollection<TerminologyRecord>(orgId, firestoreCollections.organizationSpecificTerminology, demoLearningRecords.organizationSpecificTerminology),
    readLearningCollection<ProductFactNoteRecord>(orgId, firestoreCollections.productFactNotes, demoLearningRecords.productFactNotes),
    readLearningCollection<TerminologyRecord>(orgId, firestoreCollections.operationalNotes, demoLearningRecords.operationalNotes),
    readLearningCollection<TerminologyRecord>(orgId, firestoreCollections.ambiguousPhraseHistory, demoLearningRecords.ambiguousPhraseHistory)
  ])

  return {
    userPhraseMappings,
    productAliases,
    rejectedAliases,
    intentPatterns,
    acceptedAnswers,
    rejectedAnswers,
    verifiedCorrections,
    storeSpecificTerminology,
    organizationSpecificTerminology,
    productFactNotes,
    operationalNotes,
    ambiguousPhraseHistory
  }
}

function intentFromQuery(query: string): IntentPatternRecord["intent"] {
  const normalized = query.toLowerCase()
  if (/(order|reorder|vendor|delivery|production)/.test(normalized)) return "ordering_reasoning"
  if (/(waste|stock|inventory|expiration|movement|trend)/.test(normalized)) return "inventory_reasoning"
  if (/(image|nutrition|ingredient|allergen|label|enrich)/.test(normalized)) return "product_enrichment"
  if (/(why|recommend|forecast|business|sales|cost)/.test(normalized)) return "business_recommendation"
  return "product_lookup"
}

export async function persistVerifiedLearning(input: VerifiedLearningInput, orgId = DEFAULT_ORG_ID): Promise<VerifiedLearningResult> {
  const result: VerifiedLearningResult = {
    attempted: true,
    persisted: false,
    orgId,
    recordIds: []
  }

  try {
    const db = await adminDb()
    const phraseId = `phrase-${slugifyIntelligenceId(input.query)}`
    const answerId = `${input.accepted ? "accepted" : "rejected"}-${slugifyIntelligenceId(input.query)}`
    const intentId = `intent-${slugifyIntelligenceId(input.query)}`
    const aliasId = input.resolvedProductName ? `alias-${slugifyIntelligenceId(`${input.resolvedProductName}-${input.query}`)}` : undefined

    if (!db) {
      return {
        ...result,
        recordIds: [phraseId, answerId, intentId, aliasId].filter((id): id is string => Boolean(id)),
        error: "Preview mode: verified learning was prepared but not saved to Firestore yet."
      }
    }

    const { FieldValue } = await import("firebase-admin/firestore")
    const batch = db.batch()
    const orgRef = db.collection(firestoreCollections.orgs).doc(orgId)

    batch.set(
      orgRef.collection(firestoreCollections.userPhraseMappings).doc(phraseId),
      {
        phrase: input.query,
        resolvedProductId: input.resolvedProductId,
        resolvedProductName: input.resolvedProductName,
        confidenceScore: input.accepted ? 1 : input.confidenceScore,
        verifiedByUser: Boolean(input.verifiedByUser ?? input.accepted),
        sourceRoute: input.sourceRoute,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    )

    if (input.resolvedProductName && aliasId) {
      batch.set(
        orgRef.collection(firestoreCollections.productAliases).doc(aliasId),
        {
          productId: input.resolvedProductId,
          productName: input.resolvedProductName,
          alias: input.query,
          confidenceScore: input.accepted ? 1 : input.confidenceScore,
          verifiedByUser: Boolean(input.verifiedByUser ?? input.accepted),
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      )
    }

    batch.set(
      orgRef.collection(firestoreCollections.intentPatterns).doc(intentId),
      {
        pattern: input.query,
        intent: intentFromQuery(input.query),
        confidenceScore: Math.max(0.5, input.confidenceScore),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    )

    batch.set(orgRef.collection(input.accepted ? firestoreCollections.acceptedAnswers : firestoreCollections.rejectedAnswers).doc(answerId), {
      query: input.query,
      answer: input.correctedAnswer || input.answer,
      originalAnswer: input.answer,
      resolvedProductId: input.resolvedProductId,
      resolvedProductName: input.resolvedProductName,
      confidenceScore: input.confidenceScore,
      verifiedByUser: Boolean(input.verifiedByUser),
      sourceRoute: input.sourceRoute,
      createdAt: FieldValue.serverTimestamp()
    })

    if (!input.accepted && input.correctedAnswer) {
      const correctionId = `correction-${slugifyIntelligenceId(input.query)}`
      batch.set(orgRef.collection(firestoreCollections.verifiedCorrections).doc(correctionId), {
        query: input.query,
        correctedAnswer: input.correctedAnswer,
        originalAnswer: input.answer,
        resolvedProductId: input.resolvedProductId,
        resolvedProductName: input.resolvedProductName,
        confidenceScore: input.confidenceScore,
        createdAt: FieldValue.serverTimestamp()
      })

      if (input.resolvedProductName) {
        const rejectedAliasId = `rejected-alias-${slugifyIntelligenceId(`${input.resolvedProductName}-${input.query}`)}`
        batch.set(
          orgRef.collection(firestoreCollections.rejectedAliases).doc(rejectedAliasId),
          {
            productId: input.resolvedProductId,
            productName: input.resolvedProductName,
            alias: input.query,
            reason: input.correctedAnswer,
            confidenceScore: input.confidenceScore,
            updatedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        )
      }
    }

    await batch.commit()

    return {
      ...result,
      persisted: true,
      recordIds: [phraseId, answerId, intentId, aliasId].filter((id): id is string => Boolean(id))
    }
  } catch (error) {
    return {
      ...result,
      error: error instanceof Error ? error.message : "Failed to persist verified learning."
    }
  }
}
