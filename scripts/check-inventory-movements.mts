import assert from "node:assert/strict"
import { inventoryMovementTypes, movementTypeFor, projectItemMovement, encodeMovementCursor, decodeMovementCursor } from "../src/lib/engines/inventory/movements.ts"
import { assertInventoryWritesEnabled } from "../src/lib/engines/inventory/availability.ts"
const change = { itemId: "item", unit: "kg", before: { frontStock: 0, backStock: 0, onHand: 0, revision: 0 }, after: { frontStock: 1, backStock: 2, onHand: 3, revision: 1 }, delta: { frontStock: 1, backStock: 2, onHand: 3 } }
for (const [operation, type] of Object.entries(inventoryMovementTypes)) assert.equal(movementTypeFor(operation), type)
assert.equal(movementTypeFor("unknown"), "unknown")
const raw = { operationType: "receive", changes: [change], actor: { email: "PRIVATE_IDENTITY" }, result: "PRIVATE_RESULT", createdAt: "2026-10-18T00:00:00.000Z" }
const row = projectItemMovement("op", raw, "item")!;assert.equal(row.type, "receipt");assert.equal(row.verified,true);assert.ok(!JSON.stringify(row).includes("PRIVATE_"))
assert.equal(projectItemMovement("op", raw, "other"), null)
assert.equal(projectItemMovement("op", { ...raw, changes: [change,change] }, "item")!.verified,false)
assert.equal(projectItemMovement("op", { ...raw, movementType:"discard" }, "item")!.verified,false)
assert.equal(projectItemMovement("op", { ...raw, changes: [{...change, delta:{...change.delta,onHand:99}}] }, "item")!.verified,false)
const invalid = projectItemMovement("op", { ...raw, changes:[{...change, after:{...change.after,onHand:NaN}}] }, "item")!;assert.equal(invalid.verified,false);assert.equal(invalid.after,null)
const policy = projectItemMovement("op", { operationType:"par_change",changes:[{itemId:"item",before:{par:1,reorderPoint:0,revision:1},after:{par:2,reorderPoint:1,revision:2}}] },"item")!;assert.equal(policy.verified,true);assert.equal(policy.delta,null);assert.equal(policy.kind,"policy")
const cursor={organizationId:"org",storeId:"store",itemId:"item",revision:12,after:"last-record"};const encoded=encodeMovementCursor(cursor);assert.deepEqual(decodeMovementCursor(encoded,cursor),cursor)
for(const scope of [{...cursor,organizationId:"other"},{...cursor,storeId:"other"},{...cursor,itemId:"other"}])assert.throws(()=>decodeMovementCursor(encoded,scope))
for(const bad of ["!","x".repeat(1801),Buffer.from('{"after":"../bad"}').toString("base64url")])assert.throws(()=>decodeMovementCursor(bad,cursor))
assert.doesNotThrow(()=>assertInventoryWritesEnabled("true"));assert.throws(()=>assertInventoryWritesEnabled("false"),error=>{assert.equal((error as {code:string}).code,"inventory_read_only");return true})
console.log("Inventory movement checks passed: seven explicit types, verified legacy projection, invalid/duplicate change detection, minimal output, context-bound cursor and emergency write pause.")
