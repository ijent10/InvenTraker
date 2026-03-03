"use client"

import { useQuery } from "@tanstack/react-query"
import { AppCard } from "@inventracker/ui"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchFeatureRequests } from "@/lib/data/firestore"

export default function AdminFeatureRequestsPage() {
  const { canViewAdmin } = useOrgContext()
  const { data: rows = [] } = useQuery({
    queryKey: ["admin-feature-requests"],
    queryFn: fetchFeatureRequests,
    enabled: canViewAdmin
  })

  if (!canViewAdmin) {
    return (
      <div>
        <PageHead title="Feature Requests" subtitle="Platform Admin only." />
        <AppCard>
          <p className="secondary-text">Access denied.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead title="Feature Requests" subtitle="Incoming requests from user settings." />
      <AppCard>
        <div className="space-y-3">
          {rows.length === 0 ? <p className="secondary-text">No requests yet.</p> : null}
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-app-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{row.title}</p>
                  <p className="mt-1 text-sm text-app-muted whitespace-pre-wrap">{row.content}</p>
                </div>
                <span className="rounded-full border border-app-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-app-muted">{row.status}</span>
              </div>
              <p className="mt-2 text-xs text-app-muted">{row.email ?? row.uid ?? "anonymous"}</p>
            </div>
          ))}
        </div>
      </AppCard>
    </div>
  )
}
