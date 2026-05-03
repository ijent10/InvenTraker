export type ImportDataset = "inventory" | "orders" | "waste" | "expiration" | "production" | "todo"

export type ImportFieldDefinition = {
  id: string
  label: string
  path: string
  aliases: string[]
  required?: boolean
  kind?: "text" | "number" | "date" | "boolean" | "barcode"
}

export type ImportColumnMapping = {
  index: number
  sourceHeader: string
  samples: string[]
  suggestedField?: ImportFieldDefinition
  confidence: number
}

export type ImportInspectionResult = {
  ok: true
  fileName: string
  fileType: string
  dataset: ImportDataset
  requestedDataset?: ImportDataset
  rowCount: number
  columns: ImportColumnMapping[]
  warnings: string[]
  rows: Record<string, string>[]
  previewRows: Record<string, string>[]
}

export const importDatasetLabels: Record<ImportDataset, string> = {
  inventory: "Inventory",
  orders: "Orders",
  waste: "Waste",
  expiration: "Expiration",
  production: "Production",
  todo: "To-Do"
}

export const importDatasetOptions: ImportDataset[] = ["inventory", "orders", "waste", "expiration", "production", "todo"]

export const importFieldDefinitions: Record<ImportDataset, ImportFieldDefinition[]> = {
  inventory: [
    { id: "name", label: "Item", path: "name", required: true, kind: "text", aliases: ["item", "item name", "product", "product name", "description", "name"] },
    { id: "upc", label: "Barcode", path: "upc", kind: "barcode", aliases: ["upc", "barcode", "bar code", "scan code", "sku", "plu"] },
    { id: "department", label: "Department", path: "department", kind: "text", aliases: ["department", "dept", "category", "section"] },
    { id: "location", label: "Location", path: "departmentLocation", kind: "text", aliases: ["location", "department location", "area", "stock area", "shelf", "cooler"] },
    { id: "quantity", label: "Quantity", path: "totalQuantity", kind: "number", aliases: ["quantity", "qty", "on hand", "count", "inventory", "current inventory", "current qty"] },
    { id: "unit", label: "Unit", path: "unit", kind: "text", aliases: ["unit", "uom", "unit of measure", "measure"] },
    { id: "hasExpiration", label: "Has Expiration", path: "hasExpiration", kind: "boolean", aliases: ["has expiration", "expiration", "expires", "perishable", "shelf life", "requires date"] },
    { id: "defaultExpirationDays", label: "Expiration Days", path: "defaultExpirationDays", kind: "number", aliases: ["expiration days", "default expiration", "shelf life days", "shelf life", "expires in", "days good"] },
    { id: "minimumQuantity", label: "Minimum Quantity", path: "minimumQuantity", kind: "number", aliases: ["minimum", "min", "min qty", "minimum quantity", "par", "par level"] },
    { id: "price", label: "Price", path: "price", kind: "number", aliases: ["price", "cost", "unit cost", "item cost"] },
    { id: "vendorName", label: "Vendor", path: "vendorName", kind: "text", aliases: ["vendor", "supplier", "distributor"] }
  ],
  orders: [
    { id: "itemName", label: "Item", path: "itemName", required: true, kind: "text", aliases: ["item", "item name", "product", "description", "name"] },
    { id: "vendorName", label: "Vendor", path: "vendorName", kind: "text", aliases: ["vendor", "supplier", "distributor"] },
    { id: "recommendedQuantity", label: "Recommended", path: "recommendedQuantity", kind: "number", aliases: ["recommended", "suggested", "suggested qty", "recommended quantity", "system qty"] },
    { id: "orderedQuantity", label: "Ordered", path: "orderedQuantity", kind: "number", aliases: ["ordered", "order", "order qty", "ordered quantity", "qty to order", "quantity"] },
    { id: "unit", label: "Unit", path: "itemUnit", kind: "text", aliases: ["unit", "uom", "unit of measure"] },
    { id: "status", label: "Status", path: "status", kind: "text", aliases: ["status", "state"] },
    { id: "orderDate", label: "Order Date", path: "orderDate", kind: "date", aliases: ["order date", "date ordered", "date"] },
    { id: "expectedDeliveryDate", label: "Expected Delivery", path: "expectedDeliveryDate", kind: "date", aliases: ["expected delivery", "delivery date", "eta", "arrival date"] }
  ],
  waste: [
    { id: "itemName", label: "Item", path: "itemName", required: true, kind: "text", aliases: ["item", "item name", "product", "description", "name"] },
    { id: "quantity", label: "Quantity", path: "quantity", kind: "number", aliases: ["quantity", "qty", "amount", "waste qty"] },
    { id: "reason", label: "Reason", path: "reason", kind: "text", aliases: ["reason", "waste reason", "waste type", "type"] },
    { id: "cost", label: "Cost", path: "cost", kind: "number", aliases: ["cost", "waste cost", "value", "loss"] },
    { id: "createdAt", label: "Recorded At", path: "createdAt", kind: "date", aliases: ["recorded", "recorded at", "created", "created at", "date"] }
  ],
  expiration: [
    { id: "itemName", label: "Item", path: "itemName", required: true, kind: "text", aliases: ["item", "item name", "product", "description", "name"] },
    { id: "quantity", label: "Quantity", path: "quantity", kind: "number", aliases: ["quantity", "qty", "amount"] },
    { id: "unit", label: "Unit", path: "unit", kind: "text", aliases: ["unit", "uom", "unit of measure"] },
    { id: "expirationDate", label: "Expiration Date", path: "expirationDate", kind: "date", aliases: ["expiration", "expiration date", "expires", "expires at", "use by", "best by"] },
    { id: "daysUntilExpiration", label: "Days Until Expiration", path: "daysUntilExpiration", kind: "number", aliases: ["days", "days left", "days until expiration"] }
  ],
  production: [
    { id: "name", label: "Product", path: "name", required: true, kind: "text", aliases: ["product", "production item", "item", "name"] },
    { id: "outputItemNameSnapshot", label: "Output Item", path: "outputItemNameSnapshot", kind: "text", aliases: ["output", "output item", "made item", "inventory item"] },
    { id: "defaultBatchYield", label: "Batch Yield", path: "defaultBatchYield", kind: "number", aliases: ["yield", "batch yield", "default yield", "quantity made"] },
    { id: "targetDaysOnHand", label: "Target Days On Hand", path: "targetDaysOnHand", kind: "number", aliases: ["target days", "days on hand", "target days on hand"] },
    { id: "isActive", label: "Active", path: "isActive", kind: "boolean", aliases: ["active", "enabled", "is active"] }
  ],
  todo: [
    { id: "title", label: "Task", path: "title", required: true, kind: "text", aliases: ["task", "title", "to do", "todo", "action"] },
    { id: "status", label: "Status", path: "status", kind: "text", aliases: ["status", "state"] },
    { id: "dueAt", label: "Due", path: "dueAt", kind: "date", aliases: ["due", "due date", "deadline"] },
    { id: "createdByName", label: "Created By", path: "createdByName", kind: "text", aliases: ["created by", "owner", "assigned by"] }
  ]
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_./()-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function tokens(value: string): string[] {
  return normalizeText(value).split(" ").filter((token) => token.length > 1)
}

function sampleLooksLike(kind: ImportFieldDefinition["kind"], samples: string[]): number {
  const values = samples.map((sample) => sample.trim()).filter(Boolean)
  if (!kind || values.length === 0) return 0
  if (kind === "text") return values.some((value) => /[a-z]/i.test(value)) ? 0.05 : 0
  if (kind === "barcode") {
    return values.some((value) => /^[0-9]{6,14}$/.test(value.replace(/\D/g, ""))) ? 0.18 : 0
  }
  if (kind === "number") {
    const numeric = values.filter((value) => Number.isFinite(Number(value.replace(/[$,]/g, ""))))
    return numeric.length >= Math.max(1, Math.ceil(values.length / 2)) ? 0.15 : 0
  }
  if (kind === "date") {
    const dated = values.filter((value) => !Number.isNaN(new Date(value).getTime()))
    return dated.length >= Math.max(1, Math.ceil(values.length / 2)) ? 0.15 : 0
  }
  if (kind === "boolean") {
    return values.some((value) => /^(true|false|yes|no|active|inactive|enabled|disabled)$/i.test(value)) ? 0.12 : 0
  }
  return 0
}

function scoreField(header: string, samples: string[], field: ImportFieldDefinition): number {
  const normalizedHeader = normalizeText(header)
  const aliases = [field.id, field.label, field.path, ...field.aliases].map(normalizeText)
  if (aliases.includes(normalizedHeader)) return 1
  if (aliases.some((alias) => alias && normalizedHeader.includes(alias))) return Math.min(0.9, 0.72 + sampleLooksLike(field.kind, samples))
  if (aliases.some((alias) => alias && alias.includes(normalizedHeader) && normalizedHeader.length > 2)) {
    return Math.min(0.86, 0.66 + sampleLooksLike(field.kind, samples))
  }
  const headerTokens = new Set(tokens(header))
  if (headerTokens.size === 0) return sampleLooksLike(field.kind, samples)
  const bestOverlap = aliases.reduce((best, alias) => {
    const aliasTokens = tokens(alias)
    if (aliasTokens.length === 0) return best
    const overlap = aliasTokens.filter((token) => headerTokens.has(token)).length
    return Math.max(best, overlap / Math.max(aliasTokens.length, headerTokens.size))
  }, 0)
  return Math.min(0.82, bestOverlap * 0.72 + sampleLooksLike(field.kind, samples))
}

function inferForDataset(dataset: ImportDataset, headers: string[], rows: string[][]): ImportColumnMapping[] {
  const usedFieldIds = new Set<string>()
  return headers.map((header, index) => {
    const samples = rows.map((row) => row[index] ?? "").filter(Boolean).slice(0, 4)
    const ranked = importFieldDefinitions[dataset]
      .map((field) => ({ field, confidence: scoreField(header, samples, field) }))
      .sort((left, right) => right.confidence - left.confidence)
    const winner = ranked.find((entry) => entry.confidence >= 0.42 && !usedFieldIds.has(entry.field.id))
    if (winner) usedFieldIds.add(winner.field.id)
    return {
      index,
      sourceHeader: header || `Column ${index + 1}`,
      samples,
      suggestedField: winner?.field,
      confidence: winner ? Number(winner.confidence.toFixed(2)) : 0
    }
  })
}

function datasetScore(dataset: ImportDataset, mappings: ImportColumnMapping[]): number {
  const mapped = mappings.filter((mapping) => mapping.suggestedField)
  const required = importFieldDefinitions[dataset].filter((field) => field.required)
  const requiredHits = required.filter((field) =>
    mapped.some((mapping) => mapping.suggestedField?.id === field.id)
  ).length
  const confidence = mapped.reduce((sum, mapping) => sum + mapping.confidence, 0)
  return confidence + mapped.length * 0.08 + requiredHits * 0.6
}

export function inspectImportTable(input: {
  fileName: string
  fileType: string
  headers: string[]
  rows: string[][]
  requestedDataset?: ImportDataset
  warnings?: string[]
}): ImportInspectionResult {
  const headers = input.headers.map((header, index) => header.trim() || `Column ${index + 1}`)
  const rows = input.rows.slice(0, 200)
  const ranked = importDatasetOptions
    .map((dataset) => {
      const columns = inferForDataset(dataset, headers, rows)
      return { dataset, columns, score: datasetScore(dataset, columns) }
    })
    .sort((left, right) => right.score - left.score)
  const selected = input.requestedDataset
    ? ranked.find((entry) => entry.dataset === input.requestedDataset) ?? ranked[0]
    : ranked[0]
  const dataset = selected?.dataset ?? "inventory"
  const columns = selected?.columns ?? inferForDataset(dataset, headers, rows)
  const mappedRows = rows.slice(0, 1000).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
  )
  const warnings = [...(input.warnings ?? [])]
  if (rows.length > mappedRows.length) {
    warnings.push(`Only the first ${mappedRows.length} rows will be imported from this file.`)
  }
  return {
    ok: true,
    fileName: input.fileName,
    fileType: input.fileType,
    dataset,
    requestedDataset: input.requestedDataset,
    rowCount: input.rows.length,
    columns,
    warnings,
    rows: mappedRows,
    previewRows: mappedRows.slice(0, 25)
  }
}

export function isImportDataset(value: unknown): value is ImportDataset {
  return typeof value === "string" && importDatasetOptions.includes(value as ImportDataset)
}
