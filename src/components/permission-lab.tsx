"use client"

import { ShieldCheck, ShieldX } from "lucide-react"

import { Panel, StatusPill } from "@/components/ui"
import { navigation } from "@/lib/navigation"
import { permissionGroups, type PermissionKey } from "@/lib/permissions"
import { useAuthSession } from "@/lib/auth-session"

const seededUsers = [
  ["owner@inventracker.test", "Owner", "Full organization control"],
  ["manager@inventracker.test", "Store Manager", "Inventory, orders, health checks, history, employees view"],
  ["inventory@inventracker.test", "Inventory Lead", "Inventory and health completion only"],
  ["orders@inventracker.test", "Order Clerk", "Orders and vendors only"],
  ["viewer@inventracker.test", "Viewer", "Read-only dashboard and insights"],
  ["suspended@inventracker.test", "Suspended", "Should be blocked by session status"]
]

export function PermissionLab() {
  const session = useAuthSession()
  const memberPermissions = session.member?.permissions ?? []

  return (
    <div className="grid gap-6">
      <Panel className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[var(--app-text)]">Current signed-in access</h2>
            <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">
              This reads the live Firebase Auth user and the member record at orgs/demo-org/members/uid.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={session.status === "ready" || session.status === "demo" ? "green" : "amber"}>{session.status}</StatusPill>
            {session.platformAdmin ? <StatusPill tone="blue">Platform admin</StatusPill> : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Email", session.user?.email ?? "Demo mode"],
            ["Member", session.member?.name ?? "No member"],
            ["Role/title", session.member?.jobTitle ?? "Not set"],
            ["Store", session.member?.store ?? "Not set"]
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
              <p className="text-xs font-semibold uppercase text-[var(--app-subtle)]">{label}</p>
              <p className="mt-1 font-semibold text-[var(--app-text)]">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {memberPermissions.length > 0 ? (
            memberPermissions.map((permission) => <StatusPill key={permission}>{permission === "*" ? "All permissions" : permission}</StatusPill>)
          ) : (
            <StatusPill tone="amber">No permissions loaded</StatusPill>
          )}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel className="p-4">
          <h2 className="font-semibold text-[var(--app-text)]">Navigation access</h2>
          <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">
            These are the sidebar tabs this signed-in user should be able to see or reach directly.
          </p>
          <div className="mt-4 grid gap-2">
            {navigation.map((item) => {
              const allowed = session.can(item.permission)
              const Icon = allowed ? ShieldCheck : ShieldX

              return (
                <div key={item.href} className="flex items-center justify-between gap-3 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
                  <div className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 ${allowed ? "text-emerald-300" : "text-rose-300"}`} />
                    <div>
                      <p className="text-sm font-semibold text-[var(--app-text)]">{item.label}</p>
                      <p className="text-xs text-[var(--app-muted)]">{item.permission ?? "No permission required"}</p>
                    </div>
                  </div>
                  <StatusPill tone={allowed ? "green" : "red"}>{allowed ? "Allowed" : "Denied"}</StatusPill>
                </div>
              )
            })}
          </div>
        </Panel>

        <Panel className="p-4">
          <h2 className="font-semibold text-[var(--app-text)]">Seeded test users</h2>
          <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">
            Run the seed script, then sign in as each user from /signin. Default seed password is configurable.
          </p>
          <div className="mt-4 grid gap-3">
            {seededUsers.map(([email, role, detail]) => (
              <div key={email} className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
                <p className="text-sm font-semibold text-[var(--app-text)]">{role}</p>
                <p className="mt-1 text-xs font-semibold text-[var(--app-accent)]">{email}</p>
                <p className="mt-1 text-sm leading-5 text-[var(--app-muted)]">{detail}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="p-4">
        <h2 className="font-semibold text-[var(--app-text)]">Permission matrix</h2>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {permissionGroups.map((group) => (
            <div key={group.id} className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
              <h3 className="font-semibold text-[var(--app-text)]">{group.title}</h3>
              <div className="mt-3 grid gap-2">
                {group.permissions.map((permission) => {
                  const allowed = session.can(permission.key as PermissionKey)
                  return (
                    <div key={permission.key} className="flex items-center justify-between gap-3 text-sm">
                      <span className={allowed ? "text-[var(--app-text)]" : "text-[var(--app-muted)]"}>{permission.label}</span>
                      <StatusPill tone={allowed ? "green" : "neutral"}>{allowed ? "Yes" : "No"}</StatusPill>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
