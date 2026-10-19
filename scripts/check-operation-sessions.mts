import assert from "node:assert/strict"
import { sessionMutationSchema, transitionSession, mayReadSession, type OperationSession } from "../src/lib/engines/operations/sessions.ts"
const task: OperationSession = { id: "843d2202-9ddd-4588-a62e-c857b750699d", organizationId: "org", storeId: "store", createdBy: "creator", assignedTo: "counter", title: "Count", note: "", supplierReference: "", kind: "count", payload: { lines: [{ itemId: "item", expectedRevision: 0, frontStock: 2, backStock: 3 }] }, items: [], status: "draft", revision: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), reviewNote: "" }
assert.equal(mayReadSession(task, "other", false), false)
assert.equal(mayReadSession(task, "counter", false), true)
assert.equal(transitionSession(task, "submit", 2, "counter", false), "submitted")
assert.throws(() => transitionSession(task, "submit", 1, "counter", false), /changed/)
assert.throws(() => transitionSession(task, "save", 2, "other", false), /assigned/)
assert.throws(() => transitionSession(task, "post", 2, "creator", false), /manager/)
assert.throws(() => transitionSession(task, "post", 2, "manager", true), /Submit/)
const submitted = { ...task, status: "submitted" as const }
assert.equal(transitionSession(submitted, "post", 2, "manager", true), "posted")
assert.throws(() => transitionSession(submitted, "return", 2, "manager", true), /Explain/)
assert.equal(transitionSession(submitted, "return", 2, "manager", true, "Recount back stock"), "draft")
assert.throws(() => transitionSession(submitted, "save", 2, "counter", false), /no longer/)
assert.throws(() => transitionSession({ ...task, status: "posted" }, "cancel", 2, "manager", true), /no longer/)
assert.equal(sessionMutationSchema.safeParse({ action: "create", id: task.id, storeId: task.storeId, content: { kind: "count", title: "Count", assignedTo: "counter", payload: task.payload } }).success, true)
assert.equal(sessionMutationSchema.safeParse({ action: "create", id: task.id, storeId: task.storeId, content: { kind: "count", title: "Count", assignedTo: "counter", payload: { lines: [task.payload.lines[0], task.payload.lines[0]] } } }).success, false)
console.log("Operation sessions: scope, assignment, revision conflicts, review transitions, terminal states and validated stock payloads passed.")
