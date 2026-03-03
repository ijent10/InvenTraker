"use client"

import Link from "next/link"
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { AppCard, appButtonClass } from "@inventracker/ui"

import { listPublicStripePlans } from "@/lib/firebase/functions"

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

function formatPlanPrice(unitAmount: number, currency: string, interval: string) {
  const amount = Number.isFinite(unitAmount) ? unitAmount / 100 : 0
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2
  }).format(amount)
  return `${formatted}/${interval}`
}

export default function PricingPage() {
  const { data: planData } = useQuery({
    queryKey: ["pricing-page-plans"],
    queryFn: async () => {
      const response = await listPublicStripePlans({})
      return response?.plans ?? []
    },
    staleTime: 60_000
  })

  const plans = useMemo(() => {
    const incoming = Array.isArray(planData) ? (planData as PublicPlan[]) : []
    return incoming
      .filter((plan) => plan.prices.length > 0)
      .map((plan) => ({ ...plan, prices: [...plan.prices].sort((a, b) => a.unitAmount - b.unitAmount) }))
      .sort((a, b) => (a.prices[0]?.unitAmount ?? Number.MAX_SAFE_INTEGER) - (b.prices[0]?.unitAmount ?? Number.MAX_SAFE_INTEGER))
  }, [planData])

  return (
    <div className="public-landing min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <Link href="/" className={appButtonClass("secondary", "mb-6 !h-9 !w-auto !px-3 !py-2")} style={{ borderColor: "#2563EB", color: "#2563EB" }}>
          ← Back
        </Link>
        <h1 className="text-4xl font-bold tracking-tight">Pricing</h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          Plans and prices are synced from Stripe. Any price update in Stripe appears here automatically.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const primaryPrice = plan.prices[0]
            if (!primaryPrice) return null
            return (
              <AppCard key={plan.productId} className="bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
                <h2 className="card-title text-slate-900">{plan.name}</h2>
                <p className="secondary-text mt-2 text-slate-600">{plan.description || "Subscription plan"}</p>
                <p className="mt-5 text-2xl font-semibold text-blue-700">
                  {formatPlanPrice(primaryPrice.unitAmount, primaryPrice.currency, primaryPrice.interval)}
                </p>
                {primaryPrice.trialPeriodDays ? (
                  <p className="mt-2 text-xs text-slate-500">{primaryPrice.trialPeriodDays}-day trial available</p>
                ) : null}
                <Link href="/signup" className={appButtonClass("primary", "mt-5")} style={{ background: "#2563EB" }}>
                  Choose {plan.name}
                </Link>
              </AppCard>
            )
          })}
        </div>

        {plans.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            No active Stripe plans found yet. Add active products/prices in Stripe and sync via the Firebase extension.
          </div>
        ) : null}
      </div>
    </div>
  )
}
