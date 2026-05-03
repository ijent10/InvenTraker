import pdfParse from "pdf-parse"

export type DraftStep = {
  stepNumber: number
  title?: string
  blocks: Array<{ type: "text"; text: string; orderIndex: number }>
}

function cleanText(raw: string): string {
  return raw
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function looksLikeHeading(line: string): boolean {
  if (!line) return false
  if (/^#+\s+/.test(line)) return true
  if (/^[A-Z][A-Z\s-]{4,}$/.test(line.trim())) return true
  return /^\d+[.)]\s+[A-Z]/.test(line)
}

function toStepTitle(stepNumber: number): string {
  return `Step ${stepNumber}`
}

function isPureStepNumberLine(line: string): number | null {
  if (!/^\d{1,2}$/.test(line)) return null
  const value = Number(line)
  if (!Number.isFinite(value) || value <= 0 || value > 40) return null
  return value
}

function isQuantityLine(line: string): boolean {
  return /^(?:\d+(?:[./]\d+)?)?\s*(?:ea|oz|lb|lbs|ct|each)$/i.test(line.trim())
}

function parseStructuredNumberedLines(lines: string[]): string[] {
  const rawSteps: Array<{ number: number; parts: string[] }> = []
  let expected = 1
  let pendingQuantity: string | null = null

  for (const line of lines) {
    if (/recipe build sheets/i.test(line)) break

    const maybeNumber = isPureStepNumberLine(line)
    if (maybeNumber !== null) {
      if (rawSteps.length === 0 && maybeNumber === 1) {
        rawSteps.push({ number: 1, parts: [] })
        expected = 2
        pendingQuantity = null
        continue
      }
      if (maybeNumber === expected) {
        rawSteps.push({ number: maybeNumber, parts: [] })
        expected += 1
        pendingQuantity = null
        continue
      }
      if (rawSteps.length > 0 && maybeNumber < expected) {
        // Usually quantity fragments like "1" between step lines; ignore.
        continue
      }
    }

    if (rawSteps.length === 0) continue
    if (/^(steps?|quantity|description|plu.*|shelf life.*)$/i.test(line)) continue
    if (/^(january|february|march|april|may|june|july|august|september|october|november|december)$/i.test(line))
      continue
    if (/^\d{4}$/.test(line)) continue
    if (/^\d+”\s+.*pizza$/i.test(line)) continue

    if (isQuantityLine(line)) {
      const quantity = line.match(/^(\d+(?:[./]\d+)?)\s*(ea|oz|lb|lbs|ct|each)$/i)
      const unit = quantity?.[2]?.toLowerCase()
      if (!quantity || !unit) continue
      if (unit === "ea" || unit === "each" || unit === "ct") continue
      pendingQuantity = `${quantity[1]} ${unit}`
      continue
    }

    const current = rawSteps[rawSteps.length - 1]
    if (!current) continue
    const lineText = line.trim()
    if (!lineText) continue
    if (pendingQuantity && !lineText.toLowerCase().includes(pendingQuantity.toLowerCase())) {
      current.parts.push(`${pendingQuantity} ${lineText}`.trim())
    } else {
      current.parts.push(lineText)
    }
    pendingQuantity = null
  }

  const normalized = rawSteps
    .map((step) => step.parts.join(" ").replace(/\s+/g, " ").replace(/!\s*”/g, "1/2”").trim())
    .filter(Boolean)

  return normalized.length >= 2 ? normalized : []
}

function parseInlineNumberedText(text: string): string[] {
  const flattened = cleanText(text).replace(/\n+/g, " ")
  const unitGuard = "(?:oz|lb|lbs|ea|each|ct)\\b"
  const regex = new RegExp(
    String.raw`(?:^|\s)(\d{1,2})(?:[.)])?\s+(?!${unitGuard})([\s\S]*?)(?=(?:\s\d{1,2}(?:[.)])?\s+(?!${unitGuard}))|$)`,
    "gi"
  )

  const candidates: Array<{ number: number; text: string }> = []
  let match: RegExpExecArray | null = regex.exec(flattened)
  while (match) {
    candidates.push({
      number: Number(match[1]),
      text: (match[2] ?? "").replace(/\s+/g, " ").trim()
    })
    match = regex.exec(flattened)
  }

  if (candidates.length < 2) return []

  const normalized: string[] = []
  let expected = 1
  for (const candidate of candidates) {
    if (!candidate.text) continue
    if (candidate.number === expected) {
      normalized.push(candidate.text)
      expected += 1
      continue
    }
    if (candidate.number < expected && normalized.length > 0) {
      normalized[normalized.length - 1] = `${normalized[normalized.length - 1]} ${candidate.text}`.trim()
    }
  }

  return normalized.length >= 2 ? normalized : []
}

export function buildHowToDraftFromText(text: string, titleHint?: string): { title?: string; steps: DraftStep[] } {
  const cleaned = cleanText(text)
  const lines = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  let inferredTitle: string | undefined
  if (lines.length > 0 && looksLikeHeading(lines[0] ?? "")) {
    inferredTitle = lines[0]?.replace(/^#+\s*/, "").trim()
  }

  const structuredSteps = parseStructuredNumberedLines(lines)
  const inlineSteps = structuredSteps.length >= 2 ? structuredSteps : parseInlineNumberedText(cleaned)

  if (inlineSteps.length >= 2) {
    return {
      title: inferredTitle ?? titleHint,
      steps: inlineSteps.map((stepText, index) => ({
        stepNumber: index + 1,
        title: toStepTitle(index + 1),
        blocks: [{ type: "text", text: stepText, orderIndex: 0 }]
      }))
    }
  }

  if (lines.length === 0) {
    return {
      title: titleHint,
      steps: [
        {
          stepNumber: 1,
          title: toStepTitle(1),
          blocks: [{ type: "text", text: "No text extracted from PDF.", orderIndex: 0 }]
        }
      ]
    }
  }

  const fallbackText = lines.join(" ").slice(0, 5000)
  return {
    title: inferredTitle ?? titleHint,
    steps: [
      {
        stepNumber: 1,
        title: toStepTitle(1),
        blocks: [{ type: "text", text: fallbackText, orderIndex: 0 }]
      }
    ]
  }
}

export async function extractHowToDraftFromPdf(buffer: Buffer): Promise<{ title?: string; steps: DraftStep[] }> {
  const header = buffer.subarray(0, 5).toString("utf8")
  if (header !== "%PDF-") {
    throw new Error("Invalid PDF data")
  }
  const parsed = await pdfParse(buffer)
  return buildHowToDraftFromText(parsed.text, parsed.info?.Title)
}
