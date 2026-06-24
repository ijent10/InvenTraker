import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Button, Panel, StatusPill } from "@/components/ui"
import { products } from "@/lib/demo-data"

export default function ProductsPage() {
  return (
    <>
      <PageHeader
        title="Products"
        description="A central catalog for product identity, categories, units, expiration behavior, and future AI enrichment."
        actions={<Button>Add product</Button>}
      />

      <Panel>
        <DataTable
          columns={["Product", "Category", "Default unit", "Expiration", "Last cost"]}
          rows={products.map((product) => [
            <span key={`${product.id}-name`} className="font-semibold text-white">
              {product.name}
            </span>,
            product.category,
            product.defaultUnit,
            product.expires ? <StatusPill key={product.id} tone="amber">Tracks dates</StatusPill> : "None",
            product.lastCost
          ])}
        />
      </Panel>
    </>
  )
}
