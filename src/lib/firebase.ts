import { getApps, initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { getStorage } from "firebase/storage"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
}

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.storageBucket &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId
)

export const firebaseApp = firebaseConfigured
  ? getApps().length > 0
    ? getApps()[0]
    : initializeApp(firebaseConfig)
  : null

export const auth = firebaseApp ? getAuth(firebaseApp) : null
export function clientDb(databaseId = "(default)") {
  if (!firebaseApp) return null
  return databaseId === "(default)" ? getFirestore(firebaseApp) : getFirestore(firebaseApp, databaseId)
}

export const db = clientDb()
export const storage = firebaseApp ? getStorage(firebaseApp) : null
