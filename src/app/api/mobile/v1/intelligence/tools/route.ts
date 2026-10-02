import { z } from "zod"

import { firestoreCollections } from "@/lib/firestore-schema"
import { inventrakerProductAdapter } from "@/lib/intelligence/inventraker-product-adapter"
import { assertStoreAccess, mobileCapabilities, mobileEnvelope, mobileError, mobileRecord, mobileRecordMatchesStore, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const schema = z.object({
  tool: z.enum(["current_balance", "batch_expiry", "stock_events", "order_explanation", "cost_changes", "comparable_waste", "runout_explanation"]),
  storeId: z.string().trim().min(1),
  itemId: z.string().trim().min(1).optional(),
  orderId: z.string().trim().min(1).optional()
})

export async function POST(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "insights.view")
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: { code: "invalid_request", message: "Choose a supported tool and store." } }, { status: 400 })
    const input = parsed.data
    await assertStoreAccess(principal, input.storeId)
    const capabilities = mobileCapabilities(principal)
    const needsOrders = input.tool === "order_explanation" || input.tool === "cost_changes" || input.tool === "runout_explanation"
    const needsInventory = input.tool !== "order_explanation"
    if (needsOrders && !capabilities.canViewOrders) return Response.json({ error: { code: "permission_denied", message: "Order access is required for this explanation." } }, { status: 403 })
    if (needsInventory && !capabilities.canViewInventory) return Response.json({ error: { code: "permission_denied", message: "Inventory access is required for this explanation." } }, { status: 403 })

    const sourcesByTool = {
      current_balance: ["inventory"],
      batch_expiry: ["inventoryBatches"],
      stock_events: ["stockOperations"],
      order_explanation: ["orders"],
      cost_changes: ["stockOperations", "orders"],
      comparable_waste: ["waste"],
      runout_explanation: ["inventory", "stockOperations", "orders", "waste", "sales", "portions"]
    } as const
    const names = sourcesByTool[input.tool]
    const snapshots = await Promise.all(names.map((name) => orgCollection(principal, firestoreCollections[name]).where("storeId", "==", input.storeId).get()))
    const data = Object.fromEntries(snapshots.map((snapshot, index) => [names[index], snapshot.docs.map((doc) => mobileRecord(doc.id, doc.data())).filter((record) => mobileRecordMatchesStore(record, input.storeId))]))
    const result = inventrakerProductAdapter.execute(input.tool, { storeId: input.storeId, itemId: input.itemId, orderId: input.orderId, ...data })
    return Response.json(mobileEnvelope(result))
  } catch (error) {
    return mobileError(error)
  }
}
