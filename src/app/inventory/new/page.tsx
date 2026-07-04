import { ArrowLeft } from "lucide-react"

import { InventoryForm } from "@/components/inventory-form"
import { PageHeader } from "@/components/page-header"
import { ButtonLink } from "@/components/ui"

export default function NewInventoryItemPage() {
  return (
    <>
      <PageHeader
        title="Add stock item"
        description="Create the store-counted item with front/back stock, product defaults, locations, vendor, price, par, and expiration behavior."
        actions={
          <ButtonLink href="/inventory" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to inventory
          </ButtonLink>
        }
      />

      <div className="max-w-5xl">
        <InventoryForm />
      </div>
    </>
  )
}
