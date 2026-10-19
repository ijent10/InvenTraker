import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { applicationDefault, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
if (process.env.INVENTRAKER_RUN_FIRESTORE_INTEGRATION !== "1") throw new Error("Opt in with INVENTRAKER_RUN_FIRESTORE_INTEGRATION=1 for temporary, self-cleaning organization checks.")
const origin = process.env.INVENTRAKER_TEST_ORIGIN || "http://localhost:3061"
const app = initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || "inventracker-f1229" })
const db = getFirestore(app), auth = getAuth(app), orgId = `sessions-check-${randomUUID()}`
const org = db.collection("orgs").doc(orgId), storeId = "test-store", users = [], ids = []
async function identity(role) {
  const email = `${orgId}-${role}@example.invalid`, password = `${randomUUID()}Aa9!`
  const user = await auth.createUser({ email, password }); users.push(user.uid)
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyD58SA61KJCkiy33n0WUgM9TbOtVcNLH9k"
  const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) }).then(r => r.json())
  assert.ok(login.idToken)
  await org.collection("members").doc(user.uid).set({ name: role, role: role === "owner" ? "owner" : "employee", status: "Active", storeIds: [storeId], permissions: ["inventory.edit"] })
  return { uid: user.uid, headers: { authorization: `Bearer ${login.idToken}`, "x-inventracker-org": orgId, "content-type": "application/json" } }
}
async function api(actor, body, query = "") {
  const response = await fetch(`${origin}/api/v1/operations/sessions${query}`, { method: body ? "POST" : "GET", headers: actor?.headers ?? {}, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: response.status, data: await response.json(), headers: response.headers }
}
function operation(id, action, expectedRevision, reviewNote = "") { return { id, action, expectedRevision, reviewNote } }
const outbox = id => db.collection("engineOutbox").doc(Buffer.from(JSON.stringify([orgId, `${id}:inventory.stock-committed.v1`])).toString("base64url"))
try {
  await org.set({ name: "Temporary session test organization" })
  await org.collection("stores").doc(storeId).set({ name: "Temporary store" })
  const owner = await identity("owner"), employee = await identity("employee"), outsider = await identity("outsider")
  const item = org.collection("inventory").doc("item")
  await item.set({ name: "Test cheese", storeId, unit: "lb", frontStock: 2, backStock: 3, onHand: 5, revision: 0, expires: false })
  const count = { kind: "count", title: "Morning count", assignedTo: employee.uid, payload: { lines: [{ itemId: "item", expectedRevision: 0, frontStock: 3, backStock: 4 }] } }
  const id = randomUUID(); ids.push(id)
  assert.equal((await api(null)).status, 401)
  const created = await api(owner, { action: "create", id, storeId, content: count })
  assert.equal(created.status, 200, JSON.stringify(created.data)); assert.match(created.headers.get("cache-control"), /no-store/)
  for (const [actor, expected] of [[owner, "1"], [outsider, "0"]]) {
    const widgetResponse = await fetch(`${origin}/api/v1/workspace/widgets?storeId=${storeId}&widgets=count-tasks,delivery-tasks`, { headers: actor.headers })
    const widgets = await widgetResponse.json()
    assert.equal(widgetResponse.status, 200, JSON.stringify(widgets))
    assert.equal(widgets.widgets["count-tasks"].value, expected)
    assert.ok(!JSON.stringify(widgets).includes(employee.uid), "Widget projection excludes employee identity")
  }
  assert.equal((await item.get()).data().onHand, 5, "Draft must not change stock")
  assert.equal((await api(outsider, operation(id, "submit", 0))).status, 403)
  const hidden = await api(outsider); assert.equal(hidden.status, 200, JSON.stringify(hidden.data)); assert.equal(hidden.data.sessions.length, 0)
  assert.equal((await api(employee, operation(id, "post", 0))).status, 403)
  const submitted = await api(employee, operation(id, "submit", 0)); assert.equal(submitted.status, 200, JSON.stringify(submitted.data))
  assert.equal((await api(owner, operation(id, "return", 1))).status, 400)
  assert.equal((await api(owner, operation(id, "return", 1, "Check front stock"))).status, 200)
  assert.equal((await api(employee, operation(id, "submit", 1))).status, 409)
  assert.equal((await api(employee, operation(id, "submit", 2))).status, 200)
  const approvals = await Promise.all([0, 1].map(() => api(owner, operation(id, "post", 3))))
  for (const result of approvals) assert.equal(result.status, 200, JSON.stringify(result.data))
  assert.equal((await item.get()).data().onHand, 7, "Concurrent approvals apply once")
  assert.equal((await item.get()).data().revision, 1)
  assert.equal((await org.collection("stockOperations").get()).size, 1)
  assert.equal((await org.collection("operationSessions").doc(id).collection("events").get()).size, 5)
  assert.equal((await outbox(id).get()).exists, true)
  assert.equal((await api(owner, operation(id, "cancel", 4))).status, 409)
  const staleId = randomUUID(); ids.push(staleId)
  assert.equal((await api(owner, { action: "create", id: staleId, storeId, content: count })).status, 409, "Stale counts cannot become drafts")
  const receiptId = randomUUID(); ids.push(receiptId)
  const receipt = { kind: "receiving", title: "Delivery", assignedTo: employee.uid, supplierReference: "TEST-001", payload: { lines: [{ itemId: "item", quantity: 2.5 }] } }
  assert.equal((await api(owner, { action: "create", id: receiptId, storeId, content: receipt })).status, 200)
  assert.equal((await api(employee, operation(receiptId, "submit", 0))).status, 200)
  await outbox(receiptId).create({ isolatedTestCollision: orgId })
  const failure = await api(owner, operation(receiptId, "post", 1)); assert.equal(failure.status, 500)
  assert.equal((await item.get()).data().onHand, 7)
  assert.equal((await org.collection("operationSessions").doc(receiptId).get()).data().status, "submitted")
  assert.equal((await org.collection("receiving").get()).size, 0)
  await outbox(receiptId).delete()
  for (const result of await Promise.all([0, 1].map(() => api(owner, operation(receiptId, "post", 1))))) assert.equal(result.status, 200, JSON.stringify(result.data))
  assert.equal((await item.get()).data().onHand, 9.5)
  assert.equal((await org.collection("receiving").get()).size, 1)
  assert.equal((await org.collection("stockOperations").get()).size, 2)
  const crossEngineId = randomUUID(); ids.push(crossEngineId)
  const updatedCount = { ...count, payload: { lines: [{ itemId: "item", expectedRevision: 2, frontStock: 3, backStock: 6.5 }] } }
  assert.equal((await api(owner, { action: "create", id: crossEngineId, storeId, content: updatedCount })).status, 200)
  assert.equal((await api(employee, operation(crossEngineId, "submit", 0))).status, 200)
  const transferId = randomUUID(); ids.push(transferId)
  const transfer = await fetch(`${origin}/api/v1/inventory/transfers`, { method: "POST", headers: owner.headers, body: JSON.stringify({ commandId: transferId, locationId: storeId, payload: { itemId: "item", quantity: 1, source: "back", destination: "front" } }) })
  assert.equal(transfer.status, 200)
  assert.equal((await api(owner, operation(crossEngineId, "post", 1))).status, 409, "A transfer invalidates a pending count")
  assert.equal((await org.collection("operationSessions").doc(crossEngineId).get()).data().status, "submitted")
  assert.equal((await org.collection("stockOperations").doc(crossEngineId).get()).exists, false)
  const differentStore = await api(employee, null, "?storeId=unassigned-store"); assert.equal(differentStore.status, 403)
  const wrongOrg = { headers: { ...employee.headers, "x-inventracker-org": "unassigned-org" } }; assert.equal((await api(wrongOrg)).status, 403)
  await org.collection("members").doc(employee.uid).update({ status: "Inactive" })
  assert.equal((await api(employee)).status, 403)
  console.log("Session HTTP passed: real Auth/scopes, private assignment, draft isolation, review/return, revision conflicts, concurrent count/receipt approval exactly once, stock/batch/ledger/outbox atomic rollback, private widget summaries, cross-engine stale-count rejection and inactive membership.")
} finally {
  // Remove this test's private organization and only its internal delivery artifacts.
  for (const id of ids) {
    await outbox(id).delete()
    await db.collection("engineConsumerReceipts").doc(Buffer.from(JSON.stringify(["workspace-stock-v1", orgId, `${id}:inventory.stock-committed.v1`])).toString("base64url")).delete()
  }
  const cursors = await db.collection("workspaceInvalidations").where("organizationId", "==", orgId).get()
  for (const doc of cursors.docs) await doc.ref.delete()
  await db.recursiveDelete(org)
  for (const uid of users) await auth.deleteUser(uid)
  await db.terminate()
  console.log("Removed temporary session records and accounts.")
}
