import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import fs from "node:fs"

const confirmed = process.argv.includes("--yes")

if (!confirmed) {
  console.error("Refusing to reset Firebase without --yes.")
  console.error("Run: npm run firebase:reset -- --yes")
  process.exit(1)
}

function credential() {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    return cert(JSON.parse(fs.readFileSync(serviceAccountPath, "utf8")))
  }
  return applicationDefault()
}

function readFirebaseProjectId() {
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT

  const firebaseRcPath = `${process.cwd()}/.firebaserc`
  if (fs.existsSync(firebaseRcPath)) {
    const firebaseRc = JSON.parse(fs.readFileSync(firebaseRcPath, "utf8"))
    return firebaseRc.projects?.default
  }

  return undefined
}

function storageBucket(projectId) {
  return process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`
}

function app() {
  if (getApps().length > 0) return getApps()[0]
  const projectId = readFirebaseProjectId()
  if (!projectId) {
    throw new Error("Unable to detect Firebase project id. Set FIREBASE_PROJECT_ID or configure .firebaserc.")
  }

  return initializeApp({
    credential: credential(),
    projectId,
    storageBucket: storageBucket(projectId)
  })
}

async function resetFirestore() {
  const db = getFirestore(app())
  const collections = await db.listCollections()
  for (const collection of collections) {
    console.log(`[firestore] deleting /${collection.id}`)
    await db.recursiveDelete(collection)
  }
}

async function resetAuth() {
  const auth = getAuth(app())
  let nextPageToken
  let deleted = 0

  do {
    const page = await auth.listUsers(1000, nextPageToken)
    const uids = page.users.map((user) => user.uid)
    if (uids.length > 0) {
      await auth.deleteUsers(uids)
      deleted += uids.length
      console.log(`[auth] deleted ${deleted} users`)
    }
    nextPageToken = page.pageToken
  } while (nextPageToken)
}

async function resetStorage() {
  const bucketName = storageBucket(app().options.projectId)
  if (!bucketName) {
    console.log("[storage] skipped; FIREBASE_STORAGE_BUCKET is not set")
    return
  }

  const bucket = getStorage(app()).bucket(bucketName)
  await bucket.deleteFiles({ force: true })
  console.log(`[storage] deleted files in ${bucketName}`)
}

await resetFirestore()
await resetAuth()
await resetStorage()

console.log("Firebase reset complete.")
