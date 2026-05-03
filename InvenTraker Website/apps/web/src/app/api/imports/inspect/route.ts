import { NextResponse } from "next/server"
import pdfParse from "pdf-parse"

import {
  inspectImportTable,
  isImportDataset,
  type ImportDataset
} from "@/lib/imports/attribute-mapper"
import { parseXlsxRows } from "@/lib/imports/xlsx-lite"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function parseDelimited(text: string, delimiter: "," | "\t" | "|"): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '"' && quoted && next === '"') {
      cell += '"'
      index += 1
      continue
    }
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (!quoted && char === delimiter) {
      row.push(cell.trim())
      cell = ""
      continue
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1
      row.push(cell.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ""
      continue
    }
    cell += char ?? ""
  }
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function parseWhitespaceTable(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s{2,}/).map((cell) => cell.trim()))
    .filter((row) => row.length > 1)
}

function parseKeyValueRows(text: string): string[][] {
  const pairs = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.{2,80}?)(?::|\s+-\s+|\s{2,})(.+)$/)
      return match ? [match[1]?.trim() ?? "", match[2]?.trim() ?? ""] : null
    })
    .filter((row): row is string[] => Boolean(row?.[0]))
    .slice(0, 40)
  if (pairs.length === 0) return []
  return [pairs.map((pair) => pair[0] ?? ""), pairs.map((pair) => pair[1] ?? "")]
}

function parseTextRows(text: string, fileName: string): { rows: string[][]; warnings: string[] } {
  const warnings: string[] = []
  const normalized = text.replace(/\u0000/g, "").trim()
  if (!normalized) return { rows: [], warnings: ["No readable text was found in this file."] }
  const lowerName = fileName.toLowerCase()
  const rows = lowerName.endsWith(".tsv")
    ? parseDelimited(normalized, "\t")
    : lowerName.endsWith(".psv")
      ? parseDelimited(normalized, "|")
      : parseDelimited(normalized, ",")
  if (rows.some((row) => row.length > 1)) return { rows, warnings }

  const tableRows = parseWhitespaceTable(normalized)
  if (tableRows.length > 1) {
    warnings.push("Detected a whitespace-separated table. Review mappings carefully.")
    return { rows: tableRows, warnings }
  }

  const keyValueRows = parseKeyValueRows(normalized)
  if (keyValueRows.length > 1) {
    warnings.push("Detected form-style fields instead of a spreadsheet table.")
    return { rows: keyValueRows, warnings }
  }

  return { rows: [], warnings: ["Could not find spreadsheet columns or form fields in this file."] }
}

function tableFromRows(rows: string[][]): { headers: string[]; rows: string[][] } {
  const headerIndex = rows.findIndex((row) => row.filter((cell) => String(cell ?? "").trim()).length >= 2)
  if (headerIndex < 0) return { headers: [], rows: [] }
  const rawHeaders = rows[headerIndex] ?? []
  let lastHeader = rawHeaders.length - 1
  while (lastHeader >= 0 && !String(rawHeaders[lastHeader] ?? "").trim()) lastHeader -= 1
  const headers = rawHeaders.slice(0, lastHeader + 1).map((cell, index) => String(cell || `Column ${index + 1}`).trim())
  const body = rows
    .slice(headerIndex + 1)
    .map((row) => headers.map((_, index) => String(row[index] ?? "").trim()))
    .filter((row) => row.some(Boolean))
  return { headers, rows: body }
}

async function rowsFromFile(file: File): Promise<{ rows: string[][]; warnings: string[] }> {
  const name = file.name.toLowerCase()
  const bytes = Buffer.from(await file.arrayBuffer())
  if (name.endsWith(".xlsx")) {
    return { rows: parseXlsxRows(bytes), warnings: [] }
  }
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    const parsed = await pdfParse(bytes)
    return parseTextRows(parsed.text ?? "", file.name)
  }
  return parseTextRows(bytes.toString("utf8"), file.name)
}

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const file = form.get("file")
    const requestedDatasetRaw = form.get("dataset")
    const requestedDataset: ImportDataset | undefined = isImportDataset(requestedDatasetRaw)
      ? requestedDatasetRaw
      : undefined
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, reason: "No file was provided." }, { status: 400 })
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ ok: false, reason: "File is too large. Use a file under 8 MB." }, { status: 413 })
    }

    const parsed = await rowsFromFile(file)
    const table = tableFromRows(parsed.rows)
    if (table.headers.length === 0) {
      return NextResponse.json(
        { ok: false, reason: parsed.warnings[0] ?? "Could not read columns from this file." },
        { status: 422 }
      )
    }

    return NextResponse.json(
      inspectImportTable({
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        headers: table.headers,
        rows: table.rows,
        requestedDataset,
        warnings: parsed.warnings
      })
    )
  } catch (error) {
    const reason = error instanceof Error && error.message ? error.message : "Could not inspect this file."
    return NextResponse.json({ ok: false, reason }, { status: 500 })
  }
}
