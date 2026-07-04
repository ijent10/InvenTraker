"use client"

import type { ReactNode } from "react"

import { useAuthSession } from "@/lib/auth-session"
import type { PermissionKey } from "@/lib/permissions"

export function PermissionGate({
  permission,
  children,
  fallback = null
}: {
  permission: PermissionKey
  children: ReactNode
  fallback?: ReactNode
}) {
  const session = useAuthSession()

  return session.can(permission) ? <>{children}</> : <>{fallback}</>
}
