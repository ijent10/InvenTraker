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

function app() {
  if (getApps().length > 0) return getApps()[0]
  return initializeApp({
    credential: credential(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
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
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
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
