import { auth, db } from "./lib/firebase-admin"

const PASSWORD = "InvenTracker!123"

type SeedUser = { email: string; displayName: string; role?: "Owner" | "Manager" | "Staff"; platformAdmin?: boolean }

const seedUsers: SeedUser[] = [
  { email: "owner@test.com", displayName: "Owner Test", role: "Owner" },
  { email: "manager@test.com", displayName: "Manager Test", role: "Manager" },
  { email: "staff@test.com", displayName: "Staff Test", role: "Staff" },
  { email: "admin@test.com", displayName: "Platform Admin", role: "Owner", platformAdmin: true }
]

async function upsertAuthUser(user: SeedUser) {
  try {
    const existing = await auth.getUserByEmail(user.email)
    await auth.updateUser(existing.uid, { password: PASSWORD, displayName: user.displayName })
    return existing.uid
  } catch {
    const created = await auth.createUser({
      email: user.email,
      password: PASSWORD,
      displayName: user.displayName,
      emailVerified: true
    })
    return created.uid
  }
}

function randomQty(min: number, max: number) {
  return Number((Math.random() * (max - min) + min).toFixed(3))
}

async function seed() {
  const userIds = new Map<string, string>()
  for (const user of seedUsers) {
    const uid = await upsertAuthUser(user)
    userIds.set(user.email, uid)
    if (user.platformAdmin) {
      await auth.setCustomUserClaims(uid, { platform_admin: true })
    }
  }

  const orgId = "tfm-test"
  await db.doc(`organizations/${orgId}`).set(
    {
      name: "The Fresh Market (Test)",
      createdAt: new Date(),
      status: "active",
      planId: "pro",
      subscription: {
        status: "active",
        startedAt: new Date(),
        renewsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
      },
      ownerUserIds: [userIds.get("owner@test.com"), userIds.get("admin@test.com")].filter(Boolean)
    },
    { merge: true }
  )

  const regions = [
    { id: "region-north", name: "North Region" },
    { id: "region-south", name: "South Region" }
  ]

  const districts = [
    { regionId: "region-north", id: "district-a", name: "District A" },
    { regionId: "region-north", id: "district-b", name: "District B" },
    { regionId: "region-south", id: "district-c", name: "District C" }
  ]

  const stores = [
    { regionId: "region-north", districtId: "district-a", id: "store-1", name: "TFM Midtown" },
    { regionId: "region-north", districtId: "district-b", id: "store-2", name: "TFM Lakeside" },
    { regionId: "region-south", districtId: "district-c", id: "store-3", name: "TFM Spring Water" }
  ]

  for (const region of regions) {
    await db.doc(`organizations/${orgId}/regions/${region.id}`).set({ organizationId: orgId, name: region.name }, { merge: true })
  }

  for (const district of districts) {
    await db
      .doc(`organizations/${orgId}/regions/${district.regionId}/districts/${district.id}`)
      .set({ organizationId: orgId, regionId: district.regionId, name: district.name }, { merge: true })
  }

  for (const store of stores) {
    const storePath = `organizations/${orgId}/regions/${store.regionId}/districts/${store.districtId}/stores/${store.id}`
    await db.doc(storePath).set(
      {
        organizationId: orgId,
        regionId: store.regionId,
        districtId: store.districtId,
        name: store.name,
        status: "active",
        lastSyncAt: new Date()
      },
      { merge: true }
    )

    await db.doc(`${storePath}/departments/deli`).set({ organizationId: orgId, storeId: store.id, name: "Deli" }, { merge: true })
    await db
      .doc(`${storePath}/locations/cheese-case`)
      .set({ organizationId: orgId, storeId: store.id, name: "Cheese Case", departmentId: "deli" }, { merge: true })
  }

  const ownerUid = userIds.get("owner@test.com")!
  const managerUid = userIds.get("manager@test.com")!
  const staffUid = userIds.get("staff@test.com")!
  const adminUid = userIds.get("admin@test.com")!

  await db.doc(`organizations/${orgId}/members/${ownerUid}`).set({ organizationId: orgId, userId: ownerUid, role: "Owner", storeIds: stores.map((s) => s.id), createdAt: new Date() }, { merge: true })
  await db.doc(`organizations/${orgId}/members/${managerUid}`).set({ organizationId: orgId, userId: managerUid, role: "Manager", storeIds: ["store-1"], createdAt: new Date() }, { merge: true })
  await db.doc(`organizations/${orgId}/members/${staffUid}`).set({ organizationId: orgId, userId: staffUid, role: "Staff", storeIds: ["store-1"], createdAt: new Date() }, { merge: true })
  await db.doc(`organizations/${orgId}/members/${adminUid}`).set({ organizationId: orgId, userId: adminUid, role: "Owner", storeIds: stores.map((s) => s.id), createdAt: new Date() }, { merge: true })

  for (const user of seedUsers) {
    const uid = userIds.get(user.email)!
    await db.doc(`users/${uid}`).set(
      {
        email: user.email,
        displayName: user.displayName,
        createdAt: new Date(),
        lastLoginAt: new Date(),
        defaultOrganizationId: orgId,
        platformRoles: { platformAdmin: Boolean(user.platformAdmin) }
      },
      { merge: true }
    )
  }

  const vendors = [
    { id: "vendor-gfi", name: "GFI", orderingDays: [1, 4], cutoffTimeLocal: "10:00", leadDays: 1 },
    { id: "vendor-epicure", name: "Epicure", orderingDays: [0, 2], cutoffTimeLocal: "09:00", leadDays: 2 }
  ]

  for (const vendor of vendors) {
    await db.doc(`organizations/${orgId}/vendors/${vendor.id}`).set({ organizationId: orgId, ...vendor, contactInfo: "ops@example.com" }, { merge: true })
  }

  const itemNames = [
    "Old Quebec Reserve Cheddar",
    "Old Quebec Super Sharp",
    "Locatelli Pecorino Romano",
    "TFM Mini Brie",
    "Cabot Lite50 Sharp",
    "Triumph Fresh Mozzarella",
    "Isigny Mimolette",
    "Kosher Sharp Cheddar",
    "Cambozola Black Label",
    "Parmigiano Reggiano",
    "Pecorino Toscano",
    "Aged Gouda",
    "Mahon",
    "Comte 18 Month",
    "Taleggio",
    "Goat Gouda",
    "Drunken Goat",
    "Jarlsberg Lite",
    "Port Salut",
    "Buffalo Mozzarella",
    "Smoked Cheddar",
    "Stilton Mango Ginger",
    "Midnight Moon",
    "Gruyere Cave Aged",
    "Cilento Ciliegine"
  ]

  for (let i = 0; i < itemNames.length; i += 1) {
    const itemId = `item-${i + 1}`
    const unit = i % 3 === 0 ? "lbs" : "each"
    const caseSize = unit === "lbs" ? 1 : 12
    const qtyPerCase = unit === "lbs" ? 1 : 12
    const itemDoc = {
      organizationId: orgId,
      name: itemNames[i],
      upc: `0${String(20100000000 + i)}`,
      unit,
      defaultExpirationDays: 14,
      minQuantity: unit === "lbs" ? 5 : 10,
      qtyPerCase,
      caseSize,
      price: unit === "lbs" ? randomQty(8, 22) : randomQty(4, 16),
      vendorId: i % 2 === 0 ? "vendor-gfi" : "vendor-epicure",
      departmentId: "deli",
      locationId: "cheese-case",
      tags: ["cheese", i % 2 === 0 ? "aged" : "fresh"],
      archived: false,
      weeklyUsage: randomQty(1, 12),
      createdAt: new Date(),
      updatedAt: new Date()
    }
    await db.doc(`organizations/${orgId}/items/${itemId}`).set(itemDoc, { merge: true })

    for (const store of stores) {
      const storePath = `organizations/${orgId}/regions/${store.regionId}/districts/${store.districtId}/stores/${store.id}`
      await db.doc(`${storePath}/inventoryBatches/${itemId}-a`).set(
        {
          organizationId: orgId,
          storeId: store.id,
          itemId,
          quantity: randomQty(1, 20),
          unit,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * (5 + (i % 12))),
          lot: `LOT-${i + 1}`,
          source: "received",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        { merge: true }
      )
    }
  }

  for (const store of stores) {
    const storePath = `organizations/${orgId}/regions/${store.regionId}/districts/${store.districtId}/stores/${store.id}`
    for (let i = 0; i < 5; i += 1) {
      await db.collection(`${storePath}/wasteRecords`).add({
        organizationId: orgId,
        storeId: store.id,
        itemId: `item-${i + 1}`,
        quantity: randomQty(0.1, 2),
        unit: i % 2 === 0 ? "each" : "lbs",
        reason: i % 2 === 0 ? "expired" : "damage",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * i),
        createdBy: staffUid
      })
    }
  }

  const sampleGuideId = "guide-cheese-setup"
  await db.doc(`organizations/${orgId}/howtos/${sampleGuideId}`).set(
    {
      organizationId: orgId,
      title: "Cheese Case Opening Procedure",
      description: "Morning setup for deli cheese case.",
      tags: ["opening", "deli"],
      scope: "org",
      storeId: null,
      version: 1,
      updatedAt: new Date(),
      updatedBy: managerUid,
      createdAt: new Date(),
      createdBy: managerUid
    },
    { merge: true }
  )

  const step1 = db.collection(`organizations/${orgId}/howtos/${sampleGuideId}/steps`).doc("step-1")
  await step1.set({ organizationId: orgId, stepNumber: 1, title: "Sanitize prep station", createdAt: new Date(), updatedAt: new Date() }, { merge: true })
  await step1.collection("blocks").doc("block-1").set({ organizationId: orgId, type: "text", text: "Wipe all surfaces and sanitize tools before handling products.", orderIndex: 0 }, { merge: true })

  const profileWebId = `${ownerUid}_${orgId}_WEB`
  const profileIosId = `${ownerUid}_${orgId}_IOS`
  await db.doc(`platformPreferenceProfiles/${profileWebId}`).set(
    {
      userId: ownerUid,
      organizationId: orgId,
      platform: "WEB",
      theme: "dark",
      accentColor: "#2563EB",
      boldText: false,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    { merge: true }
  )
  await db.doc(`platformPreferenceProfiles/${profileIosId}`).set(
    {
      userId: ownerUid,
      organizationId: orgId,
      platform: "IOS",
      theme: "dark",
      accentColor: "#A855F7",
      boldText: false,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    { merge: true }
  )

  console.log("Seed complete")
  console.log("Accounts:")
  console.log("- owner@test.com / InvenTracker!123")
  console.log("- manager@test.com / InvenTracker!123")
  console.log("- staff@test.com / InvenTracker!123")
  console.log("- admin@test.com / InvenTracker!123")
}

void seed()
