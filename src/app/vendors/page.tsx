import { Plus } from "lucide-react"

import { ActionButton } from "@/components/action-button"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Panel } from "@/components/ui"
import { getVendors } from "@/lib/server-data"

export default async function VendorsPage() {
  const vendors = await getVendors()

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Vendor profiles, ordering rules, lead times, contacts, and minimums."
        actions={<ActionButton doneLabel="Vendor staged" icon={<Plus className="h-4 w-4" />}>Add vendor</ActionButton>}
      />

      <Panel>
        <DataTable
          columns={["Vendor", "Lead time", "Minimum", "Contact"]}
          rows={vendors.map((vendor) => [
            <span key={`${vendor.id}-name`} className="font-semibold text-white">
              {vendor.name}
            </span>,
            vendor.leadTime,
            vendor.minimum,
            vendor.contact
          ])}
        />
      </Panel>
    </>
  )
}
