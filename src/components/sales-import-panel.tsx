"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react"

import { useAuthSession } from "@/lib/auth-session"

export function SalesImportPanel({ scope, storeId }: { scope: "store" | "organization"; storeId?: string }) {
  const session = useAuthSession()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ rowsImported: number; netSales: number; suspicious: boolean } | null>(null)
  const [error, setError] = useState("")

  async function upload() {
    if (!file || !session.user) return
    setBusy(true); setError(""); setResult(null)
    try {
      const form = new FormData(); form.set("file", file); form.set("scope", scope); if (storeId) form.set("storeId", storeId)
      const token = await session.user.getIdToken()
      const response = await fetch("/api/imports/sales", { method: "POST", headers: { Authorization: `Bearer ${token}`, "x-inventraker-org": session.orgId }, body: form })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error?.message ?? payload.error ?? "Sales import failed.")
      setResult(payload.data)
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Sales import failed.") }
    finally { setBusy(false) }
  }

  return <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
    <h2 className="font-semibold text-[var(--app-text)]">Import sales report</h2>
    <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">Upload CSV, TSV, XLS, or XLSX exports from Square, Shopify, Toast, Clover, Lightspeed, and other POS or inventory systems. Common item, SKU, quantity, location, gross, and net-sales columns are mapped automatically.</p>
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <input aria-label="Sales report file" type="file" accept=".csv,.tsv,.xls,.xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="min-h-11 flex-1 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] px-3 py-2 text-sm" />
      <button disabled={!file || busy || session.status !== "ready"} onClick={() => void upload()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--app-accent)] px-4 text-sm font-semibold text-[var(--app-on-accent)] disabled:opacity-40"><Upload className="h-4 w-4"/>{busy ? "Importing…" : `Import ${scope} sales`}</button>
    </div>
    {error ? <p className="mt-3 flex items-center gap-2 text-sm text-red-300"><AlertTriangle className="h-4 w-4"/>{error}</p> : null}
    {result ? <div className={`mt-3 rounded-md border p-3 text-sm ${result.suspicious ? "border-amber-400/40 bg-amber-400/10 text-amber-100" : "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"}`}><p className="flex items-center gap-2 font-semibold">{result.suspicious ? <AlertTriangle className="h-4 w-4"/> : <CheckCircle2 className="h-4 w-4"/>}{result.rowsImported} rows imported · ${result.netSales.toFixed(2)} net sales</p>{result.suspicious ? <p className="mt-1">The total differs sharply from recent sales. An owner alert and operational issue were created.</p> : null}</div> : null}
  </div>
}
