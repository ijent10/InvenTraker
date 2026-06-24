import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Button, Panel, StatusPill } from "@/components/ui"
import { orderDrafts } from "@/lib/demo-data"

export default function OrdersPage() {
  return (
    <>
      <PageHeader
        title="Orders"
        description="Draft, review, and submit vendor orders from one place."
        actions={
          <>
            <Button variant="secondary">Export</Button>
            <Button>Generate draft</Button>
          </>
        }
      />

      <Panel>
        <DataTable
          columns={["Vendor", "Items", "Estimated total", "Status", "Timing"]}
          rows={orderDrafts.map((order) => [
            <span key={`${order.id}-vendor`} className="font-semibold text-white">
              {order.vendor}
            </span>,
            order.items,
            order.estimatedTotal,
            <StatusPill key={order.id} tone={order.status === "Ready" ? "green" : order.status === "Needs review" ? "amber" : "neutral"}>
              {order.status}
            </StatusPill>,
            order.dueBy
          ])}
        />
      </Panel>
    </>
  )
}
