"use client"

import { useMemo, useState } from "react"
import {
  Archive,
  CalendarClock,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Folder,
  FolderOpen,
  Heart,
  Layers3,
  Search,
  Upload,
  Users
} from "lucide-react"

import { Button, Field, Panel, SelectInput, StatusPill, TextInput } from "@/components/ui"
import type { CompanyDocumentType, CompanyFile, CompanyFileCategory, CompanyFileChunk, CompanyFileVisibilityScope } from "@/lib/demo-data"

const documentTypeOptions: CompanyDocumentType[] = [
  "employee handbook",
  "dress code policy",
  "department SOP",
  "deli procedure",
  "bakery procedure",
  "produce procedure",
  "meat/seafood procedure",
  "front-end/customer-service procedure",
  "food safety document",
  "allergen policy",
  "sanitation policy",
  "recipe document",
  "vendor document",
  "product specification sheet",
  "merchandising guide",
  "ordering guide",
  "training guide",
  "safety data sheet",
  "operational report",
  "internal memo",
  "store-specific policy",
  "organization-specific policy"
]

const visibilityScopes: Array<{ value: CompanyFileVisibilityScope; label: string }> = [
  { value: "organization", label: "Entire organization" },
  { value: "jobTitle", label: "Job title" },
  { value: "department", label: "Department" },
  { value: "area", label: "Area" },
  { value: "store", label: "Store" },
  { value: "region", label: "Region" },
  { value: "district", label: "District" },
  { value: "individuals", label: "Specific individuals" }
]

function approvalTone(status: CompanyFile["approvedStatus"]) {
  if (status === "approved") return "green"
  if (status === "draft") return "amber"
  if (status === "expired" || status === "superseded") return "red"
  return "neutral"
}

function statusLabel(status: CompanyFile["approvedStatus"]) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function categoryChildren(categories: CompanyFileCategory[], parentId?: string) {
  return categories
    .filter((category) => category.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

function FileCard({
  file,
  favorite,
  onFavorite
}: {
  file: CompanyFile
  favorite: boolean
  onFavorite: () => void
}) {
  return (
    <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-[var(--app-text)]">{file.title}</h3>
            <StatusPill tone={approvalTone(file.approvedStatus)}>{statusLabel(file.approvedStatus)}</StatusPill>
          </div>
          <p className="mt-1 truncate text-xs text-[var(--app-subtle)]">{file.fileName}</p>
          <p className="mt-2 line-clamp-2 text-sm leading-5 text-[var(--app-muted)]">{file.summary}</p>
        </div>
        <button
          type="button"
          onClick={onFavorite}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition ${
            favorite
              ? "border-rose-400/40 bg-rose-500/15 text-rose-200"
              : "border-[var(--app-control-border)] bg-[var(--app-control-bg)] text-[var(--app-muted)] hover:text-[var(--app-text)]"
          }`}
          aria-label={favorite ? "Remove favorite" : "Favorite file"}
        >
          <Heart className="h-4 w-4" fill={favorite ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <StatusPill>{file.documentType}</StatusPill>
        <StatusPill>{file.department}</StatusPill>
        <StatusPill>{file.visibility.scope}: {file.visibility.labels.join(", ")}</StatusPill>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-[var(--app-subtle)] sm:grid-cols-2">
        <p>Version: {file.version}</p>
        <p>Opened: {file.openedCount.toLocaleString()} times</p>
        <p>Effective: {file.effectiveDate ?? "Not set"}</p>
        <p>Parsing: {file.parsingStatus}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={file.viewerUrl}
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] px-3 py-2 text-xs font-semibold text-[var(--app-control-text)] hover:bg-[var(--app-control-bg-hover)]"
        >
          <Eye className="h-3.5 w-3.5" />
          Open
        </a>
        {file.downloadUrl ? (
          <a
            href={file.downloadUrl}
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] px-3 py-2 text-xs font-semibold text-[var(--app-control-text)] hover:bg-[var(--app-control-bg-hover)]"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        ) : null}
      </div>
    </div>
  )
}

function UploadPanel({ categories }: { categories: CompanyFileCategory[] }) {
  const [savedMessage, setSavedMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submitUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavedMessage("")
    setIsSubmitting(true)

    try {
      const formData = new FormData(event.currentTarget)
      const response = await fetch("/api/files/ingest", {
        method: "POST",
        body: formData
      })
      const payload = await response.json()

      if (!response.ok) throw new Error(payload.error ?? "File upload failed.")
      setSavedMessage(payload.message ?? "File uploaded for review.")
      event.currentTarget.reset()
    } catch (error) {
      setSavedMessage(error instanceof Error ? error.message : "File upload failed.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Panel className="p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
          <Upload className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold text-[var(--app-text)]">Add company file</h2>
          <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">
            Uploads enter draft or approval review before the assistant treats them as authoritative.
          </p>
        </div>
      </div>

      <form className="mt-4 grid gap-3" onSubmit={submitUpload}>
        <Field label="File">
          <input
            name="file"
            type="file"
            accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json"
            className="block w-full rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] px-3 py-2 text-sm text-[var(--app-control-text)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--app-accent)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[var(--app-on-accent)]"
          />
        </Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Title">
            <TextInput name="title" placeholder="Deli closing procedure" required />
          </Field>
          <Field label="Document type">
            <SelectInput name="documentType" defaultValue="department SOP">
              {documentTypeOptions.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Category">
            <SelectInput name="categoryId" defaultValue={categories[0]?.id}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parentId ? "— " : ""}{category.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Department">
            <TextInput name="department" placeholder="Deli, Bakery, Store Operations" required />
          </Field>
          <Field label="Who is this for?">
            <SelectInput name="visibilityScope" defaultValue="organization">
              {visibilityScopes.map((scope) => (
                <option key={scope.value} value={scope.value}>
                  {scope.label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Group names">
            <TextInput name="visibilityLabels" placeholder="Deli, Liberty Ave, Store Manager" />
          </Field>
          <Field label="Effective date">
            <TextInput name="effectiveDate" type="date" />
          </Field>
          <Field label="Expiration date">
            <TextInput name="expirationDate" type="date" />
          </Field>
        </div>
        <Button type="submit" disabled={isSubmitting} icon={<Upload className="h-4 w-4" />}>
          {isSubmitting ? "Uploading..." : "Upload for review"}
        </Button>
        {savedMessage ? <p className="rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] px-3 py-2 text-sm text-[var(--app-muted)]">{savedMessage}</p> : null}
      </form>
    </Panel>
  )
}

export function CompanyFilesManager({
  files,
  categories,
  chunks,
  activeDocumentId,
  canUpload
}: {
  files: CompanyFile[]
  categories: CompanyFileCategory[]
  chunks: CompanyFileChunk[]
  activeDocumentId?: string
  canUpload: boolean
}) {
  const [query, setQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(files.flatMap((file) => (file.favoritedBy.includes("emp-001") ? [file.id] : []))))

  const filteredFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return files.filter((file) => {
      const matchesCategory = selectedCategory === "all" || file.categoryId === selectedCategory
      const matchesQuery =
        !normalizedQuery ||
        [file.title, file.fileName, file.department, file.documentType, file.summary, ...file.tags].some((value) => value.toLowerCase().includes(normalizedQuery))
      return matchesCategory && matchesQuery
    })
  }, [files, query, selectedCategory])

  const recents = [...files]
    .filter((file) => file.lastOpenedAt)
    .sort((a, b) => (a.lastOpenedAt ?? "").localeCompare(b.lastOpenedAt ?? ""))
    .reverse()
    .slice(0, 3)
  const mostOpened = [...files].sort((a, b) => b.openedCount - a.openedCount).slice(0, 3)
  const favorites = files.filter((file) => favoriteIds.has(file.id))
  const activeFile = activeDocumentId ? files.find((file) => file.documentId === activeDocumentId) : undefined
  const activeChunks = activeDocumentId ? chunks.filter((chunk) => chunk.documentId === activeDocumentId) : []

  function toggleFavorite(fileId: string) {
    setFavoriteIds((current) => {
      const next = new Set(current)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Panel className="p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_240px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-subtle)]" />
              <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search policies, procedures, vendor sheets..." className="pl-9" />
            </label>
            <SelectInput value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parentId ? "— " : ""}{category.name}
                </option>
              ))}
            </SelectInput>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
              <FileCheck2 className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-[var(--app-text)]">{files.filter((file) => file.approvedStatus === "approved").length} approved files</p>
              <p className="text-xs text-[var(--app-muted)]">Current assistant-authoritative source pool</p>
            </div>
          </div>
        </Panel>
      </div>

      {activeFile ? (
        <Panel className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-[var(--app-text)]">{activeFile.title}</h2>
                <StatusPill tone={approvalTone(activeFile.approvedStatus)}>{statusLabel(activeFile.approvedStatus)}</StatusPill>
                <StatusPill>{activeFile.documentType}</StatusPill>
              </div>
              <p className="mt-1 text-sm text-[var(--app-muted)]">{activeFile.summary}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {activeFile.downloadUrl ? (
                <a
                  href={activeFile.downloadUrl}
                  className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] px-3 py-2 text-xs font-semibold text-[var(--app-control-text)] hover:bg-[var(--app-control-bg-hover)]"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {activeChunks.length > 0 ? (
              activeChunks.map((chunk) => (
                <article id={chunk.chunkId} key={chunk.chunkId} className="scroll-mt-28 rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-[var(--app-text)]">{chunk.sectionTitle}</h3>
                    {chunk.pageStart ? <StatusPill>Page {chunk.pageStart}{chunk.pageEnd && chunk.pageEnd !== chunk.pageStart ? `-${chunk.pageEnd}` : ""}</StatusPill> : null}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--app-muted)]">{chunk.text}</p>
                  {chunk.tableData ? (
                    <div className="mt-3 overflow-x-auto rounded-md border border-[var(--app-border)]">
                      <table className="min-w-full divide-y divide-[var(--app-border)] text-sm">
                        <tbody className="divide-y divide-[var(--app-border)]">
                          {chunk.tableData.map((row, rowIndex) => (
                            <tr key={`${chunk.chunkId}-${rowIndex}`}>
                              {row.map((cell, cellIndex) => (
                                <td key={`${chunk.chunkId}-${rowIndex}-${cellIndex}`} className="px-3 py-2 text-[var(--app-muted)]">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3 text-sm text-[var(--app-muted)]">
                No parsed chunks are available yet. Reprocess this document after upload parsing is configured.
              </p>
            )}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="p-4">
          <h2 className="flex items-center gap-2 font-semibold text-[var(--app-text)]">
            <CalendarClock className="h-4 w-4 text-[var(--app-accent)]" />
            Recents
          </h2>
          <div className="mt-3 space-y-2">
            {recents.map((file) => (
              <a key={file.id} href={file.viewerUrl} className="block rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3 hover:bg-[var(--app-control-bg-hover)]">
                <p className="text-sm font-semibold text-[var(--app-text)]">{file.title}</p>
                <p className="mt-1 text-xs text-[var(--app-muted)]">{file.lastOpenedAt}</p>
              </a>
            ))}
          </div>
        </Panel>

        <Panel className="p-4">
          <h2 className="flex items-center gap-2 font-semibold text-[var(--app-text)]">
            <Layers3 className="h-4 w-4 text-[var(--app-accent)]" />
            Most opened
          </h2>
          <div className="mt-3 space-y-2">
            {mostOpened.map((file) => (
              <a key={file.id} href={file.viewerUrl} className="block rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3 hover:bg-[var(--app-control-bg-hover)]">
                <p className="text-sm font-semibold text-[var(--app-text)]">{file.title}</p>
                <p className="mt-1 text-xs text-[var(--app-muted)]">{file.openedCount.toLocaleString()} opens</p>
              </a>
            ))}
          </div>
        </Panel>

        <Panel className="p-4">
          <h2 className="flex items-center gap-2 font-semibold text-[var(--app-text)]">
            <Heart className="h-4 w-4 text-rose-300" />
            Favorites
          </h2>
          <div className="mt-3 space-y-2">
            {favorites.length > 0 ? (
              favorites.slice(0, 3).map((file) => (
                <a key={file.id} href={file.viewerUrl} className="block rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3 hover:bg-[var(--app-control-bg-hover)]">
                  <p className="text-sm font-semibold text-[var(--app-text)]">{file.title}</p>
                  <p className="mt-1 text-xs text-[var(--app-muted)]">{file.documentType}</p>
                </a>
              ))
            ) : (
              <p className="rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3 text-sm text-[var(--app-muted)]">No favorites yet.</p>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
        <Panel className="p-4">
          <h2 className="flex items-center gap-2 font-semibold text-[var(--app-text)]">
            <FolderOpen className="h-4 w-4 text-[var(--app-accent)]" />
            Categories
          </h2>
          <div className="mt-4 space-y-2">
            {categoryChildren(categories).map((category) => (
              <div key={category.id}>
                <button
                  type="button"
                  onClick={() => setSelectedCategory(category.id)}
                  className="flex w-full items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] px-3 py-2 text-left text-sm font-semibold text-[var(--app-text)] hover:bg-[var(--app-control-bg-hover)]"
                >
                  <Folder className="h-4 w-4 text-[var(--app-accent)]" />
                  {category.name}
                </button>
                <div className="ml-4 mt-2 space-y-2">
                  {categoryChildren(categories, category.id).map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => setSelectedCategory(child.id)}
                      className="flex w-full items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 py-2 text-left text-sm text-[var(--app-muted)] hover:bg-[var(--app-control-bg-hover)] hover:text-[var(--app-text)]"
                    >
                      <Folder className="h-3.5 w-3.5" />
                      {child.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--app-text)]">Files</h2>
              <p className="text-sm text-[var(--app-muted)]">{filteredFiles.length} file{filteredFiles.length === 1 ? "" : "s"} shown</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill tone="blue">
                <Users className="mr-1 inline h-3 w-3" />
                Permissioned access
              </StatusPill>
              <StatusPill>
                <Archive className="mr-1 inline h-3 w-3" />
                Drafts stay non-authoritative
              </StatusPill>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {filteredFiles.map((file) => (
              <FileCard key={file.id} file={file} favorite={favoriteIds.has(file.id)} onFavorite={() => toggleFavorite(file.id)} />
            ))}
          </div>
        </div>
      </div>

      {canUpload ? <UploadPanel categories={categories} /> : null}
    </div>
  )
}
