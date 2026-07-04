import fs from "node:fs"

function readProjectId() {
  return process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
}

function canUseApplicationDefaultCredentials() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_CONFIG ||
      process.env.K_SERVICE ||
      process.env.FUNCTION_TARGET ||
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT
  )
}

async function readCredential() {
  const { applicationDefault, cert } = await import("firebase-admin/app")

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
  }

  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    return cert(JSON.parse(fs.readFileSync(serviceAccountPath, "utf8")))
  }

  if (!canUseApplicationDefaultCredentials()) return null

  return applicationDefault()
}

export async function adminApp() {
  const projectId = readProjectId()
  if (!projectId) return null

  const { getApps, initializeApp } = await import("firebase-admin/app")

  const credential = await readCredential()
  if (!credential) return null

  return getApps().length > 0 ? getApps()[0] : initializeApp({ credential, projectId })
}

export async function adminDb(databaseId = "(default)") {
  const app = await adminApp()
  if (!app) return null

  const { getFirestore } = await import("firebase-admin/firestore")

  return databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId)
}

export async function adminAuth() {
  const app = await adminApp()
  if (!app) return null

  const { getAuth } = await import("firebase-admin/auth")
  return getAuth(app)
}

export async function adminFieldValue() {
  const { FieldValue } = await import("firebase-admin/firestore")
  return FieldValue
}
