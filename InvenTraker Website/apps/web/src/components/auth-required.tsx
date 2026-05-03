"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useAuthUser } from "@/hooks/use-auth-user"

export function AuthRequired({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthUser()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin")
    }
  }, [loading, router, user])

  if (loading || !user) {
    return <div className="p-10 text-sm text-app-muted">Loading session...</div>
  }

  return <>{children}</>
}
