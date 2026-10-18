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
const receiptItemId = `${prefix}-receipt`
const caseOrderId = `${prefix}-case-order`
const restockItemId = `${prefix}-restock`
const discardItemId = `${prefix}-discard`
const portionItemId = `${prefix}-portion`
const thresholdItemId = `${prefix}-threshold`
const thresholdProductId = `${prefix}-product`
const thresholdDetail = org.collection("stores").doc(storeId).collection("productDetails").doc(thresholdProductId)
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
  assert.equal(ledger.data()?.movementType, ({ receive: "receipt", transfer: "area_transfer", restock: "restock_reconciliation", waste: "discard", portion: "portion_reclassification", spot_check: "count_adjustment", par_change: "threshold_change" })[expectedType])
  assert.equal(history.exists, true)
  assert.ok(["pending", "delivered"].includes(outbox.data()?.status), "Committed events are staged or consumed")
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
  setup.create(org.collection("inventory").doc(receiptItemId), { ...base, id: receiptItemId, frontStock: 0, backStock: 0, onHand: 0, expires: true })
  setup.create(org.collection("orders").doc(caseOrderId), { id: caseOrderId, storeId, status: "Submitted", lines: [{ id: "case-line", itemId: receiptItemId, finalQuantity: 1, stockUnitsPerOrderUnit: 6, receivedQuantity: 0 }] })
  setup.create(org.collection("inventory").doc(restockItemId), { ...base, id: restockItemId, frontStock: 0, backStock: 5, onHand: 5, par: 3 })
  setup.create(org.collection("inventory").doc(discardItemId), { ...base, id: discardItemId, frontStock: 6, backStock: 5, onHand: 11 })
  for (const [suffix, area, quantity, expiry] of [["front", "front", 2, "2027-01-01"], ["early", "back", 2, "2027-01-01"], ["late", "back", 3, "2027-02-01"]]) setup.create(org.collection("inventoryBatches").doc(`${discardItemId}-${suffix}`), { id: `${discardItemId}-${suffix}`, itemId: discardItemId, storeId, area, remainingQuantity: quantity, originalQuantity: quantity, unit: "pounds", expirationDate: expiry, status: "available" })
  setup.create(org.collection("inventory").doc(portionItemId), { ...base, id: portionItemId, frontStock: 0, backStock: 5, onHand: 5 })
  setup.create(org.collection("inventoryBatches").doc(`${portionItemId}-source`), { id: `${portionItemId}-source`, itemId: portionItemId, storeId, area: "back", remainingQuantity: 3, originalQuantity: 3, unit: "pounds", expirationDate: "2027-01-15", receivedAt: "2026-10-01T12:00:00.000Z", status: "available" })
  setup.create(org.collection("inventory").doc(thresholdItemId), { ...base, id: thresholdItemId, frontStock: 2, backStock: 3, onHand: 5, orgProductId: thresholdProductId })
  setup.create(thresholdDetail, { par: 10, reorderPoint: 2, displayName: "INTERNAL TEST — preserve unrelated fields" })
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
  const receiptReplay = await post("/api/v1/inventory/receipts", { commandId: receive.id, locationId: storeId, payload: { lines: receive.payload.lines } })
  assert.equal(receiptReplay.status, 200)
  assert.equal(receiptReplay.body.replayed, true)
  assert.deepEqual(receiptReplay.body.data, receive.result.body.data)
  assert.equal((await post("/api/v1/inventory/receipts", { commandId: receive.id, locationId: storeId, payload: { lines: [{ ...receive.payload.lines[0], quantity: 4 }] } })).status, 409)
  assert.equal((await org.collection("orders").doc(orderId).get()).data().status, "Received")
  const restock = await mobile("restock", { commit: true, lines: [{ itemId, countedFrontStock: 7, expectedRevision: 3 }] })
  await checkCommitted(restock.id, "restock")
  const restockReplay = await post("/api/v1/inventory/restocks", { commandId: restock.id, locationId: storeId, payload: { commit: true, lines: restock.payload.lines } })
  assert.equal(restockReplay.status, 200)
  assert.equal(restockReplay.body.replayed, true)
  assert.deepEqual(restockReplay.body.data, restock.result.body.data)
  const waste = await mobile("waste", { lines: [{ itemId, quantity: 1, area: "front", reason: "Isolated integration fixture" }] })
  await checkCommitted(waste.id, "waste")
  const wasteReplay = await post("/api/v1/inventory/discards", { commandId: waste.id, locationId: storeId, payload: { lines: waste.payload.lines } })
  assert.equal(wasteReplay.status, 200); assert.equal(wasteReplay.body.replayed, true); assert.deepEqual(wasteReplay.body.data, waste.result.body.data)
  assert.equal((await post("/api/v1/inventory/discards", { commandId: waste.id, locationId: storeId, payload: { lines: [{ ...waste.payload.lines[0], reason: "Changed reason" }] } })).status, 409)
  const portion = await mobile("portion", { itemId, sourceArea: "back", portionWeight: 0.5, portionCount: 2 })
  await checkCommitted(portion.id, "portion")
  const portionReplay = await post("/api/v1/inventory/portions", { commandId: portion.id, locationId: storeId, payload: { itemId, sourceArea: "back", portionWeight: 0.5, portionCount: 2 } })
  assert.equal(portionReplay.status, 200); assert.equal(portionReplay.body.replayed, true); assert.deepEqual(portionReplay.body.data, portion.result.body.data)
  assert.equal((await post("/api/v1/inventory/portions", { commandId: portion.id, locationId: storeId, payload: { itemId, sourceArea: "back", portionWeight: 0.25, portionCount: 4 } })).status, 409)
  assert.equal((await inventoryRef.get()).data().revision, 6)
  const par = await mobile("par-change", { itemId, expectedRevision: 6, par: 12, reorderPoint: 3, reason: "Isolated integration fixture" })
  await checkCommitted(par.id, "par_change")
  const thresholdReplay = await post("/api/v1/inventory/thresholds", { commandId: par.id, locationId: storeId, payload: { itemId, expectedRevision: 6, par: 12, reorderPoint: 3, reason: "Isolated integration fixture" } })
  assert.equal(thresholdReplay.status, 200); assert.equal(thresholdReplay.body.replayed, true); assert.deepEqual(thresholdReplay.body.data, par.result.body.data)
  assert.equal((await post("/api/v1/inventory/thresholds", { commandId: par.id, locationId: storeId, payload: { itemId, expectedRevision: 6, par: 12, reorderPoint: 3, reason: "Changed reason" } })).status, 409)
  assert.equal((await inventoryRef.get()).data().onHand, 24)
  assert.equal((await inventoryRef.get()).data().revision, 7)

  const caseFirstId = op()
  const caseLine = { itemId: receiptItemId, quantity: 1, orderId: caseOrderId, orderLineId: "case-line", expirationDate: "2027-02-01T00:00:00.000Z" }
  const caseFirst = await post("/api/v1/inventory/receipts", { commandId: caseFirstId, locationId: storeId, payload: { lines: [{ ...caseLine, receivedOrderQuantity: 1 / 6 }] } })
  assert.equal(caseFirst.status, 200)
  await checkCommitted(caseFirstId, "receive")
  let caseOrder = (await org.collection("orders").doc(caseOrderId).get()).data()
  assert.equal(caseOrder.status, "Partially received")
  assert.equal(caseOrder.lines[0].receivedStockQuantity, 1)
  assert.equal(caseOrder.lines[0].receivedQuantity, 1 / 6)
  const caseSecond = await mobile("receive", { lines: [{ ...caseLine, expirationDate: "2027-03-01T00:00:00.000Z" }] })
  const receivedSecond = (await org.collection("receiving").doc(caseSecond.result.body.data.receivedIds[0]).get()).data()
  assert.equal(receivedSecond.receivedOrderQuantity, 1 / 6, "inferred order units are retained on the receipt")
  const receiptBatches = await org.collection("inventoryBatches").where("itemId", "==", receiptItemId).get()
  assert.equal(receiptBatches.size, 2)
  assert.deepEqual(receiptBatches.docs.map((doc) => doc.data().expirationDate).sort(), ["2027-02-01T00:00:00.000Z", "2027-03-01T00:00:00.000Z"])
  const badConversion = await post("/api/v1/inventory/receipts", { commandId: op(), locationId: storeId, payload: { lines: [{ ...caseLine, receivedOrderQuantity: 1 }] } })
  assert.equal(badConversion.status, 409)
  const overReceipt = await post("/api/v1/inventory/receipts", { commandId: op(), locationId: storeId, payload: { lines: [{ ...caseLine, quantity: 5 }] } })
  assert.equal(overReceipt.status, 409)
  assert.equal((await org.collection("inventory").doc(receiptItemId).get()).data().onHand, 2)

  const receiptRollbackId = op()
  await outboxRef(receiptRollbackId).create({ isolatedTestCollision: prefix })
  const orderBeforeRollback = (await org.collection("orders").doc(caseOrderId).get()).data()
  const rollbackReceipt = await post("/api/v1/inventory/receipts", { commandId: receiptRollbackId, locationId: storeId, payload: { lines: [caseLine] } })
  assert.equal(rollbackReceipt.status, 500)
  assert.equal((await org.collection("inventory").doc(receiptItemId).get()).data().onHand, 2)
  assert.deepEqual((await org.collection("orders").doc(caseOrderId).get()).data(), orderBeforeRollback)
  for (const collection of ["receiving", "inventoryBatches"]) assert.equal((await org.collection(collection).doc(`${receiptRollbackId}-1`).get()).exists, false)
  for (const collection of ["stockOperations", "history"]) assert.equal((await org.collection(collection).doc(receiptRollbackId).get()).exists, false)

  const receiptRaceIds = [op(), op()]
  const receiptRaces = await Promise.all(receiptRaceIds.map((commandId) => post("/api/v1/inventory/receipts", { commandId, locationId: storeId, payload: { lines: [{ ...caseLine, quantity: 3 }] } })))
  assert.deepEqual(receiptRaces.map((result) => result.status).sort(), [200, 409])
  assert.equal((await org.collection("inventory").doc(receiptItemId).get()).data().onHand, 5)
  const lastReceipt = await mobile("receive", { lines: [caseLine] })
  await checkCommitted(lastReceipt.id, "receive")
  caseOrder = (await org.collection("orders").doc(caseOrderId).get()).data()
  assert.equal(caseOrder.status, "Received")
  assert.equal(caseOrder.lines[0].receivedStockQuantity, 6)
  assert.equal(caseOrder.lines[0].receivedQuantity, 1)
  assert.equal((await org.collection("inventory").doc(receiptItemId).get()).data().onHand, 6)

  const thresholdId = op()
  const thresholdPayload = { itemId: thresholdItemId, expectedRevision: 0, par: 6.5, reorderPoint: 5, reason: "Updated demand" }
  const thresholds = await post("/api/v1/inventory/thresholds", { commandId: thresholdId, locationId: storeId, payload: thresholdPayload })
  assert.equal(thresholds.status, 200); assert.equal(thresholds.body.data.revision, 1)
  await checkCommitted(thresholdId, "par_change")
  const targetStock = (await org.collection("inventory").doc(thresholdItemId).get()).data()
  assert.equal(targetStock.frontStock, 2); assert.equal(targetStock.backStock, 3); assert.equal(targetStock.onHand, 5); assert.equal(targetStock.status, "Low"); assert.equal(targetStock.par, 6.5)
  const targetDetail = (await thresholdDetail.get()).data()
  assert.equal(targetDetail.par, 6.5); assert.equal(targetDetail.reorderPoint, 5); assert.equal(targetDetail.displayName, "INTERNAL TEST — preserve unrelated fields")
  const policyLedger = (await org.collection("stockOperations").doc(thresholdId).get()).data()
  assert.equal(policyLedger.quantityBasis, "policy"); assert.equal(policyLedger.changes[0].before.par, 10); assert.equal(policyLedger.changes[0].after.par, 6.5)
  assert.equal((await org.collection("inventoryBatches").where("itemId", "==", thresholdItemId).get()).size, 0)
  const thresholdMobileReplay = await post("/api/mobile/v1/actions/par-change", { operationId: thresholdId, storeId, ...thresholdPayload })
  assert.equal(thresholdMobileReplay.status, 200); assert.deepEqual(thresholdMobileReplay.body.data, thresholds.body.data)
  const thresholdRollbackId = op()
  await outboxRef(thresholdRollbackId).create({ isolatedTestCollision: prefix })
  const thresholdFailure = await post("/api/v1/inventory/thresholds", { commandId: thresholdRollbackId, locationId: storeId, payload: { ...thresholdPayload, expectedRevision: 1, par: 9 } })
  assert.equal(thresholdFailure.status, 500)
  assert.deepEqual((await org.collection("inventory").doc(thresholdItemId).get()).data(), targetStock)
  assert.deepEqual((await thresholdDetail.get()).data(), targetDetail)
  for (const collection of ["stockOperations", "history"]) assert.equal((await org.collection(collection).doc(thresholdRollbackId).get()).exists, false)
  const thresholdRace = await Promise.all([op(), op()].map((commandId, index) => post("/api/v1/inventory/thresholds", { commandId, locationId: storeId, payload: { ...thresholdPayload, expectedRevision: 1, par: 8 + index, reorderPoint: 1 } })))
  assert.deepEqual(thresholdRace.map((result) => result.status).sort(), [200, 409])
  const finalTarget = (await org.collection("inventory").doc(thresholdItemId).get()).data()
  assert.equal(finalTarget.revision, 2); assert.equal(finalTarget.status, "Active"); assert.equal(finalTarget.onHand, 5)
  assert.equal((await thresholdDetail.get()).data().par, finalTarget.par)
  assert.equal((await post("/api/v1/inventory/thresholds", { commandId: op(), locationId: storeId, payload: { ...thresholdPayload, itemId: wrongId } })).status, 403)
  assert.equal((await post("/api/v1/inventory/thresholds", { commandId: op(), locationId: storeId, payload: { ...thresholdPayload, par: 0.0001 } })).status, 400)

  const cutId = op()
  const cutPayload = { itemId: portionItemId, sourceArea: "back", sourceBatchId: `${portionItemId}-source`, portionWeight: 0.5, portionCount: 4, packageBarcodePrefix: "CUT" }
  const cut = await post("/api/v1/inventory/portions", { commandId: cutId, locationId: storeId, payload: cutPayload })
  assert.equal(cut.status, 200)
  await checkCommitted(cutId, "portion")
  const cutStock = (await org.collection("inventory").doc(portionItemId).get()).data()
  assert.equal(cutStock.onHand, 5); assert.equal(cutStock.backStock, 5); assert.equal(cutStock.revision, 1)
  const cutBatches = (await org.collection("inventoryBatches").where("itemId", "==", portionItemId).get()).docs.map((doc) => doc.data())
  assert.equal(cutBatches.reduce((sum, batch) => sum + batch.remainingQuantity, 0), 5)
  const packages = cutBatches.filter((batch) => batch.portionIndex)
  assert.equal(packages.length, 4)
  assert.ok(packages.every((batch) => batch.expirationDate === "2027-01-15" && batch.expirationSource === "inherited" && batch.receivedAt === "2026-10-01T12:00:00.000Z"))
  assert.ok(packages.every((batch) => batch.sourceAllocations.length === 1 && batch.sourceAllocations[0].quantity === 0.5 && batch.parentBatchIds[0] === `${portionItemId}-source`))
  assert.equal(new Set(packages.map((batch) => batch.packageBarcode)).size, 4)
  const unknownCut = cutBatches.find((batch) => batch.source === "portion_untracked_balance")
  assert.equal(unknownCut.remainingQuantity, 2); assert.equal(unknownCut.expirationDate, null)
  const cutReplay = await post("/api/mobile/v1/actions/portion", { operationId: cutId, storeId, ...cutPayload })
  assert.equal(cutReplay.status, 200); assert.deepEqual(cutReplay.body.data, cut.body.data)
  const staleAfterCut = await post("/api/v1/inventory/spot-checks", { commandId: op(), locationId: storeId, payload: { lines: [{ itemId: portionItemId, expectedRevision: 0, frontStock: 0, backStock: 5 }] } })
  assert.equal(staleAfterCut.status, 409)
  const extendedCut = await post("/api/v1/inventory/portions", { commandId: op(), locationId: storeId, payload: { ...cutPayload, portionCount: 1, expirationDate: "2027-02-01" } })
  assert.equal(extendedCut.status, 400); assert.equal(extendedCut.body.error.code, "expiration_exceeds_source")
  const cutRollbackId = op()
  await outboxRef(cutRollbackId).create({ isolatedTestCollision: prefix })
  const cutFailure = await post("/api/v1/inventory/portions", { commandId: cutRollbackId, locationId: storeId, payload: { ...cutPayload, portionCount: 1 } })
  assert.equal(cutFailure.status, 500)
  assert.deepEqual((await org.collection("inventory").doc(portionItemId).get()).data(), cutStock)
  assert.deepEqual((await org.collection("inventoryBatches").where("itemId", "==", portionItemId).get()).docs.map((doc) => doc.data()), cutBatches)
  for (const collection of ["stockOperations", "history", "portions"]) assert.equal((await org.collection(collection).doc(cutRollbackId).get()).exists, false)
  assert.equal((await org.collection("inventoryBatches").doc(`${cutRollbackId}-1`).get()).exists, false)
  const cutRace = await Promise.all([op(), op()].map((commandId) => post("/api/v1/inventory/portions", { commandId, locationId: storeId, payload: { ...cutPayload, portionCount: 2 } })))
  assert.deepEqual(cutRace.map((result) => result.status).sort(), [200, 409])
  assert.equal((await org.collection("inventoryBatches").doc(`${portionItemId}-source`).get()).data().remainingQuantity, 0)
  assert.equal((await org.collection("inventory").doc(portionItemId).get()).data().onHand, 5)
  assert.equal((await post("/api/v1/inventory/portions", { commandId: op(), locationId: storeId, payload: { ...cutPayload, itemId: wrongId } })).status, 403)
  assert.equal((await post("/api/v1/inventory/portions", { commandId: op(), locationId: storeId, payload: { ...cutPayload, portionWeight: 0.0004 } })).status, 400)

  const discardId = op()
  const discardLines = [{ itemId: discardItemId, quantity: 2, area: "front", reason: "Damaged" }, { itemId: discardItemId, quantity: 1, area: "back", reason: "Expired", batchId: `${discardItemId}-late` }]
  const discarded = await post("/api/v1/inventory/discards", { commandId: discardId, locationId: storeId, payload: { lines: discardLines } })
  assert.equal(discarded.status, 200)
  await checkCommitted(discardId, "waste")
  assert.equal(discarded.body.data.humanOverrideCount, 1)
  const discardedStock = (await org.collection("inventory").doc(discardItemId).get()).data()
  assert.equal(discardedStock.frontStock, 4); assert.equal(discardedStock.backStock, 4); assert.equal(discardedStock.onHand, 8); assert.equal(discardedStock.revision, 1)
  const discardedBatches = (await org.collection("inventoryBatches").where("itemId", "==", discardItemId).get()).docs.map((doc) => doc.data())
  for (const area of ["front", "back"]) assert.equal(discardedBatches.filter((batch) => batch.area === area).reduce((sum, batch) => sum + batch.remainingQuantity, 0), 4)
  const unknownFloor = discardedBatches.find((batch) => batch.source === "discard_untracked_balance")
  assert.equal(unknownFloor.remainingQuantity, 4); assert.equal(unknownFloor.expirationDate, null); assert.equal(unknownFloor.expirationKnown, false)
  assert.equal((await org.collection("inventoryBatches").doc(`${discardItemId}-late`).get()).data().remainingQuantity, 2)
  const preferredWaste = (await org.collection("waste").doc(`${discardId}-2`).get()).data()
  assert.equal(preferredWaste.batchAllocations[0].batchId, `${discardItemId}-late`)
  assert.equal((await post("/api/mobile/v1/actions/waste", { operationId: discardId, storeId, lines: discardLines })).status, 200)
  assert.equal((await post("/api/v1/inventory/discards", { commandId: discardId, locationId: storeId, payload: { lines: [{ ...discardLines[0], quantity: 1 }, discardLines[1]] } })).status, 409)
  const discardRollbackId = op()
  await outboxRef(discardRollbackId).create({ isolatedTestCollision: prefix })
  const discardFailure = await post("/api/v1/inventory/discards", { commandId: discardRollbackId, locationId: storeId, payload: { lines: [{ itemId: discardItemId, quantity: 1, area: "front", reason: "Rollback test" }] } })
  assert.equal(discardFailure.status, 500)
  assert.deepEqual((await org.collection("inventory").doc(discardItemId).get()).data(), discardedStock)
  assert.deepEqual((await org.collection("inventoryBatches").where("itemId", "==", discardItemId).get()).docs.map((doc) => doc.data()), discardedBatches)
  assert.equal((await org.collection("waste").doc(`${discardRollbackId}-1`).get()).exists, false)
  for (const collection of ["stockOperations", "history"]) assert.equal((await org.collection(collection).doc(discardRollbackId).get()).exists, false)
  const discardRace = await Promise.all([op(), op()].map((commandId) => post("/api/v1/inventory/discards", { commandId, locationId: storeId, payload: { lines: [{ itemId: discardItemId, quantity: 3, area: "front", reason: "Concurrent test" }] } })))
  assert.deepEqual(discardRace.map((result) => result.status).sort(), [200, 400])
  assert.equal((await org.collection("inventory").doc(discardItemId).get()).data().frontStock, 1)
  const discardPartialId = op()
  assert.equal((await post("/api/v1/inventory/discards", { commandId: discardPartialId, locationId: storeId, payload: { lines: [{ itemId: discardItemId, quantity: 1, area: "front", reason: "Partial test" }, { itemId: discardItemId, quantity: 5, area: "back", reason: "Excess" }] } })).status, 400)
  assert.equal((await org.collection("inventory").doc(discardItemId).get()).data().frontStock, 1)
  assert.equal((await org.collection("waste").doc(`${discardPartialId}-1`).get()).exists, false)
  assert.equal((await post("/api/v1/inventory/discards", { commandId: op(), locationId: storeId, payload: { lines: [{ itemId: wrongId, quantity: 1, area: "back", reason: "Scope test" }] } })).status, 403)
  assert.equal((await post("/api/v1/inventory/discards", { commandId: op(), locationId: storeId, payload: { lines: [{ itemId: discardItemId, quantity: 0.0001, area: "back", reason: "Precision test" }] } })).status, 400)

  const restockPreviewId = op()
  const restockLine = { itemId: restockItemId, countedFrontStock: 0 }
  const restockBefore = (await org.collection("inventory").doc(restockItemId).get()).data()
  const restockPreview = await post("/api/v1/inventory/restocks", { commandId: restockPreviewId, locationId: storeId, payload: { commit: false, lines: [restockLine] } })
  assert.equal(restockPreview.status, 200)
  assert.equal(restockPreview.body.data.recommendations[0].pullQuantity, 3)
  assert.equal(restockPreview.body.data.recommendations[0].expectedRevision, 0)
  assert.ok(restockPreview.body.generatedAt && !restockPreview.body.committedAt)
  assert.deepEqual((await org.collection("inventory").doc(restockItemId).get()).data(), restockBefore)
  for (const collection of ["stockOperations", "history"]) assert.equal((await org.collection(collection).doc(restockPreviewId).get()).exists, false)
  assert.equal((await outboxRef(restockPreviewId).get()).exists, false)
  assert.equal((await org.collection("inventoryBatches").where("itemId", "==", restockItemId).get()).size, 0)
  const noRevision = await post("/api/v1/inventory/restocks", { commandId: op(), locationId: storeId, payload: { commit: true, lines: [restockLine] } })
  assert.equal(noRevision.status, 400)
  const restockRaceIds = [restockPreviewId, op()]
  const restockRaces = await Promise.all(restockRaceIds.map((commandId) => post("/api/v1/inventory/restocks", { commandId, locationId: storeId, payload: { commit: true, lines: [{ ...restockLine, expectedRevision: 0 }] } })))
  assert.deepEqual(restockRaces.map((result) => result.status).sort(), [200, 409])
  const restockStock = (await org.collection("inventory").doc(restockItemId).get()).data()
  assert.equal(restockStock.frontStock, 3); assert.equal(restockStock.backStock, 2); assert.equal(restockStock.onHand, 5)
  const restockBatches = await org.collection("inventoryBatches").where("itemId", "==", restockItemId).get()
  for (const [area, expected] of [["front", 3], ["back", 2]]) {
    assert.equal(restockBatches.docs.filter((doc) => doc.data().area === area).reduce((sum, doc) => sum + doc.data().remainingQuantity, 0), expected)
  }
  assert.ok(restockBatches.docs.every((doc) => doc.data().expirationKnown === false && doc.data().expirationDate === null))
  const restockRollbackId = op()
  await outboxRef(restockRollbackId).create({ isolatedTestCollision: prefix })
  const restockFailure = await post("/api/v1/inventory/restocks", { commandId: restockRollbackId, locationId: storeId, payload: { commit: true, lines: [{ itemId: restockItemId, countedFrontStock: 2, expectedRevision: 1 }] } })
  assert.equal(restockFailure.status, 500)
  assert.deepEqual((await org.collection("inventory").doc(restockItemId).get()).data(), restockStock)
  assert.deepEqual((await org.collection("inventoryBatches").where("itemId", "==", restockItemId).get()).docs.map((doc) => doc.data()), restockBatches.docs.map((doc) => doc.data()))
  for (const collection of ["stockOperations", "history"]) assert.equal((await org.collection(collection).doc(restockRollbackId).get()).exists, false)
  const legacyRestock = await mobile("restock", { commit: true, lines: [{ itemId: restockItemId, countedFrontStock: 3 }] })
  await checkCommitted(legacyRestock.id, "restock")

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
  const partial = await post("/api/v1/inventory/spot-checks", { commandId: op(), locationId: storeId, payload: { lines: [{ itemId, expectedRevision: 7, frontStock: 11, backStock: 13 }, { itemId: raceId, expectedRevision: 0, frontStock: 1, backStock: 4 }] } })
  assert.equal(partial.status, 409)
  assert.deepEqual((await inventoryRef.get()).data(), countBefore, "one stale line must reject the whole count")

  const countRollbackId = op()
  await outboxRef(countRollbackId).create({ isolatedTestCollision: prefix })
  const batchesBefore = await org.collection("inventoryBatches").where("itemId", "==", itemId).get()
  const countFailed = await post("/api/v1/inventory/spot-checks", { commandId: countRollbackId, locationId: storeId, payload: { lines: [{ itemId, expectedRevision: 7, frontStock: 0, backStock: 0 }] } })
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
  console.log("Firestore engine integration passed: seven stock actions; all seven stock API adapters; read-only restock previews; revision conflicts; undated batch coverage; partial-case precision; receive-once; competing receipts/counts/transfers/discards/cuts/targets; order/stock/batch/waste/portion/store-target rollback; store isolation.")
} finally {
  if (created) {
    const refs = [inventoryRef, org.collection("inventory").doc(raceId), org.collection("inventory").doc(wrongId), org.collection("orders").doc(orderId), org.collection("orders").doc(caseOrderId), org.collection("inventory").doc(receiptItemId), org.collection("inventory").doc(restockItemId), org.collection("inventory").doc(discardItemId), org.collection("inventory").doc(portionItemId), org.collection("inventory").doc(thresholdItemId), thresholdDetail]
    for (const id of operationIds) refs.push(org.collection("stockOperations").doc(id), org.collection("history").doc(id), outboxRef(id), db.collection("engineConsumerReceipts").doc(Buffer.from(JSON.stringify(["workspace-stock-v1", orgId, `${id}:inventory.stock-committed.v1`])).toString("base64url")))
    for (const collection of ["inventoryBatches", "receiving", "waste", "portions"]) for (const id of [itemId, raceId, wrongId, receiptItemId, restockItemId, discardItemId, portionItemId, thresholdItemId]) {
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
