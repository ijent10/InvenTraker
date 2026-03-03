"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { AppCard, DataTable, SearchInput, SegmentedControl, type TableColumn } from "@inventracker/ui"
import { useQuery } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchItems, fetchStoreInventoryItems, type ItemRecord } from "@/lib/data/firestore"

export default function InventoryPage() {
  const { activeOrgId, activeStoreId, activeOrg, activeStore, role, effectivePermissions } = useOrgContext()
  const [search, setSearch] = useState("")
  const [mode, setMode] = useState<"cards" | "table">("cards")
  const [scope, setScope] = useState<"store" | "organization">("store")
  const canViewOrgInventory = effectivePermissions.viewOrganizationInventory === true

  useEffect(() => {
    if (!canViewOrgInventory && scope !== "store") {
      setScope("store")
    }
  }, [canViewOrgInventory, scope])

  useEffect(() => {
    // Store switching should always reflect store-scoped inventory immediately.
    if (scope !== "store") {
      setScope("store")
    }
  }, [activeStoreId]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: items = [] } = useQuery({
    queryKey: ["items", activeOrgId, activeStoreId, scope],
    queryFn: () => {
      if (scope === "organization" && canViewOrgInventory) {
        return fetchItems(activeOrgId)
      }
      if (!activeStoreId) return Promise.resolve([])
      return fetchStoreInventoryItems(activeOrgId, activeStoreId)
    },
    enabled: Boolean(activeOrgId && (scope === "organization" || activeStoreId))
  })

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const departmentScoped =
          role === "Owner" ||
          !activeOrg?.departmentIds?.length ||
          (item.departmentId ? activeOrg.departmentIds.includes(item.departmentId) : false)
        if (!departmentScoped) return false

        const q = search.toLowerCase()
        return (
          item.name.toLowerCase().includes(q) ||
          (item.upc ?? "").toLowerCase().includes(q) ||
          item.tags.some((tag) => tag.toLowerCase().includes(q))
        )
      }),
    [activeOrg?.departmentIds, items, role, search]
  )

  const columns: TableColumn<ItemRecord>[] = [
    {
      key: "name",
      header: "Item",
      render: (item) => (
        <Link href={`/app/inventory/${item.id}`} className="font-semibold text-blue-400">
          {item.name}
        </Link>
      )
    },
    { key: "upc", header: "Barcode", render: (item) => item.upc ?? "—" },
    { key: "unit", header: "Unit", render: (item) => item.unit },
    { key: "qty", header: "Quantity", render: (item) => item.totalQuantity.toFixed(3) },
    { key: "min", header: "Min Qty", render: (item) => item.minimumQuantity.toFixed(3) },
    { key: "price", header: "Price", render: (item) => `$${item.price.toFixed(2)}` }
  ]

  return (
    <div>
      <PageHead
        title="Inventory"
        subtitle={
          scope === "organization"
            ? "Organization-level inventory metadata across stores."
            : `Store inventory for ${activeStore ? (activeStore.title ?? activeStore.name) : "your assigned store"}.`
        }
      />

      <AppCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, tag, or barcode" />
          <div className="flex items-center gap-2">
            {canViewOrgInventory ? (
              <SegmentedControl
                options={[
                  { label: "Store", value: "store" },
                  { label: "Organization", value: "organization" }
                ]}
                value={scope}
                onChange={(value) => setScope(value as "store" | "organization")}
              />
            ) : null}
            <SegmentedControl
              options={[
                { label: "Cards", value: "cards" },
                { label: "Table", value: "table" }
              ]}
              value={mode}
              onChange={setMode}
            />
          </div>
        </div>

        <div className="mt-4">
          {scope === "store" && !activeStoreId ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              No store is assigned yet. Ask a manager to grant store access.
            </div>
          ) : null}
          {mode === "table" ? (
            <DataTable columns={columns} rows={filtered} empty="No inventory items." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item) => (
                <Link key={item.id} href={`/app/inventory/${item.id}`}>
                  <div className="rounded-2xl border border-app-border bg-app-surface-soft p-4">
                    <p className="font-semibold">{item.name}</p>
                    <p className="secondary-text mt-1">Barcode: {item.upc ?? "—"}</p>
                    <p className="secondary-text">
                      Qty {item.totalQuantity.toFixed(3)} · Min {item.minimumQuantity.toFixed(3)} {item.unit}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </AppCard>
    </div>
  )
}
