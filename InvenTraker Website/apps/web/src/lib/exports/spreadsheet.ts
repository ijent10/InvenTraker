import type {
  ExportDataset,
  OrgSettingsRecord,
  SpreadsheetExportColumnRecord,
  SpreadsheetExportPreferenceRecord,
  StoreSettingsRecord
} from "@/lib/data/firestore"

type ExportRow = Record<string, unknown>

export const exportDatasetLabels: Record<ExportDataset, string> = {
  inventory: "Inventory",
  orders: "Orders",
  waste: "Waste",
  expiration: "Expiration",
  production: "Production",
  todo: "To-Do"
}

export const defaultSpreadsheetColumns: Record<ExportDataset, SpreadsheetExportColumnRecord[]> = {
  inventory: [
    { id: "name", label: "Item", path: "name", enabled: true, order: 0, custom: false },
    { id: "upc", label: "Barcode", path: "upc", enabled: true, order: 1, custom: false },
    { id: "department", label: "Department", path: "department", enabled: true, order: 2, custom: false },
    { id: "location", label: "Location", path: "departmentLocation", enabled: true, order: 3, custom: false },
    { id: "quantity", label: "Quantity", path: "totalQuantity", enabled: true, order: 4, custom: false },
    { id: "unit", label: "Unit", path: "unit", enabled: true, order: 5, custom: false },
    { id: "hasExpiration", label: "Has Expiration", path: "hasExpiration", enabled: true, order: 6, custom: false },
    { id: "defaultExpirationDays", label: "Expiration Days", path: "defaultExpirationDays", enabled: true, order: 7, custom: false },
    { id: "minimumQuantity", label: "Minimum Quantity", path: "minimumQuantity", enabled: true, order: 8, custom: false },
    { id: "price", label: "Price", path: "price", enabled: true, order: 9, custom: false },
    { id: "vendorName", label: "Vendor", path: "vendorName", enabled: true, order: 10, custom: false }
  ],
  orders: [
    { id: "itemName", label: "Item", path: "itemName", enabled: true, order: 0, custom: false },
    { id: "vendorName", label: "Vendor", path: "vendorName", enabled: true, order: 1, custom: false },
    { id: "recommendedQuantity", label: "Recommended", path: "recommendedQuantity", enabled: true, order: 2, custom: false },
    { id: "orderedQuantity", label: "Ordered", path: "orderedQuantity", enabled: true, order: 3, custom: false },
    { id: "unit", label: "Unit", path: "itemUnit", enabled: true, order: 4, custom: false },
    { id: "status", label: "Status", path: "status", enabled: true, order: 5, custom: false },
    { id: "orderDate", label: "Order Date", path: "orderDate", enabled: true, order: 6, custom: false },
    { id: "expectedDeliveryDate", label: "Expected Delivery", path: "expectedDeliveryDate", enabled: true, order: 7, custom: false }
  ],
  waste: [
    { id: "itemName", label: "Item", path: "itemName", enabled: true, order: 0, custom: false },
    { id: "quantity", label: "Quantity", path: "quantity", enabled: true, order: 1, custom: false },
    { id: "reason", label: "Reason", path: "reason", enabled: true, order: 2, custom: false },
    { id: "cost", label: "Cost", path: "cost", enabled: true, order: 3, custom: false },
    { id: "createdAt", label: "Recorded At", path: "createdAt", enabled: true, order: 4, custom: false }
  ],
  expiration: [
    { id: "itemName", label: "Item", path: "itemName", enabled: true, order: 0, custom: false },
    { id: "quantity", label: "Quantity", path: "quantity", enabled: true, order: 1, custom: false },
    { id: "unit", label: "Unit", path: "unit", enabled: true, order: 2, custom: false },
    { id: "expirationDate", label: "Expiration Date", path: "expirationDate", enabled: true, order: 3, custom: false },
    { id: "daysUntilExpiration", label: "Days Until Expiration", path: "daysUntilExpiration", enabled: true, order: 4, custom: false }
  ],
  production: [
    { id: "name", label: "Product", path: "name", enabled: true, order: 0, custom: false },
    { id: "outputItemNameSnapshot", label: "Output Item", path: "outputItemNameSnapshot", enabled: true, order: 1, custom: false },
    { id: "defaultBatchYield", label: "Batch Yield", path: "defaultBatchYield", enabled: true, order: 2, custom: false },
    { id: "targetDaysOnHand", label: "Target Days On Hand", path: "targetDaysOnHand", enabled: true, order: 3, custom: false },
    { id: "isActive", label: "Active", path: "isActive", enabled: true, order: 4, custom: false }
  ],
  todo: [
    { id: "title", label: "Task", path: "title", enabled: true, order: 0, custom: false },
    { id: "status", label: "Status", path: "status", enabled: true, order: 1, custom: false },
    { id: "dueAt", label: "Due", path: "dueAt", enabled: true, order: 2, custom: false },
    { id: "createdByName", label: "Created By", path: "createdByName", enabled: true, order: 3, custom: false }
  ]
}

export function mergeSpreadsheetColumns(
  dataset: ExportDataset,
  preference?: SpreadsheetExportPreferenceRecord
): SpreadsheetExportColumnRecord[] {
  const defaults = defaultSpreadsheetColumns[dataset]
  const byId = new Map(defaults.map((column) => [column.id, { ...column }]))
  for (const column of preference?.columns ?? []) {
    const base = byId.get(column.id)
    byId.set(column.id, {
      ...(base ?? column),
      ...column,
      custom: column.custom || Boolean(!base)
    })
  }
  return Array.from(byId.values()).sort((left, right) => left.order - right.order || left.label.localeCompare(right.label))
}

export function resolveSpreadsheetPreference(
  dataset: ExportDataset,
  settings?: { orgSettings?: OrgSettingsRecord | null; storeSettings?: StoreSettingsRecord | null }
): SpreadsheetExportPreferenceRecord {
  const storePreference = settings?.storeSettings?.exportPreferences?.find((entry) => entry.dataset === dataset)
  const orgPreference = settings?.orgSettings?.exportPreferences?.find((entry) => entry.dataset === dataset)
  const preference = storePreference ?? orgPreference
  return {
    dataset,
    columns: mergeSpreadsheetColumns(dataset, preference),
    includeGeneratedAt: preference?.includeGeneratedAt ?? true,
    includeStoreInfo: preference?.includeStoreInfo ?? true,
    fileNameTemplate: preference?.fileNameTemplate
  }
}

function valueAtPath(row: ExportRow, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined
    return (current as Record<string, unknown>)[part]
  }, row)
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (value && typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate()
    } catch {
      return null
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function formatCellValue(value: unknown): string | number | boolean {
  const date = asDate(value)
  if (date) return date.toLocaleString()
  if (typeof value === "number" || typeof value === "boolean") return value
  if (Array.isArray(value)) return value.join(", ")
  if (value === null || value === undefined) return ""
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function escapeHtml(value: string | number | boolean): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function cleanFileName(value: string): string {
  return value.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-").toLowerCase() || "export"
}

function renderTemplate(template: string | undefined, fallback: string, context: Record<string, string>) {
  const raw = template?.trim() || fallback
  return raw.replace(/\{(\w+)\}/g, (_, key: string) => context[key] ?? "")
}

function categoryNamesById(
  dataset: ExportDataset,
  settings?: { orgSettings?: OrgSettingsRecord | null; storeSettings?: StoreSettingsRecord | null }
) {
  const rows = [
    ...(settings?.orgSettings?.categoryConfigs ?? []),
    ...(settings?.storeSettings?.categoryConfigs ?? [])
  ].filter((category) => category.enabled && category.appliesTo.includes(dataset))
  return new Map(rows.map((category) => [category.id, category.name]))
}

export function downloadSpreadsheetExport(input: {
  dataset: ExportDataset
  rows: ExportRow[]
  settings?: { orgSettings?: OrgSettingsRecord | null; storeSettings?: StoreSettingsRecord | null }
  organizationName?: string
  storeName?: string
  scopeLabel?: string
}) {
  const preference = resolveSpreadsheetPreference(input.dataset, input.settings)
  const columns = preference.columns.filter((column) => column.enabled)
  const categories = categoryNamesById(input.dataset, input.settings)
  const categoryLabels = columns.map((column) => (column.categoryId ? categories.get(column.categoryId) ?? "" : ""))
  const hasCategoryLabels = categoryLabels.some((label) => label.length > 0)
  const now = new Date()
  const generatedAt = now.toLocaleString()
  const title = input.scopeLabel ?? `${input.storeName ?? input.organizationName ?? "InvenTraker"} ${exportDatasetLabels[input.dataset]}`
  const headingRows = [
    `<tr><th colspan="${Math.max(1, columns.length)}">${escapeHtml(title)}</th></tr>`,
    preference.includeGeneratedAt
      ? `<tr><td colspan="${Math.max(1, columns.length)}">Generated ${escapeHtml(generatedAt)}</td></tr>`
      : "",
    preference.includeStoreInfo && (input.organizationName || input.storeName)
      ? `<tr><td colspan="${Math.max(1, columns.length)}">${escapeHtml(
          [input.organizationName, input.storeName].filter(Boolean).join(" / ")
        )}</td></tr>`
      : ""
  ].filter(Boolean)
  const categoryHeader = hasCategoryLabels
    ? `<tr>${categoryLabels.map((label) => `<th>${escapeHtml(label)}</th>`).join("")}</tr>`
    : ""
  const header = `<tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>`
  const body = input.rows
    .map(
      (row) =>
        `<tr>${columns
          .map((column) => `<td>${escapeHtml(formatCellValue(valueAtPath(row, column.path)))}</td>`)
          .join("")}</tr>`
    )
    .join("")
  const workbook = `<!doctype html><html><head><meta charset="utf-8" /></head><body><table>${[
    ...headingRows,
    categoryHeader,
    header,
    body
  ].join("")}</table></body></html>`
  const fallbackName = `${input.dataset}-{date}`
  const fileName = cleanFileName(
    renderTemplate(preference.fileNameTemplate, fallbackName, {
      dataset: input.dataset,
      date: now.toISOString().slice(0, 10),
      store: input.storeName ?? "all-stores",
      org: input.organizationName ?? "organization"
    })
  )
  const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${fileName}.xls`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
