"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AppCard, Tabs, appButtonClass } from "@inventracker/ui"
import { useQuery } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  computeFinancialHealthFromOrgData,
  fetchExpirationEntries,
  fetchItems,
  fetchMembers,
  fetchOrgOrders,
  fetchOrgWasteRecords,
  fetchStores,
  formatStoreLabel
} from "@/lib/data/firestore"

type StoreTab = "overview" | "inventory" | "expiration" | "waste" | "orders" | "users" | "settings"

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate()
    } catch {
      return null
    }
  }
  return null
}

export default function StoreDetailPage({ params }: { params: { storeId: string } }) {
  const { activeOrgId } = useOrgContext()
  const [tab, setTab] = useState<StoreTab>("overview")

  const { data: stores = [] } = useQuery({
    queryKey: ["store-detail-list", activeOrgId],
    queryFn: () => fetchStores(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const { data: financial } = useQuery({
    queryKey: ["store-financial-snapshot", activeOrgId, params.storeId],
    queryFn: () => computeFinancialHealthFromOrgData(activeOrgId, params.storeId, 7),
    enabled: Boolean(activeOrgId)
  })

  const { data: items = [] } = useQuery({
    queryKey: ["store-items-snapshot", activeOrgId, params.storeId],
    queryFn: () => fetchItems(activeOrgId, { storeId: params.storeId }),
    enabled: Boolean(activeOrgId)
  })

  const { data: expiring = [] } = useQuery({
    queryKey: ["store-expiring-snapshot", activeOrgId, params.storeId],
    queryFn: () => fetchExpirationEntries(activeOrgId, params.storeId, 7),
    enabled: Boolean(activeOrgId)
  })

  const { data: wasteRows = [] } = useQuery({
    queryKey: ["store-waste-snapshot", activeOrgId, params.storeId],
    queryFn: () => fetchOrgWasteRecords(activeOrgId, params.storeId),
    enabled: Boolean(activeOrgId)
  })

  const { data: orders = [] } = useQuery({
    queryKey: ["store-orders-snapshot", activeOrgId, params.storeId],
    queryFn: () => fetchOrgOrders(activeOrgId, params.storeId),
    enabled: Boolean(activeOrgId)
  })

  const { data: members = [] } = useQuery({
    queryKey: ["store-members-snapshot", activeOrgId],
    queryFn: () => fetchMembers(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const store = useMemo(() => stores.find((entry) => entry.id === params.storeId), [params.storeId, stores])

  const openOrders = useMemo(
    () => orders.filter((entry) => !["received", "closed", "complete"].includes(String(entry.status ?? "").toLowerCase())).length,
    [orders]
  )

  const activeUsers = useMemo(
    () =>
      members.filter((entry) => {
        const status = String(entry.status ?? "active").toLowerCase()
        if (status === "disabled") return false
        if (!entry.storeIds?.length) return true
        return entry.storeIds.includes(params.storeId)
      }).length,
    [members, params.storeId]
  )

  const wasteEventsThisWeek = useMemo(() => {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    return wasteRows.filter((entry) => {
      const eventAt = parseDate(entry.date ?? entry.createdAt)
      return eventAt ? eventAt >= weekAgo : false
    }).length
  }, [wasteRows])

  const tabSnapshot = useMemo(() => {
    switch (tab) {
      case "inventory":
        return {
          subtitle: "Store inventory health snapshot",
          cards: [
            { label: "Active Items", value: String(items.filter((item) => !item.archived).length) },
            {
              label: "Low Stock",
              value: String(items.filter((item) => item.totalQuantity < item.minimumQuantity).length)
            },
            { label: "Inventory Value", value: `$${(financial?.inventoryValue ?? 0).toFixed(2)}` }
          ],
          href: `/app/stores/${params.storeId}/inventory`,
          buttonLabel: "Open Store Inventory"
        }
      case "expiration":
        return {
          subtitle: "Expiration risk snapshot",
          cards: [
            { label: "Expiring (7d)", value: String(expiring.length) },
            { label: "Expiring Value", value: `$${(financial?.expiringSoonValue ?? 0).toFixed(2)}` },
            {
              label: "Expired",
              value: String(expiring.filter((entry) => entry.isExpired).length)
            }
          ],
          href: "/app/expiration",
          buttonLabel: "Open Expiration"
        }
      case "waste":
        return {
          subtitle: "Waste snapshot",
          cards: [
            { label: "Waste This Week", value: `$${(financial?.wasteCostWeek ?? 0).toFixed(2)}` },
            { label: "Waste This Month", value: `$${(financial?.wasteCostMonth ?? 0).toFixed(2)}` },
            { label: "Waste Events (7d)", value: String(wasteEventsThisWeek) }
          ],
          href: "/app/waste",
          buttonLabel: "Open Waste"
        }
      case "orders":
        return {
          subtitle: "Ordering snapshot",
          cards: [
            { label: "Open Orders", value: String(openOrders) },
            { label: "Saved Order Rows", value: String(orders.length) },
            {
              label: "Items Below Min",
              value: String(items.filter((item) => item.totalQuantity < item.minimumQuantity).length)
            }
          ],
          href: "/app/orders",
          buttonLabel: "Open Orders"
        }
      case "users":
        return {
          subtitle: "User access snapshot",
          cards: [
            { label: "Active Users", value: String(activeUsers) },
            {
              label: "Store Assigned",
              value: String(
                members.filter((entry) => (entry.storeIds ?? []).includes(params.storeId)).length
              )
            },
            {
              label: "Corporate Assigned",
              value: String(
                members.filter(
                  (entry) => (entry.assignmentType ?? "store") === "corporate" || (entry.storeIds ?? []).length === 0
                ).length
              )
            }
          ],
          href: "/app/users",
          buttonLabel: "Open Users"
        }
      case "settings":
        return {
          subtitle: "Store configuration snapshot",
          cards: [
            { label: "Store", value: store ? formatStoreLabel(store) : params.storeId },
            { label: "Status", value: store?.status ?? "active" },
            { label: "Last Sync", value: store?.lastSyncAt ? "Synced" : "Not synced" }
          ],
          href: "/app/store-settings",
          buttonLabel: "Open Store Settings"
        }
      case "overview":
      default:
        return {
          subtitle: "Quick financial and operational health",
          cards: [
            { label: "Inventory Value", value: `$${(financial?.inventoryValue ?? 0).toFixed(2)}` },
            { label: "Waste (Month)", value: `$${(financial?.wasteCostMonth ?? 0).toFixed(2)}` },
            { label: "Expiring Value", value: `$${(financial?.expiringSoonValue ?? 0).toFixed(2)}` },
            { label: "Open Orders", value: String(openOrders) },
            { label: "Active Users", value: String(activeUsers) },
            {
              label: "Items Low Stock",
              value: String(items.filter((item) => item.totalQuantity < item.minimumQuantity).length)
            }
          ],
          href: "/app/insights",
          buttonLabel: "Open Insights"
        }
    }
  }, [activeUsers, expiring, financial, items, openOrders, orders.length, params.storeId, store, tab, wasteEventsThisWeek, members])

  return (
    <div>
      <PageHead
        title={store ? formatStoreLabel(store) : "Store"}
        subtitle="Store-level overview with quick snapshot cards for each module."
      />
      <Tabs
        tabs={[
          { label: "Overview", value: "overview" },
          { label: "Inventory", value: "inventory" },
          { label: "Expiration", value: "expiration" },
          { label: "Waste", value: "waste" },
          { label: "Orders", value: "orders" },
          { label: "Users", value: "users" },
          { label: "Settings", value: "settings" }
        ]}
        value={tab}
        onChange={setTab}
      />

      <AppCard className="mt-4">
        <h2 className="card-title capitalize">{tab}</h2>
        <p className="secondary-text mt-2">{tabSnapshot.subtitle}</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tabSnapshot.cards.map((card) => (
            <div key={`${tab}-${card.label}`} className="rounded-2xl border border-app-border bg-app-surface-soft p-4">
              <p className="secondary-text">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <Link href={tabSnapshot.href} className={appButtonClass("primary")}>
            {tabSnapshot.buttonLabel}
          </Link>
        </div>
      </AppCard>
    </div>
  )
}
