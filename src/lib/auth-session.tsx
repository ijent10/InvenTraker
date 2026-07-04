"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { onAuthStateChanged, signOut, type User } from "firebase/auth"
import { doc, onSnapshot } from "firebase/firestore"

import { auth, db, firebaseConfigured } from "@/lib/firebase"
import { DEFAULT_ORG_ID } from "@/lib/firestore-schema"
import type { Employee, EmployeePermission } from "@/lib/demo-data"
import type { PermissionKey } from "@/lib/permissions"

export type AuthSessionStatus = "demo" | "loading" | "signed-out" | "no-member" | "ready" | "unconfigured"

export type AuthSession = {
  status: AuthSessionStatus
  user: User | null
  member: Employee | null
  orgId: string
  platformAdmin: boolean
  configured: boolean
  error: string
  can: (permission?: PermissionKey) => boolean
  hasAny: (permissions: PermissionKey[]) => boolean
  signOut: () => Promise<void>
}

const AuthSessionContext = createContext<AuthSession | null>(null)
const bootstrapPlatformAdminEmails = new Set(["ianjjent@icloud.com"])

function isBootstrapPlatformAdminEmail(email?: string | null) {
  return Boolean(email && bootstrapPlatformAdminEmails.has(email.toLowerCase()))
}

function normalizeMember(id: string, data: Record<string, unknown>): Employee {
  return {
    id,
    name: String(data.name ?? data.email ?? "Workspace user"),
    employeeId: String(data.employeeId ?? ""),
    phone: String(data.phone ?? ""),
    email: String(data.email ?? ""),
    jobTitle: String(data.jobTitle ?? data.role ?? ""),
    department: String(data.department ?? ""),
    location: String(data.location ?? ""),
    store: String(data.store ?? ""),
    status: data.status === "Suspended" ? "Suspended" : data.status === "Invite sent" ? "Invite sent" : "Active",
    lastActive: String(data.lastActive ?? "Signed in"),
    permissions: Array.isArray(data.permissions) ? (data.permissions as EmployeePermission[]) : []
  }
}

export function AuthSessionProvider({
  children,
  fallbackMember
}: {
  children: ReactNode
  fallbackMember?: Employee
}) {
  const [user, setUser] = useState<User | null>(null)
  const [member, setMember] = useState<Employee | null>(fallbackMember ?? null)
  const [orgId, setOrgId] = useState(DEFAULT_ORG_ID)
  const [platformAdmin, setPlatformAdmin] = useState(false)
  const [status, setStatus] = useState<AuthSessionStatus>(firebaseConfigured && auth && db ? "loading" : "demo")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!firebaseConfigured || !auth || !db) {
      setStatus("demo")
      setMember((current) => current ?? fallbackMember ?? null)
      return
    }

    const firebaseAuth = auth
    const firestore = db
    let unsubscribeMember = () => {}
    let unsubscribePlatformAdmin = () => {}
    let unsubscribeUserProfile = () => {}

    const unsubscribeAuth = onAuthStateChanged(
      firebaseAuth,
      async (nextUser) => {
        unsubscribeMember()
        unsubscribePlatformAdmin()
        unsubscribeUserProfile()
        unsubscribeMember = () => {}
        unsubscribePlatformAdmin = () => {}
        unsubscribeUserProfile = () => {}
        setUser(nextUser)
        setError("")

        if (!nextUser) {
          setMember(null)
          setOrgId(DEFAULT_ORG_ID)
          setPlatformAdmin(false)
          setStatus("signed-out")
          return
        }

        const signedInUser = nextUser
        setStatus("loading")
        setOrgId(DEFAULT_ORG_ID)
        const token = await signedInUser.getIdTokenResult().catch(() => null)
        const bootstrapPlatformAdmin = isBootstrapPlatformAdminEmail(signedInUser.email)
        setPlatformAdmin(bootstrapPlatformAdmin || token?.claims.platformAdmin === true)

        unsubscribePlatformAdmin = onSnapshot(
          doc(firestore, "platformAdmins", signedInUser.uid),
          (snapshot) => {
            setPlatformAdmin((fromClaim) => bootstrapPlatformAdmin || fromClaim || snapshot.exists())
          },
          () => {
            setPlatformAdmin(bootstrapPlatformAdmin || token?.claims.platformAdmin === true)
          }
        )

        function watchMember(nextOrgId: string) {
          unsubscribeMember()
          setOrgId(nextOrgId)
          setStatus("loading")
          unsubscribeMember = onSnapshot(
            doc(firestore, "orgs", nextOrgId, "members", signedInUser.uid),
            (snapshot) => {
              if (!snapshot.exists()) {
                setMember(null)
                setStatus("no-member")
                return
              }

              setMember(normalizeMember(snapshot.id, snapshot.data()))
              setStatus("ready")
            },
            (snapshotError) => {
              setMember(null)
              setStatus("no-member")
              setError(snapshotError.message)
            }
          )
        }

        unsubscribeUserProfile = onSnapshot(
          doc(firestore, "users", signedInUser.uid),
          (snapshot) => {
            const nextOrgId = snapshot.exists() ? String(snapshot.data().defaultOrgId ?? DEFAULT_ORG_ID) : DEFAULT_ORG_ID
            watchMember(nextOrgId || DEFAULT_ORG_ID)
          },
          () => {
            watchMember(DEFAULT_ORG_ID)
          }
        )
      },
      (authError) => {
        setStatus("signed-out")
        setError(authError.message)
      }
    )

    return () => {
      unsubscribeAuth()
      unsubscribeMember()
      unsubscribePlatformAdmin()
      unsubscribeUserProfile()
    }
  }, [fallbackMember])

  const value = useMemo<AuthSession>(() => {
    function can(permission?: PermissionKey) {
      if (!permission) return true
      if (status === "demo") return member?.permissions.includes("*") ?? true
      if (permission === "platform.admin") return platformAdmin
      if (!member || member.status === "Suspended") return false
      return member.permissions.includes("*") || member.permissions.includes(permission)
    }

    function hasAny(permissions: PermissionKey[]) {
      return permissions.some((permission) => can(permission))
    }

    return {
      status,
      user,
      member,
      orgId,
      platformAdmin,
      configured: Boolean(firebaseConfigured && auth && db),
      error,
      can,
      hasAny,
      signOut: async () => {
        if (!auth) return
        await signOut(auth)
      }
    }
  }, [error, member, orgId, platformAdmin, status, user])

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>
}

export function useAuthSession() {
  const session = useContext(AuthSessionContext)
  if (!session) {
    throw new Error("useAuthSession must be used inside AuthSessionProvider.")
  }

  return session
}
