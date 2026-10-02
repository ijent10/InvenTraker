import { notFound } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"

import { InventoryForm } from "@/components/inventory-form"
import { PageHeader } from "@/components/page-header"
import { PermissionGate } from "@/components/permission-gate"
import { ButtonLink, Panel, StatusPill } from "@/components/ui"
import { summarizeBatchAvailability } from "@/lib/batch-allocation"
import { getInventoryBatches, getInventoryItems, getOrderDrafts, getStores } from "@/lib/server-data"

export default async function EditInventoryItemPage({
  params,
  searchParams
}: {
  params: { itemId: string }
  searchParams?: { edit?: string }
}) {
  const [inventoryItems, stores, batches, orders] = await Promise.all([getInventoryItems(), getStores(), getInventoryBatches(), getOrderDrafts()])
  const item = inventoryItems.find((candidate) => candidate.id === params.itemId)
  const editing = searchParams?.edit === "1"
  const itemBatches = batches
    .filter((batch) => batch.itemId === params.itemId && batch.storeId === item?.storeId && batch.remainingQuantity > 0)
    .sort((left, right) => {
      if (!left.expirationDate) return 1
      if (!right.expirationDate) return -1
      return left.expirationDate.localeCompare(right.expirationDate)
    })
  const now = new Date().toISOString()
  const nextDelivery = orders
    .filter((order) => ["Submitted", "Auto-submitted", "Partially received"].includes(order.status))
    .filter((order) => order.lines.some((line) => line.sku === item?.sku || line.itemName === item?.name))
    .map((order) => order.expectedArrival)
    .filter((date) => date && !Number.isNaN(Date.parse(date)))
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null
  const availability = summarizeBatchAvailability(itemBatches, now, nextDelivery)

  if (!item) {
    notFound()
  }

  return (
    <>
      <PageHeader
        title={editing ? `Edit ${item.name}` : item.name}
        description="View stock levels, location, par values, vendor details, expiration behavior, and catalog handling."
        actions={
          <>
            <ButtonLink href="/inventory" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
              Back to inventory
            </ButtonLink>
            {!editing ? (
              <PermissionGate permission="inventory.edit">
                <ButtonLink href={`/inventory/${item.id}?edit=1`} icon={<Pencil className="h-4 w-4" />}>
                  Edit item
                </ButtonLink>
              </PermissionGate>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        {editing ? (
          <PermissionGate
            permission="inventory.edit"
            fallback={
              <Panel className="p-4">
                <h2 className="font-semibold text-[var(--app-text)]">Edit access required</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">You can view this item, but your member record does not include inventory.edit.</p>
              </Panel>
            }
          >
            <InventoryForm item={item} stores={stores} mode="edit" />
          </PermissionGate>
        ) : (
          <Panel className="p-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[
                ["SKU", item.sku],
                ["Department", item.department],
                ["Category", item.category],
                ["Location", item.location],
                ["Vendor", item.vendor],
                ["Unit", item.unit],
                ["Par", item.par.toLocaleString()],
                ["Reorder point", item.reorderPoint.toLocaleString()],
                ["Price", typeof item.price === "number" ? `$${item.price.toFixed(2)}` : "Not set"],
                ["Case quantity", typeof item.quantityInCase === "number" ? item.quantityInCase.toLocaleString() : "Not set"]
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
                  <p className="text-xs font-semibold uppercase text-[var(--app-subtle)]">{label}</p>
                  <p className="mt-2 font-semibold text-[var(--app-text)]">{value}</p>
                </div>
              ))}
            </div>
          </Panel>
        )}

        <Panel className="p-4">
          <h2 className="font-semibold text-white">Item summary</h2>
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <p className="text-slate-500">Current stock</p>
              <p className="mt-1 text-2xl font-semibold text-white">{item.onHand} {item.unit}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
                <p className="text-slate-500">Front</p>
                <p className="mt-1 font-semibold text-white">{item.frontStock}</p>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
                <p className="text-slate-500">Back</p>
                <p className="mt-1 font-semibold text-white">{item.backStock}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill tone={item.status === "Low" ? "amber" : "green"}>{item.status}</StatusPill>
              {item.expires ? <StatusPill tone="blue">Expiration tracked</StatusPill> : <StatusPill>Does not expire</StatusPill>}
            </div>
            <div className="border-t border-slate-800 pt-4">
              <p className="text-slate-500">Last updated</p>
              <p className="mt-1 text-slate-200">{item.updatedAt}</p>
            </div>
          </div>
        </Panel>
      </div>

      {!editing && item.expires ? (
        <Panel className="mt-6 p-4">
          <h2 className="font-semibold text-[var(--app-text)]">Expiration batches</h2>
          <p className="app-tip mt-1 text-sm text-[var(--app-muted)]">Use the earliest dated stock first. Expired stock remains in the physical total but is excluded from usable dated stock. Quantities without a recorded date remain explicitly unknown.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Total physical", availability.totalPhysical],
              ["Usable dated", availability.usableDated],
              ["Expired", availability.expired],
              ["Unknown date", availability.unknownExpiration],
              [nextDelivery ? `Expires by ${new Date(nextDelivery).toLocaleDateString("en-US")}` : "Before next delivery", nextDelivery ? availability.expiringBeforeDelivery : "Unknown"]
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
                <p className="text-xs font-semibold uppercase text-[var(--app-subtle)]">{label}</p>
                <p className="mt-1 text-xl font-semibold text-[var(--app-text)]">{value} {item.unit}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {itemBatches.length ? itemBatches.map((batch) => (
              <div key={batch.id} className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-[var(--app-text)]">{batch.remainingQuantity} {batch.unit}</p>
                  <StatusPill tone={batch.expirationKnown ? "blue" : "amber"}>{batch.area === "front" ? "Sales floor" : "Backstock"}</StatusPill>
                </div>
                <p className="mt-2 text-sm text-[var(--app-muted)]">
                  {batch.expirationDate
                    ? `${batch.expirationDate.slice(0, 10) < now.slice(0, 10) ? "Expired" : "Expires"} ${new Date(batch.expirationDate).toLocaleDateString("en-US")}`
                    : "Expiration unknown"}
                </p>
              </div>
            )) : (
              <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                Current stock predates batch tracking, so its expiration detail is unknown.
              </div>
            )}
          </div>
        </Panel>
      ) : null}
    </>
  )
}
