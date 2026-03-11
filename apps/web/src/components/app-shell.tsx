"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Home,
  Box,
  Clock3,
  Trash2,
  ShoppingCart,
  ListTodo,
  ChartColumn,
  Factory,
  BookOpenText,
  Store,
  Users,
  Settings,
  Shield,
  Building2,
  ChevronDown,
  Bell,
  ClipboardList,
  ScanLine
} from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { AuthRequired } from "@/components/auth-required"
import { OrgOnboardingGate } from "@/components/org-onboarding-gate"
import { PlanRequiredGate } from "@/components/plan-required-gate"
import { useOrgContext } from "@/hooks/use-org-context"
import { useAuthUser } from "@/hooks/use-auth-user"
import { roleModules, type AppModule } from "@/lib/rbac/modules"
import { ensureProfile } from "@/lib/firebase/functions"
import {
  fetchExpirationEntries,
  fetchOrgSettings,
  fetchOrgTodo,
  fetchOrganizationBillingStatus,
  isProTierBilling,
  fetchStoreInventoryItems,
  fetchPreferenceProfile,
  formatStoreLabel
} from "@/lib/data/firestore"
import { AppButton, appButtonClass } from "@inventracker/ui"

const nav: Array<{ href: string; label: string; icon: (typeof Home); module: AppModule }> = [
  { href: "/app", label: "Dashboard", icon: Home, module: "dashboard" },
  { href: "/app/inventory", label: "Inventory", icon: Box, module: "inventory" },
  { href: "/app/spot-check", label: "Spot Check", icon: ScanLine, module: "inventory" },
  { href: "/app/health-checks", label: "Health Checks", icon: ClipboardList, module: "healthChecks" },
  { href: "/app/expiration", label: "Expiration", icon: Clock3, module: "expiration" },
  { href: "/app/waste", label: "Waste", icon: Trash2, module: "waste" },
  { href: "/app/orders", label: "Orders", icon: ShoppingCart, module: "orders" },
  { href: "/app/todo", label: "To-Do", icon: ListTodo, module: "todo" },
  { href: "/app/notifications", label: "Notifications", icon: Bell, module: "notifications" },
  { href: "/app/insights", label: "Insights", icon: ChartColumn, module: "insights" },
  { href: "/app/production", label: "Production", icon: Factory, module: "production" },
  { href: "/app/howtos", label: "How-To Library", icon: BookOpenText, module: "howtos" },
  { href: "/app/stores", label: "Stores", icon: Store, module: "stores" },
  { href: "/app/users", label: "Users", icon: Users, module: "users" },
  { href: "/app/org-settings", label: "Organization Settings", icon: Building2, module: "orgSettings" },
  { href: "/app/store-settings", label: "Store Settings", icon: Settings, module: "storeSettings" }
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const { user } = useAuthUser()
  const {
    loading,
    storesLoading,
    orgs,
    stores,
    activeOrg,
    activeStore,
    activeOrgId,
    activeStoreId,
    setActiveOrgId,
    setActiveStoreId,
    canViewAdmin,
    role,
    error,
    effectivePermissions
  } =
    useOrgContext()
  const [showOrgMenu, setShowOrgMenu] = useState(false)
  const [showStoreMenu, setShowStoreMenu] = useState(false)
  const [showNotificationsMenu, setShowNotificationsMenu] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const shouldLoadNotificationDetails = showNotificationsMenu || pathname === "/app/notifications"

  const allowed = new Set(roleModules[role] ?? [])
  const visibleNav = nav.filter((item) => {
    if (!allowed.has(item.module)) return false
    if (item.module === "dashboard") return effectivePermissions.viewDashboard
    if (item.module === "inventory") return effectivePermissions.viewInventory
    if (item.href === "/app/spot-check") return effectivePermissions.appSpotCheck
    if (item.module === "healthChecks") return effectivePermissions.viewHealthChecks
    if (item.module === "expiration") return effectivePermissions.viewExpiration
    if (item.module === "waste") return effectivePermissions.viewWaste
    if (item.module === "orders") return effectivePermissions.viewOrders
    if (item.module === "todo") return effectivePermissions.viewTodo
    if (item.module === "notifications") return effectivePermissions.viewNotifications
    if (item.module === "insights") return effectivePermissions.viewInsights
    if (item.module === "production") return effectivePermissions.viewProduction
    if (item.module === "howtos") return effectivePermissions.viewHowTos
    if (item.module === "stores") return effectivePermissions.viewStores
    if (item.module === "users") return effectivePermissions.viewUsers
    if (item.module === "orgSettings") return effectivePermissions.manageOrgSettings
    if (item.module === "storeSettings") return effectivePermissions.manageStoreSettings
    return true
  })
  const bottomNav = visibleNav.filter((item) =>
    ["/app", "/app/inventory", "/app/orders", "/app/todo", "/app/insights"].includes(item.href)
  )
  const activeStoreLabel = activeStore ? formatStoreLabel(activeStore) : "No store"
  const activeOrgLabel = activeOrg?.organizationName ?? "No organization"
  const storeOptions = useMemo(() => stores.map((store) => ({ id: store.id, label: formatStoreLabel(store) })), [stores])

  const { data: billingStatus, isLoading: billingLoading } = useQuery({
    queryKey: ["org-billing-status", activeOrgId],
    queryFn: () => fetchOrganizationBillingStatus(activeOrgId),
    enabled: Boolean(activeOrgId),
    staleTime: 20_000
  })
  const { data: orgSettings } = useQuery({
    queryKey: ["shell-org-settings", activeOrgId],
    queryFn: () => fetchOrgSettings(activeOrgId),
    enabled: Boolean(activeOrgId),
    staleTime: 20_000
  })

  const { data: todoRows = [] } = useQuery({
    queryKey: ["shell-notifications-todo", activeOrgId, activeStoreId],
    queryFn: () => fetchOrgTodo(activeOrgId, activeStoreId || undefined),
    enabled: Boolean(activeOrgId),
    staleTime: 45_000,
    refetchOnWindowFocus: false
  })

  const { data: expiringRows = [] } = useQuery({
    queryKey: ["shell-notifications-expiring", activeOrgId, activeStoreId],
    queryFn: () => fetchExpirationEntries(activeOrgId, activeStoreId || undefined, 3),
    enabled: Boolean(activeOrgId),
    staleTime: 45_000,
    refetchOnWindowFocus: false
  })

  const { data: inventoryRows = [] } = useQuery({
    queryKey: ["shell-notifications-inventory", activeOrgId, activeStoreId],
    queryFn: () => (activeStoreId ? fetchStoreInventoryItems(activeOrgId, activeStoreId) : Promise.resolve([])),
    enabled: Boolean(activeOrgId && activeStoreId && shouldLoadNotificationDetails),
    staleTime: 120_000,
    refetchOnWindowFocus: false
  })

  const notifications = useMemo(() => {
    const todoNotifications = todoRows.slice(0, 8).map((row) => ({
      id: `todo-${row.id}`,
      title: row.title,
      subtitle: row.status === "done" ? "Completed" : "Task due",
      href:
        row.title.toLowerCase().includes("order")
          ? "/app/orders"
          : row.title.toLowerCase().includes("expire")
            ? "/app/expiration"
            : row.title.toLowerCase().includes("waste")
              ? "/app/waste"
              : "/app/todo"
    }))

    const expiringNotifications = expiringRows.slice(0, 6).map((row, index) => ({
      id: `exp-${row.itemId}-${index}`,
      title: `${row.itemName} expires ${row.isExpired ? "soon" : `in ${row.daysUntilExpiration} day(s)`}`,
      subtitle: `${row.quantity.toFixed(3)} ${row.unit}`,
      href: "/app/expiration"
    }))

    const lowStockNotifications = inventoryRows
      .filter((row) => row.totalQuantity < row.minimumQuantity)
      .slice(0, 6)
      .map((row) => ({
        id: `low-${row.id}`,
        title: `Low stock: ${row.name}`,
        subtitle: `${row.totalQuantity.toFixed(3)} / min ${row.minimumQuantity.toFixed(3)} ${row.unit}`,
        href: "/app/orders"
      }))

    return [...todoNotifications, ...expiringNotifications, ...lowStockNotifications].slice(0, 20)
  }, [expiringRows, inventoryRows, todoRows])

  const storeScopedQueryPrefixes = useMemo(
    () =>
      new Set([
        "items",
        "item",
        "expiration",
        "expiration-entries",
        "org-todo",
        "todo-expiring",
        "todo-items",
        "org-orders",
        "orders",
        "waste-records",
        "insights",
        "financial-health",
        "store-inventory-items",
        "store-overview-financial-health",
        "shell-notifications-todo",
        "shell-notifications-expiring",
        "shell-notifications-inventory",
        "howtos",
        "notifications",
        "production-items",
        "production-products",
        "production-ingredients",
        "production-runs",
        "production-spotchecks"
      ]),
    []
  )

  const invalidateStoreScopedQueries = useCallback(() => {
    void queryClient.invalidateQueries({
      predicate: (entry) => {
        if (!Array.isArray(entry.queryKey)) return false
        const prefix = entry.queryKey[0]
        return typeof prefix === "string" && storeScopedQueryPrefixes.has(prefix)
      }
    })
  }, [queryClient, storeScopedQueryPrefixes])

  useEffect(() => {
    if (!activeOrgId) return
    invalidateStoreScopedQueries()
  }, [activeOrgId, activeStoreId, invalidateStoreScopedQueries])

  useEffect(() => {
    const syncWebProfile = async () => {
      if (!user || !activeOrgId) {
        document.documentElement.dataset.showTips = "true"
        return
      }
      const tipsStorageKey = `web_show_tips_${user.uid}_${activeOrgId}`
      const cachedTips = localStorage.getItem(tipsStorageKey)
      if (cachedTips === "true" || cachedTips === "false") {
        document.documentElement.dataset.showTips = cachedTips
      }
      try {
        await ensureProfile({ userId: user.uid, orgId: activeOrgId, platform: "WEB" })
        const profile = await fetchPreferenceProfile(user.uid, activeOrgId, "WEB")
        if (!profile) return

        const theme = profile.theme === "system" ? "dark" : profile.theme
        document.documentElement.dataset.theme = theme
        document.documentElement.style.setProperty("--accent", profile.accentColor)
        document.documentElement.style.setProperty("--accent-strong", profile.accentColor)
        document.documentElement.classList.toggle("bold-text", profile.boldText)
        document.documentElement.dataset.showTips = profile.showTips ? "true" : "false"
        localStorage.setItem(tipsStorageKey, profile.showTips ? "true" : "false")
      } catch {
        if (!document.documentElement.dataset.showTips) {
          document.documentElement.dataset.showTips = "true"
        }
      }
    }

    void syncWebProfile()
  }, [activeOrgId, user])

  const isNavActive = (href: string) => {
    if (href === "/app") {
      return pathname === "/app"
    }
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  if (loading || storesLoading || (activeOrgId && billingLoading)) {
    return (
      <AuthRequired>
        <div className="p-10 text-sm text-app-muted">Loading workspace…</div>
      </AuthRequired>
    )
  }

  if (user && orgs.length === 0) {
    return (
      <AuthRequired>
        <OrgOnboardingGate userId={user.uid} />
      </AuthRequired>
    )
  }

  const normalizedSubscriptionStatus = (billingStatus?.subscriptionStatus ?? "inactive").trim().toLowerCase()
  const hasActiveSubscription =
    normalizedSubscriptionStatus === "active" || normalizedSubscriptionStatus === "trialing"
  const needsPlan = Boolean(activeOrgId) && !hasActiveSubscription
  const canManageBilling = Boolean(effectivePermissions.manageBilling || effectivePermissions.manageOrgSettings)
  const currentTheme =
    typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark"
  const preferredBrandLogoUrl =
    currentTheme === "light"
      ? orgSettings?.logoLightUrl || orgSettings?.brandLogoUrl || orgSettings?.logoDarkUrl
      : orgSettings?.logoDarkUrl || orgSettings?.brandLogoUrl || orgSettings?.logoLightUrl
  const hasBrandLogo = Boolean(preferredBrandLogoUrl)
  const proBrandingEnabled =
    isProTierBilling(billingStatus) &&
    Boolean(orgSettings?.customBrandingEnabled) &&
    Boolean(orgSettings?.replaceAppNameWithLogo) &&
    hasBrandLogo
  const sidebarBrandName =
    orgSettings?.brandDisplayName?.trim() || activeOrg?.organizationName?.trim() || "InvenTraker"
  const showIconOnlyBranding = orgSettings?.appHeaderStyle === "icon_only"

  if (needsPlan && activeOrgId) {
    return (
      <AuthRequired>
        <PlanRequiredGate
          orgId={activeOrgId}
          canManageBilling={canManageBilling}
          organizationName={activeOrg?.organizationName}
        />
      </AuthRequired>
    )
  }

  return (
    <AuthRequired>
      <div className="min-h-screen md:grid md:grid-cols-[280px_1fr]">
        <aside className="hidden border-r border-app-border bg-app-surface p-6 md:block">
          <div className="mb-6">
            {proBrandingEnabled && preferredBrandLogoUrl ? (
              <div className={`flex items-center gap-3 ${showIconOnlyBranding ? "" : "min-h-[52px]"}`}>
                <img
                  src={preferredBrandLogoUrl}
                  alt={`${sidebarBrandName} logo`}
                  className="h-12 w-auto max-w-[220px] rounded-xl border border-app-border bg-white object-contain p-2"
                />
                {!showIconOnlyBranding ? <p className="text-lg font-semibold">{sidebarBrandName}</p> : null}
              </div>
            ) : (
              <p className="text-2xl font-semibold">InvenTraker</p>
            )}
          </div>
          <nav className="space-y-2">
            {visibleNav.map((item) => {
              const active = isNavActive(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    active
                      ? "border border-app-border bg-app-surface-soft text-app-text"
                      : "text-app-muted hover:bg-app-surface-soft"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
            {canViewAdmin ? (
              <Link
                href="/admin"
                className="mt-2 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-app-muted hover:bg-app-surface-soft"
              >
                <Shield className="h-4 w-4" />
                Admin Console
              </Link>
            ) : null}
          </nav>
        </aside>

        <main>
          <header className="sticky top-0 z-20 border-b border-app-border bg-app-surface px-4 py-3 md:px-8">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div></div>
              <div className="relative">
                <AppButton
                  variant="secondary"
                  disabled={orgs.length <= 1}
                  onClick={() => {
                    setShowStoreMenu(false)
                    setShowUserMenu(false)
                    setShowOrgMenu((current) => !current)
                  }}
                  className="mx-auto !h-9 max-w-[360px] gap-2 truncate px-4 !py-2 text-center"
                >
                  <span className="truncate">{activeOrgLabel}</span>
                  {orgs.length > 1 ? <ChevronDown className="h-4 w-4" /> : null}
                </AppButton>
                {showOrgMenu && orgs.length > 1 ? (
                  <div className="absolute left-1/2 top-11 z-40 w-80 -translate-x-1/2 rounded-2xl border border-app-border bg-app-surface p-2 shadow-card">
                    {orgs.map((org) => (
                      <AppButton
                        key={org.organizationId}
                        variant="secondary"
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${
                          org.organizationId === activeOrgId
                            ? "border border-app-border bg-app-surface-soft text-app-text"
                            : "text-app-muted hover:bg-app-surface-soft"
                        }`}
                        onClick={() => {
                          setActiveOrgId(org.organizationId)
                          setActiveStoreId("")
                          invalidateStoreScopedQueries()
                          setShowOrgMenu(false)
                        }}
                      >
                        <span className="truncate">{org.organizationName}</span>
                        <span className="text-xs uppercase">{org.role}</span>
                      </AppButton>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center justify-end gap-2">
                <div className="relative">
                  <AppButton
                    variant="secondary"
                    disabled={storeOptions.length <= 1}
                    onClick={() => {
                      setShowOrgMenu(false)
                      setShowNotificationsMenu(false)
                      setShowUserMenu(false)
                      setShowStoreMenu((current) => !current)
                    }}
                    className="!h-9 max-w-[220px] gap-2 truncate px-3 !py-2"
                  >
                    <span className="truncate">{activeStoreLabel}</span>
                    {storeOptions.length > 1 ? <ChevronDown className="h-4 w-4" /> : null}
                  </AppButton>
                  {showStoreMenu && storeOptions.length > 1 ? (
                    <div className="absolute right-0 top-11 z-40 w-72 rounded-2xl border border-app-border bg-app-surface p-2 shadow-card">
                      {storeOptions.map((store) => (
                        <AppButton
                          key={store.id}
                          variant="secondary"
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${
                            store.id === activeStoreId
                              ? "border border-app-border bg-app-surface-soft text-app-text"
                              : "text-app-muted hover:bg-app-surface-soft"
                          }`}
                          onClick={() => {
                            setActiveStoreId(store.id)
                            invalidateStoreScopedQueries()
                            setShowStoreMenu(false)
                          }}
                        >
                          <span className="truncate">{store.label}</span>
                        </AppButton>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="relative">
                  <AppButton
                    variant="secondary"
                    className="relative !h-9 !w-9 !rounded-full !px-0 !py-0 text-sm font-semibold"
                    onClick={() => {
                      setShowOrgMenu(false)
                      setShowStoreMenu(false)
                      setShowUserMenu(false)
                      setShowNotificationsMenu((current) => !current)
                    }}
                  >
                    <Bell className="h-4 w-4" />
                    {notifications.length > 0 ? (
                      <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-[20px] max-w-[34px] items-center justify-center overflow-hidden rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold leading-none text-white">
                        {notifications.length > 99 ? "99+" : notifications.length}
                      </span>
                    ) : null}
                  </AppButton>
                  {showNotificationsMenu ? (
                    <div className="absolute right-0 top-11 z-40 w-80 rounded-2xl border border-app-border bg-app-surface p-2 shadow-card">
                      <div className="mb-2 border-b border-app-border px-2 pb-2">
                        <p className="text-sm font-semibold">Notifications</p>
                      </div>
                      {notifications.length === 0 ? (
                        <p className="secondary-text px-2 py-3 text-sm">No new notifications.</p>
                      ) : (
                        <div className="max-h-[340px] space-y-1 overflow-auto">
                          {notifications.map((entry) => (
                            <Link
                              key={entry.id}
                              href={entry.href}
                              className="block rounded-xl px-3 py-2 hover:bg-app-surface-soft"
                              onClick={() => setShowNotificationsMenu(false)}
                            >
                              <p className="text-sm font-semibold">{entry.title}</p>
                              <p className="secondary-text text-xs">{entry.subtitle}</p>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="relative">
                  <AppButton
                    variant="secondary"
                    className="!h-9 !w-9 !rounded-full !px-0 !py-0 text-sm font-semibold"
                    onClick={() => {
                      setShowOrgMenu(false)
                      setShowStoreMenu(false)
                      setShowNotificationsMenu(false)
                      setShowUserMenu((current) => !current)
                    }}
                  >
                    {(user?.email?.slice(0, 1) ?? "U").toUpperCase()}
                  </AppButton>
                  {showUserMenu ? (
                    <div className="absolute right-0 top-11 z-30 w-56 rounded-2xl border border-app-border bg-app-surface p-3 shadow-card">
                      <p className="mb-1 text-xs text-app-muted">{user?.email}</p>
                      <p className="mb-3 text-xs text-app-muted">{activeStoreLabel}</p>
                      <Link href="/app/account" className={appButtonClass("secondary", "mb-2 !h-9 !w-full !px-3 !py-2 text-center")}>
                        Profile & Security
                      </Link>
                      <Link href="/app/settings" className={appButtonClass("secondary", "mb-2 !h-9 !w-full !px-3 !py-2 text-center")}>
                        Settings
                      </Link>
                      <Link href="/signout" className={appButtonClass("secondary", "!h-9 !w-full !px-3 !py-2 text-center")}>
                        Sign out
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </header>
          <div
            className="px-4 py-6 pb-24 md:px-8 md:pb-6"
            onClick={() => {
              setShowOrgMenu(false)
              setShowStoreMenu(false)
              setShowNotificationsMenu(false)
              setShowUserMenu(false)
            }}
          >
            {error ? (
              <div className="mb-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}
            {orgs.length === 0 ? (
              <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                No organization membership found for this account yet.
              </div>
            ) : null}
            {children}
          </div>

          <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-app-border bg-app-surface p-2 md:hidden">
            <div className="grid grid-cols-5 gap-2">
              {bottomNav.map((item) => {
                const Icon = item.icon
                const active = isNavActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex flex-col items-center justify-center rounded-xl py-2 text-[11px] font-semibold ${
                      active ? "border border-app-border bg-app-surface-soft text-app-text" : "text-app-muted"
                    }`}
                  >
                    <Icon className="mb-1 h-4 w-4" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </nav>
        </main>
      </div>
    </AuthRequired>
  )
}
