"use client"

import { useMemo, useState } from "react"

import type { ProductNutritionInfo } from "@/lib/demo-data"
import { nutritionForWeight, preferredWeightUnit, type WeightUnit } from "@/lib/nutrition"
import { Field, Panel, SelectInput, TextInput } from "@/components/ui"

function shown(value?: number, suffix = "") {
  if (value === undefined) return "—"
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}${suffix}`
}

export function NutritionCalculator({ nutrition, organizationUnit }: { nutrition: ProductNutritionInfo; organizationUnit?: string }) {
  const initialUnit = preferredWeightUnit(organizationUnit)
  const [amount, setAmount] = useState(initialUnit === "pounds" ? 0.25 : initialUnit === "grams" ? nutrition.servingWeightGrams ?? 28 : 1)
  const [unit, setUnit] = useState<WeightUnit>(initialUnit)
  const calculated = useMemo(() => nutritionForWeight(nutrition, amount, unit), [amount, nutrition, unit])

  if (!nutrition.servingWeightGrams) return null

  return (
    <Panel className="mt-6 p-4">
      <h2 className="font-semibold text-[var(--app-text)]">Nutrition for this cut</h2>
      <p className="app-tip mt-1 text-sm text-[var(--app-muted)]">
        Base serving: {nutrition.servingSize}. Enter the cut weight and the values update automatically.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Cut weight">
          <TextInput type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(Math.max(0, Number(event.target.value) || 0))} />
        </Field>
        <Field label="Unit">
          <SelectInput value={unit} onChange={(event) => setUnit(event.target.value as WeightUnit)}>
            <option value="grams">grams</option>
            <option value="ounces">ounces</option>
            <option value="pounds">pounds</option>
          </SelectInput>
        </Field>
      </div>
      {calculated ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Servings", calculated.servings.toFixed(2)], ["Calories", shown(calculated.caloriesKcal)],
            ["Fat", shown(calculated.fatG, " g")], ["Saturated fat", shown(calculated.saturatedFatG, " g")],
            ["Carbohydrates", shown(calculated.carbohydratesG, " g")], ["Sugars", shown(calculated.sugarsG, " g")],
            ["Protein", shown(calculated.proteinG, " g")], ["Sodium", shown(calculated.sodiumMg, " mg")]
          ].map(([label, value]) => <div key={label} className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3"><p className="text-xs uppercase text-[var(--app-subtle)]">{label}</p><p className="mt-1 font-semibold text-[var(--app-text)]">{value}</p></div>)}
        </div>
      ) : null}
      {nutrition.dataKind === "representative_product_type" ? <p className="mt-3 text-xs text-amber-300">Representative values for this cut product type. Replace them when an exact supplier label is available.</p> : null}
    </Panel>
  )
}
