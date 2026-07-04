import { FileUp, Plus, Pencil, ShieldCheck } from "lucide-react"

import { DataTable } from "@/components/data-table"
import { InventoryImportDifferencePanel } from "@/components/inventory-import-workbench"
import { PageHeader } from "@/components/page-header"
import { ButtonLink, Panel, StatusPill } from "@/components/ui"
import { demoPendingAutofillBatches } from "@/lib/ai/pending-verification"
import type { InventoryItem, Product } from "@/lib/demo-data"
import { getInventoryItems, getProducts } from "@/lib/server-data"

function matchKey(value?: string) {
  return (value ?? "").trim().toLowerCase()
}

function productLookupKeys(product: Product) {
  return [matchKey(product.sku), matchKey(product.name)].filter(Boolean)
}

function inventoryLookupKeys(item: InventoryItem) {
  return [matchKey(item.sku), matchKey(item.name)].filter(Boolean)
}

type InventoryCatalogRow = {
  id: string
  item?: InventoryItem
  product?: Product
}

export default async function InventoryPage() {
  const [inventoryItems, products] = await Promise.all([getInventoryItems(), getProducts()])
  const productsByKey = new Map<string, Product>()

  products.forEach((product) => {
    productLookupKeys(product).forEach((key) => productsByKey.set(key, product))
  })

  const stockedProductIds = new Set<string>()
  const rows: InventoryCatalogRow[] = inventoryItems.map((item) => {
    const product = inventoryLookupKeys(item).map((key) => productsByKey.get(key)).find(Boolean)
    if (product) stockedProductIds.add(product.id)
    return { id: item.id, item, product }
  })

  products
    .filter((product) => !stockedProductIds.has(product.id))
    .forEach((product) => rows.push({ id: `catalog-${product.id}`, product }))

  return (
    <>
      <PageHeader
        title="Inventory"
        description="One place for store stock, central product details, nutrition, display assignment, vendor, and reorder signals."
        actions={
          <>
            <ButtonLink href="/pending-review" variant="secondary" icon={<ShieldCheck className="h-4 w-4" />}>
              Pending Review ({demoPendingAutofillBatches.length})
            </ButtonLink>
            <ButtonLink href="/inventory/import" variant="secondary" icon={<FileUp className="h-4 w-4" />}>
              Import file
            </ButtonLink>
            <ButtonLink href="/inventory/new" icon={<Plus className="h-4 w-4" />}>
              Add stock item
            </ButtonLink>
          </>
        }
      />

      <div className="mb-6">
        <InventoryImportDifferencePanel />
      </div>

      <Panel>
        <DataTable
          columns={["Item", "Stock", "Catalog", "Location & display", "Vendor / cost", "Nutrition", "Expiration", "Updated", ""]}
          rows={rows.map(({ id, item, product }) => {
            const name = item?.name ?? product?.name ?? "Unnamed item"
            const sku = item?.sku ?? product?.sku ?? "No SKU"
            const unit = item?.unit ?? product?.defaultUnit ?? "eaches"
            const expires = item?.expires ?? product?.expires ?? false
            const editHref = item ? `/inventory/${item.id}` : product ? `/products/${product.id}` : "/inventory"

            return [
            <div key={`${id}-name`}>
              <ButtonLink href={editHref} variant="ghost" className="min-h-0 justify-start px-0 py-0 text-left font-semibold text-[var(--app-text)]">
                {name}
              </ButtonLink>
              <p className="mt-1 text-xs text-[var(--app-subtle)]">{sku}</p>
              {!item ? (
                <StatusPill tone="blue">Catalog only</StatusPill>
              ) : product ? (
                <p className="mt-2 text-xs text-[var(--app-muted)]">Linked to catalog product</p>
              ) : (
                <p className="mt-2 text-xs text-[var(--app-muted)]">Stock item only</p>
              )}
            </div>,
            item ? (
              <div key={`${id}-stock`}>
                <p className="font-semibold text-[var(--app-text)]">
                  {item.onHand} {unit}
                </p>
                <p className="mt-1 text-xs text-[var(--app-muted)]">
                  Front {item.frontStock} · Back {item.backStock}
                </p>
                {item.onHand <= item.reorderPoint ? (
                  <span className="mt-2 inline-flex">
                    <StatusPill tone="amber">Low</StatusPill>
                  </span>
                ) : (
                  <span className="mt-2 inline-flex">
                    <StatusPill tone="green">Healthy</StatusPill>
                  </span>
                )}
              </div>
            ) : (
              <StatusPill key={`${id}-stock-status`}>Not stocked yet</StatusPill>
            ),
            <div key={`${id}-catalog`}>
              <p>{item?.department ?? product?.department ?? "No department"}</p>
              <p className="mt-1 text-xs text-[var(--app-subtle)]">{item?.category ?? product?.category ?? "No category"}</p>
              <p className="mt-1 text-xs text-[var(--app-muted)]">Default unit: {product?.defaultUnit ?? unit}</p>
            </div>,
            <div key={`${id}-location`}>
              <p>{item?.location ?? product?.location ?? "No location"}</p>
              <p className="mt-1 text-xs text-[var(--app-muted)]">
                {product?.displayAssignment?.isOnDisplay ? `Display: ${product.displayAssignment.displayName}` : "No display assignment"}
              </p>
            </div>,
            <div key={`${id}-vendor`}>
              <p>{item?.vendor ?? "No stock vendor"}</p>
              <p className="mt-1 text-xs text-[var(--app-muted)]">
                Price: {typeof item?.price === "number" ? `$${item.price.toFixed(2)}` : product?.lastCost ?? "Not set"}
              </p>
              <p className="mt-1 text-xs text-[var(--app-muted)]">
                Case qty: {typeof item?.quantityInCase === "number" ? item.quantityInCase : product?.averageQuantityInCase ?? "Not set"}
              </p>
            </div>,
            product?.hasNutritionInfo ? (
              <StatusPill key={`${id}-nutrition`} tone="green">
                Tracked
              </StatusPill>
            ) : (
              "Not set"
            ),
            expires ? (
              <StatusPill key={`${id}-expiration`} tone="blue">
                Tracked
              </StatusPill>
            ) : (
              "None"
            ),
            item?.updatedAt ?? "Catalog default",
            <ButtonLink
              key={`${id}-edit`}
              href={editHref}
              variant="ghost"
              className="px-2"
              icon={<Pencil className="h-4 w-4" />}
            >
              {item ? "View stock" : "View catalog"}
            </ButtonLink>
          ]
          })}
        />
      </Panel>
    </>
  )
}
