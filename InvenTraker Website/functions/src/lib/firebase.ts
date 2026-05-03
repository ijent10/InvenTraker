import { initializeApp, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import { getAuth } from "firebase-admin/auth"
import { getMessaging } from "firebase-admin/messaging"

if (getApps().length === 0) {
  initializeApp()
}

export const adminDb = getFirestore()
export const adminStorage = getStorage()
export const adminAuth = getAuth()

let messagingInstance: ReturnType<typeof getMessaging> | null = null

export function adminMessaging() {
  if (!messagingInstance) {
    messagingInstance = getMessaging()
  }
  return messagingInstance
}
