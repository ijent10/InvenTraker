"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppCard, AppSelect } from "@inventracker/ui"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  fetchFeatureRequests,
  fetchPublicSiteContent,
  updateFeatureRequestStatus
} from "@/lib/data/firestore"

export default function AdminFeatureRequestsPage() {
  const { canViewAdmin } = useOrgContext()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")

  const { data: rows = [] } = useQuery({
    queryKey: ["admin-feature-requests"],
    queryFn: fetchFeatureRequests,
    enabled: canViewAdmin
  })
  const { data: siteContent } = useQuery({
    queryKey: ["admin-feature-request-categories"],
    queryFn: fetchPublicSiteContent,
    enabled: canViewAdmin
  })
  const categoryOptions = useMemo(() => {
    const defaults = ["workflow", "inventory", "analytics", "account", "other"]
    return siteContent?.featureRequestCategories?.length ? siteContent.featureRequestCategories : defaults
  }, [siteContent?.featureRequestCategories])

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const byStatus = statusFilter === "all" ? true : row.status === statusFilter
        const byCategory = categoryFilter === "all" ? true : (row.category ?? "other") === categoryFilter
        return byStatus && byCategory
      }),
    [categoryFilter, rows, statusFilter]
  )

  const updateStatusMutation = useMutation({
    mutationFn: (input: { id: string; status: "new" | "planned" | "shipped" | "closed" }) =>
      updateFeatureRequestStatus(input.id, input.status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-feature-requests"] })
    }
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
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <AppSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="new">New</option>
            <option value="planned">Planned</option>
            <option value="shipped">Shipped</option>
            <option value="closed">Closed</option>
          </AppSelect>
          <AppSelect value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </AppSelect>
        </div>

        <div className="space-y-3">
          {filteredRows.length === 0 ? <p className="secondary-text">No requests yet.</p> : null}
          {filteredRows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-app-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{row.title}</p>
                  <p className="mt-1 text-sm text-app-muted whitespace-pre-wrap">{row.content}</p>
                </div>
                <span className="rounded-full border border-app-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-app-muted">{row.status}</span>
              </div>
              <div className="mt-2 grid gap-1 text-xs text-app-muted">
                <p>
                  Category: <span className="text-app-text">{row.category ?? "other"}</span> · Source:{" "}
                  <span className="text-app-text">{row.source ?? "unknown"}</span>
                </p>
                <p>
                  Submitted by:{" "}
                  <span className="text-app-text">
                    {row.createdByName ?? row.email ?? row.uid ?? "anonymous"}
                  </span>
                  {row.createdByEmployeeId ? ` · Employee ID ${row.createdByEmployeeId}` : ""}
                  {row.createdByRole ? ` · Role ${row.createdByRole}` : ""}
                  {row.createdByIsOwner ? " · Owner" : ""}
                </p>
                <p>
                  Org: <span className="text-app-text">{row.organizationName ?? row.organizationId ?? "n/a"}</span>
                  {row.storeId ? ` · Store ${row.storeId}` : ""}
                </p>
              </div>
              <div className="mt-3">
                <AppSelect
                  value={row.status}
                  onChange={(event) => {
                    void updateStatusMutation.mutateAsync({
                      id: row.id,
                      status: event.target.value as "new" | "planned" | "shipped" | "closed"
                    })
                  }}
                >
                  <option value="new">new</option>
                  <option value="planned">planned</option>
                  <option value="shipped">shipped</option>
                  <option value="closed">closed</option>
                </AppSelect>
              </div>
            </div>
          ))}
        </div>
      </AppCard>
    </div>
  )
}
