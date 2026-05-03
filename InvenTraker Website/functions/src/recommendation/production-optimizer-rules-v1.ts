import type {
  FrozenPullForecastRow,
  IngredientDemandRow,
  ProductionPlan,
  ProductionPullFactorSummary,
  ProductionRecommendation
} from "@inventracker/shared"
import type {
  CollectedRecommendationFeatures,
  ProductionIngredientFeature,
  ProductionProductFeature,
  ProductionRunFeature,
  ProductionSpotCheckFeature
} from "./types.js"

const MASS_UNITS = new Set(["g", "kg", "oz", "lbs"])
const VOLUME_UNITS = new Set(["ml", "l", "gal"])

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function unitDomain(unitRaw: string): "mass" | "volume" | "unitless" {
  const normalized = unitRaw.toLowerCase()
  if (MASS_UNITS.has(normalized)) return "mass"
  if (VOLUME_UNITS.has(normalized)) return "volume"
  return "unitless"
}

function gramsPerUnit(unitRaw: string): number {
  switch (unitRaw.toLowerCase()) {
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
  switch (unitRaw.toLowerCase()) {
    case "ml":
      return 1
    case "l":
      return 1000
    case "gal":
      return 3785.411784
    default:
      return 1
  }
}

function convertQuantity(quantity: number, fromUnitRaw: string, toUnitRaw: string): number | null {
  if (!Number.isFinite(quantity)) return null
  if (fromUnitRaw.toLowerCase() === toUnitRaw.toLowerCase()) return quantity
  const sourceDomain = unitDomain(fromUnitRaw)
  const destinationDomain = unitDomain(toUnitRaw)
  if (sourceDomain !== destinationDomain) return null

  if (sourceDomain === "unitless") return quantity

  if (sourceDomain === "mass") {
    const grams = quantity * gramsPerUnit(fromUnitRaw)
    return grams / gramsPerUnit(toUnitRaw)
  }

  const ml = quantity * mlPerUnit(fromUnitRaw)
  return ml / mlPerUnit(toUnitRaw)
}

function roundForUnit(value: number, unitRaw: string): number {
  const normalized = unitRaw.toLowerCase()
  if (normalized === "each" || normalized === "pieces") {
    return Math.ceil(Math.max(0, value))
  }
  return Number(Math.max(0, value).toFixed(3))
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
  product: ProductionProductFeature,
  spotChecks: ProductionSpotCheckFeature[],
  runs: ProductionRunFeature[],
  asOf: Date
): number {
  const horizonStart = new Date(asOf)
  horizonStart.setDate(asOf.getDate() - 56)

  const records = spotChecks
    .filter((row) => row.productionProductID === product.productId)
    .filter((row) => row.checkedAt >= horizonStart && row.usageObserved > 0)
    .sort((left, right) => right.checkedAt.getTime() - left.checkedAt.getTime())

  const baseUsage = average(records.slice(0, 14).map((row) => row.usageObserved))
  const weekday = asOf.getDay()
  const weekdayUsage = average(
    records
      .filter((row) => row.checkedAt.getDay() === weekday)
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
      .filter((row) => row.productionProductID === product.productId)
      .filter((row) => row.madeAt >= runStart && row.quantityMade > 0)
      .map((row) => row.quantityMade)
  )

  return Math.max(0, runFallback * 0.7)
}

function inferredTrendFactor(rows: ProductionRecommendation[]): number {
  if (!rows.length) return 1
  const totalExpected = rows.reduce((sum, row) => sum + row.expectedUsageToday, 0)
  const totalRecommended = rows.reduce((sum, row) => sum + row.recommendedMakeQuantity, 0)
  if (totalExpected <= 0) return totalRecommended > 0 ? 1.05 : 1
  const deltaRatio = (totalRecommended - totalExpected) / Math.max(1, totalExpected)
  return Math.min(1.25, Math.max(0.85, 1 + deltaRatio * 0.2))
}

function itemLooksFrozen(input: { itemName: string; tags?: string[]; department?: string }): boolean {
  const tags = input.tags?.join(" ") ?? ""
  const joined = `${input.itemName} ${tags} ${input.department ?? ""}`.toLowerCase()
  return joined.includes("frozen") || joined.includes("freezer")
}

function buildProductionDemandByItem(input: {
  recommendations: ProductionRecommendation[]
  productsById: Map<string, ProductionProductFeature>
  ingredients: ProductionIngredientFeature[]
  itemUnitById: Map<string, string>
}): Map<string, number> {
  const recommendedByItem = new Map<string, number>()

  for (const recommendation of input.recommendations) {
    if (recommendation.recommendedMakeQuantity <= 0) continue
    const product = input.productsById.get(recommendation.productId)
    if (!product) continue
    const scale = recommendation.recommendedMakeQuantity / Math.max(product.defaultBatchYield, 0.001)
    if (!Number.isFinite(scale) || scale <= 0) continue

    for (const ingredient of input.ingredients.filter((row) => row.productionProductID === recommendation.productId)) {
      const itemId = ingredient.inventoryItemID
      if (!itemId) continue
      let quantity = Math.max(0, ingredient.quantityPerBatch) * scale
      let sourceUnitRaw = ingredient.unitRaw
      if (ingredient.needsConversion && ingredient.convertToUnitRaw) {
        const converted = convertQuantity(quantity, sourceUnitRaw, ingredient.convertToUnitRaw)
        if (converted !== null) {
          quantity = converted
          sourceUnitRaw = ingredient.convertToUnitRaw
        }
      }
      const inventoryUnitRaw = input.itemUnitById.get(itemId)
      const normalized =
        inventoryUnitRaw ? (convertQuantity(quantity, sourceUnitRaw, inventoryUnitRaw) ?? quantity) : quantity
      recommendedByItem.set(itemId, (recommendedByItem.get(itemId) ?? 0) + normalized)
    }
  }

  return recommendedByItem
}

export type ProductionRulesOutput = {
  recommendations: ProductionRecommendation[]
  productionDemandByItem: Map<string, number>
  productionPlan: ProductionPlan
}

export function runProductionOptimizerRulesV1(features: CollectedRecommendationFeatures): ProductionRulesOutput {
  const asOf = features.input.window.start
  const recommendations: ProductionRecommendation[] = features.productionProducts
    .filter((product) => product.isActive)
    .map((product) => {
      const expectedUsage = predictedUsage(product, features.productionSpotChecks, features.productionRuns, asOf)
      const targetStock = Math.max(
        expectedUsage * Math.max(product.targetDaysOnHand, 0.25),
        Math.max(product.defaultBatchYield * 0.5, 0.25)
      )
      const recommended = roundForUnit(
        Math.max(0, targetStock - Math.max(product.lastSpotCheckQuantity, 0)),
        product.outputUnitRaw
      )
      const confidenceSignals = [
        expectedUsage > 0 ? 0.2 : 0,
        features.productionSpotChecks.some((row) => row.productionProductID === product.productId) ? 0.2 : 0,
        features.productionRuns.some((row) => row.productionProductID === product.productId) ? 0.15 : 0,
        product.targetDaysOnHand > 0 ? 0.1 : 0,
        product.defaultBatchYield > 0 ? 0.1 : 0
      ]
      const confidence = Math.min(0.95, 0.35 + confidenceSignals.reduce((sum, value) => sum + value, 0))
      const wasteProbability = Math.min(0.95, Math.max(0.05, (product.lastSpotCheckQuantity > targetStock ? 0.4 : 0.12)))

      return {
        productId: product.productId,
        productName: product.productName,
        outputUnitRaw: product.outputUnitRaw,
        recommendedMakeQuantity: recommended,
        expectedUsageToday: Number(expectedUsage.toFixed(3)),
        onHandQuantity: Number(Math.max(0, product.lastSpotCheckQuantity).toFixed(3)),
        predictedDemand: {
          value: Number(expectedUsage.toFixed(3)),
          unit: "pieces",
          horizonHours: 24
        },
        predictedWasteRisk: {
          probability: Number(wasteProbability.toFixed(3)),
          expectedLossValue: 0
        },
        confidence: Number(confidence.toFixed(3)),
        topContributingFactors: [
          {
            key: "expected_usage",
            label: "Expected usage",
            value: `${Number(expectedUsage.toFixed(2))}`,
            impact: Number(Math.min(1, expectedUsage / Math.max(1, targetStock)).toFixed(3)),
            direction: "up"
          },
          {
            key: "days_on_hand",
            label: "Target days on hand",
            value: `${Number(product.targetDaysOnHand.toFixed(2))}`,
            impact: 0.4,
            direction: "up"
          },
          {
            key: "on_hand",
            label: "Current on hand",
            value: `${Number(product.lastSpotCheckQuantity.toFixed(2))}`,
            impact: 0.35,
            direction: product.lastSpotCheckQuantity > targetStock ? "down" : "up"
          }
        ],
        rationaleSummary:
          recommended > 0
            ? `Make ${recommended} ${product.outputUnitRaw} to reach ${Number(targetStock.toFixed(2))} target stock.`
            : `Current stock is sufficient for today.`,
        degraded: false,
        fallbackUsed: false,
        questions: []
      } satisfies ProductionRecommendation
    })
    .sort((left, right) => left.productName.localeCompare(right.productName))

  const holiday = holidayFactorForDate(asOf)
  const factors: ProductionPullFactorSummary = {
    businessFactor: Math.min(1.6, Math.max(0.6, features.input.productionPlanOptions?.businessFactor ?? 1)),
    weatherFactor: seasonalWeatherFactor(asOf),
    holidayFactor: holiday.factor,
    trendFactor: inferredTrendFactor(recommendations),
    holidayName: holiday.holidayName
  }

  const productsById = new Map(features.productionProducts.map((product) => [product.productId, product]))
  const itemUnitById = new Map(features.items.map((item) => [item.itemId, item.unit]))
  const productionDemandByItem = buildProductionDemandByItem({
    recommendations,
    productsById,
    ingredients: features.productionIngredients,
    itemUnitById
  })

  const ingredientDemandRows: IngredientDemandRow[] = [...productionDemandByItem.entries()].reduce<
    IngredientDemandRow[]
  >((rows, [itemId, requiredQuantity]) => {
    const item = features.items.find((entry) => entry.itemId == itemId)
    if (!item) return rows
    rows.push({
      itemId,
      itemName: item.itemName,
      unitRaw: item.unit,
      requiredQuantity: roundForUnit(requiredQuantity, item.unit)
    })
    return rows
  }, [])
  ingredientDemandRows.sort((left, right) => left.itemName.localeCompare(right.itemName))

  const includeNonFrozen = features.input.productionPlanOptions?.includeNonFrozen ?? false
  const combinedFactor = factors.businessFactor * factors.weatherFactor * factors.holidayFactor * factors.trendFactor

  const frozenPullForecastRows: FrozenPullForecastRow[] = ingredientDemandRows
    .map((row) => {
      const item = features.items.find((entry) => entry.itemId == row.itemId)
      if (!item) return null
      if (!includeNonFrozen && !itemLooksFrozen({ itemName: item.itemName })) return null

      const requiredQuantity = roundForUnit(row.requiredQuantity * combinedFactor, item.unit)
      if (requiredQuantity <= 0) return null

      return {
        itemId: row.itemId,
        itemName: row.itemName,
        unitRaw: row.unitRaw,
        requiredQuantity,
        recommendedPullQuantity: roundForUnit(requiredQuantity, item.unit),
        onHandQuantity: Number(item.onHand.toFixed(3)),
        rationale: `Trend ${(factors.trendFactor * 100).toFixed(0)}% · Weather ${(factors.weatherFactor * 100).toFixed(0)}% · Holiday ${(factors.holidayFactor * 100).toFixed(0)}% · Input ${(factors.businessFactor * 100).toFixed(0)}%`
      } satisfies FrozenPullForecastRow
    })
    .filter((row): row is FrozenPullForecastRow => row != null)
    .sort((left, right) => right.recommendedPullQuantity - left.recommendedPullQuantity)

  return {
    recommendations,
    productionDemandByItem,
    productionPlan: {
      ingredientDemandRows,
      frozenPullForecastRows,
      factors
    }
  }
}
