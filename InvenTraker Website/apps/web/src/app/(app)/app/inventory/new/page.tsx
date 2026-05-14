"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AppButton, AppCard, AppCheckbox, AppInput, AppSelect, appButtonClass } from "@inventracker/ui"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  fetchStoreInventoryItems,
  fetchStoreSettings,
  fetchVendors,
  formatStoreLabel,
  uploadMediaAsset,
  upsertStoreInventoryItem
} from "@/lib/data/firestore"

type PackagingMode = "standard" | "prepackaged" | "rewrappable"
type UnitMode = "each" | "lbs"

type CreateItemFormState = {
  name: string
  upc: string
  reworkItemCode: string
  price: string
  quantityPerBox: string
  hasExpiration: boolean
  defaultExpiration: string
  defaultPackedExpiration: string
  unit: UnitMode
  vendorId: string
  vendorName: string
  departmentId: string
  categoryId: string
  storeDepartmentLocation: string
  minimumQuantity: string
  totalQuantity: string
  tags: string
  packaging: PackagingMode
  imageUrl: string
}

const defaultCreateItemForm: CreateItemFormState = {
  name: "",
  upc: "",
  reworkItemCode: "",
  price: "",
  quantityPerBox: "1",
  hasExpiration: false,
  defaultExpiration: "7",
  defaultPackedExpiration: "7",
  unit: "each",
  vendorId: "",
  vendorName: "",
  departmentId: "",
  categoryId: "",
  storeDepartmentLocation: "",
  minimumQuantity: "0",
  totalQuantity: "0",
  tags: "",
  packaging: "standard",
  imageUrl: ""
}

function normalizeBarcode(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const digits = trimmed.replace(/\D/g, "")
  return digits || trimmed
}

function makeItemId(name: string, upc: string): string {
  const normalizedUpc = normalizeBarcode(upc)
  if (normalizedUpc) {
    return `upc_${normalizedUpc.replace(/[^a-zA-Z0-9_-]/g, "")}`
  }

  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)

  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().split("-")[0]
    : String(Date.now())

  if (slug) return `item_${slug}_${suffix}`
  return `item_${suffix}`
}

export default function NewInventoryItemPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuthUser()
  const { activeOrgId, activeStore, activeStoreId, effectivePermissions } = useOrgContext()

  const [form, setForm] = useState<CreateItemFormState>(defaultCreateItemForm)
  const [creating, setCreating] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const canCreateInventory = Boolean(
    activeStoreId &&
      (effectivePermissions.editStoreInventory ||
        effectivePermissions.manageInventory ||
        effectivePermissions.editOrgInventoryMeta)
  )

  const { data: vendors = [] } = useQuery({
    queryKey: ["inventory-new-vendors", activeOrgId],
    queryFn: () => fetchVendors(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const { data: storeSettings } = useQuery({
    queryKey: ["inventory-new-store-settings", activeOrgId, activeStoreId],
    queryFn: () => fetchStoreSettings(activeOrgId, activeStore!),
    enabled: Boolean(activeOrgId && activeStore)
  })

  const { data: existingItems = [] } = useQuery({
    queryKey: ["inventory-new-items", activeOrgId, activeStoreId],
    queryFn: () => fetchStoreInventoryItems(activeOrgId, activeStoreId!),
    enabled: Boolean(activeOrgId && activeStoreId)
  })

  const departmentOptions = useMemo(
    () => storeSettings?.departmentConfigs ?? [],
    [storeSettings?.departmentConfigs]
  )

  const categoryOptions = useMemo(() => {
    return (storeSettings?.categoryConfigs ?? []).filter(
      (category) =>
        category.enabled &&
        category.appliesTo.includes("inventory") &&
        (category.departmentIds.length === 0 ||
          !form.departmentId ||
          category.departmentIds.includes(form.departmentId))
    )
  }, [form.departmentId, storeSettings?.categoryConfigs])

  const uploadImage = async (file: File) => {
    if (!activeOrgId || !user?.uid || !activeStoreId) return
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const uploaded = await uploadMediaAsset({
        file,
        orgId: activeOrgId,
        storeId: activeStoreId,
        userId: user.uid,
        type: "image"
      })
      if (!uploaded?.downloadUrl) {
        setErrorMessage("Could not upload image.")
        return
      }
      setForm((prev) => ({ ...prev, imageUrl: uploaded.downloadUrl ?? prev.imageUrl }))
      setStatusMessage("Image uploaded. Save item to apply.")
    } catch {
      setErrorMessage("Image upload failed.")
    }
  }

  const createInventoryItem = async () => {
    if (!activeOrgId || !activeStoreId || !canCreateInventory || creating) return
    setStatusMessage(null)
    setErrorMessage(null)

    const trimmedName = form.name.trim()
    if (!trimmedName) {
      setErrorMessage("Item name is required.")
      return
    }

    const normalizedUpc = normalizeBarcode(form.upc)
    const duplicate = existingItems.find((item) => {
      if (!normalizedUpc) return false
      return normalizeBarcode(item.upc ?? "") === normalizedUpc
    })
    if (duplicate) {
      setErrorMessage(`An item with barcode ${normalizedUpc} already exists in this store.`)
      return
    }

    setCreating(true)
    try {
      const hasExpiration = form.hasExpiration
      const defaultExpirationDays = hasExpiration ? Math.max(1, Number(form.defaultExpiration || "1")) : 0
      const packedExpirationDays = hasExpiration
        ? Math.max(1, Number(form.defaultPackedExpiration || form.defaultExpiration || "1"))
        : 0
      const quantity = Math.max(0, Number(form.totalQuantity || "0"))
      const initialExpirationDate = hasExpiration ? new Date() : null
      if (initialExpirationDate) {
        initialExpirationDate.setDate(initialExpirationDate.getDate() + defaultExpirationDays)
      }
      const packagingMode = form.packaging
      const departmentName =
        departmentOptions.find((department) => department.id === form.departmentId)?.name ?? ""
      const itemId = makeItemId(trimmedName, normalizedUpc)

      await upsertStoreInventoryItem(activeOrgId, activeStoreId, itemId, {
        name: trimmedName,
        upc: normalizedUpc || undefined,
        reworkItemCode:
          packagingMode === "rewrappable"
            ? (form.reworkItemCode.trim() || normalizedUpc || undefined)
            : "",
        price: Math.max(0, Number(form.price || "0")),
        quantityPerBox: Math.max(1, Number(form.quantityPerBox || "1")),
        qtyPerCase: Math.max(1, Number(form.quantityPerBox || "1")),
        hasExpiration,
        defaultExpiration: defaultExpirationDays,
        defaultExpirationDays,
        defaultPackedExpiration: packedExpirationDays,
        unit: form.unit,
        vendorId: form.vendorId.trim() || undefined,
        vendorName: form.vendorName.trim() || undefined,
        departmentId: form.departmentId.trim() || undefined,
        department: departmentName || undefined,
        categoryId: form.categoryId.trim() || undefined,
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        rewrapsWithUniqueBarcode: packagingMode === "rewrappable",
        isPrepackaged: packagingMode === "prepackaged",
        pictures: form.imageUrl ? [form.imageUrl] : [],
        totalQuantity: quantity,
        batches:
          quantity > 0
            ? [
                {
                  id: `web_${Date.now()}`,
                  quantity,
                  expirationDate: initialExpirationDate,
                  stockAreaRaw: "back_of_house",
                  storeId: activeStoreId
                }
              ]
            : [],
        minimumQuantity: Math.max(0, Number(form.minimumQuantity || "0")),
        storeMinimumQuantity: Math.max(0, Number(form.minimumQuantity || "0")),
        storeDepartmentLocation: form.storeDepartmentLocation.trim(),
        actorUid: user?.uid
      })

      await queryClient.invalidateQueries({ queryKey: ["items", activeOrgId] })
      await queryClient.invalidateQueries({ queryKey: ["store-inventory-items", activeOrgId, activeStoreId] })
      setStatusMessage("Item created.")
      router.push(`/app/inventory/${itemId}`)
    } catch (error) {
      const message = String((error as { message?: string } | undefined)?.message ?? "").trim()
      setErrorMessage(message || "Could not create inventory item.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <PageHead
        title="Add Inventory Item"
        subtitle={
          activeStore
            ? `Create a new store item for ${formatStoreLabel(activeStore)}.`
            : "Select a store, then create a new inventory item."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/app/inventory" className={appButtonClass("secondary")}>
              Back to Inventory
            </Link>
            <AppButton
              onClick={() => void createInventoryItem()}
              disabled={!canCreateInventory || creating || !form.name.trim()}
            >
              {creating ? "Creating..." : "Create Item"}
            </AppButton>
          </div>
        }
      />

      <AppCard>
        {!canCreateInventory ? (
          <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {activeStoreId
              ? "You need inventory edit permission to create items for this store."
              : "Choose an active store before creating items."}
          </div>
        ) : null}

        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <AppInput
              placeholder="Item name *"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              disabled={!canCreateInventory}
            />
            <AppInput
              placeholder="Barcode #"
              value={form.upc}
              onChange={(event) => setForm((prev) => ({ ...prev, upc: event.target.value }))}
              disabled={!canCreateInventory}
            />
          </div>

          {form.packaging === "rewrappable" ? (
            <AppInput
              placeholder="Item code used by rewrap scanner"
              value={form.reworkItemCode}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, reworkItemCode: event.target.value }))
              }
              disabled={!canCreateInventory}
            />
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <AppInput
              type="number"
              step="0.01"
              placeholder="Price"
              value={form.price}
              onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
              disabled={!canCreateInventory}
            />
            <AppInput
              type="number"
              step="1"
              min="1"
              placeholder="# per case"
              value={form.quantityPerBox}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, quantityPerBox: event.target.value }))
              }
              disabled={!canCreateInventory}
            />
            <AppInput
              type="number"
              step="0.001"
              min="0"
              placeholder="Min quantity"
              value={form.minimumQuantity}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, minimumQuantity: event.target.value }))
              }
              disabled={!canCreateInventory}
            />
            <AppInput
              type="number"
              step="0.001"
              min="0"
              placeholder="Initial quantity"
              value={form.totalQuantity}
              onChange={(event) => setForm((prev) => ({ ...prev, totalQuantity: event.target.value }))}
              disabled={!canCreateInventory}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <AppSelect
              value={form.unit}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, unit: event.target.value as UnitMode }))
              }
              disabled={!canCreateInventory}
            >
              <option value="each">Each</option>
              <option value="lbs">Lbs</option>
            </AppSelect>
            <AppSelect
              value={form.packaging}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, packaging: event.target.value as PackagingMode }))
              }
              disabled={!canCreateInventory}
            >
              <option value="standard">Standard</option>
              <option value="prepackaged">Prepackaged</option>
              <option value="rewrappable">Rewrappable (unique barcode)</option>
            </AppSelect>
            <AppInput
              placeholder="Store location"
              value={form.storeDepartmentLocation}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, storeDepartmentLocation: event.target.value }))
              }
              disabled={!canCreateInventory}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-app-border bg-app-surface px-3 py-2">
              <AppCheckbox
                checked={form.hasExpiration}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    hasExpiration: event.target.checked,
                    defaultExpiration:
                      event.target.checked && prev.defaultExpiration === "0"
                        ? "7"
                        : prev.defaultExpiration,
                    defaultPackedExpiration:
                      event.target.checked && prev.defaultPackedExpiration === "0"
                        ? "7"
                        : prev.defaultPackedExpiration
                  }))
                }
                label="Item has expiration"
              />
            </div>
            <AppInput
              type="number"
              step="1"
              min={form.hasExpiration ? "1" : "0"}
              placeholder="Default expiration (days)"
              value={form.defaultExpiration}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, defaultExpiration: event.target.value }))
              }
              disabled={!canCreateInventory || !form.hasExpiration}
            />
          </div>

          {form.packaging === "rewrappable" ? (
            <AppInput
              type="number"
              step="1"
              min={form.hasExpiration ? "1" : "0"}
              placeholder="Packaged expiration (days)"
              value={form.defaultPackedExpiration}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, defaultPackedExpiration: event.target.value }))
              }
              disabled={!canCreateInventory || !form.hasExpiration}
            />
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <AppSelect
              value={form.vendorId}
              onChange={(event) => setForm((prev) => ({ ...prev, vendorId: event.target.value }))}
              disabled={!canCreateInventory}
            >
              <option value="">Select vendor (optional)</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </AppSelect>
            <AppInput
              placeholder="Vendor name override"
              value={form.vendorName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, vendorName: event.target.value }))
              }
              disabled={!canCreateInventory}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <AppSelect
              value={form.departmentId}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  departmentId: event.target.value,
                  categoryId: ""
                }))
              }
              disabled={!canCreateInventory}
            >
              <option value="">Select department</option>
              {departmentOptions.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </AppSelect>
            <AppSelect
              value={form.categoryId}
              onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))}
              disabled={!canCreateInventory}
            >
              <option value="">Select category</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </AppSelect>
          </div>

          <AppInput
            placeholder="Tags (comma separated)"
            value={form.tags}
            onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
            disabled={!canCreateInventory}
          />

          <div className="rounded-xl border border-dashed border-app-border px-3 py-2 text-sm text-app-muted">
            Upload image
            <AppInput
              className="mt-2 h-auto text-xs"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                void uploadImage(file)
              }}
              disabled={!canCreateInventory}
            />
          </div>

          {form.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.imageUrl} alt={form.name || "New item"} className="h-28 w-28 rounded-xl object-cover" />
          ) : null}
        </div>
      </AppCard>

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
