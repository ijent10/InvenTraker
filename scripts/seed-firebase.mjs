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

async function ownerUid() {
  const uid = argValue("owner-uid") || process.env.INVENTRACKER_OWNER_UID
  if (uid) return uid

  const email = argValue("owner-email") || process.env.INVENTRACKER_OWNER_EMAIL
  if (!email) {
    throw new Error("Provide --owner-uid=<uid> or --owner-email=<email> for the organization owner.")
  }

  const user = await getAuth(app()).getUserByEmail(email)
  return user.uid
}

const orgId = argValue("org-id") || process.env.NEXT_PUBLIC_DEFAULT_ORG_ID || "demo-org"
const uid = await ownerUid()
const ownerEmail = argValue("owner-email") || process.env.INVENTRACKER_OWNER_EMAIL || ""
const ownerName = argValue("owner-name") || process.env.INVENTRACKER_OWNER_NAME || "Organization Owner"
const db = getFirestore(app())

await db.collection("orgs").doc(orgId).set(
  {
    ownerId: uid,
    companyName: "InvenTracker Demo",
    logoUrl: "/inventracker-mark.svg",
    headerText: "Inventory operations",
    accentColor: "#2563eb",
    secondaryColor: "#14b8a6",
    defaultMode: "Dark",
    defaultTheme: "Blue steel",
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  },
  { merge: true }
)

await db.collection("orgs").doc(orgId).collection("members").doc(uid).set(
  {
    id: uid,
    uid,
    name: ownerName,
    employeeId: "OWNER-001",
    phone: "",
    email: ownerEmail,
    jobTitle: "Owner",
    department: "Executive",
    location: "All locations",
    store: "All stores",
    status: "Active",
    role: "owner",
    permissions: ["*"],
    lastActive: "Seeded owner",
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  },
  { merge: true }
)

console.log(`Seeded owner ${uid} for org ${orgId}.`)
