import { InventoryMovements } from "@/components/inventory-movements"
import { PageHeader } from "@/components/page-header"
export default function InventoryMovementsPage({ searchParams }: { searchParams?: { storeId?: string; itemId?: string } }) {
  return <><PageHeader title="Movement history" description="Review the saved balances and stock targets behind an inventory item." /><InventoryMovements storeId={searchParams?.storeId ?? ""} itemId={searchParams?.itemId ?? ""} /></>
}
