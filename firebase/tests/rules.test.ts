import fs from "node:fs"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing"
import { doc, getDoc, setDoc } from "firebase/firestore"

let testEnv: RulesTestEnvironment | undefined

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "inventracker-rules-test",
    firestore: {
      rules: fs.readFileSync(path.resolve("/Users/ianjent/Desktop/InvenTracker/firebase/firestore.rules"), "utf8")
    }
  })
})

beforeEach(async () => {
  await testEnv?.clearFirestore()
})

afterAll(async () => {
  await testEnv?.cleanup()
})

describe("RBAC and tenant isolation", () => {
  it("blocks user from reading org they are not a member of", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "organizations/org-a", "members/user-a"), {
        organizationId: "org-a",
        role: "Owner",
        storeIds: [],
        createdAt: new Date()
      })
      await setDoc(doc(context.firestore(), "organizations/org-a"), { name: "Org A", ownerUserIds: ["user-a"] })
      await setDoc(doc(context.firestore(), "organizations/org-b"), { name: "Org B", ownerUserIds: ["user-b"] })
    })

    const outsider = testEnv.authenticatedContext("user-z")
    await assertFails(getDoc(doc(outsider.firestore(), "organizations/org-a")))
  })

  it("allows staff to read assigned store inventory batches", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "organizations/org-a"), { name: "Org A", ownerUserIds: ["owner-1"] })
      await setDoc(doc(context.firestore(), "organizations/org-a/members/staff-1"), {
        organizationId: "org-a",
        role: "Staff",
        storeIds: ["store-1"],
        createdAt: new Date()
      })
      await setDoc(doc(context.firestore(), "organizations/org-a/regions/r1/districts/d1/stores/store-1"), {
        organizationId: "org-a",
        regionId: "r1",
        districtId: "d1",
        name: "Store 1",
        status: "active"
      })
      await setDoc(doc(context.firestore(), "organizations/org-a/regions/r1/districts/d1/stores/store-1/inventoryBatches/b1"), {
        organizationId: "org-a",
        storeId: "store-1",
        itemId: "item-1",
        quantity: 3,
        unit: "each"
      })
    })

    const staff = testEnv.authenticatedContext("staff-1")
    await assertSucceeds(getDoc(doc(staff.firestore(), "organizations/org-a/regions/r1/districts/d1/stores/store-1/inventoryBatches/b1")))
  })

  it("blocks non-platform-admin from reading audit logs globally", async () => {
    const ctx = testEnv.authenticatedContext("staff-1")
    await assertFails(getDoc(doc(ctx.firestore(), "auditLogs/log-1")))
  })
})
