"use client"

import { signOut } from "firebase/auth"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { auth } from "@/lib/firebase/client"

export default function SignOutPage() {
  const router = useRouter()

  useEffect(() => {
    const run = async () => {
      if (auth) await signOut(auth)
      document.cookie = "it_session=; path=/; max-age=0; samesite=lax"
      router.replace("/signin")
    }
    void run()
  }, [router])

  return <div className="p-8 text-sm text-app-muted">Signing out...</div>
}
