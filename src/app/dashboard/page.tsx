import Link from "next/link"
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3 } from "lucide-react"

import { DashboardWidgetGrid } from "@/components/dashboard-widget-grid"
import { PageHeader } from "@/components/page-header"
import { Panel, StatusPill } from "@/components/ui"
import { getHealthChecks, getInventoryBatches, getInventoryItems, getOrderDrafts, getShiftNotes, getStockOperations, getStores, syncOperationalIssues } from "@/lib/server-data"
import { generateTodayIssues, operationalObservability } from "@/lib/today-issues"
import { selectTodayIssues } from "@/lib/ai/operational-decisions"

export default async function DashboardPage() {
  const [inventoryItems, batches, orderDrafts, shiftNotes, healthChecks, stockOperations, stores] = await Promise.all([
    getInventoryItems(), getInventoryBatches(), getOrderDrafts(), getShiftNotes(), getHealthChecks(), getStockOperations(), getStores()
  ])
  const lowStock = inventoryItems.filter((item) => item.onHand <= item.reorderPoint)
  const readyOrders = orderDrafts.filter((order) => order.status === "Ready")
  const needsReviewOrders = orderDrafts.filter((order) => order.status === "Needs review")
  const fallbackStoreId = stores[0]?.id ?? "store-001"
  const normalizedInventory = inventoryItems.map((item) => ({ ...item, storeId: item.storeId || fallbackStoreId }))
  const storeIds = [...new Set(normalizedInventory.map((item) => item.storeId))]
  const generatedAt = new Date()
  const allTodayCandidates = storeIds.flatMap((storeId) => generateTodayIssues({
    storeId,
    inventory: normalizedInventory,
    batches,
    orders: orderDrafts.map((order) => ({ ...order, storeId: order.storeId || fallbackStoreId })),
    stockOperations: stockOperations as never,
    now: generatedAt
  })).sort((left, right) => right.priorityScore - left.priorityScore)
  const allTodayIssues = await selectTodayIssues(allTodayCandidates)
  const todayIssues = allTodayIssues.slice(0, 6)
  const observability = operationalObservability({ inventory: normalizedInventory, batches, orders: orderDrafts, stockOperations: stockOperations as never })
  const dueChecks = healthChecks.filter((check) => ["Due today", "Overdue"].includes(check.status))
  await syncOperationalIssues(allTodayIssues, storeIds)

  return (
    <>
      <PageHeader
        title="Today"
        description="The most urgent store issues, their evidence, and the next action."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Panel className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-[var(--app-text)]">Needs attention</h2>
              <p className="mt-1 text-sm text-[var(--app-muted)]">Ranked by urgency and operational impact. Updated {generatedAt.toLocaleString("en-US")}.</p>
            </div>
            <StatusPill tone={todayIssues.some((issue) => issue.severity === "critical") ? "amber" : "green"}>{todayIssues.length} open</StatusPill>
          </div>
          <div className="mt-4 grid gap-3">
            {todayIssues.length ? todayIssues.map((issue) => (
              <Link key={issue.id} href={issue.action.href} className="group rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-4 hover:border-[var(--app-accent)]">
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${issue.severity === "critical" ? "text-rose-300" : issue.severity === "high" ? "text-amber-300" : "text-[var(--app-accent)]"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-[var(--app-text)]">{issue.title}</p><StatusPill tone={issue.severity === "critical" || issue.severity === "high" ? "amber" : "neutral"}>{issue.severity}</StatusPill></div>
                    <p className="mt-1 text-sm text-[var(--app-muted)]">{issue.detail}</p>
                    <p className="mt-2 text-sm font-semibold text-[var(--app-text)]">{issue.suggestedAction}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--app-subtle)]">
                      {issue.evidence.slice(0, 3).map((evidence) => <span key={`${issue.id}-${evidence.label}`}>{evidence.label}: {evidence.value}</span>)}
                      <span>Deadline: {issue.deadline ? new Date(issue.deadline).toLocaleString("en-US") : "Not established"}</span>
                      <span>Freshness: {issue.freshness.state}</span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[var(--app-subtle)] group-hover:text-[var(--app-accent)]" />
                </div>
              </Link>
            )) : (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200"><CheckCircle2 className="mr-2 inline h-4 w-4" />No calculated inventory or order issues need action.</div>
            )}
          </div>
        </Panel>

        <div className="grid gap-6">
          <Panel className="p-4">
            <h2 className="font-semibold text-[var(--app-text)]">Assigned checks</h2>
            <p className="mt-1 text-xs text-[var(--app-muted)]">Checklist assignments stay separate from calculated inventory health.</p>
            <div className="mt-3 grid gap-2">
              {dueChecks.length ? dueChecks.slice(0, 4).map((check) => <Link key={check.id} href={`/health-checks/${check.id}`} className="rounded-md border border-[var(--app-control-border)] p-3 text-sm"><Clock3 className="mr-2 inline h-4 w-4 text-amber-300" />{check.name} · {check.status}</Link>) : <p className="text-sm text-[var(--app-muted)]">No checks are due.</p>}
            </div>
          </Panel>
          <Panel className="p-4">
            <h2 className="font-semibold text-[var(--app-text)]">Pilot monitor</h2>
            <div className="mt-3 space-y-2 text-sm text-[var(--app-muted)]">
              <p>Balance mismatches: <strong className="text-[var(--app-text)]">{observability.balanceMismatches}</strong></p>
              <p>Duplicate operation IDs: <strong className="text-[var(--app-text)]">{observability.duplicateOperationIds}</strong></p>
              <p>Unresolved count variances: <strong className="text-[var(--app-text)]">{allTodayIssues.filter((issue) => issue.type === "count_variance").length}</strong></p>
              <p>Manager quantity overrides: <strong className="text-[var(--app-text)]">{observability.managerOverrides}</strong></p>
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-6"><DashboardWidgetGrid
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
      /></div>
    </>
  )
}
