import { AlertTriangle, BarChart3, BrainCircuit, Sparkles, TrendingUp } from "lucide-react"

import { ActionButton } from "@/components/action-button"
import { PageHeader } from "@/components/page-header"
import { Panel, StatusPill } from "@/components/ui"
import { insightCards, insightMetrics, insightRankings } from "@/lib/demo-data"

function trendTone(trend: "good" | "watch" | "risk" | "neutral") {
  if (trend === "good") return "green"
  if (trend === "risk") return "red"
  if (trend === "watch") return "amber"
  return "neutral"
}

const insightFrameworkCards = [
  { title: "Ordering recommendations", icon: TrendingUp },
  { title: "Shrink and waste alerts", icon: AlertTriangle },
  { title: "Operational scorecards", icon: BarChart3 }
]

export default function InsightsPage() {
  return (
    <>
      <PageHeader
        title="Insights"
        description="Operational signals for waste, expiration risk, out-of-stock ratio, rotation, ordering, and adaptive recommendations."
        actions={
          <ActionButton variant="secondary" doneLabel="Insights refreshed" icon={<Sparkles className="h-4 w-4" />}>
            Refresh adaptive insights
          </ActionButton>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        {insightCards.map((card) => {
          const Icon = card.icon
          return (
            <Panel key={card.title} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-400">{card.title}</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{card.value}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-400">{card.detail}</p>
            </Panel>
          )
        })}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {insightMetrics.map((metric) => (
          <Panel key={metric.label} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-400">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
              </div>
              <StatusPill tone={trendTone(metric.trend)}>{metric.trend}</StatusPill>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">{metric.detail}</p>
          </Panel>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel>
          <div className="border-b border-slate-800 px-4 py-4">
            <h2 className="font-semibold text-white">Rotation and waste rankings</h2>
            <p className="app-tip mt-1 text-sm text-slate-400">Highest-risk and highest-movement products for daily review.</p>
          </div>
          <div className="divide-y divide-slate-800">
            {insightRankings.map(([label, product, value, department]) => (
              <div key={label} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="font-semibold text-white">{label}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {product} · {department}
                  </p>
                </div>
                <StatusPill tone={label.includes("wasted") || label.includes("risk") ? "red" : "blue"}>{value}</StatusPill>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="app-tip p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Adaptive engine</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-slate-400">
                Learns repeated ordering, waste, expiration, and restock patterns so managers see the most useful signals first.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {[
              ["Waste", "Spot recurring shrink by product, department, user, and reason."],
              ["Expiration", "Prioritize items near expiration and connect them to production or markdown decisions."],
              ["Stockouts", "Track out-of-stock ratio against par, sales velocity, and backstock."],
              ["Rotation", "Find products moving fastest or sitting too long."],
              ["Ordering", "Prepare future recommendations from vendor lead time and demand signals."]
            ].map(([title, detail]) => (
              <div key={title} className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="app-tip mt-1 text-xs leading-5 text-slate-400">{detail}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="app-tip mt-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold text-white">Insight data map</h2>
            <p className="app-tip mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              Inventory movement, vendor rules, product details, waste, expiration, health checks, receiving, restocks, portions, orders,
              and history events are kept separate so adaptive recommendations can reason over them without a redesign.
            </p>
          </div>
          <StatusPill tone="blue">Expandable</StatusPill>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {insightFrameworkCards.map(({ title, icon: Icon }) => (
            <div key={title} className="rounded-md border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-blue-300" />
                <p className="font-semibold text-white">{title}</p>
              </div>
              <p className="app-tip mt-2 text-sm leading-5 text-slate-400">Built as a service boundary for future model-backed recommendations.</p>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}
