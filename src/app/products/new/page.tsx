import { ArrowLeft } from "lucide-react"

import { ProductForm } from "@/components/product-form"
import { PageHeader } from "@/components/page-header"
import { ButtonLink } from "@/components/ui"
import { getStoreDisplays } from "@/lib/server-data"

export default async function NewProductPage() {
  const displays = await getStoreDisplays()

  return (
    <>
      <PageHeader
        title="Add catalog product"
        description="Create reusable product identity, nutrition, display assignment, and assistant enrichment details. This does not add live store stock by itself."
        actions={
          <ButtonLink href="/inventory" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to inventory
          </ButtonLink>
        }
      />

      <div className="max-w-5xl">
        <ProductForm displays={displays} />
      </div>
    </>
  )
}
