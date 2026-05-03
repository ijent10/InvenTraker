"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  AppButton,
  AppCard,
  AppCheckbox,
  AppInput,
  DataTable,
  SearchInput,
  SegmentedControl,
  type TableColumn
} from "@inventracker/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  fetchOrgSettings,
  fetchItems,
  fetchItemSubmissions,
  fetchStoreInventoryItems,
  fetchStoreSettings,
  formatStoreLabel,
  reviewItemSubmission,
  upsertStoreInventoryItem,
  type ItemRecord
} from "@/lib/data/firestore"
import { downloadSpreadsheetExport } from "@/lib/exports/spreadsheet"
import type { ImportInspectionResult } from "@/lib/imports/attribute-mapper"

type ImportExpirationMode = "all" | "some" | "none"

function cleanImportText(value: unknown): string {
  return String(value ?? "").trim()
}

function parseImportNumber(value: unknown): number | undefined {
  const cleaned = cleanImportText(value).replace(/[$,]/g, "")
  if (!cleaned) return undefined
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseImportBoolean(value: unknown): boolean | undefined {
  const normalized = cleanImportText(value).toLowerCase()
  if (!normalized) return undefined
  if (["true", "yes", "y", "1", "expire", "expires", "perishable"].includes(normalized)) return true
  if (["false", "no", "n", "0", "none", "nonperishable", "non-perishable"].includes(normalized)) return false
  return undefined
}

function normalizeImportBarcode(value: unknown): string | undefined {
  const cleaned = cleanImportText(value)
  if (!cleaned) return undefined
  const digits = cleaned.replace(/\D/g, "")
  return digits || cleaned
}

function unitFromImport(value: unknown): "each" | "lbs" {
  const normalized = cleanImportText(value).toLowerCase()
  if (normalized.includes("lb") || normalized.includes("pound")) return "lbs"
  return "each"
}

function importValueForPath(
  result: ImportInspectionResult,
  row: Record<string, string>,
  path: string
): string {
  const column = result.columns.find((entry) => entry.suggestedField?.path === path)
  return column ? cleanImportText(row[column.sourceHeader]) : ""
}

function inventoryImportLabel(result: ImportInspectionResult, row: Record<string, string>, index: number): string {
  return (
    importValueForPath(result, row, "name") ||
    importValueForPath(result, row, "upc") ||
    `Row ${index + 1}`
  )
}

function makeImportItemId(row: Record<string, unknown>, fallback: string): string {
  const upc = normalizeImportBarcode(row.upc)
  if (upc) return `upc_${upc.replace(/[^a-zA-Z0-9_-]/g, "")}`
  const name = cleanImportText(row.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  if (name) return `import_${name}_${fallback}`
  return `import_item_${fallback}`
}

export default function InventoryPage() {
  const { activeOrgId, activeStoreId, activeOrg, activeStore, role, effectivePermissions } = useOrgContext()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [mode, setMode] = useState<"cards" | "table">("cards")
  const [scope, setScope] = useState<"store" | "organization">("store")
  const [reviewingSubmissionId, setReviewingSubmissionId] = useState<string | null>(null)
  const [reviewStatusMessage, setReviewStatusMessage] = useState<string | null>(null)
  const [reviewErrorMessage, setReviewErrorMessage] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(true)
  const [importResult, setImportResult] = useState<ImportInspectionResult | null>(null)
  const [importExpirationMode, setImportExpirationMode] = useState<ImportExpirationMode>("all")
  const [importExpirationRows, setImportExpirationRows] = useState<number[]>([])
  const [importStatusMessage, setImportStatusMessage] = useState<string | null>(null)
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [inspectingImport, setInspectingImport] = useState(false)
  const canViewOrgInventory = effectivePermissions.viewOrganizationInventory === true
  const canImportInventory = Boolean(
    activeStoreId &&
      (effectivePermissions.editStoreInventory ||
        effectivePermissions.manageInventory ||
        effectivePermissions.editOrgInventoryMeta)
  )
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
    enabled: Boolean(activeOrgId && (scope === "organization" || activeStoreId)),
    refetchInterval: 30_000
  })

  const { data: orgSettings } = useQuery({
    queryKey: ["inventory-org-export-settings", activeOrgId],
    queryFn: () => fetchOrgSettings(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const { data: storeSettings } = useQuery({
    queryKey: ["inventory-store-export-settings", activeOrgId, activeStoreId],
    queryFn: () => fetchStoreSettings(activeOrgId, activeStore!),
    enabled: Boolean(activeOrgId && activeStore)
  })

  const { data: pendingSubmissions = [], refetch: refetchSubmissions } = useQuery({
    queryKey: ["item-submissions", activeOrgId, activeStoreId],
    queryFn: () =>
      fetchItemSubmissions(activeOrgId, {
        status: "pending",
        storeId: activeStoreId || undefined
      }),
    enabled: Boolean(activeOrgId && canReviewSubmissions),
    staleTime: 15_000,
    refetchInterval: 30_000
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

  const importRows = useMemo(() => importResult?.rows ?? importResult?.previewRows ?? [], [importResult])

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

  const inspectInventoryImport = async (file: File) => {
    setImportStatusMessage(null)
    setImportErrorMessage(null)
    setImportResult(null)
    setImportExpirationRows([])
    setInspectingImport(true)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("dataset", "inventory")
      const response = await fetch("/api/imports/inspect", {
        method: "POST",
        body: form
      })
      const payload = (await response.json()) as ImportInspectionResult | { ok: false; reason?: string }
      if (!response.ok || payload.ok !== true) {
        throw new Error("reason" in payload ? payload.reason : "Could not inspect this file.")
      }
      setImportResult(payload)
      const mappedExpiration = payload.columns.some((column) => column.suggestedField?.path === "hasExpiration")
      setImportExpirationMode(mappedExpiration ? "some" : "all")
      if (mappedExpiration) {
        const rows = payload.rows ?? payload.previewRows
        setImportExpirationRows(
          rows
            .map((row, index) => ({
              index,
              hasExpiration: parseImportBoolean(importValueForPath(payload, row, "hasExpiration"))
            }))
            .filter((entry) => entry.hasExpiration === true)
            .map((entry) => entry.index)
        )
      }
    } catch (error) {
      setImportErrorMessage(error instanceof Error ? error.message : "Could not inspect this file.")
    } finally {
      setInspectingImport(false)
    }
  }

  const runInventoryImport = async () => {
    if (!activeOrgId || !activeStoreId || !importResult || importRows.length === 0) return
    setImporting(true)
    setImportStatusMessage(null)
    setImportErrorMessage(null)
    try {
      let imported = 0
      const existingByUpc = new Map(
        items
          .map((item) => [normalizeImportBarcode(item.upc), item] as const)
          .filter((entry): entry is readonly [string, ItemRecord] => Boolean(entry[0]))
      )
      const existingByName = new Map(items.map((item) => [item.name.trim().toLowerCase(), item]))

      for (const [index, row] of importRows.entries()) {
        const name = importValueForPath(importResult, row, "name")
        if (!name) continue

        const upc = normalizeImportBarcode(importValueForPath(importResult, row, "upc"))
        const existing = (upc ? existingByUpc.get(upc) : undefined) ?? existingByName.get(name.toLowerCase())
        const hasExpiration =
          importExpirationMode === "none"
            ? false
            : importExpirationMode === "all"
              ? true
              : importExpirationRows.includes(index)
        const defaultExpirationDays = hasExpiration
          ? Math.max(1, parseImportNumber(importValueForPath(importResult, row, "defaultExpirationDays")) ?? 7)
          : 0
        const minimumQuantity = Math.max(
          0,
          parseImportNumber(importValueForPath(importResult, row, "minimumQuantity")) ?? 0
        )
        const totalQuantity = parseImportNumber(importValueForPath(importResult, row, "totalQuantity"))
        const patch: Partial<ItemRecord> & { storeMinimumQuantity?: number; storeDepartmentLocation?: string } = {
          name,
          upc,
          unit: unitFromImport(importValueForPath(importResult, row, "unit")),
          department: importValueForPath(importResult, row, "department") || undefined,
          departmentLocation: importValueForPath(importResult, row, "departmentLocation") || undefined,
          storeDepartmentLocation: importValueForPath(importResult, row, "departmentLocation") || undefined,
          vendorName: importValueForPath(importResult, row, "vendorName") || undefined,
          minimumQuantity,
          storeMinimumQuantity: minimumQuantity,
          price: Math.max(0, parseImportNumber(importValueForPath(importResult, row, "price")) ?? 0),
          hasExpiration,
          defaultExpiration: defaultExpirationDays,
          defaultExpirationDays,
          defaultPackedExpiration: defaultExpirationDays,
          totalQuantity: totalQuantity === undefined ? undefined : Math.max(0, totalQuantity)
        }
        const itemId = existing?.id ?? makeImportItemId({ name, upc }, String(index + 1))
        await upsertStoreInventoryItem(activeOrgId, activeStoreId, itemId, patch)
        imported += 1
      }

      await queryClient.invalidateQueries({ queryKey: ["items", activeOrgId] })
      await queryClient.invalidateQueries({ queryKey: ["store-inventory-items", activeOrgId, activeStoreId] })
      setImportStatusMessage(`Imported ${imported} item${imported === 1 ? "" : "s"}.`)
    } catch (error) {
      setImportErrorMessage(error instanceof Error ? error.message : "Could not import inventory.")
    } finally {
      setImporting(false)
    }
  }

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

  const exportInventory = () => {
    if (filtered.length === 0) return
    const storeName = scope === "store" ? activeStore?.title ?? activeStore?.name : undefined
    downloadSpreadsheetExport({
      dataset: "inventory",
      rows: filtered as unknown as Array<Record<string, unknown>>,
      settings: { orgSettings, storeSettings },
      organizationName: activeOrg?.organizationName,
      storeName,
      scopeLabel: scope === "store" && storeName ? `${storeName} Inventory` : "Organization Inventory"
    })
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
        actions={
          <div className="flex flex-wrap gap-2">
            <AppButton
              variant="secondary"
              onClick={() => setImportOpen((value) => !value)}
            >
              {importOpen ? "Hide Import" : "Import"}
            </AppButton>
            <AppButton
              variant="secondary"
              onClick={exportInventory}
              disabled={!effectivePermissions.exportData || filtered.length === 0}
            >
              Export
            </AppButton>
          </div>
        }
      />

      {importOpen ? (
        <AppCard className="mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="card-title">Import Inventory</h2>
              <p className="secondary-text mt-1">
                {activeStore ? `Target store: ${formatStoreLabel(activeStore)}` : "Select a store before importing."}
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center rounded-2xl border border-app-border bg-app-surface-soft px-4 py-2 text-sm font-semibold text-app-text">
              Choose File
              <AppInput
                className="sr-only"
                type="file"
                accept=".xlsx,.csv,.tsv,.txt,.pdf,application/pdf"
                disabled={!canImportInventory || inspectingImport || importing}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (file) void inspectInventoryImport(file)
                }}
              />
            </label>
          </div>

          {!canImportInventory ? (
            <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {activeStoreId
                ? "You need inventory edit permission to import items for this store."
                : "Choose an active store before importing inventory."}
            </div>
          ) : null}

          {inspectingImport ? <p className="secondary-text mt-3 text-sm">Reading file...</p> : null}

          {importResult ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-app-border bg-app-surface-soft p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{importResult.fileName}</p>
                    <p className="secondary-text text-xs">
                      {importRows.length} readable row{importRows.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <AppButton
                    onClick={() => void runInventoryImport()}
                    disabled={importing || importRows.length === 0}
                  >
                    {importing ? "Importing..." : "Import Items"}
                  </AppButton>
                </div>
                {importResult.warnings.length > 0 ? (
                  <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    {importResult.warnings.join(" ")}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-app-border p-3">
                <p className="text-sm font-semibold">Expiration Handling</p>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <AppCheckbox
                    checked={importExpirationMode === "all"}
                    onChange={() => {
                      setImportExpirationMode("all")
                      setImportExpirationRows([])
                    }}
                    label="All items expire"
                  />
                  <AppCheckbox
                    checked={importExpirationMode === "some"}
                    onChange={() => setImportExpirationMode("some")}
                    label="Some items expire"
                  />
                  <AppCheckbox
                    checked={importExpirationMode === "none"}
                    onChange={() => {
                      setImportExpirationMode("none")
                      setImportExpirationRows([])
                    }}
                    label="No items expire"
                  />
                </div>

                {importExpirationMode === "some" ? (
                  <div className="mt-3 grid max-h-72 gap-2 overflow-auto pr-2 md:grid-cols-2">
                    {importRows.map((row, index) => (
                      <AppCheckbox
                        key={`inventory-import-expiration-${index}`}
                        checked={importExpirationRows.includes(index)}
                        onChange={(event) =>
                          setImportExpirationRows((prev) =>
                            event.target.checked
                              ? Array.from(new Set([...prev, index]))
                              : prev.filter((entry) => entry !== index)
                          )
                        }
                        label={inventoryImportLabel(importResult, row, index)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="overflow-hidden rounded-2xl border border-app-border">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 border-b border-app-border bg-app-surface-soft px-3 py-2 text-xs font-semibold uppercase text-app-muted">
                  <span>Column</span>
                  <span>Mapped To</span>
                  <span>Confidence</span>
                </div>
                {importResult.columns.map((column) => (
                  <div
                    key={`${column.index}-${column.sourceHeader}`}
                    className="grid grid-cols-[1fr_1fr_auto] gap-2 border-b border-app-border px-3 py-2 text-sm last:border-b-0"
                  >
                    <span>{column.sourceHeader}</span>
                    <span>{column.suggestedField?.label ?? "Unmapped"}</span>
                    <span>{Math.round(column.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {importStatusMessage ? (
            <div className="mt-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {importStatusMessage}
            </div>
          ) : null}
          {importErrorMessage ? (
            <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {importErrorMessage}
            </div>
          ) : null}
        </AppCard>
      ) : null}

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
