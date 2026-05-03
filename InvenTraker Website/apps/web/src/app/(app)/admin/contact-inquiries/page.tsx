"use client"

import { useQuery } from "@tanstack/react-query"
import { AppCard } from "@inventracker/ui"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchContactInquiries } from "@/lib/data/firestore"

export default function AdminContactInquiriesPage() {
  const { canViewAdmin } = useOrgContext()
  const { data: rows = [] } = useQuery({
    queryKey: ["admin-contact-inquiries"],
    queryFn: fetchContactInquiries,
    enabled: canViewAdmin
  })

  if (!canViewAdmin) {
    return (
      <div>
        <PageHead title="Contact Inquiries" subtitle="Platform Admin only." />
        <AppCard>
          <p className="secondary-text">Access denied.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead title="Contact Inquiries" subtitle="Messages submitted from the public contact form." />
      <AppCard>
        <div className="space-y-3">
          {rows.length === 0 ? <p className="secondary-text">No inquiries yet.</p> : null}
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-app-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{row.subject}</p>
                  <p className="mt-1 text-xs text-app-muted">From: {row.email}</p>
                </div>
                <span className="rounded-full border border-app-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-app-muted">{row.status}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-app-muted">{row.content}</p>
            </div>
          ))}
        </div>
      </AppCard>
    </div>
  )
}
