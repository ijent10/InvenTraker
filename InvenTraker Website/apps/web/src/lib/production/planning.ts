import type {
  ItemRecord,
  ProductionIngredientRecord,
  ProductionProductRecord,
  ProductionRunRecord,
  ProductionSpotCheckRecord
} from "@/lib/data/firestore"

export type ProductionSuggestionRow = {
  productId: string
  productName: string
  outputItemId?: string
  outputUnitRaw: string
  recommendedMakeQuantity: number
  expectedUsageToday: number
  onHandQuantity: number
  scaleFactor: number
}

export type PullFactorSummary = {
  businessFactor: number
  weatherFactor: number
  holidayFactor: number
  trendFactor: number
  holidayName?: string
}

export type FrozenPullRow = {
  itemId: string
  itemName: string
  unitRaw: string
  requiredQuantity: number
  recommendedPullQuantity: number
  onHandQuantity: number
  rationale: string
}

const MASS_UNITS = new Set(["g", "kg", "oz", "lbs"])
const VOLUME_UNITS = new Set(["mL", "L", "gal"])

function average(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function unitDomain(unitRaw: string): "mass" | "volume" | "unitless" {
  if (MASS_UNITS.has(unitRaw)) return "mass"
  if (VOLUME_UNITS.has(unitRaw)) return "volume"
  return "unitless"
}

function gramsPerUnit(unitRaw: string): number {
  switch (unitRaw) {
    case "g":
      return 1
    case "kg":
      return 1000
    case "oz":
      return 28.349523125
    case "lbs":
      return 453.59237
    default:
      return 1
  }
}

function mlPerUnit(unitRaw: string): number {
  switch (unitRaw) {
    case "mL":
      return 1
    case "L":
      return 1000
    case "gal":
      return 3785.411784
    default:
      return 1
  }
}

export function convertQuantity(quantity: number, fromUnitRaw: string, toUnitRaw: string): number | null {
  if (!Number.isFinite(quantity)) return null
  if (fromUnitRaw === toUnitRaw) return quantity
  const sourceDomain = unitDomain(fromUnitRaw)
  const destinationDomain = unitDomain(toUnitRaw)
  if (sourceDomain !== destinationDomain) return null

  if (sourceDomain === "unitless") {
    return quantity
  }

  if (sourceDomain === "mass") {
    const grams = quantity * gramsPerUnit(fromUnitRaw)
    return grams / gramsPerUnit(toUnitRaw)
  }

  const ml = quantity * mlPerUnit(fromUnitRaw)
  return ml / mlPerUnit(toUnitRaw)
}

function roundForUnit(value: number, unitRaw: string): number {
  const normalizedUnit = unitRaw.toLowerCase()
  if (normalizedUnit === "each" || normalizedUnit === "pieces") {
    return Math.ceil(Math.max(0, value))
  }
  return Number(Math.max(0, value).toFixed(3))
}

function normalizeDate(input: unknown): Date | null {
  if (input instanceof Date) return input
  if (input && typeof input === "object" && "toDate" in input) {
    try {
      const maybeDate = (input as { toDate?: () => Date }).toDate?.()
      return maybeDate instanceof Date ? maybeDate : null
    } catch {
      return null
    }
  }
  if (typeof input === "string" || typeof input === "number") {
    const date = new Date(input)
    if (!Number.isNaN(date.getTime())) return date
  }
  return null
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  const first = new Date(year, month, 1)
  const delta = (weekday - first.getDay() + 7) % 7
  return new Date(year, month, 1 + delta + (nth - 1) * 7)
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const nextMonthFirst = new Date(year, month + 1, 1)
  const lastDay = new Date(nextMonthFirst.getTime() - 24 * 60 * 60 * 1000)
  const delta = (lastDay.getDay() - weekday + 7) % 7
  return new Date(year, month, lastDay.getDate() - delta)
}

function holidayCandidates(year: number): Array<{ name: string; date: Date }> {
  return [
    { name: "New Year's", date: new Date(year, 0, 1) },
    { name: "Memorial Day", date: lastWeekdayOfMonth(year, 4, 1) },
    { name: "Independence Day", date: new Date(year, 6, 4) },
    { name: "Labor Day", date: nthWeekdayOfMonth(year, 8, 1, 1) },
    { name: "Thanksgiving", date: nthWeekdayOfMonth(year, 10, 4, 4) },
    { name: "Christmas", date: new Date(year, 11, 25) }
  ]
}

function holidayFactorForDate(date: Date): { factor: number; holidayName?: string } {
  const all = [...holidayCandidates(date.getFullYear()), ...holidayCandidates(date.getFullYear() + 1)]
  let nearest: { name: string; daysAway: number } | null = null

  for (const holiday of all) {
    const delta = Math.round((holiday.date.getTime() - date.getTime()) / (24 * 60 * 60 * 1000))
    if (delta < -1 || delta > 5) continue
    const abs = Math.abs(delta)
    if (!nearest || abs < nearest.daysAway) {
      nearest = { name: holiday.name, daysAway: abs }
    }
  }

  if (!nearest) return { factor: 1 }
  return { factor: 1.12, holidayName: nearest.name }
}

function seasonalWeatherFactor(date: Date): number {
  const month = date.getMonth() + 1
  if ([11, 12, 1, 2].includes(month)) return 1.08
  if ([6, 7, 8].includes(month)) return 0.94
  return 1
}

function predictedUsage(
  productId: string,
  spotChecks: ProductionSpotCheckRecord[],
  runs: ProductionRunRecord[],
  asOf: Date
): number {
  const horizonStart = new Date(asOf)
  horizonStart.setDate(asOf.getDate() - 56)

  const records = spotChecks
    .filter((row) => row.productionProductID === productId)
    .filter((row) => {
      const checkedAt = normalizeDate(row.checkedAt)
      return checkedAt && checkedAt >= horizonStart && row.usageObserved > 0
    })
    .sort((left, right) => {
      const l = normalizeDate(left.checkedAt)?.getTime() ?? 0
      const r = normalizeDate(right.checkedAt)?.getTime() ?? 0
      return r - l
    })

  const baseUsage = average(records.slice(0, 14).map((row) => row.usageObserved))
  const weekday = asOf.getDay()
  const weekdayUsage = average(
    records
      .filter((row) => normalizeDate(row.checkedAt)?.getDay() === weekday)
      .slice(0, 8)
      .map((row) => row.usageObserved)
  )

  let prediction = Math.max(weekdayUsage, baseUsage)
  if (weekdayUsage > 0 && baseUsage > 0) {
    prediction = weekdayUsage * 0.65 + baseUsage * 0.35
  }

  if (prediction > 0) return prediction

  const runStart = new Date(asOf)
  runStart.setDate(asOf.getDate() - 28)
  const runFallback = average(
    runs
      .filter((row) => row.productionProductID === productId)
      .filter((row) => {
        const madeAt = normalizeDate(row.madeAt)
        return madeAt && madeAt >= runStart && row.quantityMade > 0
      })
      .map((row) => row.quantityMade)
  )

  return Math.max(0, runFallback * 0.7)
}

export function makeTodaySuggestions(input: {
  products: ProductionProductRecord[]
  spotChecks: ProductionSpotCheckRecord[]
  runs: ProductionRunRecord[]
  asOf?: Date
}): ProductionSuggestionRow[] {
  const asOf = input.asOf ?? new Date()

  return input.products
    .filter((product) => product.isActive)
    .map((product) => {
      const expectedUsage = predictedUsage(product.id, input.spotChecks, input.runs, asOf)
      const targetStock = Math.max(
        expectedUsage * Math.max(product.targetDaysOnHand, 0.25),
        Math.max(product.defaultBatchYield * 0.5, 0.25)
      )
      const recommended = roundForUnit(
        Math.max(0, targetStock - Math.max(product.lastSpotCheckQuantity, 0)),
        product.outputUnitRaw
      )

      return {
        productId: product.id,
        productName: product.name,
        outputItemId: product.outputItemID,
        outputUnitRaw: product.outputUnitRaw,
        recommendedMakeQuantity: recommended,
        expectedUsageToday: Number(expectedUsage.toFixed(3)),
        onHandQuantity: Number(Math.max(0, product.lastSpotCheckQuantity).toFixed(3)),
        scaleFactor: Number((recommended / Math.max(product.defaultBatchYield, 0.001)).toFixed(3))
      } satisfies ProductionSuggestionRow
    })
    .sort((left, right) => left.productName.localeCompare(right.productName))
}

function inferredTrendFactor(suggestions: ProductionSuggestionRow[]): number {
  if (!suggestions.length) return 1
  const totalExpected = suggestions.reduce((sum, row) => sum + row.expectedUsageToday, 0)
  const totalRecommended = suggestions.reduce((sum, row) => sum + row.recommendedMakeQuantity, 0)
  if (totalExpected <= 0) {
    return totalRecommended > 0 ? 1.05 : 1
  }
  const deltaRatio = (totalRecommended - totalExpected) / Math.max(1, totalExpected)
  return Math.min(1.25, Math.max(0.85, 1 + deltaRatio * 0.2))
}

function itemLooksFrozen(item: ItemRecord): boolean {
  const joined = `${item.name} ${(item.tags ?? []).join(" ")} ${item.department ?? ""}`.toLowerCase()
  return joined.includes("frozen") || joined.includes("freezer")
}

export function generateFrozenPullRows(input: {
  products: ProductionProductRecord[]
  ingredients: ProductionIngredientRecord[]
  items: ItemRecord[]
  spotChecks: ProductionSpotCheckRecord[]
  runs: ProductionRunRecord[]
  businessFactor?: number
  weatherFactorOverride?: number
  holidayFactorOverride?: number
  includeNonFrozen?: boolean
  asOf?: Date
}): { rows: FrozenPullRow[]; factors: PullFactorSummary } {
  const asOf = input.asOf ?? new Date()
  const suggestions = makeTodaySuggestions({
    products: input.products,
    spotChecks: input.spotChecks,
    runs: input.runs,
    asOf
  })

  const holiday = holidayFactorForDate(asOf)
  const factors: PullFactorSummary = {
    businessFactor: Math.min(1.6, Math.max(0.6, input.businessFactor ?? 1)),
    weatherFactor: Math.min(1.4, Math.max(0.7, input.weatherFactorOverride ?? seasonalWeatherFactor(asOf))),
    holidayFactor: Math.min(1.4, Math.max(0.8, input.holidayFactorOverride ?? holiday.factor)),
    trendFactor: inferredTrendFactor(suggestions),
    holidayName: holiday.holidayName
  }

  const totalFactor = factors.businessFactor * factors.weatherFactor * factors.holidayFactor * factors.trendFactor
  const productsById = new Map(input.products.map((product) => [product.id, product]))
  const itemById = new Map(input.items.map((item) => [item.id, item]))
  const recommendedByItem = new Map<string, number>()

  for (const suggestion of suggestions) {
    if (suggestion.recommendedMakeQuantity <= 0) continue
    const product = productsById.get(suggestion.productId)
    if (!product) continue
    const scale = suggestion.recommendedMakeQuantity / Math.max(product.defaultBatchYield, 0.001)
    if (!Number.isFinite(scale) || scale <= 0) continue

    for (const ingredient of input.ingredients.filter((row) => row.productionProductID === suggestion.productId)) {
      const itemId = ingredient.inventoryItemID
      if (!itemId) continue
      const item = itemById.get(itemId)
      if (!item) continue

      let quantity = Math.max(0, ingredient.quantityPerBatch) * scale
      let sourceUnitRaw = ingredient.unitRaw

      if (ingredient.needsConversion && ingredient.convertToUnitRaw) {
        const converted = convertQuantity(quantity, sourceUnitRaw, ingredient.convertToUnitRaw)
        if (converted !== null) {
          quantity = converted
          sourceUnitRaw = ingredient.convertToUnitRaw
        }
      }

      const convertedForInventory = convertQuantity(quantity, sourceUnitRaw, item.unit)
      const normalized = convertedForInventory === null ? quantity : convertedForInventory
      recommendedByItem.set(itemId, (recommendedByItem.get(itemId) ?? 0) + normalized)
    }
  }

  const rows: FrozenPullRow[] = []
  for (const [itemId, baseRequired] of recommendedByItem.entries()) {
    const item = itemById.get(itemId)
    if (!item) continue
    if (!input.includeNonFrozen && !itemLooksFrozen(item)) continue

    const required = roundForUnit(baseRequired * totalFactor, item.unit)
    if (required <= 0) continue
    const onHand = Number(item.totalQuantity.toFixed(3))
    const pull = roundForUnit(required, item.unit)
    rows.push({
      itemId,
      itemName: item.name,
      unitRaw: item.unit,
      requiredQuantity: required,
      recommendedPullQuantity: pull,
      onHandQuantity: onHand,
      rationale: `Trend ${(factors.trendFactor * 100).toFixed(0)}% · Weather ${(factors.weatherFactor * 100).toFixed(0)}% · Holiday ${(factors.holidayFactor * 100).toFixed(0)}% · Input ${(factors.businessFactor * 100).toFixed(0)}%`
    })
  }

  rows.sort((left, right) => right.recommendedPullQuantity - left.recommendedPullQuantity)
  return { rows, factors }
}

export function conversionPreviewText(input: {
  quantity: number
  unitRaw: string
  needsConversion?: boolean
  convertToUnitRaw?: string
  inventoryUnitRaw: string
}): string {
  let quantity = input.quantity
  let unit = input.unitRaw

  if (input.needsConversion && input.convertToUnitRaw) {
    const converted = convertQuantity(quantity, unit, input.convertToUnitRaw)
    if (converted !== null) {
      quantity = converted
      unit = input.convertToUnitRaw
    }
  }

  if (unit === input.inventoryUnitRaw) {
    return `Matches inventory unit (${input.inventoryUnitRaw}).`
  }

  const convertedToInventory = convertQuantity(quantity, unit, input.inventoryUnitRaw)
  if (convertedToInventory === null) {
    return `No direct conversion to ${input.inventoryUnitRaw}. Keep matching units for best accuracy.`
  }

  return `Converts to ${roundForUnit(convertedToInventory, input.inventoryUnitRaw)} ${input.inventoryUnitRaw} in inventory.`
}

export function servingsConversion(batchYield: number, desiredYield: number): number {
  if (!Number.isFinite(batchYield) || batchYield <= 0) return 0
  if (!Number.isFinite(desiredYield) || desiredYield < 0) return 0
  return Number((desiredYield / batchYield).toFixed(3))
}
