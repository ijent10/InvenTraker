"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { doc, serverTimestamp, setDoc } from "firebase/firestore"
import { Bell } from "lucide-react"

import type { WorkspaceNotification } from "@/lib/demo-data"
import { db } from "@/lib/firebase"
import { useAuthSession } from "@/lib/auth-session"

function readStorageSet(key: string) {
  if (typeof window === "undefined") return new Set<string>()

  try {
    const stored = window.localStorage.getItem(key)
    return new Set<string>(stored ? (JSON.parse(stored) as string[]) : [])
  } catch {
    return new Set<string>()
  }
}

export function NotificationBell({ notifications }: { notifications: WorkspaceNotification[] }) {
  const session = useAuthSession()
  const [open, setOpen] = useState(false)
  const storageKey = `inventracker.notifications.read.${session.orgId}`
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set(notifications.filter((notification) => notification.read).map((notification) => notification.id)))
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !readIds.has(notification.id)).length,
    [notifications, readIds]
  )

  useEffect(() => {
    setReadIds((current) => {
      const next = new Set(current)
      notifications.forEach((notification) => {
        if (notification.read) next.add(notification.id)
      })
      readStorageSet(storageKey).forEach((notificationId) => next.add(notificationId))
      return next
    })
  }, [notifications, storageKey])

  function storeReadIds(next: Set<string>) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(Array.from(next)))
    } catch {
      // Local persistence is a convenience only. Firestore/local state still handles the visible update.
    }
  }

  function markAsRead(notification: WorkspaceNotification) {
    setReadIds((current) => {
      const next = new Set(current)
      next.add(notification.id)
      storeReadIds(next)
      return next
    })

    if (!db || !session.user || !session.orgId) return

    void setDoc(
      doc(db, "orgs", session.orgId, "notifications", notification.id),
      {
        ...notification,
        read: true,
        readBy: session.user.uid,
        readAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    ).catch(() => {
      // The badge already updates locally; Firestore permissions may vary by role.
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded-md border border-[var(--app-control-border)] text-[var(--app-muted)] transition hover:bg-[var(--app-control-bg-hover)] hover:text-[var(--app-text)]"
      >
        {unreadCount > 0 ? (
          <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        ) : null}
        <Bell className="h-4 w-4" />
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-panel border border-[var(--app-border)] bg-[var(--app-panel-strong)] shadow-2xl shadow-black/30">
          <div className="border-b border-[var(--app-border)] px-4 py-3">
            <p className="font-semibold text-[var(--app-text)]">Notifications</p>
            <p className="text-xs text-[var(--app-muted)]">
              {unreadCount > 0 ? `${unreadCount} missed notification${unreadCount === 1 ? "" : "s"}` : "Nothing missed"}
            </p>
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="font-semibold text-[var(--app-text)]">Nothing to show</p>
              <p className="mt-1 text-sm text-[var(--app-muted)]">You do not have any notifications right now.</p>
            </div>
          ) : (
            <div className="max-h-96 divide-y divide-[var(--app-border)] overflow-y-auto">
              {notifications.map((notification) => (
                <Link
                  key={notification.id}
                  href={notification.href}
                  onClick={() => {
                    markAsRead(notification)
                    setOpen(false)
                  }}
                  className="block px-4 py-3 transition hover:bg-[var(--app-control-bg-hover)]"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1 h-2.5 w-2.5 rounded-full ${readIds.has(notification.id) ? "bg-[var(--app-control-border)]" : "bg-rose-400"}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--app-text)]">{notification.title}</span>
                      <span className="mt-1 block text-sm leading-5 text-[var(--app-muted)]">{notification.detail}</span>
                      <span className="mt-2 block text-xs text-[var(--app-subtle)]">{notification.createdAt}</span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
