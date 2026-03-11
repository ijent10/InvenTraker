"use client"

import Link from "next/link"
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { AppCard, IconTile, appButtonClass } from "@inventracker/ui"
import {
  ArrowRight,
  Barcode,
  BookOpenText,
  CheckCircle2,
  ChartColumn,
  ClipboardCheck,
  Clock3,
  Factory,
  Shield,
  ShoppingCart,
  Store,
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

const outcomes = [
  {
    title: "Cut avoidable waste",
    desc: "Catch expiring product earlier and act before it becomes shrink."
  },
  {
    title: "Keep teams consistent",
    desc: "Standardize prep and quality with role-based checklists and how-to guides."
  },
  {
    title: "Order with confidence",
    desc: "Use current stock and trends to place cleaner, more accurate orders."
  },
  {
    title: "Run every store cleaner",
    desc: "Give managers a clear daily playbook instead of scattered spreadsheets."
  }
]

const rolloutSteps = [
  {
    title: "1. Set up your operation",
    desc: "Create your organization, stores, roles, and product catalog in one place."
  },
  {
    title: "2. Start daily workflows",
    desc: "Run spot checks, expiration, transfers, receiving, and waste with clear prompts."
  },
  {
    title: "3. Improve week by week",
    desc: "Use insights and health check history to tighten process and reduce misses."
  }
]

const firstWeekChecklist = [
  "Import your core inventory list and assign departments",
  "Set minimums, expirations, and role permissions",
  "Launch barcode-first spot checks with your team",
  "Turn on health checks for daily operational standards",
  "Review waste + expiration trends and adjust ordering"
]

const buyerQuestions = [
  {
    q: "Will my team actually use it?",
    a: "Yes. The workflow is designed for non-technical users: scan, verify, and move on."
  },
  {
    q: "Can we run multiple stores?",
    a: "Yes. Each store is isolated for quantities and daily operations, with org-level oversight where needed."
  },
  {
    q: "Can we customize permissions?",
    a: "Yes. Control access by role, department, and store so people only see what they should."
  }
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
        <header className="mb-14 text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
            <Shield className="h-3.5 w-3.5" />
            Built for fast-moving store teams
          </p>
          <h1 className="text-5xl font-bold tracking-tight text-slate-900 md:text-6xl">InvenTraker</h1>
          <p className="mx-auto mt-5 max-w-3xl text-lg text-slate-600">
            Keep inventory accurate, reduce waste, and make daily operations easier across every store.
            Barcode-first workflows, clean accountability, and better decisions without extra complexity.
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
          <div className="mt-6 flex flex-wrap justify-center gap-5 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
              Fast team onboarding
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
              Multi-store ready
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
              Role-based control
            </span>
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

        <section className="mt-14">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-slate-900">Why teams switch to InvenTraker</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {outcomes.map((item) => (
              <AppCard key={item.title} className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
                <h3 className="card-title text-slate-900">{item.title}</h3>
                <p className="secondary-text mt-2 text-slate-600">{item.desc}</p>
              </AppCard>
            ))}
          </div>
        </section>

        <section className="mt-14 grid gap-4 md:grid-cols-3">
          {rolloutSteps.map((step) => (
            <AppCard key={step.title} className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
              <h3 className="card-title text-slate-900">{step.title}</h3>
              <p className="secondary-text mt-2 text-slate-600">{step.desc}</p>
            </AppCard>
          ))}
        </section>

        <section className="mt-14 grid gap-4 md:grid-cols-2">
          <AppCard className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
            <h3 className="card-title text-slate-900">Offline-first mobile workflow</h3>
            <p className="secondary-text mt-2 text-slate-600">
              Teams can keep moving even with weak connection. Data syncs when online so operations stay reliable.
            </p>
          </AppCard>
          <AppCard className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
            <h3 className="card-title text-slate-900">Built for store execution</h3>
            <p className="secondary-text mt-2 text-slate-600">Receiving, transfers, waste, expiration, orders, and health checks all connect in one daily flow.</p>
          </AppCard>
        </section>

        <section className="mt-14 grid gap-4 md:grid-cols-2">
          <AppCard className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
            <div className="mb-2 flex items-center gap-2">
              <IconTile icon={ClipboardCheck} color="#2563EB" />
              <h3 className="card-title text-slate-900">What you can launch in week one</h3>
            </div>
            <ul className="mt-3 space-y-2">
              {firstWeekChecklist.map((row) => (
                <li key={row} className="secondary-text flex items-start gap-2 text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <span>{row}</span>
                </li>
              ))}
            </ul>
          </AppCard>
          <AppCard className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
            <div className="mb-2 flex items-center gap-2">
              <IconTile icon={Store} color="#2563EB" />
              <h3 className="card-title text-slate-900">Made for organizations and stores</h3>
            </div>
            <p className="secondary-text mt-2 text-slate-600">
              Organization leaders set standards once. Store teams execute cleanly with the right permissions and local accountability.
            </p>
            <Link href="/signup" className={appButtonClass("primary", "mt-5")} style={{ background: "#2563EB" }}>
              Create account
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </AppCard>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => {
            const primaryPrice = plan.prices[0]
            if (!primaryPrice) return null
            return (
              <AppCard key={plan.productId} className="flex min-h-[236px] flex-col bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
                <h3 className="card-title text-slate-900">{plan.name}</h3>
                <p className="secondary-text mt-2 line-clamp-3 text-slate-600">{plan.description || "Subscription plan"}</p>
                <p className="mt-6 text-3xl font-semibold text-blue-700">
                  {formatPlanPrice(primaryPrice.unitAmount, primaryPrice.currency, primaryPrice.interval)}
                </p>
                <Link href="/signup" className={appButtonClass("primary", "mt-auto")} style={{ background: "#2563EB" }}>
                  Start with {plan.name}
                </Link>
              </AppCard>
            )
          })}
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold text-slate-900">Questions teams ask before they start</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {buyerQuestions.map((row) => (
              <AppCard key={row.q} className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
                <h3 className="card-title text-slate-900">{row.q}</h3>
                <p className="secondary-text mt-2 text-slate-600">{row.a}</p>
              </AppCard>
            ))}
          </div>
        </section>

        <section className="mt-14 rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Run a cleaner operation with less guesswork</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            Set your standards, launch your workflows, and give every team member clear daily actions.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className={appButtonClass("primary")} style={{ background: "#2563EB" }}>
              Start now
            </Link>
            <Link href="/pricing" className={appButtonClass("secondary")} style={{ borderColor: "#2563EB", color: "#2563EB" }}>
              Compare plans
            </Link>
          </div>
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
