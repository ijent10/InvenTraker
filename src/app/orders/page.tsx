import Link from "next/link"
import { Download } from "lucide-react"

import { ActionButton } from "@/components/action-button"
import { DataTable } from "@/components/data-table"
import { OrderDraftBuilder } from "@/components/order-draft-builder"
import { PageHeader } from "@/components/page-header"
import { Panel, StatusPill } from "@/components/ui"
import { getInventoryItems, getOrderDrafts, getProducts, getVendors } from "@/lib/server-data"

export default async function OrdersPage({ searchParams }: { searchParams?: { draft?: string } }) {
  const [inventoryItems, orderDrafts, products, vendors] = await Promise.all([getInventoryItems(), getOrderDrafts(), getProducts(), getVendors()])

  return (
    <>
      <PageHeader
        title="Orders"
        description="Draft, review, and submit vendor orders from one place."
        actions={
          <ActionButton variant="secondary" doneLabel="Export staged" icon={<Download className="h-4 w-4" />}>
            Export
          </ActionButton>
        }
      />

      <OrderDraftBuilder
        vendors={vendors}
        inventoryItems={inventoryItems}
        products={products}
        orderDrafts={orderDrafts}
        initialDraftId={searchParams?.draft}
      />

      <Panel className="mt-6">
        <DataTable
          columns={["Vendor", "Items", "Estimated total", "Minimum", "Status", "Timing", "Submitted", "Arrival"]}
          rows={orderDrafts.map((order) => [
            <Link key={`${order.id}-vendor`} href={`/orders?draft=${order.id}#generate-order`} className="font-semibold text-[var(--app-text)] hover:text-[var(--app-accent)]">
              {order.vendor}
            </Link>,
            order.items,
            order.estimatedTotal,
            order.minimum,
            <StatusPill key={order.id} tone={order.status === "Ready" ? "green" : order.status === "Needs review" ? "amber" : "neutral"}>
              {order.status}
            </StatusPill>,
            order.dueBy,
            order.submittedAt ? `${order.submittedBy ?? "Unknown"} - ${order.submittedAt}` : "Not submitted",
            order.expectedArrival
          ])}
        />
      </Panel>
    </>
  )
}
