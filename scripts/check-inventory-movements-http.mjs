import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { applicationDefault, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

if (process.env.INVENTRAKER_RUN_FIRESTORE_INTEGRATION !== "1") throw new Error("Set INVENTRAKER_RUN_FIRESTORE_INTEGRATION=1 for isolated, self-cleaning fixture writes.")
const origin = process.env.INVENTRAKER_TEST_ORIGIN || "http://localhost:3010"
const app = initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || "inventracker-f1229" })
const db = getFirestore(app), auth = getAuth(app)
const prefix = `movement-check-${randomUUID()}`, orgId = prefix, storeId = `${prefix}-store`, itemId = `${prefix}-item`
const org = db.collection("orgs").doc(orgId), item = org.collection("inventory").doc(itemId)
const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyD58SA61KJCkiy33n0WUgM9TbOtVcNLH9k"
let uid, headers
const refs = [org, item, org.collection("stores").doc(storeId)]
async function get(params = {}, customHeaders = headers) {
  const q = new URLSearchParams({ storeId, itemId, ...params })
  const response = await fetch(`${origin}/api/v1/inventory/movements?${q}`, { headers: customHeaders })
  assert.match(response.headers.get("cache-control") || "", /no-store/)
  return { status: response.status, body: await response.json() }
}
try {
  const email = `${prefix}@example.invalid`, password = `${randomUUID()}Aa9!`
  uid = (await auth.createUser({ email, password })).uid
  const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) }).then(r => r.json())
  assert.ok(login.idToken)
  headers = { authorization: `Bearer ${login.idToken}`, "x-inventracker-org": orgId }
  const member = org.collection("members").doc(uid); refs.push(member)
  await org.set({ name: "INTERNAL temporary history check" })
  await org.collection("stores").doc(storeId).set({ name: "Internal test store" })
  await member.set({ status: "Active", role: "employee", storeIds: [storeId], permissions: ["inventory.view", "history.view"] })
  await item.set({ storeId, name: "Temporary history check", frontStock: 0, backStock: 1005, onHand: 1005, revision: 1005 })
  // More than the old reconciliation bound: no lifetime-history truncation is allowed.
  for (let start = 0; start < 1005; start += 400) {
    const batch = db.batch()
    for (let i = start; i < Math.min(start + 400, 1005); i++) {
      const ref = org.collection("stockOperations").doc(`movement-${String(i).padStart(5, "0")}`); refs.push(ref)
      batch.create(ref, { storeId, operationType: "receive", ...(i % 2 ? { movementType: "receipt" } : {}), actor: { email: "PRIVATE_ACTOR" }, result: { secret: "PRIVATE_RESULT" }, createdAt: "2026-10-18T00:00:00.000Z", changes: [{ itemId, unit: "kg", before: { frontStock: 0, backStock: i, onHand: i, revision: i }, after: { frontStock: 0, backStock: i + 1, onHand: i + 1, revision: i + 1 }, delta: { frontStock: 0, backStock: 1, onHand: 1 } }] })
    }
    await batch.commit()
  }
  const before = await item.get(), ledgerBefore = await refs[4].get()
  assert.equal((await get({}, {})).status, 401)
  assert.equal((await get({}, { ...headers, "x-inventracker-org": "unassigned-history-org" })).status, 403)
  assert.equal((await get({ storeId: "unassigned-history-store" })).status, 403)
  assert.equal((await get({ itemId: "missing-item" })).status, 404)
  assert.equal((await get({ cursor: "!" })).status, 400)
  const first = await get(); assert.equal(first.status, 200, JSON.stringify(first.body))
  assert.equal(first.body.rows.length, 100); assert.ok(first.body.nextCursor)
  const seen = new Set(), pages = []
  let page = first
  while (true) {
    pages.push(page.body)
    for (const row of page.body.rows) { assert.ok(row.verified); assert.ok(!seen.has(row.operationId)); seen.add(row.operationId) }
    assert.ok(!JSON.stringify(page.body).includes("PRIVATE_"))
    if (!page.body.nextCursor) break
    page = await get({ cursor: page.body.nextCursor }); assert.equal(page.status, 200, JSON.stringify(page.body))
    assert.ok(pages.length < 20)
  }
  assert.equal(seen.size, 1005); assert.equal(pages.length, 11); assert.equal(page.body.complete, true)
  const badScope = JSON.parse(Buffer.from(first.body.nextCursor, "base64url")); badScope.itemId = "other-item"
  assert.equal((await get({ cursor: Buffer.from(JSON.stringify(badScope)).toString("base64url") })).status, 400)
  assert.equal((await item.get()).updateTime.toMillis(), before.updateTime.toMillis())
  assert.equal((await refs[4].get()).updateTime.toMillis(), ledgerBefore.updateTime.toMillis())
  await item.update({ revision: 1006 })
  assert.equal((await get({ cursor: first.body.nextCursor })).status, 409)
  await member.update({ permissions: ["inventory.view"] }); assert.equal((await get()).status, 403)
  await member.update({ permissions: ["history.view"] }); assert.equal((await get()).status, 403)
  await member.update({ permissions: ["inventory.view", "history.viewAll"] }); assert.equal((await get()).status, 200)
  for (const status of ["Inactive", "Disabled", "Deleted", "Pending", "Suspended"]) {
    await member.update({ status }); assert.equal((await get()).status, 403)
  }
  console.log("Movement HTTP checks passed: 1,005 legacy/new records across 11 pages, no duplicates/truncation, revision conflict, privacy, authentication, current permissions, inactive states, tenant/store scope, and unchanged stock/ledger timestamps.")
} finally {
  // Delete only references created by this run, including partial setup after a failure.
  for (let start = 0; start < refs.length; start += 400) { const batch = db.batch(); for (const ref of refs.slice(start, start + 400)) batch.delete(ref); await batch.commit() }
  if (uid) await auth.deleteUser(uid)
  await db.terminate()
}
