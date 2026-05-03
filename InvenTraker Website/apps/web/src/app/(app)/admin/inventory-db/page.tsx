"use client"

import { useState } from "react"
import { AppButton, AppCard, AppCheckbox, AppInput, DataTable, type TableColumn } from "@inventracker/ui"
import { useQuery } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  fetchItems,
  fetchCentralCatalogItems,
  removeCentralCatalogItem,
  uploadMediaAsset,
  upsertCentralCatalogItem,
  type CentralCatalogItemRecord
} from "@/lib/data/firestore"

export default function AdminInventoryDatabasePage() {
  const { user } = useAuthUser()
  const { canViewAdmin, activeOrgId, loading } = useOrgContext()
  const [editingId, setEditingId] = useState("")
  const [upc, setUpc] = useState("")
  const [name, setName] = useState("")
  const [photoUrl, setPhotoUrl] = useState("")
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("")
  const [photoAssetId, setPhotoAssetId] = useState("")
  const [photoFileName, setPhotoFileName] = useState("")
  const [hasExpiration, setHasExpiration] = useState(true)
  const [defaultExpirationDays, setDefaultExpirationDays] = useState("0")
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const resolveCatalogImageSrc = (row: CentralCatalogItemRecord): string | undefined => {
    if (row.photoUrl?.trim()) return row.photoUrl.trim()
    const raw = row.thumbnailBase64?.trim()
    if (!raw) return undefined
    return raw.startsWith("data:image/") ? raw : `data:image/jpeg;base64,${raw}`
  }

  const { data: items = [], refetch, error: catalogError } = useQuery({
    queryKey: ["admin-central-catalog"],
    queryFn: fetchCentralCatalogItems,
    enabled: canViewAdmin
  })
  const { data: orgItems = [] } = useQuery({
    queryKey: ["admin-central-source-org-items", activeOrgId],
    queryFn: () => fetchItems(activeOrgId),
    enabled: canViewAdmin && Boolean(activeOrgId)
  })

  const columns: TableColumn<CentralCatalogItemRecord>[] = [
    { key: "upc", header: "Barcode", render: (row) => row.upc },
    { key: "name", header: "Name", render: (row) => row.name },
    {
      key: "image",
      header: "Image",
      render: (row) =>
        resolveCatalogImageSrc(row) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolveCatalogImageSrc(row)} alt={row.name} className="h-10 w-10 rounded-lg object-cover" />
        ) : (
          "—"
        )
    },
    {
      key: "exp",
      header: "Expiration",
      render: (row) => row.hasExpiration === false ? "No expiration" : `${Number(row.defaultExpirationDays ?? 0)} days`
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex gap-2">
          <AppButton
            variant="secondary"
            className="!px-3 !py-1"
            onClick={() => {
              setEditingId(row.id)
              setUpc(row.upc)
              setName(row.name)
              setPhotoUrl(row.photoUrl ?? "")
              setPhotoPreviewUrl(resolveCatalogImageSrc(row) ?? "")
              setPhotoAssetId(row.photoAssetId ?? "")
              setPhotoFileName("")
              setHasExpiration(row.hasExpiration !== false)
              setDefaultExpirationDays(String(row.defaultExpirationDays ?? 0))
            }}
          >
            Edit
          </AppButton>
          <AppButton
            variant="secondary"
            className="!border-rose-400 !text-rose-300 !px-3 !py-1"
            onClick={() => {
              void (async () => {
                setStatusMessage(null)
                setErrorMessage(null)
                try {
                  await removeCentralCatalogItem(row.id)
                  await refetch()
                  setStatusMessage("Catalog item removed.")
                } catch {
                  setErrorMessage("Could not remove catalog item.")
                }
              })()
            }}
          >
            Remove
          </AppButton>
        </div>
      )
    }
  ]

  const save = async () => {
    if (!upc.trim() || !name.trim()) return
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      await upsertCentralCatalogItem({
        id: editingId || undefined,
        upc: upc.trim(),
        name: name.trim(),
        photoUrl: photoUrl.trim() || undefined,
        photoAssetId: photoAssetId.trim() || undefined,
        hasExpiration,
        defaultExpirationDays: hasExpiration ? Number(defaultExpirationDays || "0") : 0
      })
      await refetch()
      setEditingId("")
      setUpc("")
      setName("")
      setPhotoUrl("")
      setPhotoPreviewUrl("")
      setPhotoAssetId("")
      setPhotoFileName("")
      setHasExpiration(true)
      setDefaultExpirationDays("0")
      setStatusMessage("Catalog item saved.")
    } catch {
      setErrorMessage("Could not save catalog item.")
    }
  }

  const importFromCurrentOrganization = async () => {
    setStatusMessage(null)
    setErrorMessage(null)

    if (!activeOrgId) {
      setErrorMessage("Select an organization first.")
      return
    }
    if (orgItems.length === 0) {
      setErrorMessage("No organization items found to import.")
      return
    }

    try {
      const existingByUpc = new Map(
        items
          .filter((entry) => entry.upc?.trim().length > 0)
          .map((entry) => [entry.upc.trim(), entry.id])
      )
      let imported = 0
      let skippedNoBarcode = 0
      for (const item of orgItems) {
        const barcode = item.upc?.trim() ?? ""
        if (!barcode) {
          skippedNoBarcode += 1
          continue
        }
        await upsertCentralCatalogItem({
          id: existingByUpc.get(barcode),
          upc: barcode,
          name: item.name,
          hasExpiration: item.hasExpiration !== false,
          defaultExpirationDays: item.hasExpiration === false ? 0 : Number(item.defaultExpirationDays ?? 0)
        })
        imported += 1
      }
      await refetch()
      setStatusMessage(
        `Imported ${imported} items from ${activeOrgId}${skippedNoBarcode > 0 ? ` (${skippedNoBarcode} skipped: missing barcode)` : ""}.`
      )
    } catch {
      setErrorMessage("Could not import organization items into central catalog.")
    }
  }

  const uploadCatalogImage = async (file: File) => {
    if (!user?.uid || !activeOrgId) {
      setErrorMessage("Select an organization and sign in before uploading images.")
      return
    }
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
      setPhotoUrl(uploaded.downloadUrl)
      setPhotoPreviewUrl(uploaded.downloadUrl)
      setPhotoAssetId(uploaded.id)
      setPhotoFileName(file.name)
      setStatusMessage("Image uploaded. Save the item to apply it.")
    } catch (error) {
      const message = String((error as { message?: string } | undefined)?.message ?? "")
      if (message.toLowerCase().includes("storage bucket")) {
        setErrorMessage("Storage is not initialized in Firebase yet. Open Firebase Console > Storage > Get started.")
      } else {
        setErrorMessage("Could not upload image.")
      }
    }
  }

  if (loading) {
    return (
      <div>
        <PageHead title="Inventory Database" subtitle="Loading access..." />
        <AppCard>
          <p className="secondary-text">Checking admin permissions.</p>
        </AppCard>
      </div>
    )
  }

  if (!canViewAdmin) {
    return (
      <div>
        <PageHead title="Inventory Database" subtitle="Platform Admin only." />
        <AppCard>
          <p className="secondary-text">Access denied.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead title="Inventory Database" subtitle="Central inventory catalog for all organizations." />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.9fr]">
        <AppCard>
          <h2 className="card-title">{editingId ? "Edit Item" : "Add Item"}</h2>
          <div className="mt-4 grid gap-3">
            <AppInput
              placeholder="Barcode (UPC)"
              value={upc}
              onChange={(event) => setUpc(event.target.value)}
            />
            <AppInput
              placeholder="Item name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <AppInput
              placeholder="Image URL (auto-filled)"
              value={photoUrl}
              readOnly
            />
            {photoPreviewUrl || photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreviewUrl || photoUrl} alt={name || "Catalog image preview"} className="h-28 w-28 rounded-xl object-cover" />
            ) : null}
            <div className="rounded-xl border border-dashed border-app-border px-3 py-2 text-sm text-app-muted">
              Upload item image
              <AppInput
                className="mt-2 h-auto text-xs"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  void uploadCatalogImage(file)
                }}
              />
            </div>
            {photoFileName ? <p className="text-xs text-app-muted">Uploaded: {photoFileName}</p> : null}
            {photoAssetId ? <p className="text-xs text-app-muted">Asset ID: {photoAssetId}</p> : null}
            <AppCheckbox
              checked={hasExpiration}
              onChange={(event) => {
                setHasExpiration(event.target.checked)
                if (event.target.checked && defaultExpirationDays === "0") {
                  setDefaultExpirationDays("7")
                }
              }}
              label="Item has an expiration"
            />
            <AppInput
              type="number"
              placeholder="Default expiration days"
              value={defaultExpirationDays}
              onChange={(event) => setDefaultExpirationDays(event.target.value)}
              disabled={!hasExpiration}
            />
            <div className="flex flex-wrap gap-2">
              <AppButton onClick={() => void save()}>
                Save
              </AppButton>
              {editingId ? (
                <AppButton
                  variant="secondary"
                  onClick={() => {
                    setEditingId("")
                    setUpc("")
                    setName("")
                    setPhotoUrl("")
                    setPhotoPreviewUrl("")
                    setPhotoAssetId("")
                    setPhotoFileName("")
                    setHasExpiration(true)
                    setDefaultExpirationDays("0")
                  }}
                >
                  Cancel edit
                </AppButton>
              ) : null}
            </div>
          </div>
        </AppCard>
        <AppCard>
          <DataTable columns={columns} rows={items} empty="No central catalog items yet." />
          {items.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-app-border p-4">
              <p className="text-sm text-app-muted">
                Central catalog is currently empty. You can bootstrap it from your current organization inventory.
              </p>
              <AppButton variant="secondary" className="mt-3" onClick={() => void importFromCurrentOrganization()}>
                Import from Current Organization
              </AppButton>
            </div>
          ) : null}
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
      {catalogError ? (
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Could not read one or more central catalog paths. Rules were updated to include
          {" "}
          <code>centralCatalog/global/items</code>; refresh after rules deploy.
        </div>
      ) : null}
    </div>
  )
}
