import type { InventoryItem } from "@/lib/demo-data"

export type ImportExpirationBehavior = "None" | "Some items" | "All items"

export type ImportFieldMapping = {
  targetField: keyof InventoryItem | "price" | "quantityInCase" | "rawText"
  label: string
  sourceColumn: string
  confidence: "high" | "medium" | "low"
  sampleValues: string[]
}

export type ImportSourceKind = "spreadsheet" | "pdf" | "word" | "image" | "text"

export type ParsedImportRow = {
  rowNumber: number
  values: Record<string, string>
  sourceText: string
}

export type ParsedInventoryCandidate = {
  rowNumber: number
  name: string
  sku: string
  department: string
  category: string
  location: string
  vendor: string
  unit: string
  frontStock: number
  backStock: number
  onHand: number
  price?: number
  quantityInCase?: number
  expires: boolean
  sourceValues: Record<string, string>
  reviewFlags: string[]
}

export type InventoryImportResult = {
  fileName: string
  fileType: string
  source: {
    kind: ImportSourceKind
    parser: string
    notes: string[]
  }
  headers: string[]
  rows: ParsedImportRow[]
  mappings: ImportFieldMapping[]
  candidates: ParsedInventoryCandidate[]
  extractedText: string
  summary: {
    rowCount: number
    candidateCount: number
    reviewFlagCount: number
    mappedFieldCount: number
  }
}

const targetFields: Array<{ field: ImportFieldMapping["targetField"]; label: string; patterns: RegExp[] }> = [
  { field: "name", label: "Item name", patterns: [/^item$/, /item.*name/, /product.*name/, /description/, /^name$/] },
  { field: "sku", label: "SKU or barcode", patterns: [/sku/, /upc/, /barcode/, /plu/, /item.*#/i, /product.*id/] },
  { field: "department", label: "Department", patterns: [/department/, /^dept$/] },
  { field: "category", label: "Category", patterns: [/category/, /class/, /type/, /group/] },
  { field: "location", label: "Location", patterns: [/location/, /aisle/, /shelf/, /rack/, /area/] },
  { field: "vendor", label: "Vendor", patterns: [/vendor/, /supplier/, /distributor/] },
  { field: "unit", label: "Unit", patterns: [/unit/, /uom/, /measure/] },
  { field: "frontStock", label: "Front stock", patterns: [/front/, /floor/, /sales.*floor/, /display.*qty/] },
  { field: "backStock", label: "Back stock", patterns: [/back/, /backstock/, /storage/, /warehouse/] },
  { field: "onHand", label: "On hand", patterns: [/on.*hand/, /quantity/, /^qty$/, /count/, /stock/] },
  { field: "price", label: "Price or cost", patterns: [/price/, /cost/, /retail/] },
  { field: "quantityInCase", label: "Quantity in case", patterns: [/case/, /pack/, /case.*qty/, /qty.*case/, /pack.*size/] },
  { field: "expires", label: "Expiration behavior", patterns: [/expir/, /shelf.*life/, /best.*by/, /use.*by/] }
]

function cleanCell(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim()
}

function decodeBuffer(buffer: Buffer) {
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer).replace(/\u0000/g, "")
}

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? ""
}

function sourceKind(fileName: string, mimeType: string): ImportSourceKind {
  const extension = fileExtension(fileName)
  if (["xlsx", "xls"].includes(extension) || mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "spreadsheet"
  if (extension === "pdf" || mimeType.includes("pdf")) return "pdf"
  if (["docx", "doc"].includes(extension) || mimeType.includes("word")) return "word"
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "heic", "heif"].includes(extension) || mimeType.startsWith("image/")) return "image"
  return "text"
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const nextCharacter = line[index + 1]

    if (character === '"' && nextCharacter === '"') {
      current += '"'
      index += 1
    } else if (character === '"') {
      inQuotes = !inQuotes
    } else if (character === delimiter && !inQuotes) {
      cells.push(cleanCell(current))
      current = ""
    } else {
      current += character
    }
  }

  cells.push(cleanCell(current))
  return cells
}

function chooseDelimiter(text: string) {
  const sample = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12)
  const candidates = [",", "\t", "|", ";"]

  return candidates
    .map((delimiter) => ({
      delimiter,
      score: sample.reduce((total, line) => total + Math.max(0, parseDelimitedLine(line, delimiter).length - 1), 0)
    }))
    .sort((a, b) => b.score - a.score)[0]
}

function uniqueHeaders(headers: string[]) {
  const counts = new Map<string, number>()

  return headers.map((header, index) => {
    const fallback = `Column ${index + 1}`
    const base = cleanCell(header) || fallback
    const count = counts.get(base.toLowerCase()) ?? 0
    counts.set(base.toLowerCase(), count + 1)
    return count === 0 ? base : `${base} ${count + 1}`
  })
}

function matrixToRows(matrix: string[][]) {
  const nonEmptyRows = matrix.filter((row) => row.some(Boolean))
  if (nonEmptyRows.length === 0) return { headers: [], rows: [] }

  const firstRow = nonEmptyRows[0]
  const firstRowLooksLikeHeader =
    firstRow.filter(Boolean).length > 1 &&
    firstRow.some((cell) => /[a-z]/i.test(cell)) &&
    firstRow.some((cell) => targetFields.some((field) => field.patterns.some((pattern) => pattern.test(cell.toLowerCase()))))
  const headers = uniqueHeaders(firstRowLooksLikeHeader ? firstRow : firstRow.map((_, index) => `Column ${index + 1}`))
  const bodyRows = firstRowLooksLikeHeader ? nonEmptyRows.slice(1) : nonEmptyRows

  return {
    headers,
    rows: bodyRows.map((row, index) => {
      const values = Object.fromEntries(headers.map((header, columnIndex) => [header, cleanCell(row[columnIndex])]))
      return {
        rowNumber: index + (firstRowLooksLikeHeader ? 2 : 1),
        values,
        sourceText: row.map(cleanCell).filter(Boolean).join(" | ")
      }
    })
  }
}

function textToRows(text: string) {
  const delimiterScore = chooseDelimiter(text)
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (delimiterScore.score > 0) {
    return matrixToRows(lines.map((line) => parseDelimitedLine(line, delimiterScore.delimiter)))
  }

  const rows = lines.map((line, index) => {
    const skuMatch = line.match(/\b(?:[A-Z]{2,}[-A-Z0-9]{2,}|\d{8,14})\b/)
    const priceMatch = line.match(/\$?\d+\.\d{2}\b/)
    const quantityMatch = line.match(/\b(?:qty|quantity|count|stock|on hand)?\s*(\d{1,5})\b/i)
    const name = cleanCell(
      line
        .replace(skuMatch?.[0] ?? "", "")
        .replace(priceMatch?.[0] ?? "", "")
        .replace(quantityMatch?.[0] ?? "", "")
    )

    return {
      rowNumber: index + 1,
      values: {
        "Raw line": line,
        "Item name": name || line,
        "SKU or barcode": skuMatch?.[0] ?? "",
        Quantity: quantityMatch?.[1] ?? "",
        Price: priceMatch?.[0] ?? ""
      },
      sourceText: line
    }
  })

  return { headers: ["Raw line", "Item name", "SKU or barcode", "Quantity", "Price"], rows }
}

function samplesForColumn(rows: ParsedImportRow[], header: string) {
  return rows
    .map((row) => row.values[header])
    .filter(Boolean)
    .slice(0, 3)
}

function inferMappings(headers: string[], rows: ParsedImportRow[]) {
  const mappings: ImportFieldMapping[] = []
  const usedHeaders = new Set<string>()

  targetFields.forEach((target) => {
    const scoredHeaders = headers
      .filter((header) => !usedHeaders.has(header))
      .map((header) => {
        const normalized = header.toLowerCase()
        const patternMatch = target.patterns.some((pattern) => pattern.test(normalized))
        const samples = samplesForColumn(rows, header)
        const sampleText = samples.join(" ").toLowerCase()
        const quantityTarget = target.field === "onHand" || target.field === "frontStock" || target.field === "backStock" || target.field === "quantityInCase"
        const sampleMatch =
          target.field === "price"
            ? samples.some((sample) => /\$?\d+\.\d{2}/.test(sample))
            : target.field === "sku"
              ? samples.some((sample) => /\b(?:[A-Z]{2,}[-A-Z0-9]{2,}|\d{8,14})\b/.test(sample))
              : quantityTarget
                ? samples.some((sample) => /^\d+(\.\d+)?$/.test(sample))
                : target.patterns.some((pattern) => pattern.test(sampleText))
        const sampleScore = quantityTarget && !patternMatch ? 0 : sampleMatch ? 1 : 0

        return {
          header,
          score: (patternMatch ? 3 : 0) + sampleScore,
          samples
        }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)

    const best = scoredHeaders[0]
    if (!best) return

    usedHeaders.add(best.header)
    mappings.push({
      targetField: target.field,
      label: target.label,
      sourceColumn: best.header,
      confidence: best.score >= 3 ? "high" : best.score === 2 ? "medium" : "low",
      sampleValues: best.samples
    })
  })

  return mappings
}

function mappingValue(row: ParsedImportRow, mappings: ImportFieldMapping[], targetField: ImportFieldMapping["targetField"]) {
  const mapping = mappings.find((candidate) => candidate.targetField === targetField)
  return mapping ? cleanCell(row.values[mapping.sourceColumn]) : ""
}

function numericValue(value: string) {
  const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : undefined
}

function boolFromExpiration(value: string, behavior: ImportExpirationBehavior) {
  if (behavior === "All items") return true
  if (behavior === "None") return false
  return Boolean(value && !/^(no|none|n\/a|false|0)$/i.test(value.trim()))
}

function buildCandidates(
  rows: ParsedImportRow[],
  mappings: ImportFieldMapping[],
  options: { defaultUnit: string; expirationBehavior: ImportExpirationBehavior }
) {
  return rows.map((row) => {
    const frontStock = numericValue(mappingValue(row, mappings, "frontStock")) ?? 0
    const backStock = numericValue(mappingValue(row, mappings, "backStock")) ?? 0
    const onHand = numericValue(mappingValue(row, mappings, "onHand")) ?? frontStock + backStock
    const name = mappingValue(row, mappings, "name")
    const sku = mappingValue(row, mappings, "sku")
    const reviewFlags = [
      !name ? "Missing item name" : "",
      !sku ? "Missing SKU/barcode" : "",
      mappings.length < 3 ? "Low mapping confidence" : "",
      onHand === 0 && frontStock === 0 && backStock === 0 ? "No quantity found" : ""
    ].filter(Boolean)

    return {
      rowNumber: row.rowNumber,
      name: name || row.values["Item name"] || row.values["Raw line"] || "Needs item name",
      sku,
      department: mappingValue(row, mappings, "department"),
      category: mappingValue(row, mappings, "category"),
      location: mappingValue(row, mappings, "location"),
      vendor: mappingValue(row, mappings, "vendor"),
      unit: mappingValue(row, mappings, "unit") || options.defaultUnit || "eaches",
      frontStock,
      backStock,
      onHand,
      price: numericValue(mappingValue(row, mappings, "price")),
      quantityInCase: numericValue(mappingValue(row, mappings, "quantityInCase")),
      expires: boolFromExpiration(mappingValue(row, mappings, "expires"), options.expirationBehavior),
      sourceValues: row.values,
      reviewFlags
    }
  })
}

async function extractSpreadsheet(buffer: Buffer) {
  const xlsx = await import("xlsx")
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) return { text: "", headers: [], rows: [] }
  const matrix = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", raw: false }).map((row) => row.map(cleanCell))
  const parsed = matrixToRows(matrix)
  return { text: matrix.map((row) => row.join("\t")).join("\n"), ...parsed }
}

async function extractPdf(buffer: Buffer) {
  const { PDFParse } = await import("pdf-parse")
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return result.text ?? ""
  } finally {
    await parser.destroy()
  }
}

async function extractWord(buffer: Buffer, fileName: string) {
  if (fileExtension(fileName) === "docx") {
    const mammoth = await import("mammoth")
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  return decodeBuffer(buffer)
}

async function extractImage(buffer: Buffer) {
  const tesseract = await import("tesseract.js")
  const tesseractModule = tesseract.default ?? tesseract
  const result = await tesseractModule.recognize(buffer, "eng")
  return result.data.text ?? ""
}

export async function parseInventoryImportFile(
  file: File,
  options: { defaultUnit: string; expirationBehavior: ImportExpirationBehavior }
): Promise<InventoryImportResult> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const kind = sourceKind(file.name, file.type)
  const notes: string[] = []
  let parser = "Text parser"
  let extractedText = ""
  let headers: string[] = []
  let rows: ParsedImportRow[] = []

  if (kind === "spreadsheet") {
    parser = "Spreadsheet parser"
    const spreadsheet = await extractSpreadsheet(buffer)
    extractedText = spreadsheet.text
    headers = spreadsheet.headers
    rows = spreadsheet.rows
  } else if (kind === "pdf") {
    parser = "PDF text extractor"
    extractedText = await extractPdf(buffer)
    notes.push("Scanned PDFs may need image OCR if no embedded text is present.")
  } else if (kind === "word") {
    parser = fileExtension(file.name) === "docx" ? "Word document parser" : "Legacy Word text fallback"
    extractedText = await extractWord(buffer, file.name)
    if (fileExtension(file.name) === "doc") notes.push("Legacy .doc files are best-effort. Convert to .docx for more reliable extraction.")
  } else if (kind === "image") {
    parser = "Image OCR parser"
    extractedText = await extractImage(buffer)
    notes.push("Image imports use OCR and should always be reviewed before saving.")
  } else {
    parser = "Delimited text parser"
    extractedText = decodeBuffer(buffer)
  }

  if (kind !== "spreadsheet") {
    const textRows = textToRows(extractedText)
    headers = textRows.headers
    rows = textRows.rows
  }

  const mappings = inferMappings(headers, rows)
  const candidates = buildCandidates(rows, mappings, options)
  const reviewFlagCount = candidates.reduce((total, candidate) => total + candidate.reviewFlags.length, 0)

  if (rows.length === 0) notes.push("No import rows were detected. Try a clearer file or a spreadsheet export.")
  if (!mappings.some((mapping) => mapping.targetField === "name")) notes.push("No item-name column was confidently detected.")
  if (!mappings.some((mapping) => mapping.targetField === "sku")) notes.push("No SKU or barcode column was confidently detected.")

  return {
    fileName: file.name,
    fileType: file.type || fileExtension(file.name) || "unknown",
    source: { kind, parser, notes },
    headers,
    rows: rows.slice(0, 200),
    mappings,
    candidates: candidates.slice(0, 200),
    extractedText: extractedText.slice(0, 12000),
    summary: {
      rowCount: rows.length,
      candidateCount: candidates.length,
      reviewFlagCount,
      mappedFieldCount: mappings.length
    }
  }
}
