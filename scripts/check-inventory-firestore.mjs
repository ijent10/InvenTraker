import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { applicationDefault, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

if (process.env.INVENTRAKER_RUN_FIRESTORE_INTEGRATION !== "1") throw new Error("Set INVENTRAKER_RUN_FIRESTORE_INTEGRATION=1 to run isolated, self-cleaning test-organization writes.")
const origin = process.env.INVENTRAKER_TEST_ORIGIN || "http://localhost:3010"
const projectId = process.env.FIREBASE_PROJECT_ID || "inventracker-f1229"
const orgId = "east-liberty-market-group"
const storeId = "east-liberty-main"
const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId }))
const org = db.collection("orgs").doc(orgId)
const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyD58SA61KJCkiy33n0WUgM9TbOtVcNLH9k"
const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: process.env.INVENTRAKER_TEST_OWNER_EMAIL || "market.owner@inventraker.app", password: process.env.INVENTRAKER_TEST_OWNER_PASSWORD || "MarketOwner2026!", returnSecureToken: true }) }).then((r) => r.json())
assert.ok(login.idToken, "Existing test-owner sign in failed")
const headers = { authorization: `Bearer ${login.idToken}`, "x-inventracker-org": orgId, "content-type": "application/json" }
const prefix = `engine-check-${randomUUID()}`
const itemId = prefix
const raceId = `${prefix}-race`
const wrongId = `${prefix}-wrong-store`
const orderId = `${prefix}-order`
let created = false
const operationIds = []
const op = () => { const id = randomUUID(); operationIds.push(id); return id }
const outboxRef = (id) => db.collection("engineOutbox").doc(Buffer.from(JSON.stringify([orgId, `${id}:inventory.stock-committed.v1`])).toString("base64url"))
const inventoryRef = org.collection("inventory").doc(itemId)
async function post(path, body) {
  const response = await fetch(`${origin}${path}`, { method: "POST", headers, body: JSON.stringify(body) })
  return { status: response.status, body: await response.json() }
}
async function checkCommitted(id, expectedType) {
  const [ledger, history, outbox] = await Promise.all([org.collection("stockOperations").doc(id).get(), org.collection("history").doc(id).get(), outboxRef(id).get()])
  assert.equal(ledger.data()?.operationType, expectedType)
  assert.equal(history.exists, true)
  assert.equal(outbox.data()?.status, "pending")
  assert.equal(outbox.data()?.event.organizationId, orgId)
  assert.equal(outbox.data()?.event.locationId, storeId)
  assert.ok(!JSON.stringify(outbox.data()).includes(login.email || "market.owner@inventraker.app"), "outbox must reference the audit record instead of copying personal details")
}
async function mobile(action, body) {
  const id = body.operationId || op()
  const payload = { operationId: id, storeId, ...body }
  const result = await post(`/api/mobile/v1/actions/${action}`, payload)
  assert.equal(result.status, 200, `${action}: ${JSON.stringify(result.body.error)}`)
  const repeat = await post(`/api/mobile/v1/actions/${action}`, payload)
  assert.equal(repeat.status, 200)
  assert.deepEqual(repeat.body.data, result.body.data)
  return { id, payload, result }
}
try {
  const setup = db.batch()
  const base = { storeId, name: "INTERNAL ENGINE TEST — temporary", unit: "pounds", par: 10, reorderPoint: 2, frontStock: 4, backStock: 16, onHand: 20, revision: 0, status: "Active" }
  setup.create(inventoryRef, { ...base, id: itemId })
  setup.create(org.collection("inventory").doc(raceId), { ...base, id: raceId, frontStock: 0, backStock: 5, onHand: 5 })
  setup.create(org.collection("inventory").doc(wrongId), { ...base, id: wrongId, storeId: "unassigned-fixture-store" })
  for (const [id, front, back] of [[itemId, 4, 16], [raceId, 0, 5]]) for (const [area, quantity] of [["front", front], ["back", back]]) {
    if (!quantity) continue
    const batchId = `${id}-${area}`
    setup.create(org.collection("inventoryBatches").doc(batchId), { id: batchId, itemId: id, storeId, area, remainingQuantity: quantity, originalQuantity: quantity, unit: "pounds", expirationDate: "2027-01-01", status: "available" })
  }
  setup.create(org.collection("orders").doc(orderId), { id: orderId, storeId, status: "Submitted", lines: [{ id: "line", itemId, finalQuantity: 5, receivedQuantity: 0, stockUnitsPerOrderUnit: 1 }] })
  await setup.commit()
  created = true

  const transferId = op()
  const transfer = { commandId: transferId, locationId: storeId, payload: { itemId, quantity: 2, source: "back", destination: "front" } }
  const first = await post("/api/v1/inventory/transfers", transfer)
  assert.equal(first.status, 200)
  assert.equal(first.body.replayed, false)
  assert.equal(first.body.data.onHand, 20)
  assert.equal(first.body.data.frontStock, 6)
  const repeat = await post("/api/v1/inventory/transfers", transfer)
  assert.equal(repeat.body.replayed, true)
  assert.equal(repeat.body.committedAt, first.body.committedAt)
  const compatibility = await post("/api/mobile/v1/actions/transfer", { operationId: transferId, storeId, ...transfer.payload })
  assert.equal(compatibility.status, 200)
  assert.deepEqual(compatibility.body.data, first.body.data)
  assert.equal((await post("/api/v1/inventory/transfers", { ...transfer, payload: { ...transfer.payload, quantity: 3 } })).status, 409)
  await checkCommitted(transferId, "transfer")
  assert.equal((await inventoryRef.get()).data().revision, 1)

  const spot = await mobile("spot-check", { lines: [{ itemId, expectedRevision: 1, frontStock: 7, backStock: 13 }] })
  await checkCommitted(spot.id, "spot_check")
  const spotVersioned = { commandId: spot.id, locationId: storeId, payload: { lines: spot.payload.lines } }
  const spotReplay = await post("/api/v1/inventory/spot-checks", spotVersioned)
  assert.equal(spotReplay.status, 200)
  assert.equal(spotReplay.body.replayed, true)
  assert.deepEqual(spotReplay.body.data, spot.result.body.data)
  assert.equal((await post("/api/v1/inventory/spot-checks", { ...spotVersioned, payload: { lines: [{ ...spot.payload.lines[0], frontStock: 8 }] } })).status, 409)
  const countBatches = await org.collection("inventoryBatches").where("itemId", "==", itemId).get()
  for (const [area, expected] of [["front", 7], ["back", 13]]) assert.equal(countBatches.docs.filter((doc) => doc.data().area === area).reduce((sum, doc) => sum + doc.data().remainingQuantity, 0), expected)
  assert.equal(countBatches.docs.filter((doc) => doc.data().source === "count_reconciliation")[0].data().expirationKnown, false)
  const receive = await mobile("receive", { lines: [{ itemId, quantity: 5, orderId, orderLineId: "line", receivedOrderQuantity: 5 }] })
  await checkCommitted(receive.id, "receive")
  assert.equal((await org.collection("orders").doc(orderId).get()).data().status, "Received")
  const restock = await mobile("restock", { commit: true, lines: [{ itemId, countedFrontStock: 7 }] })
  await checkCommitted(restock.id, "restock")
  const waste = await mobile("waste", { lines: [{ itemId, quantity: 1, area: "front", reason: "Isolated integration fixture" }] })
  await checkCommitted(waste.id, "waste")
  const portion = await mobile("portion", { itemId, sourceArea: "back", portionWeight: 0.5, portionCount: 2 })
  await checkCommitted(portion.id, "portion")
  const par = await mobile("par-change", { itemId, expectedRevision: 5, par: 12, reorderPoint: 3, reason: "Isolated integration fixture" })
  await checkCommitted(par.id, "par_change")
  assert.equal((await inventoryRef.get()).data().onHand, 24)
  assert.equal((await inventoryRef.get()).data().revision, 6)

  const parallelIds = [op(), op()]
  const concurrent = await Promise.all(parallelIds.map((commandId) => post("/api/v1/inventory/transfers", { commandId, locationId: storeId, payload: { itemId: raceId, quantity: 4, source: "back", destination: "front" } })))
  assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 400])
  const raced = (await org.collection("inventory").doc(raceId).get()).data()
  assert.equal(raced.frontStock, 4); assert.equal(raced.backStock, 1); assert.equal(raced.revision, 1)

  const countRaceIds = [op(), op()]
  const countRaces = await Promise.all(countRaceIds.map((commandId, index) => post("/api/v1/inventory/spot-checks", { commandId, locationId: storeId, payload: { lines: [{ itemId: raceId, expectedRevision: 1, frontStock: 3 + index, backStock: 2 - index }] } })))
  assert.deepEqual(countRaces.map((result) => result.status).sort(), [200, 409])
  assert.equal((await org.collection("inventory").doc(raceId).get()).data().revision, 2)
  assert.equal(countRaces.find((result) => result.status === 409).body.error.code, "stale_count")

  const countBefore = (await inventoryRef.get()).data()
  const partial = await post("/api/v1/inventory/spot-checks", { commandId: op(), locationId: storeId, payload: { lines: [{ itemId, expectedRevision: 6, frontStock: 11, backStock: 13 }, { itemId: raceId, expectedRevision: 0, frontStock: 1, backStock: 4 }] } })
  assert.equal(partial.status, 409)
  assert.deepEqual((await inventoryRef.get()).data(), countBefore, "one stale line must reject the whole count")

  const countRollbackId = op()
  await outboxRef(countRollbackId).create({ isolatedTestCollision: prefix })
  const batchesBefore = await org.collection("inventoryBatches").where("itemId", "==", itemId).get()
  const countFailed = await post("/api/v1/inventory/spot-checks", { commandId: countRollbackId, locationId: storeId, payload: { lines: [{ itemId, expectedRevision: 6, frontStock: 0, backStock: 0 }] } })
  assert.equal(countFailed.status, 500)
  assert.deepEqual((await inventoryRef.get()).data(), countBefore)
  const batchesAfter = await org.collection("inventoryBatches").where("itemId", "==", itemId).get()
  assert.deepEqual(batchesAfter.docs.map((doc) => doc.data()), batchesBefore.docs.map((doc) => doc.data()), "count failure must roll back batch changes")
  assert.equal((await org.collection("stockOperations").doc(countRollbackId).get()).exists, false)
  assert.equal((await org.collection("history").doc(countRollbackId).get()).exists, false)

  const rollbackId = op()
  await outboxRef(rollbackId).create({ isolatedTestCollision: prefix })
  const before = (await inventoryRef.get()).data()
  const failed = await post("/api/v1/inventory/transfers", { commandId: rollbackId, locationId: storeId, payload: { itemId, quantity: 1, source: "back", destination: "front" } })
  assert.equal(failed.status, 500)
  assert.deepEqual((await inventoryRef.get()).data(), before, "outbox create failure must roll back the stock write")
  assert.equal((await org.collection("history").doc(rollbackId).get()).exists, false)
  assert.equal((await org.collection("stockOperations").doc(rollbackId).get()).exists, false)

  const crossStore = await post("/api/v1/inventory/transfers", { commandId: op(), locationId: storeId, payload: { itemId: wrongId, quantity: 1, source: "back", destination: "front" } })
  assert.equal(crossStore.status, 403)
  const invalid = await post("/api/v1/inventory/transfers", { commandId: op(), locationId: storeId, payload: { itemId, quantity: 0.0001, source: "back", destination: "front" } })
  assert.equal(invalid.status, 400)
  assert.equal(invalid.body.schemaVersion, "1")
  assert.equal(invalid.body.requestId, null)
  assert.equal(invalid.body.error.code, "invalid_request")
  assert.equal((await fetch(`${origin}/api/v1/inventory/transfers`, { method: "POST" })).status, 401)
  const outboxRead = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/engineOutbox/${outboxRef(transferId).id}`, { headers: { authorization: `Bearer ${login.idToken}` } })
  assert.equal(outboxRead.status, 403, "client SDK credentials must not read the internal outbox")
  console.log("Firestore engine integration passed: seven stock actions, receiving once, transfer/count API parity, conflicting retries, concurrent transfers/counts, stale multi-line rejection, stock/batch rollback, store isolation and private outbox.")
} finally {
  if (created) {
    const refs = [inventoryRef, org.collection("inventory").doc(raceId), org.collection("inventory").doc(wrongId), org.collection("orders").doc(orderId)]
    for (const id of operationIds) refs.push(org.collection("stockOperations").doc(id), org.collection("history").doc(id), outboxRef(id))
    for (const collection of ["inventoryBatches", "receiving", "waste", "portions"]) for (const id of [itemId, raceId, wrongId]) {
      const records = await org.collection(collection).where("itemId", "==", id).get()
      refs.push(...records.docs.map((doc) => doc.ref))
    }
    const cleanup = db.batch()
    refs.forEach((ref) => cleanup.delete(ref))
    await cleanup.commit()
    console.log("Removed only this run's isolated test records.")
  }
  await db.terminate()
}
