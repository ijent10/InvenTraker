"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, Loader2, Sparkles } from "lucide-react"

import { Button, Field, SelectInput, TextArea, TextInput } from "@/components/ui"
import type { ProductNutritionInfo } from "@/lib/demo-data"
import type { PendingAutofillField } from "@/lib/ai/types"

type NutritionStatus = "No nutritional information" | "Has nutritional information" | "Unknown"

type NutritionFormState = {
  servingSize: string
  caloriesKcal: string
  fatG: string
  saturatedFatG: string
  carbohydratesG: string
  sugarsG: string
  fiberG: string
  proteinG: string
  sodiumMg: string
  saltG: string
  ingredientsText: string
  allergens: string
  labels: string
  imageUrl: string
  sourceSummary: string
}

type AutofillResponse = {
  batch?: {
    sourceSummary: string
    fields: PendingAutofillField[]
  }
  message?: string
}

function valueOrEmpty(value?: string | number) {
  return value === undefined || value === null ? "" : String(value)
}

function initialState(nutrition?: ProductNutritionInfo): NutritionFormState {
  return {
    servingSize: valueOrEmpty(nutrition?.servingSize),
    caloriesKcal: valueOrEmpty(nutrition?.caloriesKcal),
    fatG: valueOrEmpty(nutrition?.fatG),
    saturatedFatG: valueOrEmpty(nutrition?.saturatedFatG),
    carbohydratesG: valueOrEmpty(nutrition?.carbohydratesG),
    sugarsG: valueOrEmpty(nutrition?.sugarsG),
    fiberG: valueOrEmpty(nutrition?.fiberG),
    proteinG: valueOrEmpty(nutrition?.proteinG),
    sodiumMg: valueOrEmpty(nutrition?.sodiumMg),
    saltG: valueOrEmpty(nutrition?.saltG),
    ingredientsText: valueOrEmpty(nutrition?.ingredientsText),
    allergens: valueOrEmpty(nutrition?.allergens),
    labels: valueOrEmpty(nutrition?.labels),
    imageUrl: valueOrEmpty(nutrition?.imageUrl),
    sourceSummary: valueOrEmpty(nutrition?.sourceSummary)
  }
}

function suggestionKey(field: PendingAutofillField) {
  return `${field.field}:${field.proposedValue}`
}

function isNutritionSuggestion(field: PendingAutofillField) {
  return (
    field.field.includes("product.nutrition") ||
    field.field === "product.ingredientsText" ||
    field.field === "product.allergens" ||
    field.field === "product.labels" ||
    field.field === "product.imageUrl"
  )
}

function extractNumeric(value: string) {
  const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ""))
  return Number.isFinite(parsed) ? String(parsed) : value
}

function stateFieldForSuggestion(fieldPath: string): keyof NutritionFormState | undefined {
  if (fieldPath.includes("product.nutrition.per100g.")) return undefined

  const formFieldPath = fieldPath
    .replace("product.nutrition.perServing.nutrition.", "product.nutrition.")
    .replace("product.nutrition.perServing.", "product.nutrition.")
  if (formFieldPath === "product.nutrition.servingSize") return "servingSize"
  if (formFieldPath === "product.nutrition.caloriesKcal") return "caloriesKcal"
  if (formFieldPath === "product.nutrition.saturatedFatG") return "saturatedFatG"
  if (formFieldPath === "product.nutrition.fatG") return "fatG"
  if (formFieldPath === "product.nutrition.carbohydratesG") return "carbohydratesG"
  if (formFieldPath === "product.nutrition.sugarsG") return "sugarsG"
  if (formFieldPath === "product.nutrition.fiberG") return "fiberG"
  if (formFieldPath === "product.nutrition.proteinG") return "proteinG"
  if (formFieldPath === "product.nutrition.sodiumMg") return "sodiumMg"
  if (formFieldPath === "product.nutrition.saltG") return "saltG"
  if (fieldPath === "product.ingredientsText") return "ingredientsText"
  if (fieldPath === "product.allergens") return "allergens"
  if (fieldPath === "product.labels") return "labels"
  if (fieldPath === "product.imageUrl") return "imageUrl"
  return undefined
}

function fieldValueForSuggestion(field: PendingAutofillField) {
  return field.field.includes(".nutrition.") && !field.field.endsWith("servingSize")
    ? extractNumeric(field.proposedValue)
    : field.proposedValue
}

export function ProductNutritionEditor({
  productId,
  productName,
  sku,
  hasNutritionInfo,
  nutrition
}: {
  productId?: string
  productName: string
  sku?: string
  hasNutritionInfo?: boolean
  nutrition?: ProductNutritionInfo
}) {
  const [status, setStatus] = useState<NutritionStatus>(hasNutritionInfo ? "Has nutritional information" : "No nutritional information")
  const [formState, setFormState] = useState<NutritionFormState>(() => initialState(nutrition))
  const [suggestions, setSuggestions] = useState<PendingAutofillField[]>([])
  const [selectedSuggestions, setSelectedSuggestions] = useState<string[]>([])
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [message, setMessage] = useState("")

  const selectedSuggestionSet = useMemo(() => new Set(selectedSuggestions), [selectedSuggestions])
  const canLookup = productName.trim().length >= 2 || Boolean(sku?.trim())

  function updateField(field: keyof NutritionFormState, value: string) {
    setFormState((currentState) => ({ ...currentState, [field]: value }))
  }

  function toggleSuggestion(field: PendingAutofillField) {
    const key = suggestionKey(field)
    setSelectedSuggestions((currentSelection) =>
      currentSelection.includes(key) ? currentSelection.filter((selectedKey) => selectedKey !== key) : [...currentSelection, key]
    )
  }

  function applySuggestions(fieldsToApply = suggestions.filter((field) => selectedSuggestionSet.has(suggestionKey(field)))) {
    if (fieldsToApply.length === 0) {
      setMessage("Choose at least one suggestion to apply.")
      return
    }

    const applicableFields = fieldsToApply
      .map((field) => ({ field, targetField: stateFieldForSuggestion(field.field) }))
      .filter((item): item is { field: PendingAutofillField; targetField: keyof NutritionFormState } => Boolean(item.targetField))
    const referenceOnlyCount = fieldsToApply.length - applicableFields.length

    if (applicableFields.length === 0) {
      setMessage("The selected suggestions are reference-only. Choose nutrition, ingredient, allergen, label, or image suggestions to apply.")
      return
    }

    setFormState((currentState) => {
      const nextState = { ...currentState }
      applicableFields.forEach(({ field, targetField }) => {
        nextState[targetField] = fieldValueForSuggestion(field)
      })
      return nextState
    })
    setStatus("Has nutritional information")
    setMessage(
      `${applicableFields.length} editable nutrition suggestion${applicableFields.length === 1 ? "" : "s"} applied. Review and save when ready.${
        referenceOnlyCount > 0 ? ` ${referenceOnlyCount} reference-only suggestion${referenceOnlyCount === 1 ? "" : "s"} left unchanged.` : ""
      }`
    )
  }

  async function runAutofill() {
    if (!canLookup) {
      setMessage("Add a product name or SKU before autofilling nutrition.")
      return
    }

    setLookupStatus("loading")
    setMessage("")

    try {
      const response = await fetch("/api/ai/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: productName.trim() || sku?.trim() || "Unknown product",
          sku: sku?.trim() || undefined,
          productId,
          persist: false,
          reason: "Nutrition autofill requested from the product form."
        })
      })
      const payload = (await response.json()) as AutofillResponse

      if (!response.ok) {
        throw new Error(payload.message ?? "Autofill failed.")
      }

      const nextSuggestions = payload.batch?.fields.filter(isNutritionSuggestion) ?? []
      setSuggestions(nextSuggestions)
      setSelectedSuggestions(nextSuggestions.map(suggestionKey))
      setLookupStatus("done")
      setMessage(
        nextSuggestions.length > 0
          ? `${nextSuggestions.length} nutrition and ingredient suggestion${nextSuggestions.length === 1 ? "" : "s"} found.`
          : payload.message ?? "No nutrition suggestions were found for this product."
      )
      if (payload.batch?.sourceSummary) updateField("sourceSummary", payload.batch.sourceSummary)
    } catch (error) {
      setLookupStatus("error")
      setMessage(error instanceof Error ? error.message : "Autofill failed.")
    }
  }

  return (
    <div className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[var(--app-text)]">Nutrition and ingredients</h3>
          <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">
            Mark whether this product has nutrition facts, edit the fields manually, or autofill suggestions for review.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={lookupStatus === "loading"}
          onClick={runAutofill}
          icon={lookupStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        >
          Autofill nutrition
        </Button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[280px_1fr]">
        <Field label="Nutrition status">
          <SelectInput name="nutritionStatus" value={status} onChange={(event) => setStatus(event.target.value as NutritionStatus)}>
            <option>No nutritional information</option>
            <option>Has nutritional information</option>
            <option>Unknown</option>
          </SelectInput>
        </Field>
        <Field label="Source or verification note">
          <TextInput
            name="nutritionSourceSummary"
            value={formState.sourceSummary}
            onChange={(event) => updateField("sourceSummary", event.target.value)}
            placeholder="Supplier label, package photo, Open Food Facts, or manager verification"
          />
        </Field>
      </div>

      {status !== "No nutritional information" ? (
        <div className="mt-4 grid gap-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Serving size">
              <TextInput name="nutritionServingSize" value={formState.servingSize} onChange={(event) => updateField("servingSize", event.target.value)} />
            </Field>
            <Field label="Calories">
              <TextInput
                name="nutritionCaloriesKcal"
                type="number"
                min="0"
                value={formState.caloriesKcal}
                onChange={(event) => updateField("caloriesKcal", event.target.value)}
              />
            </Field>
            <Field label="Total fat (g)">
              <TextInput name="nutritionFatG" type="number" min="0" value={formState.fatG} onChange={(event) => updateField("fatG", event.target.value)} />
            </Field>
            <Field label="Saturated fat (g)">
              <TextInput
                name="nutritionSaturatedFatG"
                type="number"
                min="0"
                value={formState.saturatedFatG}
                onChange={(event) => updateField("saturatedFatG", event.target.value)}
              />
            </Field>
            <Field label="Carbohydrates (g)">
              <TextInput
                name="nutritionCarbohydratesG"
                type="number"
                min="0"
                value={formState.carbohydratesG}
                onChange={(event) => updateField("carbohydratesG", event.target.value)}
              />
            </Field>
            <Field label="Sugars (g)">
              <TextInput name="nutritionSugarsG" type="number" min="0" value={formState.sugarsG} onChange={(event) => updateField("sugarsG", event.target.value)} />
            </Field>
            <Field label="Fiber (g)">
              <TextInput name="nutritionFiberG" type="number" min="0" value={formState.fiberG} onChange={(event) => updateField("fiberG", event.target.value)} />
            </Field>
            <Field label="Protein (g)">
              <TextInput name="nutritionProteinG" type="number" min="0" value={formState.proteinG} onChange={(event) => updateField("proteinG", event.target.value)} />
            </Field>
            <Field label="Sodium (mg)">
              <TextInput name="nutritionSodiumMg" type="number" min="0" value={formState.sodiumMg} onChange={(event) => updateField("sodiumMg", event.target.value)} />
            </Field>
            <Field label="Salt (g)">
              <TextInput name="nutritionSaltG" type="number" min="0" value={formState.saltG} onChange={(event) => updateField("saltG", event.target.value)} />
            </Field>
            <Field label="Labels">
              <TextInput name="nutritionLabels" value={formState.labels} onChange={(event) => updateField("labels", event.target.value)} placeholder="Kosher, vegan, organic" />
            </Field>
            <Field label="Allergens">
              <TextInput name="nutritionAllergens" value={formState.allergens} onChange={(event) => updateField("allergens", event.target.value)} placeholder="Milk, wheat, nuts" />
            </Field>
          </div>

          <Field label="Ingredients">
            <TextArea name="nutritionIngredientsText" value={formState.ingredientsText} onChange={(event) => updateField("ingredientsText", event.target.value)} />
          </Field>
          <Field label="Product image URL">
            <TextInput name="nutritionImageUrl" value={formState.imageUrl} onChange={(event) => updateField("imageUrl", event.target.value)} />
          </Field>
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="mt-5 rounded-md border border-[var(--app-control-border)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-control-border)] px-3 py-3">
            <div>
              <p className="font-semibold text-[var(--app-text)]">Review autofill suggestions</p>
              <p className="app-tip mt-1 text-xs text-[var(--app-muted)]">Selected suggestions are applied to the editable fields above.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setSelectedSuggestions(suggestions.map(suggestionKey))}>
                Select all
              </Button>
              <Button onClick={() => applySuggestions()} icon={<CheckCircle2 className="h-4 w-4" />}>
                Apply selected
              </Button>
            </div>
          </div>
          <div className="grid gap-2 p-3">
            {suggestions.map((field) => {
              const key = suggestionKey(field)
              const selected = selectedSuggestionSet.has(key)

              return (
                <label
                  key={key}
                  className="grid cursor-pointer gap-3 rounded-md border border-[var(--app-control-border)] bg-[var(--app-panel)] p-3 md:grid-cols-[24px_1fr_140px]"
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSuggestion(field)}
                    className="mt-1 h-4 w-4 accent-[var(--app-accent)]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[var(--app-text)]">{field.label}</span>
                    <span className="mt-1 block whitespace-pre-wrap break-words text-sm leading-6 text-[var(--app-muted)]">{field.proposedValue}</span>
                  </span>
                  <span className="text-xs leading-5 text-[var(--app-subtle)]">
                    {field.sourceLabel}
                    <br />
                    {field.confidence} confidence
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      ) : null}

      {message ? (
        <div
          className={`mt-4 rounded-md border px-3 py-2 text-sm font-semibold ${
            lookupStatus === "error"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
              : "border-[var(--app-control-border)] bg-[var(--app-panel)] text-[var(--app-text)]"
          }`}
        >
          {message}
        </div>
      ) : null}
    </div>
  )
}
