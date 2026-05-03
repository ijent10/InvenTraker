import { inflateRawSync } from "node:zlib"

type ZipEntry = {
  name: string
  method: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

function readUInt16(buffer: Buffer, offset: number): number {
  return buffer.readUInt16LE(offset)
}

function readUInt32(buffer: Buffer, offset: number): number {
  return buffer.readUInt32LE(offset)
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const signature = 0x06054b50
  const minOffset = Math.max(0, buffer.length - 66_000)
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (readUInt32(buffer, offset) === signature) return offset
  }
  throw new Error("Could not read XLSX archive.")
}

function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const eocd = findEndOfCentralDirectory(buffer)
  const entryCount = readUInt16(buffer, eocd + 10)
  const centralDirectoryOffset = readUInt32(buffer, eocd + 16)
  const entries: ZipEntry[] = []
  let offset = centralDirectoryOffset

  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(buffer, offset) !== 0x02014b50) break
    const method = readUInt16(buffer, offset + 10)
    const compressedSize = readUInt32(buffer, offset + 20)
    const uncompressedSize = readUInt32(buffer, offset + 24)
    const fileNameLength = readUInt16(buffer, offset + 28)
    const extraLength = readUInt16(buffer, offset + 30)
    const commentLength = readUInt16(buffer, offset + 32)
    const localHeaderOffset = readUInt32(buffer, offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8")
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset })
    offset += 46 + fileNameLength + extraLength + commentLength
  }

  const files = new Map<string, Buffer>()
  for (const entry of entries) {
    const local = entry.localHeaderOffset
    if (readUInt32(buffer, local) !== 0x04034b50) continue
    const fileNameLength = readUInt16(buffer, local + 26)
    const extraLength = readUInt16(buffer, local + 28)
    const dataStart = local + 30 + fileNameLength + extraLength
    const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize)
    if (entry.method === 0) {
      files.set(entry.name, compressed)
    } else if (entry.method === 8) {
      files.set(entry.name, inflateRawSync(compressed, { finishFlush: 2 }))
    } else if (entry.uncompressedSize === 0) {
      files.set(entry.name, Buffer.alloc(0))
    }
  }
  return files
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`, "i"))
  return match ? decodeXml(match[1] ?? "") : undefined
}

function stripTags(value: string): string {
  return decodeXml(value.replace(/<[^>]+>/g, ""))
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return []
  const rows: string[] = []
  const matches = xml.match(/<si[\s\S]*?<\/si>/g) ?? []
  for (const item of matches) {
    const textParts = [...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1] ?? ""))
    rows.push(textParts.length > 0 ? textParts.join("") : stripTags(item))
  }
  return rows
}

function columnIndex(cellRef: string | undefined, fallback: number): number {
  const letters = (cellRef?.match(/[A-Z]+/i)?.[0] ?? "").toUpperCase()
  if (!letters) return fallback
  let index = 0
  for (const letter of letters) {
    index = index * 26 + letter.charCodeAt(0) - 64
  }
  return Math.max(0, index - 1)
}

function cellValue(cell: string, fallbackIndex: number, sharedStrings: string[]): { index: number; value: string } {
  const open = cell.match(/<c\b[^>]*>/i)?.[0] ?? ""
  const type = attr(open, "t")
  const index = columnIndex(attr(open, "r"), fallbackIndex)
  if (type === "inlineStr") {
    const inline = cell.match(/<is[^>]*>([\s\S]*?)<\/is>/i)?.[1] ?? ""
    return { index, value: stripTags(inline).trim() }
  }
  const raw = cell.match(/<v[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? ""
  const decoded = decodeXml(raw).trim()
  if (type === "s") {
    return { index, value: sharedStrings[Number(decoded)] ?? "" }
  }
  if (type === "str") {
    return { index, value: decoded }
  }
  return { index, value: decoded }
}

function workbookSheetPath(files: Map<string, Buffer>): string {
  const workbook = files.get("xl/workbook.xml")?.toString("utf8")
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8")
  if (!workbook || !rels) return "xl/worksheets/sheet1.xml"
  const firstSheet = workbook.match(/<sheet\b[^>]*>/i)?.[0]
  const relationId = firstSheet ? attr(firstSheet, "r:id") : undefined
  if (!relationId) return "xl/worksheets/sheet1.xml"
  const relationship = (rels.match(/<Relationship\b[^>]*\/>/gi) ?? [])
    .find((entry) => attr(entry, "Id") === relationId)
  const target = relationship ? attr(relationship, "Target") : undefined
  if (!target) return "xl/worksheets/sheet1.xml"
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`.replace(/\/[^/]+\/\.\.\//g, "/")
}

export function parseXlsxRows(buffer: Buffer): string[][] {
  const files = readZipEntries(buffer)
  const sharedStrings = parseSharedStrings(files.get("xl/sharedStrings.xml")?.toString("utf8"))
  const sheetPath = workbookSheetPath(files)
  const sheet = files.get(sheetPath)?.toString("utf8") ?? files.get("xl/worksheets/sheet1.xml")?.toString("utf8")
  if (!sheet) return []
  const parsedRows: string[][] = []
  const rowMatches = sheet.match(/<row\b[\s\S]*?<\/row>/gi) ?? []
  for (const row of rowMatches) {
    const cells = row.match(/<c\b[\s\S]*?<\/c>/gi) ?? []
    const values: string[] = []
    cells.forEach((cell, fallbackIndex) => {
      const parsed = cellValue(cell, fallbackIndex, sharedStrings)
      values[parsed.index] = parsed.value
    })
    if (values.some((value) => String(value ?? "").trim())) {
      parsedRows.push(values.map((value) => String(value ?? "").trim()))
    }
  }
  return parsedRows
}
