import { DataTable } from "@/components/data-table"
import { InventoryForm } from "@/components/inventory-form"
import { PageHeader } from "@/components/page-header"
import { Button, Panel, StatusPill } from "@/components/ui"
import { inventoryItems } from "@/lib/demo-data"

export default function InventoryPage() {
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Store-level stock counts with location, par, vendor, and reorder signals."
        actions={
          <>
            <Button variant="secondary">Import</Button>
            <Button>Add item</Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel>
          <DataTable
            columns={["Item", "Department", "Location", "Stock", "Reorder", "Vendor", "Updated"]}
            rows={inventoryItems.map((item) => [
              <div key={`${item.id}-name`}>
                <p className="font-semibold text-white">{item.name}</p>
                <p className="mt-1 text-xs text-slate-500">{item.sku}</p>
              </div>,
              item.department,
              item.location,
              `${item.onHand} ${item.unit}`,
              item.onHand <= item.reorderPoint ? <StatusPill key={item.id} tone="amber">Low</StatusPill> : "Healthy",
              item.vendor,
              item.updatedAt
            ])}
          />
        </Panel>
        <InventoryForm />
      </div>
    </>
  )
}
