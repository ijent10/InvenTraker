import { canMobile, type MobilePrincipal } from "@/lib/mobile-api"
import { workspaceCursorId } from "./workspace-consumer"
export async function readWorkspaceStockRevision(principal: MobilePrincipal, storeId: string) {
  if (!canMobile(principal, "inventory.view")) return 0
  const cursor = (await principal.db.collection("workspaceInvalidations").doc(workspaceCursorId(principal.orgId, storeId)).get()).data()
  if (!cursor) return 0
  if (cursor.organizationId !== principal.orgId || cursor.storeId !== storeId || !Number.isSafeInteger(cursor.revision) || cursor.revision < 0) throw new Error("Invalid workspace invalidation scope.")
  return cursor.revision as number
}
