"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AppButton, AppCard, DataTable, type TableColumn } from "@inventracker/ui"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchAdminOrganizationDetailDirect, updateItem } from "@/lib/data/firestore"
import { adminGetOrganizationDetail, adminSafeEdit } from "@/lib/firebase/functions"

type AdminItemRow = {
  id: string
  name?: string
  upc?: string
  price?: number
  hasExpiration?: boolean
  defaultExpirationDays?: number
  archived?: boolean
  departmentId?: string
  locationId?: string
}

export default function AdminStoreInventoryPage({ params }: { params: { orgId: string; storeId: string } }) {
  const { canViewAdmin, loading } = useOrgContext()
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data, refetch } = useQuery({
    queryKey: ["admin-store-inventory", params.orgId],
    queryFn: async () => {
      try {
        return await adminGetOrganizationDetail({ orgId: params.orgId })
      } catch {
        return await fetchAdminOrganizationDetailDirect(params.orgId)
      }
    },
    enabled: canViewAdmin
  })

  const items = ((data?.items as AdminItemRow[] | undefined) ?? []).slice()

  const patchItem = async (item: AdminItemRow, patch: Record<string, unknown>) => {
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      await adminSafeEdit({
        orgId: params.orgId,
        storeId: params.storeId,
        targetType: "item",
        targetId: item.id,
        patch
      })
      await refetch()
      setStatusMessage("Inventory item updated.")
    } catch {
      try {
        await updateItem(params.orgId, item.id, patch)
        await refetch()
        setStatusMessage("Inventory item updated.")
      } catch {
        setErrorMessage("Could not update item.")
      }
    }
  }

  const columns: TableColumn<AdminItemRow>[] = [
    { key: "name", header: "Item", render: (row) => row.name ?? row.id },
    { key: "upc", header: "Barcode", render: (row) => row.upc ?? "—" },
    { key: "price", header: "Price", render: (row) => `$${Number(row.price ?? 0).toFixed(2)}` },
    {
      key: "exp",
      header: "Default Exp",
      render: (row) => row.hasExpiration === false ? "No expiration" : `${Number(row.defaultExpirationDays ?? 0)} days`
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          <AppButton
            variant="secondary"
            className="!px-3 !py-1"
            onClick={() => {
              const nextUpc = window.prompt("Barcode", row.upc ?? "")
              if (nextUpc == null) return
              void patchItem(row, { upc: nextUpc })
            }}
          >
            Edit Barcode
          </AppButton>
          <AppButton
            variant="secondary"
            className="!px-3 !py-1"
            onClick={() => {
              const nextPrice = window.prompt("Price", String(row.price ?? 0))
              if (nextPrice == null) return
              void patchItem(row, { price: Number(nextPrice || "0") })
            }}
          >
            Edit Price
          </AppButton>
          <AppButton
            variant="secondary"
            className="!px-3 !py-1"
            onClick={() => void patchItem(row, { archived: !(row.archived ?? false) })}
          >
            {row.archived ? "Unarchive" : "Archive"}
          </AppButton>
        </div>
      )
    }
  ]

  if (loading) {
    return (
      <div>
        <PageHead title="Store Inventory" subtitle="Loading access..." />
        <AppCard>
          <p className="secondary-text">Checking admin permissions.</p>
        </AppCard>
      </div>
    )
  }

  if (!canViewAdmin) {
    return (
      <div>
        <PageHead title="Store Inventory" subtitle="Platform Admin only." />
        <AppCard>
          <p className="secondary-text">Access denied.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead title="Store Inventory" subtitle="Adjust inventory metadata safely for this store context." />
      <AppCard>
        <DataTable columns={columns} rows={items} empty="No inventory records found." />
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
