import { randomUUID } from "node:crypto"
import * as XLSX from "xlsx"
import { z } from "zod"

import { mobileEnvelope, mobileError, requireMobilePrincipal } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestFields = z.object({
  scope: z.enum(["store", "organization"]),
  storeId: z.string().trim().max(120).optional()
})

const aliases = {
  date: ["date", "business date", "sale date", "created at", "closed at", "transaction date", "order date"],
  transactionId: ["transaction id", "order id", "receipt", "receipt id", "check id", "sale id"],
  sku: ["sku", "item sku", "variant sku", "barcode", "upc", "plu"],
  productName: ["product", "product name", "item", "item name", "menu item", "description"],
  quantity: ["quantity", "qty", "items sold", "units", "net quantity"],
  grossSales: ["gross sales", "gross", "subtotal", "total sales", "sales"],
  netSales: ["net sales", "net", "amount", "total", "paid"],
  storeId: ["store id", "location id", "location", "store", "outlet"]
} as const

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[$,()%]/g, "").trim())
  return Number.isFinite(parsed) ? parsed : 0
}

function field(row: Record<string, unknown>, names: readonly string[]) {
  const entry = Object.entries(row).find(([key]) => names.includes(normalized(key)))
  return entry?.[1]
}

function rowsFromFile(buffer: Buffer, fileName: string) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true })
  return workbook.SheetNames.flatMap((sheetName) =>
    XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "", raw: false }).map((row) => ({ ...row, __sheet: sheetName, __file: fileName }))
  )
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export async function POST(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "insights.view")
    const form = await request.formData()
    const parsed = requestFields.parse({ scope: form.get("scope"), storeId: form.get("storeId") || undefined })
    if (parsed.scope === "store" && !parsed.storeId) return Response.json({ error: "Choose a store for a store-level import." }, { status: 400 })
    const file = form.get("file")
    if (!(file instanceof File)) return Response.json({ error: "Choose a CSV, TSV, or Excel sales report." }, { status: 400 })
    if (file.size > 20 * 1024 * 1024) return Response.json({ error: "Sales reports must be 20 MB or smaller." }, { status: 413 })

    const importedAt = new Date().toISOString()
    const importId = randomUUID()
    const rawRows = rowsFromFile(Buffer.from(await file.arrayBuffer()), file.name)
    const records = rawRows.map((row, index) => {
      const rawDate = field(row, aliases.date)
      const date = rawDate ? new Date(String(rawDate)) : new Date()
      return {
        id: `${importId}-${index + 1}`,
        importId,
        scope: parsed.scope,
        storeId: parsed.scope === "store" ? parsed.storeId : String(field(row, aliases.storeId) || "organization-wide"),
        businessDate: Number.isNaN(date.getTime()) ? importedAt.slice(0, 10) : date.toISOString().slice(0, 10),
        transactionId: String(field(row, aliases.transactionId) || `${importId}-${index + 1}`),
        sku: String(field(row, aliases.sku) || ""),
        productName: String(field(row, aliases.productName) || "Unmapped item"),
        quantity: numberValue(field(row, aliases.quantity)) || 1,
        grossSales: numberValue(field(row, aliases.grossSales)),
        netSales: numberValue(field(row, aliases.netSales) ?? field(row, aliases.grossSales)),
        sourceFile: file.name,
        sourceSystem: "uploaded_report",
        importedAt
      }
    }).filter((record) => record.productName !== "Unmapped item" || record.sku || record.netSales)

    if (!records.length) return Response.json({ error: "No sales rows were recognized. Include a product/item/SKU and sales or quantity column." }, { status: 422 })
    const sales = principal.db.collection("orgs").doc(principal.orgId).collection("sales")
    for (let index = 0; index < records.length; index += 400) {
      const batch = principal.db.batch()
      records.slice(index, index + 400).forEach((record) => batch.set(sales.doc(record.id), record))
      await batch.commit()
    }

    const importedTotal = records.reduce((sum, record) => sum + record.netSales, 0)
    const recent = await sales.orderBy("importedAt", "desc").limit(1500).get()
    const totals = new Map<string, number>()
    recent.docs.forEach((doc) => {
      const data = doc.data()
      if (data.importId === importId) return
      const key = String(data.businessDate ?? "")
      if (key) totals.set(key, (totals.get(key) ?? 0) + numberValue(data.netSales))
    })
    const baseline = median(Array.from(totals.values()).filter((value) => value > 0))
    const suspicious = importedTotal < 0 || importedTotal > 10_000_000 || (baseline > 0 && (importedTotal > baseline * 3 || importedTotal < baseline * 0.2))
    if (suspicious) {
      const message = `Sales import ${file.name} totaled $${importedTotal.toFixed(2)}${baseline ? ` versus a recent daily median of $${baseline.toFixed(2)}` : ""}. Review the report mapping and source totals.`
      await Promise.all([
        principal.db.collection("orgs").doc(principal.orgId).collection("notifications").doc(`sales-anomaly-${importId}`).set({ id: `sales-anomaly-${importId}`, title: "AI sales variance alert", message, tone: "risk", read: false, href: "/organization", audience: "owner", createdAt: importedAt }),
        principal.db.collection("orgs").doc(principal.orgId).collection("operationalIssues").doc(`sales-anomaly-${importId}`).set({ id: `sales-anomaly-${importId}`, type: "sales_import_anomaly", title: "Suspicious sales import", detail: message, priority: "high", status: "open", storeId: parsed.storeId ?? "organization-wide", createdAt: importedAt, updatedAt: importedAt })
      ])
    }
    return Response.json(mobileEnvelope({ importId, rowsImported: records.length, netSales: importedTotal, recentDailyMedian: baseline, suspicious, alertCreated: suspicious }))
  } catch (error) {
    return mobileError(error)
  }
}
