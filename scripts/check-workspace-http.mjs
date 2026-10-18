import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { applicationDefault, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
if (process.env.INVENTRAKER_RUN_FIRESTORE_INTEGRATION !== "1") throw new Error("Set INVENTRAKER_RUN_FIRESTORE_INTEGRATION=1 for isolated, self-cleaning workspace checks.")
const origin = process.env.INVENTRAKER_TEST_ORIGIN || "http://localhost:3010"
const app = initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || "inventracker-f1229" })
const db = getFirestore(app), auth = getAuth(app), orgId = `workspace-check-${randomUUID()}`
const org = db.collection("orgs").doc(orgId), storeId = `${orgId}-store`
const refs = [org, org.collection("stores").doc(storeId)]
let uid, headers
async function api(path, body, customHeaders = headers) {
  const response = await fetch(`${origin}${path}`, { method: body ? "PUT" : "GET", headers: { ...customHeaders, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: response.status, data: await response.json(), headers: response.headers }
}
try {
  const email = `${orgId}@example.invalid`, password = `${randomUUID()}Aa9!`
  uid = (await auth.createUser({ email, password })).uid
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyD58SA61KJCkiy33n0WUgM9TbOtVcNLH9k"
  const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) }).then(r => r.json())
  assert.ok(login.idToken)
  headers = { authorization: `Bearer ${login.idToken}`, "x-inventracker-org": orgId }
  const member = org.collection("members").doc(uid), preferences = db.doc(`users/${uid}/preferences/workspace`)
  refs.push(member, preferences)
  for (const device of ["phone", "tablet", "desktop"]) refs.push(db.collection("workspaceLayouts").doc(encodeURIComponent(JSON.stringify([uid, orgId, device]))))
  await org.set({ name: "Temporary workspace integration check" })
  await org.collection("stores").doc(storeId).set({ name: "Temporary store" })
  await member.set({ role: "employee", status: "Active", storeIds: [storeId], permissions: ["inventory.view"] })
  await preferences.set({ dashboardWidgetIds: ["inventory", "orders", "retired-widget"] })
  const beforePreferences = await preferences.get()
  assert.equal((await api("/api/v1/workspace/catalog?device=phone", null, {})).status, 401)
  assert.equal((await api("/api/v1/workspace/catalog?device=invalid")).status, 400)
  assert.equal((await api("/api/v1/workspace/catalog?device=phone", null, { ...headers, "x-inventracker-org": "unassigned-workspace-org" })).status, 403)
  const catalog = await api("/api/v1/workspace/catalog?device=phone")
  assert.equal(catalog.status, 200, JSON.stringify(catalog.data)); assert.match(catalog.headers.get("cache-control"), /no-store/)
  assert.ok(catalog.data.definitions.some(d => d.id === "inventory"))
  assert.ok(!catalog.data.definitions.some(d => d.id === "orders"))
  assert.ok(!catalog.data.defaultLayout.widgets.some(w => w.widgetDefinitionId === "orders"))
  assert.ok(catalog.data.seedLayout.widgets.some(w => w.widgetDefinitionId === "orders"), "Keep saved presentation without granting data access")
  assert.deepEqual(catalog.data.unresolvedIds, ["retired-widget"])
  assert.equal((await api("/api/v1/workspace/layout?device=phone")).data.layout, null, "Catalog GET must not create a layout")
  const layout = catalog.data.seedLayout
  assert.equal(layout.userId, uid); assert.equal(layout.organizationId, orgId)
  assert.equal((await api("/api/v1/workspace/layout", { expectedRevision: 0, layout: { ...layout, userId: "other-user" } })).status, 403)
  const bad = structuredClone(layout); bad.widgets[1].gridX = bad.widgets[0].gridX; bad.widgets[1].gridY = bad.widgets[0].gridY
  assert.equal((await api("/api/v1/workspace/layout", { expectedRevision: 0, layout: bad })).status, 400)
  const first = await api("/api/v1/workspace/layout", { expectedRevision: 0, layout }); assert.equal(first.status, 200); assert.equal(first.data.layout.revision, 1)
  const races = await Promise.all(["circle", "square"].map(shapePreference => api("/api/v1/workspace/layout", { expectedRevision: 1, layout: { ...first.data.layout, shapePreference } })))
  assert.deepEqual(races.map(r => r.status).sort(), [200, 409])
  const current = (await api("/api/v1/workspace/layout?device=phone")).data.layout; assert.equal(current.revision, 2)
  const desktopCatalog = (await api("/api/v1/workspace/catalog?device=desktop")).data
  assert.equal(desktopCatalog.seedLayout.deviceClass, "desktop")
  assert.equal(desktopCatalog.seedLayout.shapePreference, current.shapePreference)
  assert.deepEqual(desktopCatalog.seedLayout.widgets.map(w => w.id), current.widgets.map(w => w.id))
  const desktop = await api("/api/v1/workspace/layout", { expectedRevision: 0, layout: desktopCatalog.seedLayout }); assert.equal(desktop.status, 200, JSON.stringify(desktop.data))
  assert.equal((await api("/api/v1/workspace/layout?device=phone")).data.layout.revision, 2)
  const storeDenied = await api(`/api/v1/workspace/widgets?storeId=unassigned-store&widgets=inventory`); assert.equal(storeDenied.status, 403)
  const facts = await api(`/api/v1/workspace/widgets?storeId=${storeId}&widgets=orders,inventory`)
  assert.equal(facts.status, 200); assert.equal(facts.data.widgets.orders.state, "permission-denied")
  assert.equal((await preferences.get()).updateTime.toMillis(), beforePreferences.updateTime.toMillis())
  await member.update({ status: "Inactive" })
  assert.equal((await api("/api/v1/workspace/catalog?device=phone")).status, 403)
  assert.equal((await api("/api/v1/workspace/layout", { expectedRevision: 2, layout: current })).status, 403)
  console.log("Workspace HTTP passed: catalog permissions, additive legacy migration, read-only seeding, device adaptation/independence, invalid geometry/owner rejection, concurrent 200/409 saves, active membership, organization/store isolation and unchanged legacy preferences.")
} finally {
  const batch = db.batch(); for (const ref of refs) batch.delete(ref); await batch.commit()
  if (uid) await auth.deleteUser(uid)
  await db.terminate()
}
