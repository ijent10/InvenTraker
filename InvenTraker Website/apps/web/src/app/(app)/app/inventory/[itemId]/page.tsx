"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AppButton, AppCard, AppCheckbox, AppInput, AppSelect, appButtonClass } from "@inventracker/ui"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  fetchItem,
  fetchStoreSettings,
  fetchVendors,
  updateItem,
  updateStoreItemOverride,
  uploadMediaAsset,
  type ItemRecord
} from "@/lib/data/firestore"

type PackagingMode = "standard" | "prepackaged" | "rewrappable"

type FormState = {
  name: string
  upc: string
  reworkItemCode: string
  price: string
  quantityPerBox: string
  hasExpiration: boolean
  defaultExpiration: string
  defaultPackedExpiration: string
  vendorId: string
  vendorName: string
  departmentId: string
  department: string
  categoryId: string
  storeDepartmentLocation: string
  tags: string
  packaging: PackagingMode
  imageUrl: string
  imageAssetId: string
}

function formFromItem(item: ItemRecord): FormState {
  const packaging: PackagingMode = item.rewrapsWithUniqueBarcode
    ? "rewrappable"
    : item.isPrepackaged
      ? "prepackaged"
      : "standard"
  const defaultImage = item.pictures?.[0] ?? ""
  return {
    name: item.name,
    upc: item.upc ?? "",
    reworkItemCode: item.reworkItemCode ?? "",
    price: item.price.toFixed(2),
    quantityPerBox: String(item.quantityPerBox),
    hasExpiration: item.hasExpiration !== false,
    defaultExpiration: String(item.defaultExpiration),
    defaultPackedExpiration: String(item.defaultPackedExpiration),
    vendorId: item.vendorId ?? "",
    vendorName: item.vendorName ?? "",
    departmentId: item.departmentId ?? "",
    department: item.department ?? "",
    categoryId: item.categoryId ?? "",
    storeDepartmentLocation: item.departmentLocation ?? "",
    tags: item.tags.join(", "),
    packaging,
    imageUrl: defaultImage,
    imageAssetId: ""
  }
}

export default function InventoryItemDetailPage({ params }: { params: { itemId: string } }) {
  const { user } = useAuthUser()
  const { activeOrgId, activeStoreId, activeStore, effectivePermissions } = useOrgContext()
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)

  const { data: item, refetch } = useQuery({
    queryKey: ["item", activeOrgId, activeStoreId, params.itemId],
    queryFn: () => fetchItem(activeOrgId, params.itemId, { storeId: activeStoreId || undefined }),
    enabled: Boolean(activeOrgId && params.itemId)
  })

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-for-item", activeOrgId],
    queryFn: () => fetchVendors(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const { data: storeSettings } = useQuery({
    queryKey: ["item-detail-store-settings", activeOrgId, activeStore?.id],
    queryFn: () => fetchStoreSettings(activeOrgId, activeStore!),
    enabled: Boolean(activeOrgId && activeStore)
  })

  useEffect(() => {
    if (!item) return
    setForm(formFromItem(item))
  }, [item])

  const quantities = useMemo(() => {
    if (!item) return { total: 0, back: 0, front: 0 }
    const total = Number(item.totalQuantity.toFixed(3))
    const back = Number(
      item.batches
        .filter((batch) => !batch.stockAreaRaw || batch.stockAreaRaw === "back_of_house")
        .reduce((sum, batch) => sum + batch.quantity, 0)
        .toFixed(3)
    )
    const front = Number(
      item.batches
        .filter((batch) => batch.stockAreaRaw === "front_of_house")
        .reduce((sum, batch) => sum + batch.quantity, 0)
        .toFixed(3)
    )
    return { total, back, front }
  }, [item])

  const departmentOptions = useMemo(() => storeSettings?.departmentConfigs ?? [], [storeSettings?.departmentConfigs])

  const categoryOptions = useMemo(() => {
    const departmentId = form?.departmentId ?? ""
    return (storeSettings?.categoryConfigs ?? []).filter(
      (category) =>
        category.enabled &&
        category.appliesTo.includes("inventory") &&
        (category.departmentIds.length === 0 || !departmentId || category.departmentIds.includes(departmentId))
    )
  }, [form?.departmentId, storeSettings?.categoryConfigs])

  const save = async () => {
    if (!activeOrgId || !form || !item) return
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const packagingMode = form.packaging
      const patch: Partial<ItemRecord> = {
        name: form.name.trim(),
        upc: form.upc.trim(),
        reworkItemCode:
          packagingMode === "rewrappable"
            ? (form.reworkItemCode.trim() || form.upc.trim() || undefined)
            : "",
        price: Math.max(0, Number(form.price || "0")),
        quantityPerBox: Math.max(1, Number(form.quantityPerBox || "1")),
        qtyPerCase: Math.max(1, Number(form.quantityPerBox || "1")),
        hasExpiration: form.hasExpiration,
        defaultExpiration: form.hasExpiration ? Math.max(1, Number(form.defaultExpiration || "1")) : 0,
        defaultExpirationDays: form.hasExpiration ? Math.max(1, Number(form.defaultExpiration || "1")) : 0,
        defaultPackedExpiration: form.hasExpiration ? Math.max(1, Number(form.defaultPackedExpiration || form.defaultExpiration || "1")) : 0,
        vendorId: form.vendorId.trim() || undefined,
        vendorName: form.vendorName.trim() || undefined,
        departmentId: form.departmentId.trim() || undefined,
        department:
          departmentOptions.find((department) => department.id === form.departmentId)?.name ??
          (form.department.trim() || undefined),
        categoryId: form.categoryId.trim() || undefined,
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        rewrapsWithUniqueBarcode: packagingMode === "rewrappable",
        isPrepackaged: packagingMode === "prepackaged"
      }
      const currentImage = item.pictures?.[0] ?? ""
      if (form.imageUrl !== currentImage) {
        patch.pictures = form.imageUrl ? [form.imageUrl] : []
      }
      await updateItem(activeOrgId, item.id, patch)
      if (activeStoreId) {
        await updateStoreItemOverride(activeOrgId, activeStoreId, item.id, {
          departmentLocation: form.storeDepartmentLocation,
          actorUid: user?.uid
        })
      }
      await refetch()
      setStatusMessage(activeStoreId ? "Organization and store inventory fields saved." : "Organization inventory fields saved.")
    } catch {
      setErrorMessage("Could not save item.")
    }
  }

  const uploadImage = async (file: File) => {
    if (!activeOrgId || !user?.uid || !form) return
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const uploaded = await uploadMediaAsset({
        file,
        orgId: activeOrgId,
        userId: user.uid,
        type: "image"
      })
      if (!uploaded?.downloadUrl) {
        setErrorMessage("Could not upload image.")
        return
      }
      setForm((prev) =>
        prev
          ? {
              ...prev,
              imageUrl: uploaded.downloadUrl ?? prev.imageUrl,
              imageAssetId: uploaded.id
            }
          : prev
      )
      setStatusMessage("Image uploaded. Save item to apply.")
    } catch {
      setErrorMessage("Image upload failed.")
    }
  }

  if (!item || !form) {
    return (
      <div>
        <PageHead title="Inventory Item" subtitle="Loading item..." />
        <AppCard>
          <p className="secondary-text">Loading metadata.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead
        title={item.name}
        subtitle="Organization inventory fields. Store quantity/location/min are read-only here."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {activeStoreId ? (
              <Link href={`/app/stores/${activeStoreId}/inventory?itemId=${item.id}`} className={appButtonClass("secondary")}>
                Open Store Inventory
              </Link>
            ) : null}
            <AppButton
              onClick={() => void save()}
              disabled={!effectivePermissions.editOrgInventoryMeta}
            >
              Save
            </AppButton>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <AppCard>
          <h2 className="card-title">Allowed Organization Edits</h2>
          <div className="mt-4 grid gap-3">
            <AppInput
              placeholder="Item name"
              value={form.name}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
              disabled={!effectivePermissions.editOrgInventoryMeta}
            />
            <AppInput
              placeholder="Barcode #"
              value={form.upc}
              onChange={(event) => setForm((prev) => (prev ? { ...prev, upc: event.target.value } : prev))}
              disabled={!effectivePermissions.editOrgInventoryMeta}
            />
            {form.packaging === "rewrappable" ? (
              <AppInput
                placeholder="Item code used by rewrap scanner"
                value={form.reworkItemCode}
                onChange={(event) =>
                  setForm((prev) => (prev ? { ...prev, reworkItemCode: event.target.value } : prev))
                }
                disabled={!effectivePermissions.editOrgInventoryMeta}
              />
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <AppInput
                type="number"
                step="0.01"
                placeholder="Price"
                value={form.price}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, price: event.target.value } : prev))}
                disabled={!effectivePermissions.editOrgInventoryMeta}
              />
              <AppInput
                type="number"
                step="1"
                min="1"
                placeholder="# per case"
                value={form.quantityPerBox}
                onChange={(event) =>
                  setForm((prev) => (prev ? { ...prev, quantityPerBox: event.target.value } : prev))
                }
                disabled={!effectivePermissions.editOrgInventoryMeta}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-app-border bg-app-surface px-3 py-2">
                <AppCheckbox
                  checked={form.hasExpiration}
                  onChange={(event) =>
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            hasExpiration: event.target.checked,
                            defaultExpiration: event.target.checked && prev.defaultExpiration === "0" ? "7" : prev.defaultExpiration,
                            defaultPackedExpiration:
                              event.target.checked && prev.defaultPackedExpiration === "0"
                                ? (prev.defaultExpiration === "0" ? "7" : prev.defaultExpiration)
                                : prev.defaultPackedExpiration
                          }
                        : prev
                    )
                  }
                  disabled={!effectivePermissions.editOrgInventoryMeta}
                  label="Item has an expiration"
                />
              </div>
              <AppInput
                type="number"
                step="1"
                min={form.hasExpiration ? "1" : "0"}
                placeholder="Default expiration"
                value={form.defaultExpiration}
                onChange={(event) =>
                  setForm((prev) => (prev ? { ...prev, defaultExpiration: event.target.value } : prev))
                }
                disabled={!effectivePermissions.editOrgInventoryMeta || !form.hasExpiration}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {form.packaging === "rewrappable" ? (
                <AppInput
                  type="number"
                  step="1"
                  min={form.hasExpiration ? "1" : "0"}
                  placeholder="Packaged expiration"
                  value={form.defaultPackedExpiration}
                  onChange={(event) =>
                    setForm((prev) =>
                      prev ? { ...prev, defaultPackedExpiration: event.target.value } : prev
                    )
                  }
                  disabled={!effectivePermissions.editOrgInventoryMeta || !form.hasExpiration}
                />
              ) : (
                <div className="rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-muted">
                  Packaged expiration shown for rewrappable items.
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <AppSelect
                value={form.vendorId}
                onChange={(event) =>
                  setForm((prev) => (prev ? { ...prev, vendorId: event.target.value } : prev))
                }
                disabled={!effectivePermissions.editOrgInventoryMeta}
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
                  setForm((prev) => (prev ? { ...prev, vendorName: event.target.value } : prev))
                }
                disabled={!effectivePermissions.editOrgInventoryMeta}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <AppSelect
                value={form.departmentId}
                onChange={(event) => {
                  const departmentId = event.target.value
                  const departmentName = departmentOptions.find((department) => department.id === departmentId)?.name ?? ""
                  setForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          departmentId,
                          department: departmentName,
                          categoryId: ""
                        }
                      : prev
                  )
                }}
                disabled={!effectivePermissions.editOrgInventoryMeta}
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
                onChange={(event) => setForm((prev) => (prev ? { ...prev, categoryId: event.target.value } : prev))}
                disabled={!effectivePermissions.editOrgInventoryMeta}
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
              onChange={(event) => setForm((prev) => (prev ? { ...prev, tags: event.target.value } : prev))}
              disabled={!effectivePermissions.editOrgInventoryMeta}
            />
            <AppSelect
              value={form.packaging}
              onChange={(event) =>
                setForm((prev) => (prev ? { ...prev, packaging: event.target.value as PackagingMode } : prev))
              }
              disabled={!effectivePermissions.editOrgInventoryMeta}
            >
              <option value="standard">Standard</option>
              <option value="prepackaged">Prepackaged</option>
              <option value="rewrappable">Rewrappable (unique barcode)</option>
            </AppSelect>
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
                disabled={!effectivePermissions.editOrgInventoryMeta}
              />
            </div>
            {form.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.imageUrl} alt={item.name} className="h-28 w-28 rounded-xl object-cover" />
            ) : null}
          </div>
        </AppCard>

        <AppCard>
          <h2 className="card-title">Store-Controlled Fields</h2>
          <div className="mt-4 grid gap-3">
            <div className="rounded-xl border border-app-border bg-app-surface px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-app-muted">Store</p>
              <p className="mt-1 text-sm font-semibold">
                {activeStore ? `${activeStore.title ?? activeStore.name}` : "No store selected"}
              </p>
            </div>
            <div className="rounded-xl border border-app-border bg-app-surface px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-app-muted">Quantity (read-only)</p>
              <p className="mt-1 text-sm font-semibold">
                Total {quantities.total.toFixed(3)} · Back {quantities.back.toFixed(3)} · Front {quantities.front.toFixed(3)}
              </p>
            </div>
            <AppInput
              className="text-app-muted"
              value={item.minimumQuantity.toFixed(3)}
              disabled
              placeholder="Min quantity (store controls)"
            />
            <AppInput
              value={form.storeDepartmentLocation}
              onChange={(event) =>
                setForm((prev) => (prev ? { ...prev, storeDepartmentLocation: event.target.value } : prev))
              }
              disabled={!activeStoreId || !effectivePermissions.editStoreInventory}
              placeholder="Location in store (store controls)"
            />
            <div className="rounded-2xl border border-app-border bg-app-surface p-4">
              <p className="text-sm font-semibold">Store-Level Editing</p>
              <p className="secondary-text mt-1 text-xs">
                You can edit this item location for the active store here. Organization updates still flow to all stores.
              </p>
            </div>
          </div>
        </AppCard>
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
