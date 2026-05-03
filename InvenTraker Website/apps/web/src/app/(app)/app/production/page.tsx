"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { AppButton, AppCard, AppCheckbox, AppInput, AppSelect, AppSlider, AppTextarea, TipBanner } from "@inventracker/ui"
import { Snowflake, Plus, Trash2 } from "lucide-react"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  deleteProductionProduct,
  fetchHowToGuide,
  fetchHowToGuides,
  fetchItems,
  fetchOrgSettings,
  fetchProductionIngredients,
  fetchProductionProducts,
  fetchProductionRuns,
  fetchProductionSpotChecks,
  fetchStoreSettings,
  saveProductionProduct,
  type SaveProductionIngredientInput
} from "@/lib/data/firestore"
import { downloadSpreadsheetExport } from "@/lib/exports/spreadsheet"
import { getStoreRecommendations } from "@/lib/firebase/functions"
import { buildProductionFallback } from "@/lib/recommendations/fallback"
import {
  conversionPreviewText,
  servingsConversion
} from "@/lib/production/planning"

const UNIT_OPTIONS = ["pieces", "each", "lbs", "oz", "g", "kg", "gal", "L", "mL", "custom"] as const

type IngredientDraft = {
  id: string
  inventoryItemID?: string
  quantityPerBatch: string
  unitRaw: string
  needsConversion: boolean
  convertToUnitRaw?: string
}

function emptyIngredientDraft(): IngredientDraft {
  return {
    id: crypto.randomUUID(),
    inventoryItemID: undefined,
    quantityPerBatch: "",
    unitRaw: "pieces",
    needsConversion: false,
    convertToUnitRaw: "pieces"
  }
}

function emptyIngredientDraftWithDefault(defaultUnitRaw: string): IngredientDraft {
  return {
    id: crypto.randomUUID(),
    inventoryItemID: undefined,
    quantityPerBatch: "",
    unitRaw: defaultUnitRaw || "pieces",
    needsConversion: false,
    convertToUnitRaw: defaultUnitRaw || "pieces"
  }
}

export default function ProductionPage() {
  const { user } = useAuthUser()
  const { activeOrgId, activeStoreId, activeOrg, stores, effectivePermissions } = useOrgContext()
  const activeStore = useMemo(() => stores.find((store) => store.id === activeStoreId), [activeStoreId, stores])

  const [name, setName] = useState("")
  const [outputItemID, setOutputItemID] = useState("")
  const [howToGuideID, setHowToGuideID] = useState("")
  const [defaultBatchYield, setDefaultBatchYield] = useState("1")
  const [desiredServings, setDesiredServings] = useState("1")
  const [targetDaysOnHand, setTargetDaysOnHand] = useState("1.5")
  const [manualInstructions, setManualInstructions] = useState("")
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([emptyIngredientDraft()])

  const [businessFactor, setBusinessFactor] = useState(1)
  const [includeNonFrozen, setIncludeNonFrozen] = useState(false)

  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const canEditSetup = effectivePermissions.manageInventory || effectivePermissions.manageStoreSettings

  const { data: items = [] } = useQuery({
    queryKey: ["production-items", activeOrgId, activeStoreId],
    queryFn: () => fetchItems(activeOrgId, { storeId: activeStoreId || undefined }),
    enabled: Boolean(activeOrgId)
  })

  const { data: guides = [] } = useQuery({
    queryKey: ["production-guides", activeOrgId, activeStoreId],
    queryFn: () => fetchHowToGuides(activeOrgId, activeStoreId || undefined),
    enabled: Boolean(activeOrgId)
  })

  const { data: orgSettings } = useQuery({
    queryKey: ["production-org-settings", activeOrgId],
    queryFn: () => fetchOrgSettings(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const { data: storeSettings } = useQuery({
    queryKey: ["production-store-settings", activeOrgId, activeStoreId],
    queryFn: () =>
      activeStore && activeOrgId ? fetchStoreSettings(activeOrgId, activeStore) : Promise.resolve(null),
    enabled: Boolean(activeOrgId && activeStore)
  })

  const { data: products = [], refetch: refetchProducts } = useQuery({
    queryKey: ["production-products", activeOrgId, activeStoreId],
    queryFn: () => fetchProductionProducts(activeOrgId, activeStoreId || undefined),
    enabled: Boolean(activeOrgId)
  })

  const { data: productionIngredients = [], refetch: refetchIngredients } = useQuery({
    queryKey: ["production-ingredients", activeOrgId, activeStoreId],
    queryFn: () => fetchProductionIngredients(activeOrgId, activeStoreId || undefined),
    enabled: Boolean(activeOrgId)
  })

  const { data: runs = [] } = useQuery({
    queryKey: ["production-runs", activeOrgId, activeStoreId],
    queryFn: () => fetchProductionRuns(activeOrgId, activeStoreId || undefined),
    enabled: Boolean(activeOrgId)
  })

  const { data: spotChecks = [] } = useQuery({
    queryKey: ["production-spotchecks", activeOrgId, activeStoreId],
    queryFn: () => fetchProductionSpotChecks(activeOrgId, activeStoreId || undefined),
    enabled: Boolean(activeOrgId)
  })

  const {
    data: backendRecommendations,
    isFetching: backendRecommendationLoading,
    error: backendRecommendationError
  } = useQuery({
    queryKey: ["production-recommendations", activeOrgId, activeStoreId, businessFactor, includeNonFrozen],
    queryFn: async () => {
      if (!activeOrgId || !activeStoreId) return null
      return getStoreRecommendations({
        orgId: activeOrgId,
        storeId: activeStoreId,
        domains: ["production"],
        productionPlanOptions: {
          businessFactor,
          includeNonFrozen
        },
        forceRefresh: true
      })
    },
    enabled: Boolean(activeOrgId && activeStoreId)
  })

  const backendSuggestions = useMemo(
    () =>
      (backendRecommendations?.productionRecommendations ?? []).map((row) => ({
        productId: row.productId,
        productName: row.productName,
        outputItemId: undefined,
        outputUnitRaw: row.outputUnitRaw,
        recommendedMakeQuantity: row.recommendedMakeQuantity,
        expectedUsageToday: row.expectedUsageToday,
        onHandQuantity: row.onHandQuantity,
        scaleFactor:
          row.expectedUsageToday > 0
            ? Number((row.recommendedMakeQuantity / row.expectedUsageToday).toFixed(3))
            : 0
      })),
    [backendRecommendations]
  )

  const backendDegraded = Boolean(
    backendRecommendations?.meta.degraded || backendRecommendations?.meta.fallbackUsed
  )
  const usingRecommendationFallback = Boolean(backendRecommendationError)
  const localFallback = useMemo(
    () => {
      if (!usingRecommendationFallback) return null
      return buildProductionFallback({
        products,
        ingredients: productionIngredients,
        items,
        runs,
        spotChecks,
        businessFactor,
        includeNonFrozen,
        fallbackReason:
          backendRecommendationError instanceof Error ? backendRecommendationError.message : undefined
      })
    },
    [
      backendRecommendationError,
      businessFactor,
      includeNonFrozen,
      items,
      products,
      productionIngredients,
      runs,
      spotChecks,
      usingRecommendationFallback
    ]
  )

  const suggestions = useMemo(
    () => (usingRecommendationFallback ? (localFallback?.suggestions ?? []) : backendSuggestions),
    [backendSuggestions, localFallback, usingRecommendationFallback]
  )

  const makeTodayRows = useMemo(
    () => suggestions.filter((row) => row.recommendedMakeQuantity > 0),
    [suggestions]
  )

  const pullForecast = useMemo(
    () => {
      if (usingRecommendationFallback) {
        return {
          rows: localFallback?.frozenPullRows ?? [],
          factors:
            localFallback?.factors ?? {
              businessFactor: 1,
              weatherFactor: 1,
              holidayFactor: 1,
              trendFactor: 1
            }
        }
      }
      return {
        rows: backendRecommendations?.productionPlan.frozenPullForecastRows ?? [],
        factors:
          backendRecommendations?.productionPlan.factors ?? {
            businessFactor: 1,
            weatherFactor: 1,
            holidayFactor: 1,
            trendFactor: 1
          }
      }
    },
    [backendRecommendations, localFallback, usingRecommendationFallback]
  )

  const preferredConversionUnitRaw = useMemo(() => {
    const storePreferred = (storeSettings as unknown as { productionDefaultUnitRaw?: string } | null)
      ?.productionDefaultUnitRaw
    if (storePreferred) return storePreferred
    const orgPreferred = (orgSettings as unknown as { productionDefaultUnitRaw?: string } | null)
      ?.productionDefaultUnitRaw
    if (orgPreferred) return orgPreferred
    return "pieces"
  }, [orgSettings, storeSettings])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeOrgId || !user) return
      const cleanName = name.trim()
      if (!cleanName) {
        throw new Error("Enter a production product name.")
      }
      const outputItem = items.find((item) => item.id === outputItemID)
      if (!outputItem) {
        throw new Error("Select an output inventory item.")
      }

      const parsedYield = Number(defaultBatchYield)
      if (!Number.isFinite(parsedYield) || parsedYield <= 0) {
        throw new Error("Enter a valid batch yield.")
      }

      const parsedTargetDays = Number(targetDaysOnHand)
      const parsedDesiredServings = Number(desiredServings)

      const normalizedIngredients: SaveProductionIngredientInput[] = ingredients.reduce<
        SaveProductionIngredientInput[]
      >((rows, draft) => {
        const selectedItem = items.find((item) => item.id === draft.inventoryItemID)
        const quantity = Number(draft.quantityPerBatch)
        if (!selectedItem || !Number.isFinite(quantity) || quantity <= 0) {
          return rows
        }
        rows.push({
          inventoryItemID: selectedItem.id,
          inventoryItemNameSnapshot: selectedItem.name,
          quantityPerBatch: quantity,
          unitRaw: draft.unitRaw,
          needsConversion: draft.needsConversion,
          convertToUnitRaw: draft.needsConversion ? draft.convertToUnitRaw : undefined
        })
        return rows
      }, [])

      if (!normalizedIngredients.length) {
        throw new Error("Add at least one ingredient.")
      }

      const instructionLines = manualInstructions
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)

      if (howToGuideID) {
        const linkedGuide = await fetchHowToGuide(activeOrgId, howToGuideID)
        if (linkedGuide?.steps?.length) {
          const flattened = linkedGuide.steps
            .sort((left, right) => left.stepNumber - right.stepNumber)
            .map((step) => {
              const textBlocks = step.blocks
                .filter((block) => block.type === "text")
                .map((block) => block.text?.trim() ?? "")
                .filter(Boolean)
              if (textBlocks.length > 0) {
                return textBlocks.join(" ")
              }
              return (step.title ?? `Step ${step.stepNumber}`).trim()
            })
            .filter(Boolean)
          if (flattened.length > 0) {
            const seen = new Set(instructionLines.map((line) => line.toLowerCase()))
            for (const line of flattened) {
              const key = line.toLowerCase()
              if (seen.has(key)) continue
              instructionLines.push(line)
              seen.add(key)
            }
          }
        }
      }

      await saveProductionProduct(activeOrgId, {
        name: cleanName,
        storeId: activeStoreId || undefined,
        outputItemID: outputItem.id,
        outputItemNameSnapshot: outputItem.name,
        outputUnitRaw: outputItem.unit,
        howToGuideID: howToGuideID || undefined,
        defaultBatchYield: parsedYield,
        targetDaysOnHand: Number.isFinite(parsedTargetDays) ? parsedTargetDays : 1.5,
        defaultServingTarget: Number.isFinite(parsedDesiredServings) ? parsedDesiredServings : undefined,
        instructions: instructionLines,
        ingredients: normalizedIngredients,
        actorUid: user.uid,
        isActive: true
      })
    },
    onSuccess: async () => {
      setStatusMessage("Production product saved.")
      setErrorMessage(null)
      setName("")
      setOutputItemID("")
      setHowToGuideID("")
      setDefaultBatchYield("1")
      setDesiredServings("1")
      setTargetDaysOnHand("1.5")
      setManualInstructions("")
      setIngredients([emptyIngredientDraftWithDefault(preferredConversionUnitRaw)])
      await Promise.all([refetchProducts(), refetchIngredients()])
    },
    onError: (error) => {
      setStatusMessage(null)
      setErrorMessage(error instanceof Error ? error.message : "Could not save production product.")
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (productId: string) => {
      if (!activeOrgId || !user) return
      await deleteProductionProduct(activeOrgId, productId, user.uid)
    },
    onSuccess: async () => {
      setStatusMessage("Production product removed.")
      setErrorMessage(null)
      await Promise.all([refetchProducts(), refetchIngredients()])
    },
    onError: () => {
      setStatusMessage(null)
      setErrorMessage("Could not remove production product.")
    }
  })

  const exportProduction = () => {
    if (products.length === 0) return
    downloadSpreadsheetExport({
      dataset: "production",
      rows: products as unknown as Array<Record<string, unknown>>,
      settings: { orgSettings, storeSettings },
      organizationName: activeOrg?.organizationName,
      storeName: activeStore?.title ?? activeStore?.name,
      scopeLabel: activeStore ? `${activeStore.title ?? activeStore.name} Production` : "Production"
    })
  }

  return (
    <div>
      <PageHead
        title="Production"
        subtitle="Create production products from inventory ingredients, attach guides, and auto-generate make + frozen pull lists."
        actions={
          <AppButton
            variant="secondary"
            onClick={exportProduction}
            disabled={!effectivePermissions.exportData || products.length === 0}
          >
            Export
          </AppButton>
        }
      />

      <TipBanner
        title="Tip"
        message="Auto pull uses trends, seasonal weather demand, holiday boosts, and your business input factor."
        accentColor="#8B5CF6"
      />

      <div className="mt-3 rounded-2xl border border-app-border px-3 py-2 text-xs text-app-muted">
        Recommendation source:{" "}
        {usingRecommendationFallback
          ? `Local fallback (degraded mode · ${localFallback?.meta.engineVersion ?? "local_fallback_rules_v1"})`
          : `Backend ${backendRecommendations?.meta.engineVersion ?? "rules_v1"}${backendDegraded ? " (degraded)" : ""}`}
        {backendRecommendations?.meta.fallbackReason ? ` · ${backendRecommendations.meta.fallbackReason}` : ""}
        {usingRecommendationFallback ? ` · ${localFallback?.meta.fallbackReason ?? "Backend unavailable."}` : ""}
        {backendRecommendationLoading ? " · Refreshing…" : ""}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_1.75fr]">
        <AppCard>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="card-title">Create Production Item</h2>
            <span className="rounded-full border border-app-border px-2 py-1 text-xs text-app-muted">Web Only</span>
          </div>

          <div className="grid gap-3">
            <AppInput
              placeholder="Product name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!canEditSetup}
            />

            <div className="grid gap-3 md:grid-cols-2">
              <AppSelect
                value={outputItemID}
                onChange={(event) => setOutputItemID(event.target.value)}
                disabled={!canEditSetup}
              >
                <option value="">Output inventory item</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </AppSelect>

              <AppSelect
                value={howToGuideID}
                onChange={(event) => setHowToGuideID(event.target.value)}
                disabled={!canEditSetup}
              >
                <option value="">Attach guide (optional)</option>
                {guides.map((guide) => (
                  <option key={guide.id} value={guide.id}>
                    {guide.title}
                  </option>
                ))}
              </AppSelect>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-xs text-app-muted">
                Batch yield (servings)
                <AppInput
                  className="text-sm"
                  value={defaultBatchYield}
                  onChange={(event) => setDefaultBatchYield(event.target.value)}
                  inputMode="decimal"
                  disabled={!canEditSetup}
                />
              </label>
              <label className="grid gap-1 text-xs text-app-muted">
                Need today (servings)
                <AppInput
                  className="text-sm"
                  value={desiredServings}
                  onChange={(event) => setDesiredServings(event.target.value)}
                  inputMode="decimal"
                  disabled={!canEditSetup}
                />
              </label>
              <label className="grid gap-1 text-xs text-app-muted">
                Target days on hand
                <AppInput
                  className="text-sm"
                  value={targetDaysOnHand}
                  onChange={(event) => setTargetDaysOnHand(event.target.value)}
                  inputMode="decimal"
                  disabled={!canEditSetup}
                />
              </label>
            </div>

            <p className="secondary-text text-xs">
              Batch scaling: {servingsConversion(Number(defaultBatchYield), Number(desiredServings)).toFixed(3)}x
            </p>

            <AppTextarea
              className="min-h-[88px] text-sm"
              placeholder="Optional inline instructions (one step per line)."
              value={manualInstructions}
              onChange={(event) => setManualInstructions(event.target.value)}
              disabled={!canEditSetup}
            />

            <div className="rounded-2xl border border-app-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Ingredients</p>
                <AppButton
                  variant="secondary"
                  onClick={() =>
                    setIngredients((prev) => [...prev, emptyIngredientDraftWithDefault(preferredConversionUnitRaw)])
                  }
                  disabled={!canEditSetup}
                >
                  <Plus className="h-4 w-4" /> Add ingredient
                </AppButton>
              </div>

              <div className="space-y-3">
                {ingredients.map((draft) => {
                  const item = items.find((row) => row.id === draft.inventoryItemID)
                  const quantity = Number(draft.quantityPerBatch)
                  const preview =
                    item && Number.isFinite(quantity) && quantity > 0
                      ? conversionPreviewText({
                          quantity,
                          unitRaw: draft.unitRaw,
                          needsConversion: draft.needsConversion,
                          convertToUnitRaw: draft.convertToUnitRaw,
                          inventoryUnitRaw: item.unit
                        })
                      : ""

                  return (
                    <div key={draft.id} className="rounded-2xl border border-app-border p-3">
                      <div className="grid gap-2 md:grid-cols-[1.4fr_0.9fr_0.9fr_auto]">
                        <AppSelect
                          value={draft.inventoryItemID ?? ""}
                          onChange={(event) =>
                            setIngredients((prev) =>
                              prev.map((row) =>
                                row.id === draft.id
                                  ? {
                                      ...row,
                                      inventoryItemID: event.target.value || undefined,
                                      convertToUnitRaw:
                                        items.find((item) => item.id === event.target.value)?.unit ??
                                        preferredConversionUnitRaw
                                    }
                                  : row
                              )
                            )
                          }
                          disabled={!canEditSetup}
                        >
                          <option value="">Inventory ingredient</option>
                          {items.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.name}
                            </option>
                          ))}
                        </AppSelect>

                        <AppInput
                          placeholder="Amount"
                          value={draft.quantityPerBatch}
                          onChange={(event) =>
                            setIngredients((prev) =>
                              prev.map((row) => (row.id === draft.id ? { ...row, quantityPerBatch: event.target.value } : row))
                            )
                          }
                          inputMode="decimal"
                          disabled={!canEditSetup}
                        />

                        <AppSelect
                          value={draft.unitRaw}
                          onChange={(event) =>
                            setIngredients((prev) =>
                              prev.map((row) => (row.id === draft.id ? { ...row, unitRaw: event.target.value } : row))
                            )
                          }
                          disabled={!canEditSetup}
                        >
                          {UNIT_OPTIONS.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </AppSelect>

                        <AppButton
                          variant="secondary"
                          className="!px-3"
                          onClick={() =>
                            setIngredients((prev) =>
                              prev.length > 1 ? prev.filter((row) => row.id !== draft.id) : prev
                            )
                          }
                          disabled={!canEditSetup || ingredients.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </AppButton>
                      </div>

                      <div className="mt-2 grid gap-2 md:grid-cols-[auto_1fr] md:items-center">
                        <AppCheckbox
                          checked={draft.needsConversion}
                          onChange={(event) =>
                            setIngredients((prev) =>
                              prev.map((row) =>
                                row.id === draft.id ? { ...row, needsConversion: event.target.checked } : row
                              )
                            )
                          }
                          disabled={!canEditSetup}
                          label="Needs conversion"
                          className="w-fit !py-1.5"
                        />

                        {draft.needsConversion ? (
                          <AppSelect
                            className="text-sm"
                            value={draft.convertToUnitRaw ?? "pieces"}
                            onChange={(event) =>
                              setIngredients((prev) =>
                                prev.map((row) =>
                                  row.id === draft.id ? { ...row, convertToUnitRaw: event.target.value } : row
                                )
                              )
                            }
                            disabled={!canEditSetup}
                          >
                            {UNIT_OPTIONS.map((unit) => (
                              <option key={unit} value={unit}>
                                Convert to {unit}
                              </option>
                            ))}
                          </AppSelect>
                        ) : null}
                      </div>

                      {preview ? <p className="mt-2 text-xs text-app-muted">{preview}</p> : null}
                    </div>
                  )
                })}
              </div>
            </div>

            <AppButton
              onClick={() => saveMutation.mutate()}
              disabled={!canEditSetup || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving..." : "Save Production Item"}
            </AppButton>
          </div>
        </AppCard>

        <div className="grid gap-4">
          <AppCard>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="card-title">Make Today</h2>
              <span className="rounded-full border border-app-border px-2 py-1 text-xs text-app-muted">Trend Based</span>
            </div>
            {makeTodayRows.length === 0 ? (
              <p className="secondary-text">
                No production items configured yet. Create your first product setup on this page to unlock make recommendations.
              </p>
            ) : (
              <div className="space-y-2">
                {makeTodayRows.map((row) => (
                  <div key={row.productId} className="rounded-2xl border border-app-border px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{row.productName}</p>
                      <p className="text-sm font-semibold text-violet-300">
                        Make {row.recommendedMakeQuantity.toFixed(3)} {row.outputUnitRaw}
                      </p>
                    </div>
                    <p className="secondary-text text-xs">
                      Usage {row.expectedUsageToday.toFixed(3)} · On hand {row.onHandQuantity.toFixed(3)} · Scale {row.scaleFactor.toFixed(3)}x
                    </p>
                  </div>
                ))}
              </div>
            )}
          </AppCard>

          <AppCard>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Snowflake className="h-4 w-4 text-cyan-300" />
                <h2 className="card-title">Frozen Pull (Next Day)</h2>
              </div>
              <AppCheckbox
                checked={includeNonFrozen}
                onChange={(event) => setIncludeNonFrozen(event.target.checked)}
                label="Include non-frozen"
                className="w-fit !py-1.5 !text-xs"
              />
            </div>

            <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
              <label className="text-xs text-app-muted">
                Business input factor ({businessFactor.toFixed(2)}x)
                <AppSlider
                  className="mt-1"
                  min={0.7}
                  max={1.5}
                  step={0.05}
                  value={businessFactor}
                  onChange={(event) => setBusinessFactor(Number(event.target.value))}
                />
              </label>
              <div className="rounded-2xl border border-app-border px-3 py-2 text-xs text-app-muted">
                Weather {pullForecast.factors.weatherFactor.toFixed(2)}x · Holiday {pullForecast.factors.holidayFactor.toFixed(2)}x
                <br />
                Trend {pullForecast.factors.trendFactor.toFixed(2)}x
                {pullForecast.factors.holidayName ? ` · ${pullForecast.factors.holidayName}` : ""}
              </div>
            </div>

            {pullForecast.rows.length === 0 ? (
              <p className="secondary-text">
                No pull recommendations yet. Add frozen ingredients and production formulas, then run Make Today to generate tomorrow&apos;s pull list.
              </p>
            ) : (
              <div className="space-y-2">
                {pullForecast.rows.map((row) => (
                  <div key={row.itemId} className="rounded-2xl border border-app-border px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{row.itemName}</p>
                      <p className="text-sm font-semibold text-cyan-300">
                        Pull {row.recommendedPullQuantity.toFixed(3)} {row.unitRaw}
                      </p>
                    </div>
                    <p className="secondary-text text-xs">
                      Need {row.requiredQuantity.toFixed(3)} · On hand {row.onHandQuantity.toFixed(3)} · {row.rationale}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </AppCard>

          <AppCard>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="card-title">Configured Products</h2>
              <span className="rounded-full border border-app-border px-2 py-1 text-xs text-app-muted">{products.length} total</span>
            </div>
            {products.length === 0 ? (
              <p className="secondary-text">
                No production products saved yet. Add a product with ingredients and yield so teams can run production from this dashboard.
              </p>
            ) : (
              <div className="space-y-2">
                {products.map((product) => (
                  <div key={product.id} className="rounded-2xl border border-app-border px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{product.name}</p>
                        <p className="secondary-text text-xs">
                          Yield {product.defaultBatchYield.toFixed(3)} {product.outputUnitRaw} · Ingredients {productionIngredients.filter((row) => row.productionProductID === product.id).length}
                        </p>
                      </div>
                      {canEditSetup ? (
                        <AppButton
                          variant="secondary"
                          className="!border-rose-500/50 !text-rose-300"
                          onClick={() => deleteMutation.mutate(product.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" /> Remove
                        </AppButton>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AppCard>
        </div>
      </div>

      {statusMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {statusMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      ) : null}
    </div>
  )
}
