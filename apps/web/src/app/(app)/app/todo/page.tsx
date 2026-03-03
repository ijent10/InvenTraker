"use client"

import Link from "next/link"
import { useMemo } from "react"
import { AppCard, TipBanner } from "@inventracker/ui"
import { useQuery } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  fetchExpirationEntries,
  fetchOrgTodo,
  fetchStoreInventoryItems
} from "@/lib/data/firestore"

export default function TodoPage() {
  const { activeOrgId, activeStoreId } = useOrgContext()

  const { data: todoRows = [] } = useQuery({
    queryKey: ["org-todo", activeOrgId, activeStoreId],
    queryFn: () => fetchOrgTodo(activeOrgId, activeStoreId || undefined),
    enabled: Boolean(activeOrgId)
  })

  const { data: expiringRows = [] } = useQuery({
    queryKey: ["todo-expiring", activeOrgId, activeStoreId],
    queryFn: () => fetchExpirationEntries(activeOrgId, activeStoreId || undefined, 3),
    enabled: Boolean(activeOrgId)
  })

  const { data: items = [] } = useQuery({
    queryKey: ["todo-items", activeOrgId, activeStoreId],
    queryFn: () => (activeStoreId ? fetchStoreInventoryItems(activeOrgId, activeStoreId) : Promise.resolve([])),
    enabled: Boolean(activeOrgId && activeStoreId)
  })

  const derived = useMemo(() => {
    const lowStock = items
      .filter((item) => item.totalQuantity < item.minimumQuantity)
      .map((item) => ({
        id: `low-${item.id}`,
        title: `Low stock: ${item.name}`,
        status: "open",
        href: "/app/orders"
      }))

    const expiring = expiringRows.map((entry, idx) => ({
      id: `exp-${entry.itemId}-${idx}`,
      title: `Check expiration: ${entry.itemName}`,
      status: "open",
      href: "/app/expiration"
    }))

    return [...lowStock, ...expiring]
  }, [expiringRows, items])

  const allRows = useMemo(
    () => [
      ...todoRows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        href:
          row.title.toLowerCase().includes("order")
            ? "/app/orders"
            : row.title.toLowerCase().includes("expire")
              ? "/app/expiration"
              : row.title.toLowerCase().includes("waste")
                ? "/app/waste"
                : "/app/todo"
      })),
      ...derived
    ],
    [derived, todoRows]
  )

  return (
    <div>
      <PageHead title="To-Do" subtitle="Manual + auto-generated tasks tied to inventory actions." />
      <TipBanner title="Tip" message="Tasks link directly to the module where the action is completed." accentColor="#A855F7" />
      <AppCard className="mt-4">
        <div className="space-y-2 text-sm">
          {allRows.length === 0 ? (
            <p className="secondary-text">No tasks right now.</p>
          ) : (
            allRows.map((row) => (
              <Link key={row.id} href={row.href} className="block rounded-xl border border-app-border p-3 hover:bg-app-surface-soft">
                <p className="font-semibold">{row.title}</p>
                <p className="secondary-text">{row.status}</p>
              </Link>
            ))
          )}
        </div>
      </AppCard>
    </div>
  )
}
