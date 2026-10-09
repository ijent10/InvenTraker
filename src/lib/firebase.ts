import { getApps, initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { getStorage } from "firebase/storage"

// Firebase App Hosting supplies FIREBASE_WEBAPP_CONFIG during its build, but
// Next.js client bundles only expose NEXT_PUBLIC_* values. These public web-app
// identifiers keep the hosted client connected when explicit overrides are not
// configured. They are Firebase client identifiers, not server credentials.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyD58SA61KJCkiy33n0WUgM9TbOtVcNLH9k",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "inventracker-f1229.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "inventracker-f1229",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "inventracker-f1229.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "754519240035",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:754519240035:web:15200a15fdceffcf8ef756",
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
