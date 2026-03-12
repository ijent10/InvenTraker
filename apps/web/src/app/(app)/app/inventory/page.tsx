"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { AppButton, AppCard, DataTable, SearchInput, SegmentedControl, type TableColumn } from "@inventracker/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  fetchItems,
  fetchItemSubmissions,
  fetchStoreInventoryItems,
  formatStoreLabel,
  reviewItemSubmission,
  type ItemRecord
} from "@/lib/data/firestore"

export default function InventoryPage() {
  const { activeOrgId, activeStoreId, activeOrg, activeStore, role, effectivePermissions } = useOrgContext()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [mode, setMode] = useState<"cards" | "table">("cards")
  const [scope, setScope] = useState<"store" | "organization">("store")
  const [reviewingSubmissionId, setReviewingSubmissionId] = useState<string | null>(null)
  const [reviewStatusMessage, setReviewStatusMessage] = useState<string | null>(null)
  const [reviewErrorMessage, setReviewErrorMessage] = useState<string | null>(null)
  const canViewOrgInventory = effectivePermissions.viewOrganizationInventory === true
  const canReviewSubmissions = Boolean(
    effectivePermissions.editOrgInventoryMeta ||
      effectivePermissions.manageInventory ||
      effectivePermissions.manageCentralCatalog
  )

  useEffect(() => {
    if (!canViewOrgInventory && scope !== "store") {
      setScope("store")
    }
  }, [canViewOrgInventory, scope])

  useEffect(() => {
    // Store switching should always reflect store-scoped inventory immediately.
    if (scope !== "store") {
      setScope("store")
    }
  }, [activeStoreId]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: items = [] } = useQuery({
    queryKey: ["items", activeOrgId, activeStoreId, scope],
    queryFn: () => {
      if (scope === "organization" && canViewOrgInventory) {
        return fetchItems(activeOrgId)
      }
      if (!activeStoreId) return Promise.resolve([])
      return fetchStoreInventoryItems(activeOrgId, activeStoreId)
    },
    enabled: Boolean(activeOrgId && (scope === "organization" || activeStoreId))
  })

  const { data: pendingSubmissions = [], refetch: refetchSubmissions } = useQuery({
    queryKey: ["item-submissions", activeOrgId, activeStoreId],
    queryFn: () =>
      fetchItemSubmissions(activeOrgId, {
        status: "pending",
        storeId: activeStoreId || undefined
      }),
    enabled: Boolean(activeOrgId && canReviewSubmissions),
    staleTime: 15_000
  })

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const departmentScoped =
          role === "Owner" ||
          !activeOrg?.departmentIds?.length ||
          (item.departmentId ? activeOrg.departmentIds.includes(item.departmentId) : false)
        if (!departmentScoped) return false

        const q = search.toLowerCase()
        return (
          item.name.toLowerCase().includes(q) ||
          (item.upc ?? "").toLowerCase().includes(q) ||
          item.tags.some((tag) => tag.toLowerCase().includes(q))
        )
      }),
    [activeOrg?.departmentIds, items, role, search]
  )

  const columns: TableColumn<ItemRecord>[] = [
    {
      key: "name",
      header: "Item",
      render: (item) => (
        <Link href={`/app/inventory/${item.id}`} className="font-semibold text-blue-400">
          {item.name}
        </Link>
      )
    },
    { key: "upc", header: "Barcode", render: (item) => item.upc ?? "—" },
    { key: "unit", header: "Unit", render: (item) => item.unit },
    { key: "qty", header: "Quantity", render: (item) => item.totalQuantity.toFixed(3) },
    { key: "min", header: "Min Qty", render: (item) => item.minimumQuantity.toFixed(3) },
    { key: "price", header: "Price", render: (item) => `$${item.price.toFixed(2)}` }
  ]

  const runSubmissionReview = async (
    submissionId: string,
    decision: "approved" | "rejected" | "promoted"
  ) => {
    if (!activeOrgId) return
    setReviewStatusMessage(null)
    setReviewErrorMessage(null)
    setReviewingSubmissionId(submissionId)
    try {
      await reviewItemSubmission({
        orgId: activeOrgId,
        submissionId,
        decision
      })
      await refetchSubmissions()
      await queryClient.invalidateQueries({ queryKey: ["items", activeOrgId] })
      await queryClient.invalidateQueries({ queryKey: ["store-inventory-items", activeOrgId, activeStoreId] })
      setReviewStatusMessage(
        decision === "rejected"
          ? "Submission rejected."
          : decision === "promoted"
            ? "Submission approved and promoted to central catalog."
            : "Submission approved to organization inventory."
      )
    } catch (error) {
      const message = String((error as { message?: string } | undefined)?.message ?? "").trim()
      setReviewErrorMessage(message || "Could not review this submission.")
    } finally {
      setReviewingSubmissionId(null)
    }
  }

  return (
    <div>
      <PageHead
        title="Inventory"
        subtitle={
          scope === "organization"
            ? "Organization-level inventory metadata across stores."
            : `Store inventory for ${activeStore ? (activeStore.title ?? activeStore.name) : "your assigned store"}.`
        }
      />

      <AppCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, tag, or barcode" />
          <div className="flex items-center gap-2">
            {canViewOrgInventory ? (
              <SegmentedControl
                options={[
                  { label: "Store", value: "store" },
                  { label: "Organization", value: "organization" }
                ]}
                value={scope}
                onChange={(value) => setScope(value as "store" | "organization")}
              />
            ) : null}
            <SegmentedControl
              options={[
                { label: "Cards", value: "cards" },
                { label: "Table", value: "table" }
              ]}
              value={mode}
              onChange={setMode}
            />
          </div>
        </div>

        <div className="mt-4">
          {scope === "store" && !activeStoreId ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              No store is assigned yet. Ask a manager to grant store access.
            </div>
          ) : null}
          {mode === "table" ? (
            <DataTable
              columns={columns}
              rows={filtered}
              empty={
                scope === "organization"
                  ? "No organization items yet. Add or approve items to build your shared catalog metadata."
                  : "No store items yet. Run Spot Check or Receiving to create store-level inventory rows."
              }
            />
          ) : (
            <>
              {filtered.length === 0 ? (
                <div className="rounded-2xl border border-app-border bg-app-surface-soft px-4 py-3 text-sm text-app-muted">
                  {scope === "organization"
                    ? "No organization inventory metadata yet. Add items or approve pending submissions to populate this view."
                    : "This store is currently empty. Add stock via Spot Check, Receiving, or the store sync tools."}
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((item) => (
                    <Link key={item.id} href={`/app/inventory/${item.id}`}>
                      <div className="rounded-2xl border border-app-border bg-app-surface-soft p-4">
                        <p className="font-semibold">{item.name}</p>
                        <p className="secondary-text mt-1">Barcode: {item.upc ?? "—"}</p>
                        <p className="secondary-text">
                          Qty {item.totalQuantity.toFixed(3)} · Min {item.minimumQuantity.toFixed(3)} {item.unit}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </AppCard>

      {canReviewSubmissions ? (
        <AppCard className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="card-title">Item Verification Queue</h2>
              <p className="secondary-text mt-1">
                Unknown scans create store drafts immediately. Review and approve metadata here.
              </p>
            </div>
            <span className="rounded-full border border-app-border bg-app-surface-soft px-3 py-1 text-xs font-semibold text-app-muted">
              {pendingSubmissions.length} pending
            </span>
          </div>

          {pendingSubmissions.length === 0 ? (
            <div className="rounded-2xl border border-app-border bg-app-surface-soft px-4 py-3 text-sm text-app-muted">
              No pending submissions right now. New unknown scans will appear here for review.
            </div>
          ) : (
            <div className="space-y-2">
              {pendingSubmissions.map((submission) => (
                <div key={submission.id} className="rounded-2xl border border-app-border bg-app-surface-soft p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{submission.itemDraft.name}</p>
                      <p className="secondary-text text-xs">
                        Barcode: {submission.itemDraft.upc ?? submission.scannedUpc ?? "—"} · Unit {submission.itemDraft.unit} · Price $
                        {submission.itemDraft.price.toFixed(2)}
                      </p>
                      <p className="secondary-text text-xs">
                        Submitted by {submission.submittedByName ?? submission.submittedByUid}
                        {submission.submittedByEmployeeId ? ` (${submission.submittedByEmployeeId})` : ""}
                        {activeStore ? ` · ${formatStoreLabel(activeStore)}` : submission.storeId ? ` · Store ${submission.storeId}` : ""}
                      </p>
                      {submission.note ? <p className="secondary-text mt-1 text-xs">Note: {submission.note}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <AppButton
                        variant="secondary"
                        disabled={reviewingSubmissionId === submission.id}
                        onClick={() => void runSubmissionReview(submission.id, "rejected")}
                      >
                        Reject
                      </AppButton>
                      <AppButton
                        variant="secondary"
                        disabled={reviewingSubmissionId === submission.id}
                        onClick={() => void runSubmissionReview(submission.id, "approved")}
                      >
                        Approve
                      </AppButton>
                      <AppButton
                        disabled={reviewingSubmissionId === submission.id}
                        onClick={() => void runSubmissionReview(submission.id, "promoted")}
                      >
                        Approve + Promote
                      </AppButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {reviewStatusMessage ? (
            <div className="mt-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {reviewStatusMessage}
            </div>
          ) : null}
          {reviewErrorMessage ? (
            <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {reviewErrorMessage}
            </div>
          ) : null}
        </AppCard>
      ) : null}
    </div>
  )
}
