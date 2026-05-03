"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { AppButton, AppCard, AppCheckbox, AppInput, AppSelect, SearchInput } from "@inventracker/ui"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  fetchStores,
  fetchStoreInventoryItems,
  fetchVendors,
  uploadMediaAsset,
  upsertStoreInventoryItem,
  type StoreInventoryItemRecord
} from "@/lib/data/firestore"

type PackagingMode = "standard" | "prepackaged" | "rewrappable"

type StoreItemForm = {
  name: string
  upc: string
  price: string
  quantityPerBox: string
  hasExpiration: boolean
  defaultExpiration: string
  defaultPackedExpiration: string
  vendorId: string
  vendorName: string
  tags: string
  packaging: PackagingMode
  imageUrl: string
  storeMinimumQuantity: string
  storeDepartmentLocation: string
  quantityOnHand: string
}

function formFromStoreItem(item: StoreInventoryItemRecord): StoreItemForm {
  return {
    name: item.name,
    upc: item.upc ?? "",
    price: item.price.toFixed(2),
    quantityPerBox: String(item.quantityPerBox),
    hasExpiration: item.hasExpiration !== false,
    defaultExpiration: String(item.defaultExpiration),
    defaultPackedExpiration: String(item.defaultPackedExpiration),
    vendorId: item.vendorId ?? "",
    vendorName: item.vendorName ?? "",
    tags: item.tags.join(", "),
    packaging: item.rewrapsWithUniqueBarcode ? "rewrappable" : item.isPrepackaged ? "prepackaged" : "standard",
    imageUrl: item.pictures?.[0] ?? "",
    storeMinimumQuantity: item.storeMinimumQuantity.toFixed(3),
    storeDepartmentLocation: item.storeDepartmentLocation ?? "",
    quantityOnHand: item.totalQuantity.toFixed(3)
  }
}

export default function StoreInventoryPage({ params }: { params: { storeId: string } }) {
  const { user } = useAuthUser()
  const searchParams = useSearchParams()
  const focusItemId = searchParams.get("itemId") ?? ""
  const { activeOrgId, effectivePermissions } = useOrgContext()
  const [search, setSearch] = useState("")
  const [selectedItemId, setSelectedItemId] = useState<string>("")
  const [form, setForm] = useState<StoreItemForm | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: stores = [] } = useQuery({
    queryKey: ["store-list-for-store-inventory", activeOrgId],
    queryFn: () => fetchStores(activeOrgId),
    enabled: Boolean(activeOrgId)
  })
  const store = useMemo(() => stores.find((entry) => entry.id === params.storeId) ?? null, [params.storeId, stores])

  const { data: items = [], refetch } = useQuery({
    queryKey: ["store-inventory-items", activeOrgId, params.storeId],
    queryFn: () => fetchStoreInventoryItems(activeOrgId, params.storeId),
    enabled: Boolean(activeOrgId && params.storeId)
  })

  const { data: vendors = [] } = useQuery({
    queryKey: ["store-inventory-vendors", activeOrgId],
    queryFn: () => fetchVendors(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  useEffect(() => {
    if (!items.length) return
    const initialId = focusItemId && items.some((entry) => entry.id === focusItemId) ? focusItemId : items[0]?.id
    if (!initialId) return
    setSelectedItemId((current) => current || initialId)
  }, [focusItemId, items])

  const selectedItem = useMemo(
    () => items.find((entry) => entry.id === selectedItemId) ?? null,
    [items, selectedItemId]
  )

  useEffect(() => {
    if (!selectedItem) return
    setForm(formFromStoreItem(selectedItem))
  }, [selectedItem])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return items
    return items.filter((item) => {
      const haystack = `${item.name} ${item.upc ?? ""} ${item.tags.join(" ")}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [items, search])

  const save = async () => {
    if (!activeOrgId || !selectedItem || !form) return
    setStatusMessage(null)
    setErrorMessage(null)

    try {
      const quantity = Math.max(0, Number(form.quantityOnHand || "0"))
      const expirationDays = form.hasExpiration ? Math.max(1, Number(form.defaultExpiration || "1")) : 0
      const expirationDate = form.hasExpiration ? new Date() : null
      if (expirationDate) {
        expirationDate.setDate(expirationDate.getDate() + expirationDays)
      }
      await upsertStoreInventoryItem(activeOrgId, params.storeId, selectedItem.id, {
        name: form.name.trim(),
        upc: form.upc.trim(),
        price: Math.max(0, Number(form.price || "0")),
        quantityPerBox: Math.max(1, Number(form.quantityPerBox || "1")),
        qtyPerCase: Math.max(1, Number(form.quantityPerBox || "1")),
        hasExpiration: form.hasExpiration,
        defaultExpiration: expirationDays,
        defaultExpirationDays: expirationDays,
        defaultPackedExpiration: form.hasExpiration ? Math.max(1, Number(form.defaultPackedExpiration || form.defaultExpiration || "1")) : 0,
        vendorId: form.vendorId.trim() || undefined,
        vendorName: form.vendorName.trim() || undefined,
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        rewrapsWithUniqueBarcode: form.packaging === "rewrappable",
        isPrepackaged: form.packaging === "prepackaged",
        pictures: form.imageUrl ? [form.imageUrl] : [],
        totalQuantity: quantity,
        batches: [
          {
            id: `web_${Date.now()}`,
            quantity,
            expirationDate,
            stockAreaRaw: "back_of_house",
            storeId: params.storeId
          }
        ],
        storeMinimumQuantity: Math.max(0, Number(form.storeMinimumQuantity || "0")),
        storeDepartmentLocation: form.storeDepartmentLocation.trim(),
        actorUid: user?.uid
      })
      await refetch()
      setStatusMessage("Store inventory updated.")
    } catch {
      setErrorMessage("Could not save store inventory fields.")
    }
  }

  const uploadImage = async (file: File) => {
    if (!activeOrgId || !user?.uid) return
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const uploaded = await uploadMediaAsset({
        file,
        orgId: activeOrgId,
        storeId: params.storeId,
        userId: user.uid,
        type: "image"
      })
      if (!uploaded?.downloadUrl) {
        setErrorMessage("Could not upload image.")
        return
      }
      setForm((prev) => (prev ? { ...prev, imageUrl: uploaded.downloadUrl ?? prev.imageUrl } : prev))
      setStatusMessage("Image uploaded. Save to apply.")
    } catch {
      setErrorMessage("Image upload failed.")
    }
  }

  return (
    <div>
      <PageHead
        title={`Store Inventory${store ? ` · ${store.title ?? store.name}` : ""}`}
        subtitle="Store-level editable inventory fields (mobile parity): min quantity, location, quantity, and metadata."
        actions={
          <AppButton
            onClick={() => void save()}
            disabled={!effectivePermissions.editStoreInventory}
          >
            Save Store Inventory
          </AppButton>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_1.8fr]">
        <AppCard>
          <SearchInput value={search} onChange={setSearch} placeholder="Search item, barcode, tags" />
          <div className="mt-4 space-y-2">
            {filtered.map((item) => (
              <AppButton
                key={item.id}
                variant="secondary"
                className={`!h-auto !w-full !justify-start !rounded-xl !px-3 !py-2 !text-left ${
                  selectedItemId === item.id
                    ? "!border-[color:var(--accent)] !bg-app-surface-soft"
                    : "!border-[color:var(--app-border)] !bg-[color:var(--app-surface)]"
                }`}
                onClick={() => setSelectedItemId(item.id)}
              >
                <div>
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="secondary-text">Qty {item.totalQuantity.toFixed(3)} · Min {item.storeMinimumQuantity.toFixed(3)}</p>
                </div>
              </AppButton>
            ))}
          </div>
        </AppCard>

        <AppCard>
          {selectedItem && form ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <AppInput
                  value={form.name}
                  onChange={(event) => setForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                  placeholder="Item name"
                />
                <AppInput
                  value={form.upc}
                  onChange={(event) => setForm((prev) => (prev ? { ...prev, upc: event.target.value } : prev))}
                  placeholder="Barcode #"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <AppInput
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(event) => setForm((prev) => (prev ? { ...prev, price: event.target.value } : prev))}
                  placeholder="Price"
                />
                <AppInput
                  type="number"
                  step="1"
                  min="1"
                  value={form.quantityPerBox}
                  onChange={(event) =>
                    setForm((prev) => (prev ? { ...prev, quantityPerBox: event.target.value } : prev))
                  }
                  placeholder="# per case"
                />
                <AppInput
                  type="number"
                  step="0.001"
                  value={form.quantityOnHand}
                  onChange={(event) =>
                    setForm((prev) => (prev ? { ...prev, quantityOnHand: event.target.value } : prev))
                  }
                  placeholder="Quantity"
                  disabled={!effectivePermissions.adjustStoreQuantity}
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
                    label="Item has an expiration"
                  />
                </div>
                <AppInput
                  type="number"
                  min={form.hasExpiration ? "1" : "0"}
                  value={form.defaultExpiration}
                  onChange={(event) =>
                    setForm((prev) => (prev ? { ...prev, defaultExpiration: event.target.value } : prev))
                  }
                  placeholder="Default expiration"
                  disabled={!form.hasExpiration}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <AppInput
                  type="number"
                  min={form.hasExpiration ? "1" : "0"}
                  value={form.defaultPackedExpiration}
                  onChange={(event) =>
                    setForm((prev) =>
                      prev ? { ...prev, defaultPackedExpiration: event.target.value } : prev
                    )
                  }
                  placeholder="Packaged expiration"
                  disabled={!form.hasExpiration}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <AppSelect
                  value={form.vendorId}
                  onChange={(event) =>
                    setForm((prev) => (prev ? { ...prev, vendorId: event.target.value } : prev))
                  }
                >
                  <option value="">Select vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </AppSelect>
                <AppInput
                  value={form.vendorName}
                  onChange={(event) => setForm((prev) => (prev ? { ...prev, vendorName: event.target.value } : prev))}
                  placeholder="Vendor name override"
                />
              </div>
              <AppInput
                value={form.tags}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, tags: event.target.value } : prev))}
                placeholder="Tags (comma separated)"
              />
              <AppSelect
                value={form.packaging}
                onChange={(event) =>
                  setForm((prev) => (prev ? { ...prev, packaging: event.target.value as PackagingMode } : prev))
                }
              >
                <option value="standard">Standard</option>
                <option value="prepackaged">Prepackaged</option>
                <option value="rewrappable">Rewrappable</option>
              </AppSelect>
              <div className="grid grid-cols-2 gap-3">
                <AppInput
                  type="number"
                  step="0.001"
                  value={form.storeMinimumQuantity}
                  onChange={(event) =>
                    setForm((prev) => (prev ? { ...prev, storeMinimumQuantity: event.target.value } : prev))
                  }
                  placeholder="Store min quantity"
                />
                <AppInput
                  value={form.storeDepartmentLocation}
                  onChange={(event) =>
                    setForm((prev) =>
                      prev ? { ...prev, storeDepartmentLocation: event.target.value } : prev
                    )
                  }
                  placeholder="Location in store"
                />
              </div>

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
                />
              </div>
              {form.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.imageUrl} alt={form.name} className="h-28 w-28 rounded-xl object-cover" />
              ) : null}
            </div>
          ) : (
            <p className="secondary-text">Select an item to edit store inventory fields.</p>
          )}
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
