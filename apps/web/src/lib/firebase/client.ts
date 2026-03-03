import { initializeApp, getApps, getApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore/lite"
import { getFunctions } from "firebase/functions"
import { getStorage } from "firebase/storage"

import { env } from "@/lib/env"

const firebaseConfig = env.success
  ? {
      apiKey: env.data.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: env.data.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: env.data.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: env.data.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.data.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.data.NEXT_PUBLIC_FIREBASE_APP_ID,
      measurementId: env.data.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
    }
  : null

const app = firebaseConfig ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null

export const firebaseReady = Boolean(app)
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
export const functions = app ? getFunctions(app, "us-central1") : null
export const storage = app ? getStorage(app) : null
