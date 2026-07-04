import fs from "node:fs"
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { FieldValue, getFirestore } from "firebase-admin/firestore"

function argValue(name) {
  const prefix = `--${name}=`
  const match = process.argv.find((argument) => argument.startsWith(prefix))
  return match ? match.slice(prefix.length) : undefined
}

function firebaseRcProjectId() {
  const firebaseRcPath = `${process.cwd()}/.firebaserc`
  if (!fs.existsSync(firebaseRcPath)) return undefined
  const firebaseRc = JSON.parse(fs.readFileSync(firebaseRcPath, "utf8"))
  return firebaseRc.projects?.default
}

function projectId() {
  return (
    argValue("project-id") ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    firebaseRcProjectId()
  )
}

function credential() {
  const inlineCredential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (inlineCredential) return cert(JSON.parse(inlineCredential))

  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    return cert(JSON.parse(fs.readFileSync(serviceAccountPath, "utf8")))
  }

  return applicationDefault()
}

function app() {
  if (getApps().length > 0) return getApps()[0]
  const detectedProjectId = projectId()
  if (!detectedProjectId) {
    throw new Error("Unable to detect Firebase project id. Set FIREBASE_PROJECT_ID or configure .firebaserc.")
  }

  return initializeApp({
    credential: credential(),
    projectId: detectedProjectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${detectedProjectId}.firebasestorage.app`
  })
}

const orgId = argValue("org-id") || process.env.NEXT_PUBLIC_DEFAULT_ORG_ID || "demo-org"
const password = argValue("password") || process.env.INVENTRACKER_TEST_USER_PASSWORD || "InvenTracker123!"
const auth = getAuth(app())
const db = getFirestore(app())

const testUsers = [
  {
    email: "owner@inventracker.test",
    name: "Owner Test",
    employeeId: "OWNER-TEST",
    phone: "555-0100",
    jobTitle: "Owner",
    department: "Executive",
    location: "All locations",
    store: "All stores",
    role: "owner",
    status: "Active",
    permissions: ["*"]
  },
  {
    email: "manager@inventracker.test",
    name: "Manager Test",
    employeeId: "MGR-TEST",
    phone: "555-0101",
    jobTitle: "Store Manager",
    department: "Operations",
    location: "Liberty Ave",
    store: "Liberty Ave",
    role: "manager",
    status: "Active",
    permissions: [
      "inventory.view",
      "inventory.edit",
      "inventory.archive",
      "orders.view",
      "orders.create",
      "orders.approve",
      "health.view",
      "health.complete",
      "health.manage",
      "history.view",
      "history.viewStore",
      "history.viewDepartment",
      "ai.use",
      "ai.verifyAutofill",
      "insights.view",
      "products.view",
      "products.edit",
      "vendors.view",
      "vendors.edit",
      "employees.view",
      "stores.view"
    ]
  },
  {
    email: "inventory@inventracker.test",
    name: "Inventory Test",
    employeeId: "INV-TEST",
    phone: "555-0102",
    jobTitle: "Inventory Lead",
    department: "Inventory",
    location: "Liberty Ave",
    store: "Liberty Ave",
    role: "employee",
    status: "Active",
    permissions: [
      "inventory.view",
      "inventory.edit",
      "health.view",
      "health.complete",
      "history.view",
      "history.viewDepartment",
      "ai.use",
      "products.view",
      "vendors.view"
    ]
  },
  {
    email: "orders@inventracker.test",
    name: "Orders Test",
    employeeId: "ORD-TEST",
    phone: "555-0103",
    jobTitle: "Order Clerk",
    department: "Ordering",
    location: "Liberty Ave",
    store: "Liberty Ave",
    role: "employee",
    status: "Active",
    permissions: ["orders.view", "orders.create", "inventory.view", "products.view", "vendors.view"]
  },
  {
    email: "viewer@inventracker.test",
    name: "Viewer Test",
    employeeId: "VIEW-TEST",
    phone: "555-0104",
    jobTitle: "Viewer",
    department: "Operations",
    location: "Liberty Ave",
    store: "Liberty Ave",
    role: "viewer",
    status: "Active",
    permissions: ["inventory.view", "orders.view", "health.view", "history.view", "insights.view", "ai.use"]
  },
  {
    email: "suspended@inventracker.test",
    name: "Suspended Test",
    employeeId: "SUSP-TEST",
    phone: "555-0105",
    jobTitle: "Suspended Employee",
    department: "Operations",
    location: "Liberty Ave",
    store: "Liberty Ave",
    role: "employee",
    status: "Suspended",
    permissions: ["inventory.view", "orders.view"]
  }
]

async function upsertAuthUser(testUser) {
  try {
    const existing = await auth.getUserByEmail(testUser.email)
    return auth.updateUser(existing.uid, {
      displayName: testUser.name,
      password,
      emailVerified: true,
      disabled: false
    })
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error
  }

  return auth.createUser({
    email: testUser.email,
    password,
    emailVerified: true,
    displayName: testUser.name,
    disabled: false
  })
}

await db.collection("orgs").doc(orgId).set(
  {
    companyName: "InvenTracker Permission Lab",
    logoUrl: "/inventracker-mark.svg",
    headerText: "Permission testing workspace",
    accentColor: "#2563eb",
    secondaryColor: "#14b8a6",
    defaultMode: "Dark",
    defaultTheme: "Blue steel",
    schemaVersion: 1,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  },
  { merge: true }
)

let ownerUid = ""

for (const testUser of testUsers) {
  const user = await upsertAuthUser(testUser)
  if (testUser.role === "owner") ownerUid = user.uid

  await db.collection("orgs").doc(orgId).collection("members").doc(user.uid).set(
    {
      id: user.uid,
      uid: user.uid,
      name: testUser.name,
      employeeId: testUser.employeeId,
      phone: testUser.phone,
      email: testUser.email,
      jobTitle: testUser.jobTitle,
      department: testUser.department,
      location: testUser.location,
      store: testUser.store,
      status: testUser.status,
      role: testUser.role,
      permissions: testUser.permissions,
      lastActive: "Seeded test user",
      schemaVersion: 1,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  )

  await db.collection("users").doc(user.uid).set(
    {
      email: testUser.email,
      name: testUser.name,
      defaultOrgId: orgId,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  )

  console.log(`Seeded ${testUser.email} (${testUser.role}) -> ${user.uid}`)
}

if (ownerUid) {
  await db.collection("orgs").doc(orgId).set(
    {
      ownerId: ownerUid,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  )
}

console.log(`\nSeeded ${testUsers.length} Firebase Auth test users for org ${orgId}.`)
console.log(`Default password: ${password}`)
console.log("Use /signin to switch users and /administrator/access-lab to inspect permissions.")
