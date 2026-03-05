"use client"

import {
  BookOpenText,
  Box,
  Building2,
  ChartColumn,
  ClipboardList,
  Clock3,
  Factory,
  ListTodo,
  Settings,
  ShoppingCart,
  Store,
  Trash2,
  Users
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { getModuleAccent } from "@inventracker/shared"

import { DashboardModuleCard } from "@/components/dashboard-module-card"
import { AppButton, AppCard, AppCheckbox } from "@inventracker/ui"
import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"

type DashboardCard = {
  id: string
  href: string
  title: string
  subtitle: string
  metric: string
  module: "expiration" | "waste" | "inventory" | "healthChecks" | "orders" | "todo" | "insights" | "production" | "howtos" | "stores" | "users" | "storeSettings" | "orgSettings"
  icon: typeof Clock3
}

function moduleAccentForCard(
  module: DashboardCard["module"],
  accent: string
) {
  if (module === "expiration" || module === "waste" || module === "inventory" || module === "healthChecks" || module === "orders" || module === "todo" || module === "insights" || module === "production" || module === "howtos") {
    return getModuleAccent(module, accent)
  }
  return accent
}

const cardCatalog: DashboardCard[] = [
  { id: "expiration", href: "/app/expiration", icon: Clock3, title: "Expiration", subtitle: "Items expiring soon", metric: "Soon", module: "expiration" },
  { id: "waste", href: "/app/waste", icon: Trash2, title: "Waste", subtitle: "Track spoilage cost", metric: "Live", module: "waste" },
  { id: "inventory", href: "/app/inventory", icon: Box, title: "Inventory", subtitle: "Search UPC, tags, names", metric: "Active", module: "inventory" },
  { id: "healthChecks", href: "/app/health-checks", icon: ClipboardList, title: "Health Checks", subtitle: "Assigned QA + safety forms", metric: "Daily", module: "healthChecks" },
  { id: "orders", href: "/app/orders", icon: ShoppingCart, title: "Orders", subtitle: "Suggested lines by vendor", metric: "Draft", module: "orders" },
  { id: "todo", href: "/app/todo", icon: ListTodo, title: "To-Do", subtitle: "Manual + auto tasks", metric: "Open", module: "todo" },
  { id: "insights", href: "/app/insights", icon: ChartColumn, title: "Insights", subtitle: "Financial health metrics", metric: "Weekly", module: "insights" },
  { id: "production", href: "/app/production", icon: Factory, title: "Production", subtitle: "Make recommendations", metric: "Trend", module: "production" },
  { id: "howtos", href: "/app/howtos", icon: BookOpenText, title: "How-To Library", subtitle: "Guides and SOPs", metric: "Guides", module: "howtos" },
  { id: "stores", href: "/app/stores", icon: Store, title: "Stores", subtitle: "Store setup and status", metric: "Network", module: "stores" },
  { id: "users", href: "/app/users", icon: Users, title: "Users", subtitle: "Roles and permissions", metric: "Access", module: "users" },
  { id: "orgSettings", href: "/app/org-settings", icon: Building2, title: "Organization Settings", subtitle: "Org-level controls", metric: "Policy", module: "orgSettings" },
  { id: "storeSettings", href: "/app/store-settings", icon: Settings, title: "Store Settings", subtitle: "Store-level controls", metric: "Local", module: "storeSettings" }
]

export default function DashboardPage() {
  const { activeOrg, activeOrgId, effectivePermissions } = useOrgContext()
  const accent = "#2563EB"
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>(cardCatalog.map((card) => card.id))
  const [orderedCardIds, setOrderedCardIds] = useState<string[]>(cardCatalog.map((card) => card.id))
  const [showCustomize, setShowCustomize] = useState(false)
  const [rearrangeMode, setRearrangeMode] = useState(false)
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null)

  useEffect(() => {
    if (!activeOrgId) return
    const selectedKey = `dashboard_cards_selected_${activeOrgId}`
    const orderKey = `dashboard_cards_order_${activeOrgId}`
    const savedSelected = localStorage.getItem(selectedKey)
    const savedOrder = localStorage.getItem(orderKey)
    try {
      if (savedSelected) {
        const parsed = JSON.parse(savedSelected) as string[]
        if (Array.isArray(parsed) && parsed.length) setSelectedCardIds(parsed)
      }
      if (savedOrder) {
        const parsed = JSON.parse(savedOrder) as string[]
        if (Array.isArray(parsed) && parsed.length) setOrderedCardIds(parsed)
      }
    } catch {
      // Ignore malformed local state.
    }
  }, [activeOrgId])

  const saveLayout = (nextSelected: string[], nextOrder: string[]) => {
    if (!activeOrgId) return
    localStorage.setItem(`dashboard_cards_selected_${activeOrgId}`, JSON.stringify(nextSelected))
    localStorage.setItem(`dashboard_cards_order_${activeOrgId}`, JSON.stringify(nextOrder))
  }

  const toggleCard = (id: string, enabled: boolean) => {
    setSelectedCardIds((prev) => {
      const next = enabled ? [...new Set([...prev, id])] : prev.filter((entry) => entry !== id)
      saveLayout(next, orderedCardIds)
      return next
    })
    if (enabled && !orderedCardIds.includes(id)) {
      setOrderedCardIds((prev) => {
        const next = [...prev, id]
        saveLayout(selectedCardIds, next)
        return next
      })
    }
  }

  const moveCard = (fromId: string, toId: string) => {
    setOrderedCardIds((prev) => {
      const fromIndex = prev.indexOf(fromId)
      const toIndex = prev.indexOf(toId)
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      if (!moved) return prev
      next.splice(toIndex, 0, moved)
      saveLayout(selectedCardIds, next)
      return next
    })
  }

  const visibleCards = useMemo(() => {
    const catalogById = new Map(cardCatalog.map((card) => [card.id, card]))
    return orderedCardIds
      .map((id) => catalogById.get(id))
      .filter((card): card is DashboardCard => Boolean(card))
      .filter((card) => selectedCardIds.includes(card.id))
      .filter((card) => {
        if (card.id === "stores") return effectivePermissions.manageStores
        if (card.id === "users") return effectivePermissions.manageUsers
        if (card.id === "orgSettings") return effectivePermissions.manageOrgSettings
        if (card.id === "storeSettings") return effectivePermissions.manageStoreSettings
        return true
      })
  }, [effectivePermissions.manageOrgSettings, effectivePermissions.manageStoreSettings, effectivePermissions.manageStores, effectivePermissions.manageUsers, orderedCardIds, selectedCardIds])

  return (
    <div>
      <PageHead
        title="Dashboard"
        subtitle={activeOrg ? `Operating in ${activeOrg.organizationName}` : "Select an organization to begin."}
        actions={
          <AppButton
            variant="secondary"
            onClick={() => {
              setShowCustomize((current) => !current)
              if (showCustomize) setRearrangeMode(false)
            }}
          >
            {showCustomize ? "Close Customize" : "Customize Dashboard"}
          </AppButton>
        }
      />

      {showCustomize ? (
        <AppCard className="mb-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="card-title">Dashboard Customization</h2>
            <div className="flex gap-2">
              <AppButton
                variant="secondary"
                className={rearrangeMode ? "!border-[color:var(--accent)] !text-[color:var(--app-text)]" : ""}
                onClick={() => setRearrangeMode((current) => !current)}
              >
                Rearrange
              </AppButton>
              <AppButton
                variant="secondary"
                onClick={() => {
                  const allIds = cardCatalog.map((card) => card.id)
                  setSelectedCardIds(allIds)
                  setOrderedCardIds(allIds)
                  saveLayout(allIds, allIds)
                }}
              >
                Reset
              </AppButton>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            {cardCatalog.map((card) => (
              <AppCheckbox
                key={card.id}
                checked={selectedCardIds.includes(card.id)}
                onChange={(event) => toggleCard(card.id, event.target.checked)}
                label={card.title}
              />
            ))}
          </div>

          {rearrangeMode ? (
            <div className="mt-4 rounded-2xl border border-app-border p-3">
              <p className="mb-2 text-sm font-semibold">Rearrange (drag and drop)</p>
              <div className="space-y-2">
                {orderedCardIds
                  .filter((id) => selectedCardIds.includes(id))
                  .map((id) => {
                    const card = cardCatalog.find((entry) => entry.id === id)
                    if (!card) return null
                    return (
                      <div
                        key={id}
                        draggable
                        onDragStart={() => setDraggedCardId(id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (!draggedCardId || draggedCardId === id) return
                          moveCard(draggedCardId, id)
                          setDraggedCardId(null)
                        }}
                        className="cursor-move rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm"
                      >
                        {card.title}
                      </div>
                    )
                  })}
              </div>
            </div>
          ) : null}
        </AppCard>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleCards.map((card) => (
          <DashboardModuleCard
            key={card.id}
            href={card.href}
            icon={card.icon}
            title={card.title}
            subtitle={card.subtitle}
            color={moduleAccentForCard(card.module, accent)}
            metric={card.metric}
          />
        ))}
      </div>
    </div>
  )
}
