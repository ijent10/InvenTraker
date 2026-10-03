import type { ProductNutritionInfo } from "@/lib/demo-data"

export type WeightUnit = "grams" | "ounces" | "pounds"

const gramsPerUnit: Record<WeightUnit, number> = {
  grams: 1,
  ounces: 28.349523125,
  pounds: 453.59237
}

export function weightToGrams(amount: number, unit: WeightUnit) {
  return amount * gramsPerUnit[unit]
}

export function gramsToWeight(grams: number, unit: WeightUnit) {
  return grams / gramsPerUnit[unit]
}

export function nutritionForWeight(nutrition: ProductNutritionInfo, amount: number, unit: WeightUnit) {
  const servingWeightGrams = Number(nutrition.servingWeightGrams)
  if (!Number.isFinite(servingWeightGrams) || servingWeightGrams <= 0) return null

  const grams = weightToGrams(amount, unit)
  const servings = grams / servingWeightGrams
  const scale = (value?: number) => typeof value === "number" && Number.isFinite(value) ? value * servings : undefined

  return {
    grams,
    servings,
    caloriesKcal: scale(nutrition.caloriesKcal),
    fatG: scale(nutrition.fatG),
    saturatedFatG: scale(nutrition.saturatedFatG),
    carbohydratesG: scale(nutrition.carbohydratesG),
    sugarsG: scale(nutrition.sugarsG),
    fiberG: scale(nutrition.fiberG),
    proteinG: scale(nutrition.proteinG),
    sodiumMg: scale(nutrition.sodiumMg),
    saltG: scale(nutrition.saltG)
  }
}

export function preferredWeightUnit(unit?: string): WeightUnit {
  if (unit === "grams" || unit === "ounces" || unit === "pounds") return unit
  return "ounces"
}
