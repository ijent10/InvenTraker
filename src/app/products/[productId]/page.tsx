import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { ProductForm } from "@/components/product-form"
import { PageHeader } from "@/components/page-header"
import { ButtonLink, Panel, StatusPill } from "@/components/ui"
import { getProducts, getStoreDisplays } from "@/lib/server-data"

export default async function EditProductPage({ params }: { params: { productId: string } }) {
  const [products, displays] = await Promise.all([getProducts(), getStoreDisplays()])
  const product = products.find((candidate) => candidate.id === params.productId)

  if (!product) {
    notFound()
  }

  return (
    <>
      <PageHeader
        title={`Edit ${product.name} catalog product`}
        description="Manage reusable product identity, department/category defaults, nutrition, display assignment, unit behavior, and expiration tracking."
        actions={
          <ButtonLink href="/inventory" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to inventory
          </ButtonLink>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <ProductForm product={product} mode="edit" displays={displays} />

        <Panel className="p-4">
          <h2 className="font-semibold text-[var(--app-text)]">Catalog summary</h2>
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <p className="text-[var(--app-subtle)]">SKU or barcode</p>
              <p className="mt-1 font-semibold text-[var(--app-text)]">{product.sku ?? "None"}</p>
            </div>
            <div>
              <p className="text-[var(--app-subtle)]">Department</p>
              <p className="mt-1 font-semibold text-[var(--app-text)]">{product.department}</p>
            </div>
            <div>
              <p className="text-[var(--app-subtle)]">Category</p>
              <p className="mt-1 font-semibold text-[var(--app-text)]">{product.category}</p>
            </div>
            <div>
              <p className="text-[var(--app-subtle)]">Location</p>
              <p className="mt-1 font-semibold text-[var(--app-text)]">{product.location}</p>
            </div>
            <div>
              <p className="text-[var(--app-subtle)]">Display</p>
              <p className="mt-1 font-semibold text-[var(--app-text)]">
                {product.displayAssignment?.isOnDisplay ? product.displayAssignment.displayName : "Not on display"}
              </p>
              {product.displayAssignment?.isOnDisplay ? (
                <p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">
                  {product.displayAssignment.quantityNeeded} needed - starts {product.displayAssignment.startDate}
                  {product.displayAssignment.endDate ? ` - ends ${product.displayAssignment.endDate}` : ""}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill tone="blue">{product.defaultUnit}</StatusPill>
              {product.expires ? <StatusPill tone="amber">Tracks expiration</StatusPill> : <StatusPill>No expiration</StatusPill>}
              {product.hasNutritionInfo ? <StatusPill tone="green">Nutrition tracked</StatusPill> : <StatusPill>No nutrition info</StatusPill>}
            </div>
            <div className="border-t border-[var(--app-border)] pt-4">
              <p className="text-[var(--app-subtle)]">Last cost</p>
              <p className="mt-1 text-[var(--app-muted)]">{product.lastCost}</p>
            </div>
            {product.nutrition?.sourceSummary ? (
              <div>
                <p className="text-[var(--app-subtle)]">Nutrition source</p>
                <p className="mt-1 text-[var(--app-muted)]">{product.nutrition.sourceSummary}</p>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
    </>
  )
}
