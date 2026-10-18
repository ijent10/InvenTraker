"use client"

import { ButtonLink } from "@/components/ui"
import { useAuthSession } from "@/lib/auth-session"

export function InventoryHistoryLink({ storeId, itemId }: { storeId: string; itemId: string }) {
  const session = useAuthSession()
  if (!session.can("inventory.view") || (!session.can("history.view") && !session.can("history.viewAll"))) return null
  const params = new URLSearchParams({ storeId, itemId })
  return <ButtonLink href={`/inventory/movements?${params}`} variant="secondary">Movement history</ButtonLink>
}
