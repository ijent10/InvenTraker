import { ArrowRight, ClipboardCheck } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Panel, StatusPill } from "@/components/ui"
import { activity, inventoryItems, metrics, orderDrafts } from "@/lib/demo-data"

export default function DashboardPage() {
  const lowStock = inventoryItems.filter((item) => item.onHand <= item.reorderPoint)

  return (
    <>
      <PageHeader
        title="Operations dashboard"
        description="A clean rebuild focused on inventory, ordering, product data, and vendor workflows."
        actions={
          <button className="h-10 rounded-md border border-blue-500 bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500">
            New count
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon
          return (
            <Panel key={metric.label} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-400">{metric.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{metric.value}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-400">{metric.delta}</p>
            </Panel>
          )
        })}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Panel>
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
            <div>
              <h2 className="font-semibold text-white">Priority work</h2>
              <p className="mt-1 text-sm text-slate-400">Items and orders that need attention first.</p>
            </div>
            <ClipboardCheck className="h-5 w-5 text-emerald-300" />
          </div>
          <div className="divide-y divide-slate-800">
            {lowStock.map((item) => (
              <div key={item.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="font-medium text-white">{item.name}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {item.department} · {item.location}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill tone="amber">{item.onHand} on hand</StatusPill>
                  <ArrowRight className="h-4 w-4 text-slate-500" />
                </div>
              </div>
            ))}
            {orderDrafts.map((order) => (
              <div key={order.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="font-medium text-white">{order.vendor}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {order.items} items · {order.dueBy}
                  </p>
                </div>
                <StatusPill tone={order.status === "Ready" ? "green" : "neutral"}>{order.status}</StatusPill>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="border-b border-slate-800 px-4 py-4">
            <h2 className="font-semibold text-white">Recent activity</h2>
            <p className="mt-1 text-sm text-slate-400">A lightweight event feed for the new database.</p>
          </div>
          <div className="space-y-1 p-3">
            {activity.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="flex gap-3 rounded-md px-3 py-3 hover:bg-slate-800/60">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-800 text-slate-300">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{item.label}</p>
                    <p className="mt-1 text-sm text-slate-400">{item.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>
    </>
  )
}
