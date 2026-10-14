"use client"

import { useAuthSession } from "@/lib/auth-session"
import { Panel, StatusPill } from "@/components/ui"

export function PersonalAccountIdentity() {
  const session = useAuthSession()
  const member = session.member
  return <Panel className="mb-6 p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-[var(--app-subtle)]">Signed in as</p>
        <h2 className="mt-1 text-xl font-semibold text-[var(--app-text)]">{member?.name || session.user?.email || "Your account"}</h2>
        <p className="mt-1 text-sm text-[var(--app-muted)]">{[member?.jobTitle, member?.department, member?.location].filter(Boolean).join(" · ")}</p>
      </div>
      {member && <StatusPill tone={member.status === "Active" ? "green" : "neutral"}>{member.status}</StatusPill>}
    </div>
  </Panel>
}
