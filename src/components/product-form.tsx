"use client"

import { useMemo, useRef, useState } from "react"
import { Save } from "lucide-react"

import { ActionButton } from "@/components/action-button"
import { ProductNutritionEditor } from "@/components/product-nutrition-editor"
import { Field, Panel, SelectInput, TextArea, TextInput, ToggleRow } from "@/components/ui"
import { archiveOrgRecord, centralProductId, submitPlatformProductApproval, writeOrgRecord } from "@/lib/cloud-records"
import { storeDisplays, type Product, type StoreDisplay } from "@/lib/demo-data"

function numericField(formData: FormData, name: string) {
  const value = Number(formData.get(name) ?? 0)
  return Number.isFinite(value) ? value : 0
}

function optionalNumericField(formData: FormData, name: string) {
  const rawValue = String(formData.get(name) ?? "").trim()
  if (!rawValue) return undefined
  const value = Number(rawValue)
  return Number.isFinite(value) ? value : undefined
}

function textField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim()
}

function priceNumber(value: string) {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : undefined
}

function listField(formData: FormData, name: string) {
  return textField(formData, name)
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function compactRecord(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== ""))
}

export function ProductForm({
  product,
  mode = "create",
  displays = storeDisplays
}: {
  product?: Product
  mode?: "create" | "edit"
  displays?: StoreDisplay[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [productName, setProductName] = useState(product?.name ?? "")
  const [sku, setSku] = useState(product?.sku ?? "")
  const [isOnDisplay, setIsOnDisplay] = useState(product?.displayAssignment?.isOnDisplay ?? false)
  const [selectedDisplayId, setSelectedDisplayId] = useState(product?.displayAssignment?.displayId ?? displays[0]?.id ?? "")
  const selectedDisplay = useMemo(
    () => displays.find((display) => display.id === selectedDisplayId) ?? displays[0],
    [displays, selectedDisplayId]
  )

  async function saveProduct() {
    if (!formRef.current) throw new Error("Product form is not ready.")

    const formData = new FormData(formRef.current)
    const expires = textField(formData, "expiration") === "Tracks expiration"
    const productName = textField(formData, "name")
    const productSku = textField(formData, "sku")
    const lastCost = textField(formData, "lastCost")
    const averagePrice = optionalNumericField(formData, "averagePrice") ?? priceNumber(lastCost)
    const averageExpirationDays = optionalNumericField(formData, "averageExpirationDays")
    const averageQuantityInCase = optionalNumericField(formData, "averageQuantityInCase")
    const images = listField(formData, "images")
    const nutritionStatus = textField(formData, "nutritionStatus")
    const hasNutritionInfo = nutritionStatus === "Has nutritional information"
    const nutrition = hasNutritionInfo
      ? compactRecord({
          servingSize: textField(formData, "nutritionServingSize"),
          caloriesKcal: optionalNumericField(formData, "nutritionCaloriesKcal"),
          fatG: optionalNumericField(formData, "nutritionFatG"),
          saturatedFatG: optionalNumericField(formData, "nutritionSaturatedFatG"),
          carbohydratesG: optionalNumericField(formData, "nutritionCarbohydratesG"),
          sugarsG: optionalNumericField(formData, "nutritionSugarsG"),
          fiberG: optionalNumericField(formData, "nutritionFiberG"),
          proteinG: optionalNumericField(formData, "nutritionProteinG"),
          sodiumMg: optionalNumericField(formData, "nutritionSodiumMg"),
          saltG: optionalNumericField(formData, "nutritionSaltG"),
          ingredientsText: textField(formData, "nutritionIngredientsText"),
          allergens: textField(formData, "nutritionAllergens"),
          labels: textField(formData, "nutritionLabels"),
          imageUrl: textField(formData, "nutritionImageUrl"),
          sourceSummary: textField(formData, "nutritionSourceSummary")
        })
      : {}
    const displayAssignment = isOnDisplay
      ? compactRecord({
          isOnDisplay: true,
          displayId: selectedDisplayId,
          displayName: selectedDisplay?.name ?? "",
          startDate: textField(formData, "displayStartDate"),
          endDate: textField(formData, "displayEndDate"),
          quantityNeeded: numericField(formData, "displayQuantityNeeded"),
          changeMode: textField(formData, "displayChangeMode") || "Manual",
          notes: textField(formData, "displayNotes")
        })
      : {
          isOnDisplay: false,
          displayId: "",
          displayName: "",
          startDate: "",
          quantityNeeded: 0,
          changeMode: "Manual"
        }

    const centralId = centralProductId({ sku: productSku, name: productName })
    if (centralId) {
      await submitPlatformProductApproval(`approval-${centralId}`, {
        proposedCentralProductId: centralId,
        name: productName,
        sku: productSku,
        proposedData: {
          name: productName,
          sku: productSku,
          nutrition,
          averagePrice,
          averageExpirationDays,
          averageQuantityInCase,
          images,
          sourceCount: 1,
          lastSeenSource: "organization-product-form",
          searchText: [productName, productSku].filter(Boolean).join(" ").toLowerCase()
        },
        source: "organization-product-form"
      })
    }

    await writeOrgRecord("products", product?.id, {
      centralProductId: centralId,
      name: productName,
      sku: productSku,
      department: textField(formData, "department"),
      category: textField(formData, "category"),
      defaultUnit: textField(formData, "defaultUnit") || "eaches",
      expires,
      lastCost,
      location: textField(formData, "location"),
      averagePrice,
      averageExpirationDays,
      averageQuantityInCase,
      images,
      hasNutritionInfo,
      nutrition,
      centralApprovalStatus: centralId ? "pending" : "not_applicable",
      displayAssignment,
      notes: textField(formData, "productNotes"),
      source: "web"
    })
  }

  async function archiveProduct() {
    if (!product?.id) throw new Error("Save this product before archiving it.")
    await archiveOrgRecord("products", product.id)
  }

  return (
    <Panel className="p-4">
      <div className="mb-4">
        <h2 className="font-semibold text-white">{mode === "edit" ? "Edit catalog product" : "Add catalog product"}</h2>
        <p className="app-tip mt-1 text-sm text-slate-400">
          Catalog products hold reusable identity, nutrition, and default details. Store stock is added separately when a location starts carrying it.
        </p>
      </div>

      <form ref={formRef} className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Product name">
            <TextInput name="name" value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Cabernet Sauvignon" />
          </Field>
          <Field label="SKU or barcode">
            <TextInput name="sku" value={sku} onChange={(event) => setSku(event.target.value)} placeholder="WINE-CAB-750 or UPC barcode" />
          </Field>
          <Field label="Department">
            <TextInput name="department" defaultValue={product?.department} placeholder="Beer & Wine" />
          </Field>
          <Field label="Category">
            <TextInput name="category" defaultValue={product?.category} placeholder="Red wine" />
          </Field>
          <Field label="Default unit">
            <SelectInput name="defaultUnit" defaultValue={product?.defaultUnit ?? "eaches"}>
              <option>eaches</option>
              <option>cases</option>
              <option>pounds</option>
              <option>ounces</option>
              <option>gallons</option>
            </SelectInput>
          </Field>
          <Field label="Expiration behavior">
            <SelectInput name="expiration" defaultValue={product?.expires ? "Tracks expiration" : "No expiration"}>
              <option>No expiration</option>
              <option>Tracks expiration</option>
            </SelectInput>
          </Field>
          <Field label="Last cost">
            <TextInput name="lastCost" defaultValue={product?.lastCost} placeholder="$0.00" />
          </Field>
          <Field label="Average price">
            <TextInput name="averagePrice" type="number" min="0" step="0.01" defaultValue={product?.averagePrice} placeholder="12.40" />
          </Field>
          <Field label="Average expiration in days">
            <TextInput name="averageExpirationDays" type="number" min="0" step="1" defaultValue={product?.averageExpirationDays} placeholder="7" />
          </Field>
          <Field label="Average quantity in a case">
            <TextInput name="averageQuantityInCase" type="number" min="0" step="1" defaultValue={product?.averageQuantityInCase} placeholder="12" />
          </Field>
          <Field label="Default store location">
            <TextInput name="location" defaultValue={product?.location} placeholder="Aisle, cooler, shelf, or backstock location" />
          </Field>
        </div>

        <Field label="Product image URLs" hint="One URL per line or comma separated. These sync to the central catalog as reviewed image candidates.">
          <TextArea name="images" defaultValue={product?.images?.join("\n")} placeholder="https://..." />
        </Field>

        <ToggleRow
          name="allowStoreCategoryOverride"
          title="Allow stores to override category"
          description="Store-level inventory can use a local category while the catalog product keeps its default."
          checked={false}
        />

        <ToggleRow
          name="isOnDisplay"
          title="Is on display"
          description="When selected, this product can be assigned to a managed store display with dates and required quantity."
          checked={isOnDisplay}
          onChange={(event) => setIsOnDisplay(event.currentTarget.checked)}
        />

        {isOnDisplay ? (
          <div className="rounded-md border border-[var(--app-accent)] bg-[var(--app-accent-soft)] p-4">
            <div className="mb-4">
              <h3 className="font-semibold text-white">Display assignment</h3>
              <p className="app-tip mt-1 text-sm leading-6 text-slate-300">
                Displays are managed in store settings. This assignment can be scheduled for a date range or changed manually anytime.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Display">
                <SelectInput name="displayId" value={selectedDisplayId} onChange={(event) => setSelectedDisplayId(event.target.value)}>
                  {displays.map((display) => (
                    <option key={display.id} value={display.id}>
                      {display.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Change mode">
                <SelectInput name="displayChangeMode" defaultValue={product?.displayAssignment?.changeMode ?? "Manual"}>
                  <option>Manual</option>
                  <option>Scheduled</option>
                </SelectInput>
              </Field>
              <Field label="Start date">
                <TextInput name="displayStartDate" type="date" defaultValue={product?.displayAssignment?.startDate} />
              </Field>
              <Field label="End date" hint="Optional. Leave blank for an open-ended display.">
                <TextInput name="displayEndDate" type="date" defaultValue={product?.displayAssignment?.endDate} />
              </Field>
              <Field label="Quantity needed on display">
                <TextInput name="displayQuantityNeeded" type="number" min="0" defaultValue={product?.displayAssignment?.quantityNeeded ?? 0} />
              </Field>
              <Field label="Display capacity">
                <TextInput name="displayCapacityLabel" value={selectedDisplay ? `${selectedDisplay.capacity} units` : "No display selected"} readOnly />
              </Field>
            </div>

            {selectedDisplay ? (
              <div className="mt-4 rounded-md border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300">
                <p className="font-semibold text-white">{selectedDisplay.name}</p>
                <p className="mt-1">
                  {selectedDisplay.location} · {selectedDisplay.department} · owned by {selectedDisplay.owner}
                </p>
              </div>
            ) : null}

            <Field label="Display notes">
              <TextArea
                name="displayNotes"
                defaultValue={product?.displayAssignment?.notes}
                placeholder="Facing notes, seasonal instructions, replenishment cadence, or manual change notes."
              />
            </Field>
          </div>
        ) : null}

        <ProductNutritionEditor
          productId={product?.id}
          productName={productName}
          sku={sku}
          hasNutritionInfo={product?.hasNutritionInfo}
          nutrition={product?.nutrition}
        />

        <Field label="Product notes">
          <TextArea name="productNotes" placeholder="Optional product details, ordering notes, or future AI hints." />
        </Field>

        <div className="flex flex-wrap gap-2">
          <ActionButton icon={<Save className="h-4 w-4" />} doneLabel={mode === "edit" ? "Catalog product saved" : "Catalog product created"} onAction={saveProduct}>
            {mode === "edit" ? "Save catalog product" : "Create catalog product"}
          </ActionButton>
          {mode === "edit" ? (
            <ActionButton variant="ghost" doneLabel="Catalog product archived" onAction={archiveProduct}>
              Archive catalog product
            </ActionButton>
          ) : null}
        </div>
      </form>
    </Panel>
  )
}
