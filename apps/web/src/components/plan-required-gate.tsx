"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AppButton, AppCard } from "@inventracker/ui"

import { createCheckoutSession, listPublicStripePlans } from "@/lib/firebase/functions"

type PublicPlan = {
  productId: string
  name: string
  description: string
  active: boolean
  prices: Array<{
    priceId: string
    unitAmount: number
    currency: string
    interval: string
    intervalCount: number
    trialPeriodDays: number | null
  }>
}

type PlanRequiredGateProps = {
  orgId: string
  canManageBilling: boolean
  organizationName?: string
}

const FALLBACK_PLANS: PublicPlan[] = [
  {
    productId: "starter",
    name: "Starter",
    description: "Core inventory + expiration workflows",
    active: true,
    prices: [{ priceId: "starter-monthly", unitAmount: 4900, currency: "USD", interval: "month", intervalCount: 1, trialPeriodDays: 14 }]
  },
  {
    productId: "growth",
    name: "Growth",
    description: "Multi-store controls + richer automations",
    active: true,
    prices: [{ priceId: "growth-monthly", unitAmount: 9900, currency: "USD", interval: "month", intervalCount: 1, trialPeriodDays: 14 }]
  },
  {
    productId: "pro",
    name: "Pro",
    description: "Enterprise controls and support",
    active: true,
    prices: [{ priceId: "pro-monthly", unitAmount: 19900, currency: "USD", interval: "month", intervalCount: 1, trialPeriodDays: 14 }]
  }
]

function formatPrice(unitAmount: number, currency: string, interval: string) {
  const amount = Number.isFinite(unitAmount) ? unitAmount / 100 : 0
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2
  }).format(amount)
  return `${formatted}/${interval}`
}

export function PlanRequiredGate({ orgId, canManageBilling, organizationName }: PlanRequiredGateProps) {
  const [selectedPriceId, setSelectedPriceId] = useState("")
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const { data: planData = [] } = useQuery({
    queryKey: ["public-stripe-plans", "gate"],
    queryFn: async () => {
      const response = await listPublicStripePlans({})
      return (response?.plans ?? []) as PublicPlan[]
    },
    staleTime: 60_000,
    retry: 1
  })

  const plans = useMemo(() => {
    const valid = planData.filter((entry) => entry.active && entry.prices.length > 0)
    return valid.length ? valid : FALLBACK_PLANS
  }, [planData])

  useEffect(() => {
    if (selectedPriceId) return
    const cheapest = plans
      .flatMap((plan) => plan.prices)
      .sort((a, b) => a.unitAmount - b.unitAmount)[0]
    if (cheapest) {
      setSelectedPriceId(cheapest.priceId)
    }
  }, [plans, selectedPriceId])

  const startCheckout = async () => {
    if (!canManageBilling || !orgId || !selectedPriceId) return
    setStatusMessage(null)
    setErrorMessage(null)
    setIsBusy(true)
    try {
      const origin = window.location.origin
      const checkout = await createCheckoutSession({
        orgId,
        priceId: selectedPriceId,
        successUrl: `${origin}/billing/success?orgId=${encodeURIComponent(orgId)}`,
        cancelUrl: `${origin}/billing/cancel?orgId=${encodeURIComponent(orgId)}`
      })
      if (checkout?.url) {
        window.location.assign(checkout.url)
        return
      }
      setStatusMessage("Checkout session is still preparing. Try again in a few seconds.")
    } catch (error) {
      const message = String((error as { message?: string } | undefined)?.message ?? "")
      setErrorMessage(message || "Could not start billing checkout.")
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <div className="mb-8">
        <h1 className="page-title">Subscription required</h1>
        <p className="secondary-text mt-2">
          {organizationName ? `${organizationName} ` : "This organization "}
          does not have an active plan yet. Complete billing to unlock the workspace.
        </p>
      </div>

      <AppCard>
        <h2 className="card-title">Select a plan</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {plans.map((plan) => {
            const primaryPrice = [...plan.prices].sort((a, b) => a.unitAmount - b.unitAmount)[0]
            if (!primaryPrice) return null
            const active = selectedPriceId === primaryPrice.priceId
            return (
              <AppButton
                key={plan.productId}
                variant="secondary"
                className={`h-auto w-full justify-start rounded-2xl p-4 text-left transition ${
                  active
                    ? "!border-[color:var(--accent)] !bg-app-surface-soft !text-[color:var(--app-text)]"
                    : "!bg-app-surface-soft"
                }`}
                onClick={() => setSelectedPriceId(primaryPrice.priceId)}
                disabled={!canManageBilling}
              >
                <p className="text-sm font-semibold">{plan.name}</p>
                <p className="secondary-text mt-1">{plan.description || "Subscription plan"}</p>
                <p className="mt-3 text-lg font-semibold text-blue-400">
                  {formatPrice(primaryPrice.unitAmount, primaryPrice.currency, primaryPrice.interval)}
                </p>
              </AppButton>
            )
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {canManageBilling ? (
            <AppButton onClick={() => void startCheckout()} disabled={isBusy || !selectedPriceId}>
              {isBusy ? "Preparing checkout…" : "Continue to Billing"}
            </AppButton>
          ) : (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              You don&apos;t have billing permissions. Ask an owner/manager to activate a plan.
            </div>
          )}
        </div>
      </AppCard>

      {statusMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      ) : null}
    </div>
  )
}
