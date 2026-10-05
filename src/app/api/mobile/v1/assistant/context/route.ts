import { privacyFilterAssistantValue } from "@/lib/ai/privacy"
import { mobileEnvelope, mobileError, requireMobilePrincipal } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const blockedCollections = new Set(["members", "employees", "users", "assistantChats", "preferences", "billing", "subscriptions", "invites", "sessions"])

function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain)
  if (!value || typeof value !== "object") return value
  if ("toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return ((value as { toDate(): Date }).toDate()).toISOString()
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, plain(child)]))
}

export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    const org = principal.db.collection("orgs").doc(principal.orgId)
    const collections = (await org.listCollections()).filter((collection) => !blockedCollections.has(collection.id))
    const sections = await Promise.all(collections.map(async (collection) => {
      const snapshot = await collection.limit(300).get()
      return {
        name: collection.id,
        records: snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))
      }
    }))
    const collectionCounts = Object.fromEntries(sections.map((section) => [section.name, section.records.length]))
    const businessSummary = {
      name: "businessSummary",
      records: [{
        type: "authoritative_collection_counts",
        ...collectionCounts,
        activeInventory: sections.find((section) => section.name === "inventory")?.records.filter((record) => String((record as Record<string, unknown>).status ?? "").toLowerCase() !== "archived").length ?? 0
      }]
    }
    const filtered = privacyFilterAssistantValue(plain([businessSummary, ...sections]))
    return Response.json(mobileEnvelope({
      generatedAt: new Date().toISOString(),
      privacy: "Employee names, IDs, badge numbers, contact details, authentication data, and task-owner identities are excluded.",
      sections: filtered
    }))
  } catch (error) { return mobileError(error) }
}
