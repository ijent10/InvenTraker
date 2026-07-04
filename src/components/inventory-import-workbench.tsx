"use client"

import { useMemo, useState, type FormEvent } from "react"
import { AlertTriangle, CheckCircle2, FileSearch, Loader2, Upload } from "lucide-react"

import { Button, Field, Panel, SelectInput, StatusPill } from "@/components/ui"
import type { ImportExpirationBehavior, InventoryImportResult } from "@/lib/import-parser"

type ImportResponse = InventoryImportResult & {
  message?: string
  persistence?: {
    attempted: boolean
    persisted: boolean
    id?: string
    message?: string
  }
}

const acceptedImportTypes = [
  ".csv",
  ".tsv",
  ".txt",
  ".xlsx",
  ".xls",
  ".pdf",
  ".docx",
  ".doc",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff"
].join(",")

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function fieldLabel(field: string) {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase())
    .replace("Sku", "SKU")
}

export function InventoryImportWorkbench() {
  const [file, setFile] = useState<File | null>(null)
  const [defaultUnit, setDefaultUnit] = useState("eaches")
  const [expirationBehavior, setExpirationBehavior] = useState<ImportExpirationBehavior>("None")
  const [status, setStatus] = useState<"idle" | "busy" | "done">("idle")
  const [error, setError] = useState("")
  const [result, setResult] = useState<ImportResponse | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const previewRows = useMemo(() => result?.candidates.slice(0, 24) ?? [], [result])

  async function parseImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) {
      setError("Choose a file before importing.")
      return
    }

    setStatus("busy")
    setError("")

    try {
      const formData = new FormData()
      formData.set("sourceFile", file)
      formData.set("defaultUnit", defaultUnit)
      formData.set("expirationBehavior", expirationBehavior)
      formData.set("persist", "true")

      const response = await fetch("/api/imports/inventory", {
        method: "POST",
        body: formData
      })
      const payload = (await response.json()) as ImportResponse | { error?: string }

      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Import failed.")
      }

      setResult(payload as ImportResponse)
      setStatus("done")
      window.setTimeout(() => setStatus("idle"), 1800)
    } catch (caughtError) {
      setStatus("idle")
      setError(caughtError instanceof Error ? caughtError.message : "Import failed.")
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <Panel className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
            <FileSearch className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-[var(--app-text)]">Import and review</h2>
            <p className="app-tip mt-1 text-sm text-[var(--app-muted)]">
              Files are parsed into a review draft before anything becomes live inventory.
            </p>
          </div>
        </div>

        <form onSubmit={parseImport} className="mt-5 grid gap-5">
          <label
            className={`rounded-md border border-dashed bg-[var(--app-control-bg)] p-6 text-center transition hover:border-[var(--app-accent)] ${
              dragActive ? "border-[var(--app-accent)] ring-2 ring-[var(--app-accent-soft)]" : "border-[var(--app-control-border)]"
            }`}
            onDragOver={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragActive(false)
              setFile(event.dataTransfer.files?.[0] ?? null)
            }}
          >
            <Upload className="mx-auto h-8 w-8 text-[var(--app-muted)]" />
            <span className="mt-3 block text-sm font-semibold text-[var(--app-text)]">
              {file ? file.name : "Drop a file or choose from your computer"}
            </span>
            <span className="app-tip mt-1 block text-sm text-[var(--app-subtle)]">
              {file ? `${file.type || "unknown type"} - ${formatFileSize(file.size)}` : "CSV, Excel, PDF, Word, TXT, and common image files."}
            </span>
            <span className="mt-4 inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-[var(--app-control-border)] bg-[var(--app-panel)] px-4 py-2 text-sm font-semibold text-[var(--app-text)] transition hover:bg-[var(--app-control-bg-hover)]">
              Choose file
            </span>
            <input
              name="sourceFile"
              type="file"
              accept={acceptedImportTypes}
              className="sr-only"
              onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Expiration behavior">
              <SelectInput
                name="expirationBehavior"
                value={expirationBehavior}
                onChange={(event) => setExpirationBehavior(event.currentTarget.value as ImportExpirationBehavior)}
              >
                <option>None</option>
                <option>Some items</option>
                <option>All items</option>
              </SelectInput>
            </Field>
            <Field label="Default unit">
              <SelectInput name="defaultUnit" value={defaultUnit} onChange={(event) => setDefaultUnit(event.currentTarget.value)}>
                <option>eaches</option>
                <option>cases</option>
                <option>pounds</option>
                <option>ounces</option>
                <option>gallons</option>
              </SelectInput>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={status === "busy"}
              icon={
                status === "busy" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : status === "done" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Upload className="h-4 w-4" />
                )
              }
            >
              {status === "done" ? "Import staged" : "Parse import"}
            </Button>
            {result?.persistence?.message ? (
              <span className="text-sm font-semibold text-[var(--app-muted)]">{result.persistence.message}</span>
            ) : null}
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-semibold text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}
        </form>

        {result ? (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3">
                <p className="text-xs font-semibold uppercase tracking-normal text-[var(--app-subtle)]">Rows found</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--app-text)]">{result.summary.rowCount}</p>
              </div>
              <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3">
                <p className="text-xs font-semibold uppercase tracking-normal text-[var(--app-subtle)]">Draft items</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--app-text)]">{result.summary.candidateCount}</p>
              </div>
              <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3">
                <p className="text-xs font-semibold uppercase tracking-normal text-[var(--app-subtle)]">Mapped fields</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--app-text)]">{result.summary.mappedFieldCount}</p>
              </div>
              <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3">
                <p className="text-xs font-semibold uppercase tracking-normal text-[var(--app-subtle)]">Review flags</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--app-text)]">{result.summary.reviewFlagCount}</p>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-[var(--app-text)]">Detected mappings</h3>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {result.mappings.length > 0 ? (
                  result.mappings.map((mapping) => (
                    <div key={`${mapping.targetField}-${mapping.sourceColumn}`} className="rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-[var(--app-text)]">{mapping.label}</p>
                        <StatusPill tone={mapping.confidence === "high" ? "green" : mapping.confidence === "medium" ? "blue" : "amber"}>
                          {mapping.confidence}
                        </StatusPill>
                      </div>
                      <p className="mt-1 text-sm text-[var(--app-muted)]">{mapping.sourceColumn}</p>
                      {mapping.sampleValues.length > 0 ? (
                        <p className="mt-2 text-xs text-[var(--app-subtle)]">{mapping.sampleValues.join(" - ")}</p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="app-tip rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3 text-sm text-[var(--app-muted)]">
                    No confident mappings yet. The extracted text below can still help tune the import once you provide a sample.
                  </p>
                )}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-[var(--app-text)]">Staged inventory preview</h3>
              <div className="mt-3 overflow-hidden rounded-md border border-[var(--app-border)]">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-[var(--app-border)] text-left text-sm">
                    <thead className="bg-[var(--app-control-bg)] text-xs font-semibold uppercase tracking-normal text-[var(--app-subtle)]">
                      <tr>
                        {["Item", "SKU", "Department", "Category", "Stock", "Vendor", "Expires", "Review"].map((column) => (
                          <th key={column} className="px-3 py-3">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-border)]">
                      {previewRows.length > 0 ? (
                        previewRows.map((candidate) => (
                          <tr key={candidate.rowNumber} className="bg-[var(--app-panel)]">
                            <td className="px-3 py-3 font-semibold text-[var(--app-text)]">{candidate.name}</td>
                            <td className="px-3 py-3 text-[var(--app-muted)]">{candidate.sku || "Needs review"}</td>
                            <td className="px-3 py-3 text-[var(--app-muted)]">{candidate.department || "Not found"}</td>
                            <td className="px-3 py-3 text-[var(--app-muted)]">{candidate.category || "Not found"}</td>
                            <td className="px-3 py-3 text-[var(--app-muted)]">
                              {candidate.onHand} {candidate.unit}
                              <span className="block text-xs text-[var(--app-subtle)]">
                                Front {candidate.frontStock} - Back {candidate.backStock}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-[var(--app-muted)]">{candidate.vendor || "Not found"}</td>
                            <td className="px-3 py-3">
                              <StatusPill tone={candidate.expires ? "blue" : "neutral"}>{candidate.expires ? "Yes" : "No"}</StatusPill>
                            </td>
                            <td className="px-3 py-3 text-xs text-[var(--app-subtle)]">
                              {candidate.reviewFlags.length > 0 ? candidate.reviewFlags.join(", ") : "Ready for review"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="px-3 py-6 text-center text-[var(--app-muted)]">
                            No rows were staged from this file.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {result.extractedText ? (
              <details className="rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--app-text)]">View extracted text</summary>
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-[var(--app-muted)]">{result.extractedText}</pre>
              </details>
            ) : null}
          </div>
        ) : null}
      </Panel>

      <Panel className="p-4">
        <h2 className="font-semibold text-[var(--app-text)]">What happens here</h2>
        <div className="app-tip mt-4 space-y-3 text-sm leading-6 text-[var(--app-muted)]">
          <p>
            Imports try to recognize item names, SKU/barcodes, departments, categories, vendors, units, front stock, back stock, on-hand quantity,
            price, case quantity, and expiration behavior.
          </p>
          <p>
            Image and scanned document imports use OCR, so they should always be reviewed before being turned into live stock items.
          </p>
          <p>
            When Firebase Admin is configured, parsed imports are also saved as review drafts so another device can pick up the same work.
          </p>
        </div>

        <div className="mt-5 space-y-2">
          {["CSV and TSV", "Excel workbooks", "PDF documents", "Word documents", "Product list images", "Plain text"].map((label) => (
            <div key={label} className="flex items-center justify-between rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] px-3 py-2">
              <span className="text-sm font-semibold text-[var(--app-text)]">{label}</span>
              <StatusPill tone="blue">Supported</StatusPill>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

export function InventoryImportDifferencePanel() {
  return (
    <Panel className="p-4">
      <h2 className="font-semibold text-[var(--app-text)]">Catalog product vs. stock item</h2>
      <div className="app-tip mt-3 grid gap-3 text-sm leading-6 text-[var(--app-muted)] md:grid-cols-2">
        <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3">
          <p className="font-semibold text-[var(--app-text)]">{fieldLabel("catalog product")}</p>
          <p className="mt-1">
            Reusable product identity and defaults: name, SKU, nutrition, images, default unit, category, and expiration behavior.
          </p>
        </div>
        <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3">
          <p className="font-semibold text-[var(--app-text)]">{fieldLabel("stock item")}</p>
          <p className="mt-1">
            What a store actually counts and orders: front stock, back stock, vendor, price, location, par, reorder point, and notes.
          </p>
        </div>
      </div>
    </Panel>
  )
}
