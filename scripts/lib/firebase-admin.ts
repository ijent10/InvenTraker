import { getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

if (getApps().length === 0) {
  initializeApp({ projectId: "inventracker-f1229" })
}

export const db = getFirestore()
export const auth = getAuth()

export type MigrationResult = {
  id: string
  scanned: number
  updated: number
  skipped: number
  notes: string[]
}
