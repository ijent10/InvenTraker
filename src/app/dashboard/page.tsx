import { DashboardWidgetGrid } from "@/components/dashboard-widget-grid"
import { PageHeader } from "@/components/page-header"
import { getInventoryItems, getOrderDrafts, getShiftNotes } from "@/lib/server-data"

export default async function DashboardPage() {
  const [inventoryItems, orderDrafts, shiftNotes] = await Promise.all([getInventoryItems(), getOrderDrafts(), getShiftNotes()])
  const lowStock = inventoryItems.filter((item) => item.onHand <= item.reorderPoint)
  const readyOrders = orderDrafts.filter((order) => order.status === "Ready")
  const needsReviewOrders = orderDrafts.filter((order) => order.status === "Needs review")

  return (
    <>
      <PageHeader
        title="Operations dashboard"
        description="Your home screen only shows the tiles and widgets you choose."
      />

      <DashboardWidgetGrid
        widgetStats={{
          inventory: {
            value: inventoryItems.length.toLocaleString(),
            detail: `${lowStock.length} low-stock item${lowStock.length === 1 ? "" : "s"} across active inventory.`
          },
          orders: {
            value: `${readyOrders.length} ready`,
            detail: `${needsReviewOrders.length} draft${needsReviewOrders.length === 1 ? "" : "s"} need review before submission.`
          },
          "low-stock": {
            value: lowStock.length.toLocaleString(),
            detail: lowStock.length > 0 ? `${lowStock[0].name} is the first item below reorder point.` : "No low-stock items right now."
          },
          notes: {
            value: `${shiftNotes.length} note${shiftNotes.length === 1 ? "" : "s"}`,
            detail:
              shiftNotes.length > 0
                ? shiftNotes
                    .slice(0, 2)
                    .map((note) => `${note.title}: ${note.body}`)
                    .join(" • ")
                : "No notes yet. Add a personal, department, people, or organization note."
          }
        }}
        shiftNotes={shiftNotes}
      />
    </>
  )
}
