import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Button, Panel } from "@/components/ui"
import { vendors } from "@/lib/demo-data"

export default function VendorsPage() {
  return (
    <>
      <PageHeader
        title="Vendors"
        description="Vendor profiles, ordering rules, lead times, contacts, and minimums."
        actions={<Button>Add vendor</Button>}
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
