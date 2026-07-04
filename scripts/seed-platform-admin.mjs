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

async function adminUser(email) {
  const auth = getAuth(app())

  try {
    return await auth.getUserByEmail(email)
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error
  }

  const password = process.env.INVENTRACKER_PLATFORM_ADMIN_PASSWORD
  if (!password) {
    throw new Error(
      `No Firebase Auth user exists for ${email}. Create the user first, or set INVENTRACKER_PLATFORM_ADMIN_PASSWORD for this one-time seed run.`
    )
  }

  return auth.createUser({
    email,
    password,
    emailVerified: true,
    displayName: argValue("name") || "Platform Administrator"
  })
}

const email = (argValue("email") || process.env.INVENTRACKER_PLATFORM_ADMIN_EMAIL || "ianjjent@icloud.com").toLowerCase()
const user = await adminUser(email)
const auth = getAuth(app())
const db = getFirestore(app())

await auth.setCustomUserClaims(user.uid, {
  ...(user.customClaims ?? {}),
  platformAdmin: true
})

await db.collection("platformAdmins").doc(user.uid).set(
  {
    uid: user.uid,
    email,
    role: "platformAdmin",
    status: "Active",
    permissions: ["platform.admin"],
    source: "seed-platform-admin",
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  },
  { merge: true }
)

console.log(`Seeded platform administrator ${email} (${user.uid}).`)
