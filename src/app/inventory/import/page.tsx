import { ArrowLeft } from "lucide-react"

import { InventoryImportWorkbench } from "@/components/inventory-import-workbench"
import { PageHeader } from "@/components/page-header"
import { ButtonLink } from "@/components/ui"

export default function InventoryImportPage() {
  return (
    <>
      <PageHeader
        title="Import inventory"
        description="Parse spreadsheets, PDFs, Word docs, text files, and images into a review draft before anything becomes live inventory."
        actions={
          <ButtonLink href="/inventory" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to inventory
          </ButtonLink>
        }
      />

      <InventoryImportWorkbench />
    </>
  )
}
