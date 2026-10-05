import { adminFieldValue } from "@/lib/firebase-admin"
import { firestoreCollections } from "@/lib/firestore-schema"
import { assertStoreAccess, mobileCapabilities, mobileEnvelope, mobileError, mobileRecord, mobileRecordMatchesStore, orgCollection, requireMobilePrincipal, requireMobileStoreId } from "@/lib/mobile-api"
import { generateTodayIssues, operationalObservability, type TodayIssue } from "@/lib/today-issues"
import { selectTodayIssues } from "@/lib/ai/operational-decisions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    const storeId = requireMobileStoreId(new URL(request.url).searchParams.get("storeId"))
    await assertStoreAccess(principal, storeId)
    const capabilities = mobileCapabilities(principal)
    const [inventorySnapshot, batchSnapshot, orderSnapshot, operationSnapshot, issueSnapshot] = await Promise.all([
      capabilities.canViewInventory ? orgCollection(principal, firestoreCollections.inventory).where("storeId", "==", storeId).get() : null,
      capabilities.canViewInventory ? orgCollection(principal, firestoreCollections.inventoryBatches).where("storeId", "==", storeId).get() : null,
      capabilities.canViewOrders ? orgCollection(principal, firestoreCollections.orders).where("storeId", "==", storeId).get() : null,
      orgCollection(principal, firestoreCollections.stockOperations).where("storeId", "==", storeId).get(),
      orgCollection(principal, firestoreCollections.operationalIssues).where("storeId", "==", storeId).get()
    ])
    const records = (snapshot: typeof inventorySnapshot) => (snapshot?.docs ?? []).map((doc) => mobileRecord(doc.id, doc.data())).filter((record) => mobileRecordMatchesStore(record, storeId))
    const inventory = records(inventorySnapshot)
    const batches = records(batchSnapshot)
    const orders = records(orderSnapshot)
    const stockOperations = records(operationSnapshot)
    const now = new Date()
    const candidates = generateTodayIssues({ storeId, inventory: inventory as never, batches: batches as never, orders: orders as never, stockOperations: stockOperations as never, now })
    const issues = await selectTodayIssues(candidates)
    const previous = issueSnapshot.docs.map((doc) => mobileRecord(doc.id, doc.data())) as unknown as TodayIssue[]
    const activeIds = new Set(issues.map((issue) => issue.id))
    const FieldValue = await adminFieldValue()
    const writes: Array<(batch: FirebaseFirestore.WriteBatch) => void> = []
    for (const issue of issues) {
      writes.push((batch) => batch.set(orgCollection(principal, firestoreCollections.operationalIssues).doc(issue.id), {
        ...issue, generatedAt: now.toISOString(), lastSeenAt: FieldValue.serverTimestamp(), resolvedAt: null
      }, { merge: true }))
    }
    for (const oldIssue of previous.filter((issue) => issue.status === "open" && !activeIds.has(issue.id))) {
      writes.push((batch) => batch.update(orgCollection(principal, firestoreCollections.operationalIssues).doc(oldIssue.id), {
        status: "resolved", resolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      }))
    }
    for (let index = 0; index < writes.length; index += 400) {
      const batch = principal.db.batch()
      writes.slice(index, index + 400).forEach((write) => write(batch))
      await batch.commit()
    }
    const observability = operationalObservability({ inventory: inventory as never, batches: batches as never, orders: orders as never, stockOperations: stockOperations as never })
    return Response.json(mobileEnvelope({
      generatedAt: now.toISOString(), engineVersion: issues[0]?.engineVersion ?? "2026-10-01.1", issues,
      observability: { ...observability, unresolvedVariances: issues.filter((issue) => issue.type === "count_variance").length }
    }))
  } catch (error) {
    return mobileError(error)
  }
}
