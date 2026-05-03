"use client"

import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"

import {
  fetchStores,
  fetchUserOrganizations,
  permissionCatalog,
  permissionDefaultsForRole,
  type OrgContext
} from "@/lib/data/firestore"
import { listMyOrganizations } from "@/lib/firebase/functions"
import { useAuthUser } from "@/hooks/use-auth-user"

export type StoreContext = {
  id: string
  name: string
  title?: string
  storeNumber?: string
  status: string
  regionId: string
  districtId: string
}

type OrgContextValue = {
  loading: boolean
  storesLoading: boolean
  contextReady: boolean
  error: string | null
  orgs: OrgContext[]
  stores: StoreContext[]
  activeOrg: OrgContext | null
  activeStore: StoreContext | null
  activeOrgId: string
  activeStoreId: string
  setActiveOrgId: Dispatch<SetStateAction<string>>
  setActiveStoreId: Dispatch<SetStateAction<string>>
  role: "Owner" | "Manager" | "Staff"
  canViewAdmin: boolean
  effectivePermissions: Record<string, boolean>
}

const ActiveOrgContext = createContext<OrgContextValue | null>(null)

const activeOrgKey = (uid: string) => `active_org_${uid}`
const activeStoreKey = (uid: string, orgId: string) => `active_store_${uid}_${orgId}`

function useOrgContextState(): OrgContextValue {
  const { user, isPlatformAdmin } = useAuthUser()
  const [orgs, setOrgs] = useState<OrgContext[]>([])
  const [stores, setStores] = useState<StoreContext[]>([])
  const [activeOrgId, setActiveOrgId] = useState("")
  const [activeStoreId, setActiveStoreId] = useState("")
  const [loading, setLoading] = useState(true)
  const [storesLoading, setStoresLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      if (!user) {
        setOrgs([])
        setStores([])
        setActiveOrgId("")
        setActiveStoreId("")
        setError(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const response = await listMyOrganizations({})
        const contexts = (response?.organizations ?? []).map((org) => ({
          ...org,
          departmentIds: "departmentIds" in org && Array.isArray(org.departmentIds) ? org.departmentIds : [],
          locationIds: "locationIds" in org && Array.isArray(org.locationIds) ? org.locationIds : [],
          permissionFlags:
            "permissionFlags" in org && org.permissionFlags && typeof org.permissionFlags === "object"
              ? (org.permissionFlags as Record<string, boolean>)
              : {},
          isPlatformAdmin: response?.isPlatformAdmin ?? isPlatformAdmin
        })) as OrgContext[]
        setOrgs(contexts)
        const storedOrgId = localStorage.getItem(activeOrgKey(user.uid)) ?? ""
        const nextOrg =
          contexts.find((entry) => entry.organizationId === storedOrgId)?.organizationId ??
          contexts[0]?.organizationId ??
          ""
        setActiveOrgId(nextOrg)
      } catch {
        try {
          const fallbackContexts = await fetchUserOrganizations(user.uid)
          setOrgs(fallbackContexts)
          const storedOrgId = localStorage.getItem(activeOrgKey(user.uid)) ?? ""
          const nextOrg =
            fallbackContexts.find((entry) => entry.organizationId === storedOrgId)?.organizationId ??
            fallbackContexts[0]?.organizationId ??
            ""
          setActiveOrgId(nextOrg)
          setError(null)
        } catch {
          setOrgs([])
          setStores([])
          setActiveOrgId("")
          setActiveStoreId("")
          setError("Could not load organization access for this account.")
        }
      }
      setLoading(false)
    }

    void run()
  }, [isPlatformAdmin, user])

  useEffect(() => {
    const loadStoresForOrg = async () => {
      if (!user || !activeOrgId) {
        setStores([])
        setActiveStoreId("")
        setStoresLoading(false)
        return
      }

      setStoresLoading(true)
      const currentOrg = orgs.find((entry) => entry.organizationId === activeOrgId)
      try {
        const allStores = await fetchStores(activeOrgId)
        const assignedStoreIds = currentOrg?.storeIds ?? []
        const filteredStores =
          currentOrg?.role === "Owner"
            ? allStores
            : assignedStoreIds.length > 0
              ? allStores.filter((store) => assignedStoreIds.includes(store.id))
              : []

        const mappedStores = filteredStores.map((store) => ({
          id: store.id,
          name: store.name,
          title: store.title,
          storeNumber: store.storeNumber,
          status: store.status,
          regionId: store.regionId,
          districtId: store.districtId
        }))

        setStores(mappedStores)
        const storedStoreId = localStorage.getItem(activeStoreKey(user.uid, activeOrgId)) ?? ""
        const nextStore = mappedStores.find((entry) => entry.id === storedStoreId)?.id ?? mappedStores[0]?.id ?? ""
        setActiveStoreId(nextStore)
      } catch {
        setStores([])
        setActiveStoreId("")
      } finally {
        setStoresLoading(false)
      }
    }

    void loadStoresForOrg()
  }, [activeOrgId, orgs, user])

  useEffect(() => {
    if (!user || !activeOrgId) return
    localStorage.setItem(activeOrgKey(user.uid), activeOrgId)
  }, [activeOrgId, user])

  useEffect(() => {
    if (!user || !activeStoreId) return
    localStorage.setItem(activeStoreKey(user.uid, activeOrgId), activeStoreId)
  }, [activeOrgId, activeStoreId, user])

  const activeOrg = useMemo(
    () => orgs.find((entry) => entry.organizationId === activeOrgId) ?? null,
    [activeOrgId, orgs]
  )
  const activeStore = useMemo(
    () => stores.find((entry) => entry.id === activeStoreId) ?? null,
    [activeStoreId, stores]
  )
  const role = activeOrg?.role ?? "Staff"
  const canViewAdmin = isPlatformAdmin || orgs.some((entry) => entry.isPlatformAdmin)

  const basePermissions = permissionDefaultsForRole(role)
  const ownerPermissions = Object.fromEntries(permissionCatalog.map((entry) => [entry.key, true])) as Record<string, boolean>
  const effectivePermissions: Record<string, boolean> = role === "Owner" ? ownerPermissions : { ...basePermissions }
  for (const [key, value] of Object.entries(activeOrg?.permissionFlags ?? {})) {
    effectivePermissions[key] = value === true
  }

  return {
    loading,
    storesLoading,
    contextReady: !loading && !storesLoading,
    error,
    orgs,
    stores,
    activeOrg,
    activeStore,
    activeOrgId,
    activeStoreId,
    setActiveOrgId,
    setActiveStoreId,
    role,
    canViewAdmin,
    effectivePermissions
  }
}

export function OrgContextProvider({ children }: { children: React.ReactNode }) {
  const value = useOrgContextState()
  return <ActiveOrgContext.Provider value={value}>{children}</ActiveOrgContext.Provider>
}

export function useOrgContext() {
  const context = useContext(ActiveOrgContext)
  if (!context) {
    throw new Error("useOrgContext must be used inside OrgContextProvider.")
  }
  return context
}
