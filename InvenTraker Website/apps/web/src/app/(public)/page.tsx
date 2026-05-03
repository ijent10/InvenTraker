"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AppButton, AppCard, IconTile, appButtonClass } from "@inventracker/ui"
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

const operationFlow = [
  {
    title: "1. Scan + capture",
    desc: "Run spot checks, receiving, and waste in seconds with barcode-first workflows."
  },
  {
    title: "2. Analyze risk",
    desc: "See expiring inventory, waste patterns, and demand signals in one operational view."
  },
  {
    title: "3. Take action",
    desc: "Apply order and production recommendations before shrink compounds."
  },
  {
    title: "4. Improve weekly",
    desc: "Use health checks and insights to tighten execution store by store."
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

const webShowcaseScreens = [
  {
    src: "/showcase/dashboard.png",
    alt: "InvenTraker dashboard overview with module cards",
    title: "Dashboard",
    description: "A clear daily workflow layout across inventory, orders, waste, and production."
  },
  {
    src: "/showcase/spot-check.png",
    alt: "Spot check history and export preview screen",
    title: "Spot Check",
    description: "Count history, variance review, and barcode-ready export in one place."
  },
  {
    src: "/showcase/health-checks.png",
    alt: "Health checks form builder screen",
    title: "Health Checks",
    description: "Build role-based forms and review completion history across stores."
  },
  {
    src: "/showcase/notifications.png",
    alt: "Notifications composer screen",
    title: "Notifications",
    description: "Send immediate or scheduled operational alerts to selected roles."
  },
  {
    src: "/showcase/insights.png",
    alt: "Insights screen with inventory and waste metrics",
    title: "Insights",
    description: "Track inventory health, waste cost, overstock, and expiring value."
  },
  {
    src: "/showcase/production.png",
    alt: "Production setup and recommendation screen",
    title: "Production",
    description: "Configure formulas and review make + frozen pull recommendations."
  },
  {
    src: "/showcase/howto-guide.png",
    alt: "How-to guide editor with step blocks",
    title: "How-To Library",
    description: "Author SOPs with step blocks, media, and PDF-assisted drafting."
  },
  {
    src: "/showcase/stores.png",
    alt: "Stores management screen",
    title: "Stores",
    description: "Create stores, manage addresses, and keep organization structure tidy."
  }
]

const mobileShowcaseScreens = [
  { src: "/showcase/mobile-home.png", alt: "InvenTraker mobile home dashboard" },
  { src: "/showcase/mobile-spot-check.png", alt: "InvenTraker mobile spot check screen" },
  { src: "/showcase/mobile-waste.png", alt: "InvenTraker mobile waste scan screen" },
  { src: "/showcase/mobile-generate-order.png", alt: "InvenTraker mobile generate order screen" },
  { src: "/showcase/mobile-chop-items.png", alt: "InvenTraker mobile chop items screen" },
  { src: "/showcase/mobile-waste-types.png", alt: "InvenTraker mobile waste types settings" },
  { src: "/showcase/mobile-orders.png", alt: "InvenTraker mobile orders screen" },
  { src: "/showcase/mobile-production.png", alt: "InvenTraker mobile production screen" }
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

const brandNavy = "#1d3f7d"
const brandBlue = "#2f67b7"
const brandGreen = "#0f9f7a"
const brandAmber = "#f2b84b"

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
  const [expandedImage, setExpandedImage] = useState<{
    src: string
    alt: string
    title?: string
    description?: string
  } | null>(null)

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

  useEffect(() => {
    if (!expandedImage) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpandedImage(null)
      }
    }
    const priorOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = priorOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [expandedImage])

  return (
    <div className="public-landing min-h-screen bg-[#f7faff] text-slate-900">
      <section className="relative min-h-[78vh] overflow-hidden text-white" style={{ backgroundColor: brandNavy }}>
        <img
          src="/inventracker-logo.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-[#102a61]/70" />
        <div className="relative z-10 mx-auto flex min-h-[78vh] max-w-6xl flex-col px-6 py-5">
          <nav className="flex items-center justify-between gap-4">
            <Link href="/" className="inline-flex items-center gap-3 text-base font-semibold text-white">
              <img src="/inventracker-logo.png" alt="" className="h-10 w-10 rounded-xl border border-white/20 object-cover" />
              InvenTraker
            </Link>
            <div className="flex flex-wrap justify-end gap-2">
              <Link href="/signin" className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
                Sign in
              </Link>
              <Link href="/signup" className="rounded-full bg-white px-4 py-2 text-sm font-semibold transition hover:bg-blue-50" style={{ color: brandNavy }}>
                Create account
              </Link>
            </div>
          </nav>

          <div className="flex flex-1 flex-col justify-center py-12">
            <p className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-semibold text-blue-50 backdrop-blur">
              <Shield className="h-3.5 w-3.5" />
              Built for fast-moving store teams
            </p>
            <h1 className="max-w-3xl text-5xl font-bold leading-[1.04] md:text-7xl">InvenTraker</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-blue-50 md:text-xl">
              Keep inventory accurate, reduce waste, and make daily operations easier across every store.
              Barcode-first workflows, clean accountability, and better decisions without extra complexity.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-full bg-white px-5 py-3 text-sm font-semibold transition hover:bg-blue-50" style={{ color: brandNavy }}>
                Create account
              </Link>
              <Link href="/pricing" className="rounded-full border border-white/35 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15">
                View pricing
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-4 text-sm text-blue-50">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-[#9be6cf]" />
                Fast team onboarding
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-[#9be6cf]" />
                Multi-store ready
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-[#9be6cf]" />
                Role-based control
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="relative mx-auto max-w-6xl px-6 py-14">

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <AppCard key={feature.title} className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
              <div className="mb-3 flex items-center gap-3">
                <IconTile icon={feature.icon} color={brandBlue} />
                <h2 className="card-title text-slate-900">{feature.title}</h2>
              </div>
              <p className="secondary-text text-slate-600">{feature.desc}</p>
            </AppCard>
          ))}
        </section>

        <section className="mt-14 grid gap-4 lg:grid-cols-3">
          <AppCard className="bg-white lg:col-span-2 !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
            <h2 className="text-2xl font-semibold text-slate-900">How the flow works</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              One simple loop for teams: capture what happened, surface risk, act early, and improve continuously.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {operationFlow.map((step) => (
                <div key={step.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                  <p className="secondary-text mt-1 text-slate-600">{step.desc}</p>
                </div>
              ))}
            </div>
          </AppCard>
          <AppCard className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
            <p className="text-xs font-semibold uppercase" style={{ color: brandGreen }}>Estimated impact</p>
            <p className="mt-3 text-4xl font-semibold" style={{ color: brandAmber }}>12% - 28%</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Potential waste reduction</p>
            <p className="secondary-text mt-3 text-slate-600">
              Teams that consistently run spot checks, expiration reviews, and guided ordering can typically reduce avoidable
              waste in this range over the first 90 days.
            </p>
          </AppCard>
        </section>

        <section className="mt-14">
          <div className="mb-5">
            <h2 className="text-2xl font-semibold text-slate-900">See the Screens Before You Start</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              A quick look at the actual web and mobile workflows your team will use daily.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {webShowcaseScreens.map((screen) => (
              <AppCard key={screen.src} className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
                <AppButton
                  variant="secondary"
                  className="group !h-auto !w-full !cursor-zoom-in !rounded-2xl !border-slate-200 !bg-slate-50 !p-2 !text-left transition hover:!border-blue-300"
                  onClick={() => setExpandedImage(screen)}
                >
                  <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-slate-950">
                    <img
                      src={screen.src}
                      alt={screen.alt}
                      loading="lazy"
                      className="h-full w-full object-contain transition duration-200 group-hover:scale-[1.01]"
                    />
                  </div>
                </AppButton>
                <h3 className="mt-3 text-lg font-semibold text-slate-900">{screen.title}</h3>
                <p className="secondary-text mt-1 text-slate-600">{screen.description}</p>
                <p className="mt-2 text-xs font-medium" style={{ color: brandBlue }}>Click image to expand</p>
              </AppCard>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Mobile app walkthrough</p>
            <p className="mt-1 text-xs text-slate-600">
              Barcode-first workflows for spot check, waste, production, and daily execution.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {mobileShowcaseScreens.map((screen) => (
                <AppButton
                  key={screen.src}
                  variant="secondary"
                  type="button"
                  className="group !h-auto !rounded-2xl !border-slate-200 !bg-white !p-2 !text-left transition hover:!border-blue-300"
                  onClick={() => setExpandedImage(screen)}
                >
                  <div className="relative mx-auto aspect-[9/19] w-full max-w-[220px] overflow-hidden rounded-[22px] bg-slate-950">
                    <img
                      src={screen.src}
                      alt={screen.alt}
                      loading="lazy"
                      className="h-full w-full object-contain transition duration-200 group-hover:scale-[1.01]"
                    />
                  </div>
                </AppButton>
              ))}
            </div>
            <p className="mt-3 text-xs font-medium" style={{ color: brandBlue }}>Click any screenshot to expand</p>
          </div>
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
              <IconTile icon={ClipboardCheck} color={brandGreen} />
              <h3 className="card-title text-slate-900">What you can launch in week one</h3>
            </div>
            <ul className="mt-3 space-y-2">
              {firstWeekChecklist.map((row) => (
                <li key={row} className="secondary-text flex items-start gap-2 text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: brandGreen }} />
                  <span>{row}</span>
                </li>
              ))}
            </ul>
          </AppCard>
          <AppCard className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
            <div className="mb-2 flex items-center gap-2">
              <IconTile icon={Store} color={brandBlue} />
              <h3 className="card-title text-slate-900">Made for organizations and stores</h3>
            </div>
            <p className="secondary-text mt-2 text-slate-600">
              Organization leaders set standards once. Store teams execute cleanly with the right permissions and local accountability.
            </p>
            <Link href="/signup" className={appButtonClass("primary", "mt-5")} style={{ background: brandBlue }}>
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
                <p className="mt-6 text-3xl font-semibold" style={{ color: brandBlue }}>
                  {formatPlanPrice(primaryPrice.unitAmount, primaryPrice.currency, primaryPrice.interval)}
                </p>
                <Link href="/signup" className={appButtonClass("primary", "mt-auto")} style={{ background: brandBlue }}>
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
          <h2 className="text-3xl font-semibold text-slate-900">Run a cleaner operation with less guesswork</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            Set your standards, launch your workflows, and give every team member clear daily actions.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className={appButtonClass("primary")} style={{ background: brandBlue }}>
              Start now
            </Link>
            <Link href="/pricing" className={appButtonClass("secondary")} style={{ borderColor: brandBlue, color: brandBlue }}>
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

      {expandedImage ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4"
          onClick={() => setExpandedImage(null)}
        >
          <div
            className="w-full max-w-6xl rounded-3xl border border-slate-700 bg-slate-950 p-4 md:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{expandedImage.title ?? "Screenshot Preview"}</p>
                {expandedImage.description ? (
                  <p className="mt-1 text-xs text-slate-300">{expandedImage.description}</p>
                ) : null}
              </div>
              <AppButton
                variant="secondary"
                type="button"
                className="!h-auto !rounded-xl !border-slate-600 !px-3 !py-1.5 !text-sm !font-medium !text-slate-200 transition hover:!border-slate-400 hover:!text-white"
                onClick={() => setExpandedImage(null)}
              >
                Close
              </AppButton>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-700 bg-black/70">
              <img
                src={expandedImage.src}
                alt={expandedImage.alt}
                className="mx-auto max-h-[78vh] h-auto w-full object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
