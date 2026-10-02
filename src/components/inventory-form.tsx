"use client"

import { useRef } from "react"
import { Save } from "lucide-react"

import { ActionButton } from "@/components/action-button"
import { Field, Panel, SelectInput, TextArea, TextInput } from "@/components/ui"
import { archiveOrgRecord, centralProductId, submitPlatformProductApproval, writeOrgRecord, writeStoreProductDetail } from "@/lib/cloud-records"
import type { InventoryItem, StoreRecord } from "@/lib/demo-data"
import { useAuthSession } from "@/lib/auth-session"
import { saveWebParChange, saveWebSpotCheck } from "@/lib/web-stock-operations"

function numericField(formData: FormData, name: string) {
  const value = Number(formData.get(name) ?? 0)
  return Number.isFinite(value) ? value : 0
}

function textField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim()
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
}

function catalogRecordId(sku: string, name: string) {
  const key = slugify(sku || name)
  return key ? `product-${key}` : undefined
}

function optionalNumericField(formData: FormData, name: string) {
  const rawValue = String(formData.get(name) ?? "").trim()
  if (!rawValue) return undefined
  const value = Number(rawValue)
  return Number.isFinite(value) ? value : undefined
}

export function InventoryForm({ item, stores, mode = "create" }: { item?: InventoryItem; stores: StoreRecord[]; mode?: "create" | "edit" }) {
  const formRef = useRef<HTMLFormElement>(null)
  const session = useAuthSession()

  async function saveItem() {
    if (!formRef.current) throw new Error("Inventory form is not ready.")

    const formData = new FormData(formRef.current)
    const frontStock = numericField(formData, "frontStock")
    const backStock = numericField(formData, "backStock")
    const reorderPoint = numericField(formData, "reorderPoint")
    const name = textField(formData, "name")
    const sku = textField(formData, "sku")
    const department = textField(formData, "department")
    const category = textField(formData, "category")
    const location = textField(formData, "location")
    const vendor = textField(formData, "vendor")
    const unit = textField(formData, "unit") || "eaches"
    const expires = textField(formData, "expiration") === "Tracks expiration"
    const price = optionalNumericField(formData, "price")
    const quantityInCase = optionalNumericField(formData, "quantityInCase")
    const centralId = centralProductId({ sku, name })
    const orgProductId = catalogRecordId(sku, name)
    const storeId = mode === "edit" ? String(item?.storeId ?? "") : textField(formData, "storeId")
    const reason = textField(formData, "changeReason")
    if (!storeId) throw new Error("Choose the store this stock belongs to.")
    if (!reason) throw new Error("Add a short reason for the stock and par change.")

    if (centralId) {
      await submitPlatformProductApproval(`approval-${centralId}`, {
        proposedCentralProductId: centralId,
        name,
        sku,
        proposedData: {
          name,
          sku,
          averagePrice: price,
          averageQuantityInCase: quantityInCase,
          averageExpirationDays: expires ? undefined : 0,
          images: [],
          sourceCount: 1,
          lastSeenSource: "inventory-form",
          searchText: [name, sku].filter(Boolean).join(" ").toLowerCase()
        },
        source: "inventory-form"
      })
    }

    await writeOrgRecord("products", orgProductId, {
      centralProductId: centralId,
      name,
      sku,
      department,
      category,
      defaultUnit: unit,
      expires,
      lastCost: typeof price === "number" ? `$${price.toFixed(2)}` : "",
      location,
      averagePrice: price,
      averageQuantityInCase: quantityInCase,
      centralApprovalStatus: centralId ? "pending" : "not_applicable",
      source: "web-inventory"
    }, session.orgId)

    const inventoryId = await writeOrgRecord("inventory", item?.id, {
      centralProductId: centralId,
      orgProductId,
      ...(mode === "create" ? { storeId } : {}),
      name,
      sku,
      department,
      category,
      location,
      vendor,
      price,
      quantityInCase,
      unit,
      expires,
      ...(mode === "create" ? { frontStock: 0, backStock: 0, onHand: 0, par: 0, reorderPoint: 0, revision: 0, status: "Low" } : {}),
      notes: textField(formData, "notes"),
      source: "web"
    }, session.orgId)

    await writeStoreProductDetail(storeId, orgProductId, {
      centralProductId: centralId,
      orgProductId,
      name,
      sku,
      vendor,
      price,
      quantityInCase,
      expires,
      location,
      notes: textField(formData, "notes"),
      source: "web-inventory"
    }, session.orgId)

    let revision = item?.revision ?? 0
    if (mode === "create" || frontStock !== item?.frontStock || backStock !== item?.backStock) {
      await saveWebSpotCheck({
        orgId: session.orgId,
        storeId,
        itemId: inventoryId,
        expectedRevision: revision,
        frontStock,
        backStock,
        reason
      })
      revision += 1
    }

    const par = numericField(formData, "par")
    if (mode === "create" || par !== item?.par || reorderPoint !== item?.reorderPoint) {
      await saveWebParChange({
        orgId: session.orgId,
        storeId,
        itemId: inventoryId,
        expectedRevision: revision,
        par,
        reorderPoint,
        reason
      })
    }
  }

  async function archiveItem() {
    if (!item?.id) throw new Error("Save this item before archiving it.")
    await archiveOrgRecord("inventory", item.id, session.orgId)
  }

  return (
    <Panel className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">{mode === "edit" ? "Edit stock item" : "Add stock item"}</h2>
          <p className="app-tip mt-1 text-sm text-slate-400">
            This creates the item your store counts, stocks, orders, and links back to product defaults.
          </p>
        </div>
        <Save className="h-5 w-5 text-blue-300" />
      </div>

      <form ref={formRef} className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Item name">
            <TextInput name="name" defaultValue={item?.name} placeholder="Cabernet Sauvignon" />
          </Field>
          <Field label="SKU or barcode">
            <TextInput name="sku" defaultValue={item?.sku} placeholder="WINE-CAB-750" />
          </Field>
          <Field label="Department">
            <TextInput name="department" defaultValue={item?.department} placeholder="Beer & Wine" />
          </Field>
          <Field label="Category">
            <TextInput name="category" defaultValue={item?.category} placeholder="Red wine" />
          </Field>
          <Field label="Store location">
            <TextInput name="location" defaultValue={item?.location} placeholder="Aisle 4 / Backstock B" />
          </Field>
          <Field label="Store">
            {mode === "edit" ? (
              <TextInput value={stores.find((store) => store.id === item?.storeId)?.name ?? item?.storeId ?? "Unassigned"} disabled />
            ) : (
              <SelectInput name="storeId" defaultValue={session.member?.storeId ?? stores[0]?.id ?? ""}>
                <option value="" disabled>Choose a store</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </SelectInput>
            )}
          </Field>
          <Field label="Vendor">
            <TextInput name="vendor" defaultValue={item?.vendor} placeholder="Vintage Point" />
          </Field>
          <Field label="Store price">
            <TextInput name="price" type="number" min="0" step="0.01" defaultValue={item?.price} placeholder="12.40" />
          </Field>
          <Field label="# per case">
            <TextInput name="quantityInCase" type="number" min="0" step="1" defaultValue={item?.quantityInCase} placeholder="12" />
          </Field>
          <Field label="Unit">
            <SelectInput name="unit" defaultValue={item?.unit ?? "eaches"}>
              <option>eaches</option>
              <option>cases</option>
              <option>pounds</option>
              <option>ounces</option>
              <option>gallons</option>
            </SelectInput>
          </Field>
          <Field label="Expiration tracking">
            <SelectInput name="expiration" defaultValue={item?.expires ? "Tracks expiration" : "No expiration"}>
              <option>No expiration</option>
              <option>Tracks expiration</option>
            </SelectInput>
          </Field>
          <Field label="Front stock">
            <TextInput name="frontStock" type="number" min="0" defaultValue={item?.frontStock ?? 0} />
          </Field>
          <Field label="Back stock">
            <TextInput name="backStock" type="number" min="0" defaultValue={item?.backStock ?? 0} />
          </Field>
          <Field label="Par">
            <TextInput name="par" type="number" min="0" defaultValue={item?.par ?? 0} />
          </Field>
          <Field label="Reorder point">
            <TextInput name="reorderPoint" type="number" min="0" defaultValue={item?.reorderPoint ?? 0} />
          </Field>
        </div>

        <Field label="Notes" hint="Use this for receiving rules, shelf capacity notes, or anything a team member should see.">
          <TextArea name="notes" placeholder="Optional item notes" />
        </Field>

        <Field label="Change reason" hint="Saved with the stock and par audit record.">
          <TextInput name="changeReason" defaultValue={mode === "create" ? "Opening stock setup" : "Verified inventory update"} />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <ActionButton icon={<Save className="h-4 w-4" />} doneLabel={mode === "edit" ? "Stock item saved" : "Stock item created"} onAction={saveItem}>
            {mode === "edit" ? "Save stock item" : "Create stock item"}
          </ActionButton>
          <ActionButton variant="secondary" doneLabel="Draft saved">Save as draft</ActionButton>
          {mode === "edit" ? (
            <ActionButton variant="ghost" doneLabel="Item archived" onAction={archiveItem}>
              Archive item
            </ActionButton>
          ) : null}
        </div>
      </form>
    </Panel>
  )
}
