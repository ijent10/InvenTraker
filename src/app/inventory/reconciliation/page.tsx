import { PageHeader } from "@/components/page-header"
import { InventoryReconciliation } from "@/components/inventory-reconciliation"
export default function ReconciliationPage() {
  return <><PageHeader title="Stock review" description="Find differences between inventory, batches, and stock movement history." /><InventoryReconciliation /></>
}
