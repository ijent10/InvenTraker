import { adminDb } from "@/lib/firebase-admin"
import { DEFAULT_ORG_ID, firestoreCollections } from "@/lib/firestore-schema"
import type { AiAnswer, AiOperationalContext, AssistantProductMemory } from "@/lib/ai/types"

export const GLOBAL_ASSISTANT_MEMORY_ORG_ID = "global"

export type AssistantMemoryPersistenceResult = {
  attempted: boolean
  persisted: boolean
  memoryId?: string
  orgId: string
  error?: string
}

type AssistantProductMemoryDraft = Omit<AssistantProductMemory, "id" | "createdAt" | "updatedAt" | "lastUsedAt" | "useCount">

const demoAssistantProductMemory: AssistantProductMemory[] = [
  {
    id: "demo-demo-org-cabernet-sauvignon-wine-cab-750-kosher-status",
    orgId: DEFAULT_ORG_ID,
    centralProductId: "central-wine-cab-750",
    productName: "Cabernet Sauvignon",
    sku: "WINE-CAB-750",
    department: "Beer & Wine",
    category: "Red wine",
    factType: "kosher_status",
    value: "not_verified",
    normalizedValue: "not_verified",
    confidence: "low",
    summary: "No source-backed kosher certification is stored for Cabernet Sauvignon in the demo workspace.",
    evidence: ["Local product record exists", "Kosher certification is not recorded"],
    sourceLabels: ["Demo assistant memory"],
    sourceUrls: [],
    visibility: "assistant_only",
    useCount: 1
  }
]

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

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, 12)
}

function findContextProduct(context: AiOperationalContext, productName?: string, sku?: string) {
  const normalizedName = productName?.toLowerCase()
  const normalizedSku = sku?.toLowerCase()

  const centralProduct = context.centralCatalog.find(
    (product) => product.sku?.toLowerCase() === normalizedSku || product.name.toLowerCase() === normalizedName
  )
  const organizationProduct = context.organizationProducts.find(
    (product) => product.sku?.toLowerCase() === normalizedSku || product.name.toLowerCase() === normalizedName
  )
  const inventoryItem = context.inventory.find(
    (item) => item.sku.toLowerCase() === normalizedSku || item.name.toLowerCase() === normalizedName
  )

  return {
    centralProduct,
    organizationProduct,
    inventoryItem
  }
}

function classifyKosherValue(answer: AiAnswer) {
  const text = [answer.answer, ...answer.quickFacts].join(" ").toLowerCase()

  if (answer.quickFacts.some((fact) => fact.toLowerCase().includes("kosher evidence found externally"))) {
    return "verified"
  }

  if (/\b(is|marked|certified)\s+kosher\b/.test(text) && !text.includes("not verified") && !text.includes("not recorded")) {
    return "verified"
  }

  if (text.includes("not verified") || text.includes("none of the matched records include kosher evidence")) {
    return "not_verified"
  }

  if (text.includes("not recorded") || text.includes("does not have kosher certification recorded")) {
    return "not_recorded"
  }

  return "unknown"
}

function summaryForFact(factType: AssistantProductMemory["factType"], productName: string, value: string, answer: AiAnswer) {
  if (factType === "kosher_status") {
    if (value === "verified") {
      return `${productName} has source-backed kosher evidence in the assistant memory.`
    }

    if (value === "not_verified") {
      return `${productName} does not currently have source-backed kosher evidence in the assistant memory.`
    }

    if (value === "not_recorded") {
      return `${productName} has no recorded kosher certification in the current product context.`
    }
  }

  return answer.answer.length > 220 ? `${answer.answer.slice(0, 217)}...` : answer.answer
}

function factTypeFromQuestion(question: string): AssistantProductMemory["factType"] | undefined {
  const normalized = question.toLowerCase()

  if (normalized.includes("kosher")) {
    return "kosher_status"
  }

  if (normalized.includes("halal") || normalized.includes("gluten") || normalized.includes("organic")) {
    return "dietary_status"
  }

  if (normalized.includes("nutrition") || normalized.includes("ingredient") || normalized.includes("allergen") || normalized.includes("calorie")) {
    return "nutrition"
  }

  if (normalized.includes("image") || normalized.includes("photo") || normalized.includes("picture")) {
    return "image"
  }

  if (normalized.includes("recall") || normalized.includes("recalled") || normalized.includes("safety")) {
    return "recall"
  }

  return undefined
}

function valueFromAnswer(factType: AssistantProductMemory["factType"], answer: AiAnswer) {
  if (factType === "kosher_status") return classifyKosherValue(answer)
  if (factType === "nutrition") return answer.quickFacts.length > 0 ? "nutrition_candidate" : "nutrition_not_found"
  if (factType === "image") return answer.imageCandidates.length > 0 ? "image_candidates_found" : "image_not_found"
  if (factType === "recall") return answer.recallMatches && answer.recallMatches.length > 0 ? "recall_matches_found" : "no_recall_match_returned"
  return "noted"
}

export function assistantMemoryRecordId(input: Pick<AssistantProductMemory, "orgId" | "productName" | "sku" | "factType">) {
  return [input.orgId || GLOBAL_ASSISTANT_MEMORY_ORG_ID, input.productName, input.sku, input.factType].map((value) => slugify(value ?? "none")).join("-")
}

export async function readAssistantProductMemory(orgId = DEFAULT_ORG_ID): Promise<AssistantProductMemory[]> {
  try {
    const db = await adminDb()
    if (!db) {
      return demoAssistantProductMemory.filter((memory) => memory.orgId === orgId || memory.orgId === GLOBAL_ASSISTANT_MEMORY_ORG_ID)
    }

    const snapshot = await db
      .collection(firestoreCollections.assistantProductMemory)
      .where("orgId", "in", [orgId, GLOBAL_ASSISTANT_MEMORY_ORG_ID])
      .limit(500)
      .get()

    return snapshot.docs.map(
      (document) =>
        ({
          id: document.id,
          ...(serializeFirestoreValue(document.data()) as Record<string, unknown>)
        }) as AssistantProductMemory
    )
  } catch {
    return demoAssistantProductMemory.filter((memory) => memory.orgId === orgId || memory.orgId === GLOBAL_ASSISTANT_MEMORY_ORG_ID)
  }
}

export async function persistAssistantProductMemory(
  draft: AssistantProductMemoryDraft,
  orgId = draft.orgId || DEFAULT_ORG_ID
): Promise<AssistantMemoryPersistenceResult> {
  const result: AssistantMemoryPersistenceResult = {
    attempted: true,
    persisted: false,
    orgId
  }

  try {
    const db = await adminDb()
    const memoryId = assistantMemoryRecordId({ ...draft, orgId })

    if (!db) {
      return {
        ...result,
        memoryId,
        error: "Preview mode: assistant memory was prepared, but it was not saved to Firestore yet."
      }
    }

    const { FieldValue } = await import("firebase-admin/firestore")
    const memoryRef = db.collection(firestoreCollections.assistantProductMemory).doc(memoryId)
    const existing = await memoryRef.get()

    await memoryRef.set(
      {
        ...draft,
        id: memoryId,
        orgId,
        visibility: "assistant_only",
        ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
        lastUsedAt: FieldValue.serverTimestamp(),
        useCount: FieldValue.increment(1)
      },
      { merge: true }
    )

    return {
      ...result,
      persisted: true,
      memoryId
    }
  } catch (error) {
    return {
      ...result,
      error: error instanceof Error ? error.message : "Failed to persist assistant memory."
    }
  }
}

export function buildAssistantMemoryFromAnswer({
  question,
  answer,
  context,
  productName,
  sku,
  orgId = DEFAULT_ORG_ID
}: {
  question: string
  answer: AiAnswer
  context: AiOperationalContext
  productName?: string
  sku?: string
  orgId?: string
}): AssistantProductMemoryDraft | null {
  if (answer.needsClarification) return null

  const factType = factTypeFromQuestion(question)
  if (!factType) return null

  const match = findContextProduct(context, answer.productName ?? productName, sku)
  const resolvedName = answer.productName ?? productName ?? match.centralProduct?.name ?? match.organizationProduct?.name ?? match.inventoryItem?.name
  const resolvedSku = sku ?? match.centralProduct?.sku ?? match.organizationProduct?.sku ?? match.inventoryItem?.sku

  if (!resolvedName && !resolvedSku) return null

  const displayName = resolvedName ?? resolvedSku ?? "Unknown product"
  const value = valueFromAnswer(factType, answer)
  const sourceLabels = uniqueStrings(answer.sources.map((source) => source.label))
  const sourceUrls = uniqueStrings(answer.sources.map((source) => source.url))

  return {
    orgId,
    centralProductId: match.centralProduct?.centralProductId ?? match.organizationProduct?.centralProductId ?? match.inventoryItem?.centralProductId,
    productName: displayName,
    sku: resolvedSku,
    department: match.inventoryItem?.department ?? match.organizationProduct?.department,
    category: match.inventoryItem?.category ?? match.organizationProduct?.category,
    factType,
    value,
    normalizedValue: value,
    confidence: answer.confidence,
    summary: summaryForFact(factType, displayName, value, answer),
    evidence: uniqueStrings([...answer.quickFacts, answer.answer]),
    sourceLabels,
    sourceUrls,
    visibility: "assistant_only"
  }
}
