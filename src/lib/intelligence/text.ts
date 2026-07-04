export function normalizeIntelligenceText(value: string | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function textTokens(value: string | undefined) {
  return normalizeIntelligenceText(value)
    .split(" ")
    .filter((token) => token.length > 1)
}

export function slugifyIntelligenceId(value: string) {
  return normalizeIntelligenceText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

export function confidenceLabel(score: number) {
  if (score >= 0.78) return "high" as const
  if (score >= 0.52) return "medium" as const
  return "low" as const
}

export function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
}
