import { auth, db } from "./lib/firebase-admin"
import { FieldValue } from "firebase-admin/firestore"

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  return process.argv[index + 1]
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

async function listStoreIds(orgId: string): Promise<string[]> {
  const ids: string[] = []
  const regions = await db.collection(`organizations/${orgId}/regions`).get()
  for (const region of regions.docs) {
    const districts = await db.collection(`organizations/${orgId}/regions/${region.id}/districts`).get()
    for (const district of districts.docs) {
      const stores = await db
        .collection(`organizations/${orgId}/regions/${region.id}/districts/${district.id}/stores`)
        .get()
      for (const store of stores.docs) {
        ids.push(store.id)
      }
    }
  }
  return ids
}

async function addOwnerMembership(orgId: string, uid: string) {
  const storeIds = await listStoreIds(orgId)
  await db.doc(`organizations/${orgId}/members/${uid}`).set(
    {
      organizationId: orgId,
      userId: uid,
      role: "Owner",
      storeIds,
      departmentIds: [],
      locationIds: [],
      permissionFlags: {
        manageUsers: true,
        manageStores: true,
        manageOrgSettings: true,
        manageStoreSettings: true,
        manageInventory: true,
        manageSales: true,
        sendNotifications: true
      },
      createdAt: new Date()
    },
    { merge: true }
  )
  await db.doc(`organizations/${orgId}`).set(
    {
      ownerUserIds: FieldValue.arrayUnion(uid)
    },
    { merge: true }
  )
}

async function main() {
  const email = argValue("--email")
  if (!email) {
    console.error("Usage: npm run grant-admin -- --email you@example.com [--org orgId] [--all-orgs] [--owner]")
    process.exit(1)
  }

  const orgId = argValue("--org")
  const ownerFlag = hasFlag("--owner")
  const allOrgsFlag = hasFlag("--all-orgs")

  const user = await auth.getUserByEmail(email)
  const existingClaims = user.customClaims ?? {}
  await auth.setCustomUserClaims(user.uid, {
    ...existingClaims,
    platform_admin: true
  })

  await db.doc(`users/${user.uid}`).set(
    {
      email: user.email ?? email,
      displayName: user.displayName ?? user.email ?? "InvenTracker User",
      lastLoginAt: new Date(),
      platformRoles: {
        platformAdmin: true
      },
      createdAt: new Date()
    },
    { merge: true }
  )

  if (ownerFlag) {
    if (orgId) {
      await addOwnerMembership(orgId, user.uid)
      console.log(`Added Owner membership in org ${orgId}`)
    } else if (allOrgsFlag) {
      const orgs = await db.collection("organizations").get()
      for (const org of orgs.docs) {
        await addOwnerMembership(org.id, user.uid)
      }
      console.log(`Added Owner membership in ${orgs.docs.length} organizations`)
    } else {
      const ownedOrgs = await db.collection("organizations").where("ownerUserIds", "array-contains", user.uid).get()
      for (const org of ownedOrgs.docs) {
        await addOwnerMembership(org.id, user.uid)
      }
      if (ownedOrgs.docs.length > 0) {
        console.log(`Synced Owner membership for ${ownedOrgs.docs.length} owned organizations`)
      } else {
        console.log("No owner memberships were added (pass --org <id> or --all-orgs with --owner)")
      }
    }
  }

  console.log(`Platform admin enabled for ${email} (${user.uid})`)
  console.log("Sign out and sign back in on web to refresh admin claim.")
}

void main()
