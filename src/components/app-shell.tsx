"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { doc, onSnapshot } from "firebase/firestore"
import { KeyRound, ShieldAlert, UserCircle } from "lucide-react"

import { BetaOwnerActivation } from "@/components/beta-owner-activation"
import { GlobalSearch } from "@/components/global-search"
import { NotificationBell } from "@/components/notification-bell"
import { AuthSessionProvider, useAuthSession } from "@/lib/auth-session"
import { employees, organizationBranding, type Employee, type OrganizationBranding, type WorkspaceNotification } from "@/lib/demo-data"
import { isPublicPath, navigation, requiredPermissionForPath } from "@/lib/navigation"
import { readCloudWorkspacePreferences } from "@/lib/cloud-preferences"
import { applyTipsPreference, readStoredTipsPreference, TIPS_EVENT } from "@/lib/tips"
import { applyAndStoreAppTheme, applyAppTheme, readStoredAppTheme } from "@/lib/theme"
import { db } from "@/lib/firebase"

export function AppShell({
  children,
  initialBranding = organizationBranding,
  initialEmployee,
  notifications = []
}: {
  children: React.ReactNode
  initialBranding?: OrganizationBranding
  initialEmployee?: Employee
  notifications?: WorkspaceNotification[]
}) {
  return (
    <AuthSessionProvider fallbackMember={initialEmployee}>
      <AppShellContent initialBranding={initialBranding} initialEmployee={initialEmployee} notifications={notifications}>
        {children}
      </AppShellContent>
    </AuthSessionProvider>
  )
}

function resolveBranding(data: Record<string, unknown>): Partial<OrganizationBranding> {
  const nestedBranding = data.branding && typeof data.branding === "object" ? (data.branding as Partial<OrganizationBranding>) : {}
  const source = { ...data, ...nestedBranding } as Record<string, unknown>

  return {
    companyName: typeof source.companyName === "string" ? source.companyName : undefined,
    logoUrl: typeof source.logoUrl === "string" ? source.logoUrl : undefined,
    headerText: typeof source.headerText === "string" ? source.headerText : undefined,
    accentColor: typeof source.accentColor === "string" ? source.accentColor : undefined,
    secondaryColor: typeof source.secondaryColor === "string" ? source.secondaryColor : undefined,
    defaultMode: source.defaultMode === "Light" || source.defaultMode === "System" || source.defaultMode === "Dark" ? source.defaultMode : undefined,
    defaultTheme: typeof source.defaultTheme === "string" ? source.defaultTheme : undefined
  }
}

function BrandLogo({ src, size }: { src?: string; size: number }) {
  const fallbackSrc = "/inventracker-mark.svg"
  const [failedSrc, setFailedSrc] = useState("")
  const safeSrc = src && src !== failedSrc ? src : fallbackSrc

  return (
    // User-entered organization logos can come from arbitrary approved business URLs.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={safeSrc}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-md object-contain"
      style={{ width: size, height: size }}
      onError={() => setFailedSrc(safeSrc)}
    />
  )
}

function AppShellContent({
  children,
  initialBranding = organizationBranding,
  initialEmployee,
  notifications = []
}: {
  children: React.ReactNode
  initialBranding?: OrganizationBranding
  initialEmployee?: Employee
  notifications?: WorkspaceNotification[]
}) {
  const pathname = usePathname()
  const session = useAuthSession()
  const [liveBranding, setLiveBranding] = useState(initialBranding)
  const visibleNavigation = navigation.filter((item) => session.can(item.permission))
  const currentEmployee = session.member ?? initialEmployee ?? employees[0]
  const isPublicRoute = isPublicPath(pathname)
  const storeNavLabel = currentEmployee?.store && currentEmployee.store !== "All stores" ? "Store" : "Stores"
  const routePermission = requiredPermissionForPath(pathname)
  const bootstrapAdminCanClaim = routePermission === "platform.admin" && session.user?.email?.toLowerCase() === "ianjjent@icloud.com"
  const routeAllowed = !routePermission || session.can(routePermission) || bootstrapAdminCanClaim

  useEffect(() => {
    setLiveBranding(initialBranding)
  }, [initialBranding])

  useEffect(() => {
    if (!db || isPublicRoute || !session.orgId || session.status !== "ready") return undefined

    return onSnapshot(doc(db, "orgs", session.orgId), (snapshot) => {
      if (!snapshot.exists()) return
      const savedBranding = resolveBranding(snapshot.data())
      setLiveBranding((current) => ({ ...current, ...savedBranding }))
    })
  }, [isPublicRoute, session.orgId, session.status])

  useEffect(() => {
    function refreshTheme() {
      applyAppTheme(readStoredAppTheme())
    }

    function refreshTips() {
      applyTipsPreference(readStoredTipsPreference())
    }

    refreshTheme()
    refreshTips()
    readCloudWorkspacePreferences()
      .then((preferences) => {
        if (preferences?.theme) applyAndStoreAppTheme(preferences.theme)
        if (typeof preferences?.showTips === "boolean") applyTipsPreference(preferences.showTips)
      })
      .catch(() => {
        refreshTheme()
        refreshTips()
      })
    window.addEventListener("storage", refreshTheme)
    window.addEventListener("storage", refreshTips)
    window.addEventListener(TIPS_EVENT, refreshTips)
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    mediaQuery.addEventListener("change", refreshTheme)

    return () => {
      window.removeEventListener("storage", refreshTheme)
      window.removeEventListener("storage", refreshTips)
      window.removeEventListener(TIPS_EVENT, refreshTips)
      mediaQuery.removeEventListener("change", refreshTheme)
    }
  }, [])

  if (isPublicRoute) {
    return <>{children}</>
  }

  if (session.configured && session.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4 text-[var(--app-text)]">
        <div className="w-full max-w-md rounded-panel border border-[var(--app-border)] bg-[var(--app-panel)] p-5 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[var(--app-control-border)] border-t-[var(--app-accent)]" />
          <h1 className="mt-4 font-semibold">Checking access</h1>
          <p className="mt-2 text-sm text-[var(--app-muted)]">Loading Firebase Auth and membership permissions.</p>
        </div>
      </div>
    )
  }

  if (session.configured && session.status === "signed-out") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4 text-[var(--app-text)]">
        <div className="w-full max-w-md rounded-panel border border-[var(--app-border)] bg-[var(--app-panel)] p-5 text-center">
          <KeyRound className="mx-auto h-8 w-8 text-[var(--app-accent)]" />
          <h1 className="mt-4 text-xl font-semibold">Sign in required</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">Sign in before testing synced data and permission-scoped access.</p>
          <a
            href="/signin"
            className="mt-5 inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--app-accent)] bg-[var(--app-accent)] px-4 py-2 text-sm font-semibold text-[var(--app-on-accent)]"
          >
            Sign in
          </a>
        </div>
      </div>
    )
  }

  if (session.configured && session.status === "no-member") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4 text-[var(--app-text)]">
        <div className="w-full max-w-lg rounded-panel border border-[var(--app-border)] bg-[var(--app-panel)] p-5 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-amber-300" />
          <h1 className="mt-4 text-xl font-semibold">No organization access</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
            This Firebase user is signed in, but there is no member record for this organization yet. Seed the user or prepare the owner workspace.
          </p>
          {session.error ? <p className="mt-3 text-xs font-semibold text-rose-300">{session.error}</p> : null}
          <BetaOwnerActivation />
          <a
            href="/signin"
            className="mt-5 inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] px-4 py-2 text-sm font-semibold text-[var(--app-control-text)]"
          >
            Open sign in setup
          </a>
        </div>
      </div>
    )
  }

  if (!routeAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4 text-[var(--app-text)]">
        <div className="w-full max-w-lg rounded-panel border border-[var(--app-border)] bg-[var(--app-panel)] p-5 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-rose-300" />
          <h1 className="mt-4 text-xl font-semibold">Access denied</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
            Your current member record does not include <span className="font-semibold text-[var(--app-text)]">{routePermission}</span>.
          </p>
          <a
            href="/dashboard"
            className="mt-5 inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] px-4 py-2 text-sm font-semibold text-[var(--app-control-text)]"
          >
            Back to dashboard
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--app-bg)] text-[var(--app-text)]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-[var(--app-border)] bg-[var(--app-panel-strong)] px-4 py-5 lg:flex">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-3">
          <Image src="/inventracker-mark.svg" alt="" width={40} height={40} />
          <div className="min-w-0">
            <p className="text-base font-semibold">InvenTracker</p>
            <p className="text-xs text-[var(--app-muted)]">Inventory operations</p>
          </div>
        </Link>

        <nav className="mt-8 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {visibleNavigation.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--app-accent)] text-[var(--app-on-accent)]"
                    : "text-[var(--app-muted)] hover:bg-[var(--app-control-bg-hover)] hover:text-[var(--app-text)]"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{item.href === "/stores" ? storeNavLabel : item.label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="min-w-0 overflow-x-hidden lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-[var(--app-border)] bg-[var(--app-panel-strong)] backdrop-blur">
          <div className="grid min-h-20 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/dashboard" className="flex shrink-0 items-center gap-2 lg:hidden">
                <Image src="/inventracker-mark.svg" alt="" width={36} height={36} />
                <span className="hidden font-semibold sm:inline">InvenTracker</span>
              </Link>
              <GlobalSearch className="hidden w-full max-w-xs md:flex xl:w-80 xl:max-w-[30vw]" />
            </div>

            <Link href="/organization" className="flex min-w-0 flex-col items-center justify-center text-center">
              <BrandLogo src={liveBranding.logoUrl} size={36} />
              <span className="mt-1 max-w-[36vw] truncate text-sm font-semibold text-[var(--app-text)] sm:max-w-sm">{liveBranding.companyName}</span>
              {liveBranding.headerText ? (
                <span className="hidden max-w-[32vw] truncate text-xs text-[var(--app-muted)] sm:block">{liveBranding.headerText}</span>
              ) : null}
            </Link>

            <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
              <NotificationBell notifications={notifications} />
              <Link
                href="/account"
                className="flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-md border border-[var(--app-control-border)] px-2 text-[var(--app-muted)] transition hover:bg-[var(--app-control-bg-hover)] hover:text-[var(--app-text)] sm:px-3"
              >
                <UserCircle className="h-4 w-4" />
                <span className="hidden max-w-32 truncate text-sm font-semibold md:inline">{currentEmployee?.name ?? session.user?.email ?? "Account"}</span>
              </Link>
            </div>
          </div>

          <div className="border-t border-[var(--app-border)] px-3 pb-3 md:hidden">
            <GlobalSearch className="flex w-full" />
          </div>

          <nav className="flex max-w-full gap-1 overflow-x-auto border-t border-[var(--app-border)] px-3 py-2 lg:hidden">
            {visibleNavigation.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold ${
                    active ? "bg-[var(--app-accent)] text-[var(--app-on-accent)]" : "text-[var(--app-muted)]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.href === "/stores" ? storeNavLabel : item.label}
                </Link>
              )
            })}
          </nav>
        </header>

        <main className="mx-auto min-w-0 max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
