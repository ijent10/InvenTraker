import { createHash } from "crypto"

import type { CompanyDocumentType, CompanyFileType, CompanyFileVisibilityScope } from "@/lib/demo-data"
import { createLocalTextEmbedding } from "@/lib/intelligence/vector-search"

export type ParsedBusinessDocument = {
  text: string
  chunks: Array<{
    sectionTitle: string
    headingPath: string[]
    pageStart?: number
    pageEnd?: number
    text: string
    tableData?: string[][]
  }>
  fileType: CompanyFileType
  parser: string
}

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? ""
}

function decodeBuffer(buffer: Buffer) {
  return buffer.toString("utf8").replace(/\u0000/g, "")
}

function typeFromFile(fileName: string, mimeType: string): CompanyFileType {
  const extension = fileExtension(fileName)
  if (extension === "pdf" || mimeType.includes("pdf")) return "pdf"
  if (extension === "docx") return "docx"
  if (extension === "md" || extension === "markdown") return "markdown"
  if (extension === "csv") return "csv"
  if (extension === "json") return "json"
  if (extension === "txt" || mimeType.startsWith("text/")) return "txt"
  if (["xlsx", "xls"].includes(extension)) return "spreadsheet"
  if (mimeType.startsWith("image/")) return "image"
  return "other"
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

async function extractDocx(buffer: Buffer) {
  const mammoth = await import("mammoth")
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

async function extractSpreadsheet(buffer: Buffer) {
  const xlsx = await import("xlsx")
  const workbook = xlsx.read(buffer, { type: "buffer", cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) return ""
  const matrix = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", raw: false })
  return matrix.map((row) => row.join("\t")).join("\n")
}

function chunkText(text: string) {
  const clean = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  if (!clean) return []

  const sections = clean
    .split(/\n(?=#{1,3}\s|\d+\.\s|[A-Z][A-Za-z /\-&]{2,80}\n)/)
    .map((section) => section.trim())
    .filter(Boolean)

  const sourceSections = sections.length > 1 ? sections : clean.match(/[\s\S]{1,1600}(?=\s|$)/g) ?? [clean]

  return sourceSections.map((section, index) => {
    const firstLine = section.split("\n")[0]?.replace(/^#{1,3}\s*/, "").trim()
    const sectionTitle = firstLine && firstLine.length <= 90 ? firstLine : `Section ${index + 1}`
    return {
      sectionTitle,
      headingPath: [sectionTitle],
      pageStart: index + 1,
      pageEnd: index + 1,
      text: section
    }
  })
}

export async function parseBusinessDocument(file: File): Promise<ParsedBusinessDocument> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const fileType = typeFromFile(file.name, file.type)
  let parser = "Text parser"
  let text = ""

  if (fileType === "pdf") {
    parser = "PDF parser"
    text = await extractPdf(buffer)
  } else if (fileType === "docx") {
    parser = "Word parser"
    text = await extractDocx(buffer)
  } else if (fileType === "spreadsheet") {
    parser = "Spreadsheet parser"
    text = await extractSpreadsheet(buffer)
  } else if (fileType === "csv") {
    parser = "CSV parser"
    text = decodeBuffer(buffer)
  } else if (fileType === "json") {
    parser = "JSON parser"
    const parsed = JSON.parse(decodeBuffer(buffer))
    text = JSON.stringify(parsed, null, 2)
  } else {
    text = decodeBuffer(buffer)
  }

  return {
    text,
    chunks: chunkText(text),
    fileType,
    parser
  }
}

export function documentIdFor(title: string, fileName: string) {
  const hash = createHash("sha1").update(`${title}-${fileName}-${Date.now()}`).digest("hex").slice(0, 10)
  return `doc-${hash}`
}

export function normalizeDocumentType(value: FormDataEntryValue | null): CompanyDocumentType {
  return (typeof value === "string" && value.trim() ? value.trim() : "internal memo") as CompanyDocumentType
}

export function normalizeVisibilityScope(value: FormDataEntryValue | null): CompanyFileVisibilityScope {
  const text = typeof value === "string" ? value : "organization"
  if (["organization", "jobTitle", "department", "area", "store", "region", "district", "individuals"].includes(text)) return text as CompanyFileVisibilityScope
  return "organization"
}

export function embeddingForChunk(text: string) {
  return createLocalTextEmbedding(text)
}
