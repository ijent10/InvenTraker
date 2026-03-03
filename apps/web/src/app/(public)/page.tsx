"use client"

import Link from "next/link"
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { AppCard, IconTile, appButtonClass } from "@inventracker/ui"
import {
  Barcode,
  BookOpenText,
  ChartColumn,
  Clock3,
  Factory,
  ShieldCheck,
  ShoppingCart,
  Trash2
} from "lucide-react"

import { listPublicStripePlans } from "@/lib/firebase/functions"

const features = [
  { title: "Spot Check", desc: "Barcode-first counting with batch expirations and variance tracking.", icon: Barcode },
  { title: "Expiration", desc: "Surface near-dated product value before it turns into waste.", icon: Clock3 },
  { title: "Waste", desc: "Capture spoilage with reasons, costs, and accountable audit trails.", icon: Trash2 },
  { title: "Orders", desc: "Generate vendor-ready order suggestions from live stock and min levels.", icon: ShoppingCart },
  { title: "Insights", desc: "Operational + financial snapshots that are actually usable in-store.", icon: ChartColumn },
  { title: "Production", desc: "Plan daily prep, pull forecasts, and ingredient demand by trend.", icon: Factory },
  { title: "How-To Library", desc: "Searchable SOP guides with step content and media.", icon: BookOpenText }
]

type PublicPlan = {
  productId: string
  name: string
  description: string
  prices: Array<{
    priceId: string
    unitAmount: number
    currency: string
    interval: string
    intervalCount: number
    trialPeriodDays: number | null
  }>
}

const fallbackPlans: PublicPlan[] = [
  {
    productId: "starter",
    name: "Starter",
    description: "Ideal for a single location launching barcode-first workflows.",
    prices: [{ priceId: "starter-monthly", unitAmount: 4900, currency: "USD", interval: "month", intervalCount: 1, trialPeriodDays: 14 }]
  },
  {
    productId: "growth",
    name: "Growth",
    description: "Multi-store controls with deeper role permissions and automation.",
    prices: [{ priceId: "growth-monthly", unitAmount: 9900, currency: "USD", interval: "month", intervalCount: 1, trialPeriodDays: 14 }]
  },
  {
    productId: "pro",
    name: "Pro",
    description: "Advanced enterprise operations with admin controls and robust analytics.",
    prices: [{ priceId: "pro-monthly", unitAmount: 19900, currency: "USD", interval: "month", intervalCount: 1, trialPeriodDays: 14 }]
  }
]

function formatPlanPrice(unitAmount: number, currency: string, interval: string) {
  const amount = Number.isFinite(unitAmount) ? unitAmount / 100 : 0
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2
  }).format(amount)
  return `${formatted}/${interval}`
}

export default function LandingPage() {
  const { data: planData } = useQuery({
    queryKey: ["public-pricing-plans"],
    queryFn: async () => {
      const response = await listPublicStripePlans({})
      return response?.plans ?? []
    },
    staleTime: 60_000
  })

  const plans = useMemo(() => {
    const incoming = Array.isArray(planData) ? (planData as PublicPlan[]) : []
    const filtered = incoming
      .filter((plan) => plan.prices.length > 0)
      .map((plan) => ({
        ...plan,
        prices: [...plan.prices].sort((a, b) => a.unitAmount - b.unitAmount)
      }))
      .sort((a, b) => (a.prices[0]?.unitAmount ?? Number.MAX_SAFE_INTEGER) - (b.prices[0]?.unitAmount ?? Number.MAX_SAFE_INTEGER))
    return filtered.length ? filtered : fallbackPlans
  }, [planData])

  return (
    <div className="public-landing min-h-screen bg-white text-slate-900">
      <div className="relative mx-auto max-w-6xl px-6 py-16">
        <header className="mb-16 text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            Secure inventory + billing workflows
          </p>
          <h1 className="text-5xl font-bold tracking-tight text-slate-900 md:text-6xl">InvenTraker</h1>
          <p className="mx-auto mt-5 max-w-3xl text-lg text-slate-600">
            Fast barcode-first inventory, expirations, waste, ordering, insights. Built for teams that need speed without losing control.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signin" className={appButtonClass("primary")} style={{ background: "#2563EB" }}>
              Sign in
            </Link>
            <Link href="/signup" className={appButtonClass("secondary")} style={{ borderColor: "#2563EB", color: "#2563EB" }}>
              Create account
            </Link>
            <Link href="/pricing" className={appButtonClass("secondary")} style={{ borderColor: "#93C5FD", color: "#1D4ED8" }}>
              View pricing
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <AppCard key={feature.title} className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
              <div className="mb-3 flex items-center gap-3">
                <IconTile icon={feature.icon} color="#2563EB" />
                <h2 className="card-title text-slate-900">{feature.title}</h2>
              </div>
              <p className="secondary-text text-slate-600">{feature.desc}</p>
            </AppCard>
          ))}
        </section>

        <section className="mt-14 grid gap-4 md:grid-cols-2">
          <AppCard className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
            <h3 className="card-title text-slate-900">Offline-first on mobile</h3>
            <p className="secondary-text mt-2 text-slate-600">
              iOS stays fast with local data caching, then syncs changes when online. Web reflects updates in near real time.
            </p>
          </AppCard>
          <AppCard className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
            <h3 className="card-title text-slate-900">Live Stripe pricing</h3>
            <p className="secondary-text mt-2 text-slate-600">
              Plan prices below are loaded from Stripe products/prices, so promotional pricing stays current automatically.
            </p>
          </AppCard>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const primaryPrice = plan.prices[0]
            if (!primaryPrice) return null
            return (
              <AppCard key={plan.productId} className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
                <h3 className="card-title text-slate-900">{plan.name}</h3>
                <p className="secondary-text mt-2 text-slate-600">{plan.description || "Subscription plan"}</p>
                <p className="mt-5 text-2xl font-semibold text-blue-700">
                  {formatPlanPrice(primaryPrice.unitAmount, primaryPrice.currency, primaryPrice.interval)}
                </p>
                <Link href="/signup" className={appButtonClass("primary", "mt-5")} style={{ background: "#2563EB" }}>
                  Start with {plan.name}
                </Link>
              </AppCard>
            )
          })}
        </section>

        <footer className="mt-14 flex flex-wrap justify-center gap-6 text-sm text-slate-500">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/contact">Contact</Link>
        </footer>
      </div>
    </div>
  )
}
