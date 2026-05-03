"use client"

import { onAuthStateChanged, type User } from "firebase/auth"
import { useEffect, useState } from "react"
import { doc, getDoc } from "firebase/firestore/lite"
import { auth, db } from "@/lib/firebase/client"

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)
      if (nextUser) {
        const token = await nextUser.getIdTokenResult(true)
        let platformAdmin = token.claims.platform_admin === true
        if (!platformAdmin && db) {
          try {
            const userSnap = await getDoc(doc(db, "users", nextUser.uid))
            const userData = (userSnap.data() as { platformRoles?: { platformAdmin?: boolean } } | undefined) ?? {}
            platformAdmin = userData.platformRoles?.platformAdmin === true
          } catch {
            // Leave token-based value in place on lookup failure.
          }
        }
        setIsPlatformAdmin(platformAdmin)
      } else {
        setIsPlatformAdmin(false)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  return { user, loading, isPlatformAdmin }
}
