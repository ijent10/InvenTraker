import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"

import { auth, db } from "@/lib/firebase"
import { userPreferencesPath } from "@/lib/firestore-schema"
import type { AppTheme } from "@/lib/theme"

export type CloudWorkspacePreferences = {
  theme?: AppTheme
  savedThemes?: AppTheme[]
  dashboardWidgetIds?: string[]
  showTips?: boolean
  updatedAt?: unknown
  schemaVersion?: number
}

async function currentUserId() {
  const firebaseAuth = auth
  if (!firebaseAuth) return null
  if (firebaseAuth.currentUser) return firebaseAuth.currentUser.uid

  return new Promise<string | null>((resolve) => {
    let unsubscribe = () => {}
    const timeout = window.setTimeout(() => {
      unsubscribe()
      resolve(firebaseAuth.currentUser?.uid ?? null)
    }, 1500)
    unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (user) => {
        window.clearTimeout(timeout)
        unsubscribe()
        resolve(user?.uid ?? null)
      },
      () => {
        window.clearTimeout(timeout)
        unsubscribe()
        resolve(null)
      }
    )
  })
}

async function workspacePreferencesRef() {
  const userId = await currentUserId()
  if (!db || !userId) return null
  return doc(db, userPreferencesPath(userId))
}

export function canSyncWorkspacePreferences() {
  return Boolean(db && auth)
}

export async function readCloudWorkspacePreferences(): Promise<CloudWorkspacePreferences | null> {
  const ref = await workspacePreferencesRef()
  if (!ref) return null

  const snapshot = await getDoc(ref)
  return snapshot.exists() ? (snapshot.data() as CloudWorkspacePreferences) : null
}

export async function writeCloudWorkspacePreferences(patch: CloudWorkspacePreferences) {
  const ref = await workspacePreferencesRef()
  if (!ref) return false

  await setDoc(
    ref,
    {
      ...patch,
      schemaVersion: 1,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  )

  return true
}
