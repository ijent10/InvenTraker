import { assertStoreAccess, canAccessMobileStore, mobileError, mobileRecord, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"
import { EngineError, engineDocumentIdSchema } from "../contracts"
import { stockState } from "@/lib/stock-quantities"
import { executeSpotCheck } from "../inventory/spot-check"
import { executeReceiving } from "../inventory/receiving"
import { firestoreSpotCheckRepository } from "../inventory/firestore-spot-check-repository"
import { firestoreReceivingRepository } from "../inventory/firestore-receiving-repository"
import { assertInventoryWritesEnabled } from "../inventory/availability"
import { mayReadSession, sessionMutationSchema, transitionSession, type OperationSession } from "./sessions"

const headers = { "Cache-Control": "private, no-store" }
export async function getSessions(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "inventory.edit")
    const storeSnapshot = await orgCollection(principal, "stores").limit(201).get()
    const stores = storeSnapshot.docs.map(doc => ({ ...mobileRecord(doc.id, doc.data()), id: doc.id } as Record<string, unknown> & { id: string })).filter(store => canAccessMobileStore(principal, store.id, store.name, store.code, store.address, store.location))
    const selected = new URL(request.url).searchParams.get("storeId") || stores[0]?.id
    const selection = engineDocumentIdSchema.safeParse(selected)
    if (!selection.success) throw new EngineError("Choose an available store.", 400, "store_required")
    const storeId = selection.data
    await assertStoreAccess(principal, storeId)
    if (!(await orgCollection(principal, "stores").doc(storeId).get()).exists) throw new EngineError("This store was not found.", 404, "store_not_found")
    // Separate queries avoid a composite index and keep another employee's drafts out of the response.
    const source = orgCollection(principal, "operationSessions").where("storeId", "==", storeId)
    const queries = principal.isManager ? [source] : [source.where("assignedTo", "==", principal.uid), source.where("createdBy", "==", principal.uid)]
    const snapshots = await Promise.all(queries.map(query => query.limit(101).get()))
    const sessions = [...new Map(snapshots.flatMap(snapshot => snapshot.docs.map(doc => [doc.id, doc.data() as OperationSession] as const))).values()].filter(session => mayReadSession(session, principal.uid, principal.isManager)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const members = principal.isManager ? await orgCollection(principal, "members").limit(201).get() : null
    const assignees = members?.docs.flatMap(doc => {
      const value = doc.data()
      const manager = [value.role, value.jobTitle].some(role => ["owner", "organization owner", "admin", "administrator", "manager"].includes(String(role ?? "").trim().toLowerCase()))
      if (String(value.status ?? "Active").trim().toLowerCase() !== "active" || (!manager && !value.permissions?.includes("inventory.edit") && !value.permissions?.includes("*")) || !canAccessMobileStore({ ...principal, uid: doc.id, isManager: manager, permissions: value.permissions ?? [], member: { ...value, id: doc.id } }, storeId)) return []
      return [{ id: doc.id, name: String(value.name ?? "Employee") }]
    }) ?? [{ id: principal.uid, name: String(principal.member.name ?? "Me") }]
    const inventory = await orgCollection(principal, "inventory").where("storeId", "==", storeId).limit(201).get()
    const items = inventory.docs.flatMap(doc => {
      const value = doc.data()
      if (value.status === "Archived") return []
      try { return [{ id: doc.id, name: String(value.name ?? "Inventory item"), unit: String(value.unit ?? "eaches"), ...stockState(value) }] } catch { return [] }
    })
    return Response.json({ schemaVersion: "1", storeId, assignees: assignees.slice(0, 200), assigneesPartial: Boolean(members && members.size > 200), stores: stores.slice(0, 200).map(store => ({ id: store.id, name: String(store.name ?? store.id) })), storesPartial: storeSnapshot.size > 200, items: items.slice(0, 200), itemsPartial: inventory.size > 200, sessions: sessions.slice(0, 100), sessionsPartial: sessions.length > 100 || snapshots.some(snapshot => snapshot.size > 100), canReview: principal.isManager, uid: principal.uid }, { headers })
  } catch (error) { const response = mobileError(error); response.headers.set("Cache-Control", "private, no-store"); return response }
}

export async function mutateSession(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "inventory.edit")
    const parsed = sessionMutationSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new EngineError(parsed.error.issues[0]?.message ?? "Valid task details are required.", 400, "invalid_request")
    const input = parsed.data
    const ref = orgCollection(principal, "operationSessions").doc(input.id)
    // Resolve scope before the transaction; recheck persisted identity inside it.
    const first = input.action === "create" ? null : await ref.get()
    if (first && !first.exists) throw new EngineError("This task was not found.", 404, "session_not_found")
    const storeId = input.action === "create" ? input.storeId : String(first?.data()?.storeId ?? "")
    await assertStoreAccess(principal, storeId)
    if (!(await orgCollection(principal, "stores").doc(storeId).get()).exists) throw new EngineError("This store was not found.", 404, "store_not_found")
    if ("content" in input && input.content.assignedTo !== principal.uid) {
      if (!principal.isManager) throw new EngineError("Only a manager can assign a task to another employee.", 403, "assignment_denied")
      const member = await orgCollection(principal, "members").doc(input.content.assignedTo).get()
      const value = member.data()
      const manager = value && [value.role, value.jobTitle].some(role => ["owner", "organization owner", "admin", "administrator", "manager"].includes(String(role ?? "").trim().toLowerCase()))
      if (!value || (!manager && !value.permissions?.includes("inventory.edit") && !value.permissions?.includes("*")) || String(value.status ?? "Active").trim().toLowerCase() !== "active" || !canAccessMobileStore({ ...principal, uid: member.id, isManager: Boolean(manager), permissions: value.permissions ?? [], member: { ...value, id: member.id } }, storeId)) throw new EngineError("Choose an active employee assigned to this store.", 400, "invalid_assignee")
    }
    const result = await principal.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref)
      const current = snapshot.data() as OperationSession | undefined
      const now = new Date().toISOString()
      let next: OperationSession
      if (input.action === "create") {
        if (snapshot.exists) throw new EngineError("This task already exists. Reload it to continue.", 409, "session_conflict")
        next = { ...input.content, id: input.id, organizationId: principal.orgId, storeId, createdBy: principal.uid, status: "draft", revision: 0, createdAt: now, updatedAt: now, reviewNote: "", items: [] }
      } else {
        if (!current || current.organizationId !== principal.orgId || current.storeId !== storeId) throw new EngineError("This task could not be verified.", 409, "session_scope_invalid")
        if (!mayReadSession(current, principal.uid, principal.isManager)) throw new EngineError("This task is assigned to another employee.", 403, "session_access_denied")
        if (input.action === "post" && current.status === "posted") {
          if (!principal.isManager) throw new EngineError("A manager must review this task.", 403, "review_required")
          return current // A lost response never creates another stock operation.
        }
        const status = transitionSession(current, input.action, input.expectedRevision, principal.uid, principal.isManager, "reviewNote" in input ? input.reviewNote : "")
        if (input.action === "save" && current.kind !== input.content.kind) throw new EngineError("A task's type cannot be changed.", 400, "invalid_request")
        next = { ...current, ...(input.action === "save" ? input.content : {}), status, revision: current.revision + 1, updatedAt: now, ...("reviewNote" in input ? { reviewNote: input.reviewNote } : {}) }
      }
      if (input.action === "create" || input.action === "save" || input.action === "submit" || input.action === "post") {
        const items = await Promise.all(next.payload.lines.map(line => transaction.get(orgCollection(principal, "inventory").doc(line.itemId))))
        next.items = items.map((item, index) => {
          const value = item.data()
          if (!value || value.storeId !== storeId || value.status === "Archived") throw new EngineError("An item is unavailable in this store. Update the task before continuing.", 409, "item_unavailable")
          let stock
          try { stock = stockState(value) } catch { throw new EngineError("An item has invalid stock balances. Correct it before continuing.", 409, "invalid_stock_balance") }
          const line = next.payload.lines[index]
          if (next.kind === "count" && "expectedRevision" in line && line.expectedRevision !== stock.revision) throw new EngineError("Stock changed after this count was opened. Reload stock and count again.", 409, "stale_count")
          return { id: item.id, name: String(value.name ?? "Inventory item"), unit: String(value.unit ?? "eaches"), frontStock: stock.frontStock, backStock: stock.backStock, revision: stock.revision }
        })
      }
      if (input.action === "post") {
        assertInventoryWritesEnabled()
        const command = { commandId: next.id, organizationId: principal.orgId, actorId: principal.uid, locationId: storeId, payload: next.payload }
        const actor = { uid: principal.uid, organizationId: principal.orgId, permissions: principal.permissions, isManager: principal.isManager }
        const response = next.kind === "count"
          ? await executeSpotCheck(command, actor, await firestoreSpotCheckRepository(principal, request, transaction), async () => {})
          : await executeReceiving(command, actor, await firestoreReceivingRepository(principal, request, transaction), async () => {})
        next = { ...next, postedBy: principal.uid, postedAt: response.committedAt, result: response }
      }
      transaction.set(ref, next)
      transaction.create(ref.collection("events").doc(String(next.revision)), { action: input.action, actorId: principal.uid, revision: next.revision, at: now, status: next.status, reviewNote: next.reviewNote })
      return next
    })
    return Response.json({ schemaVersion: "1", session: result }, { headers })
  } catch (error) { const response = mobileError(error); response.headers.set("Cache-Control", "private, no-store"); return response }
}
