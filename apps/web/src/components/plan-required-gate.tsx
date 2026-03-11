"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AppButton, AppCard } from "@inventracker/ui"

import { listPublicStripePlans } from "@/lib/firebase/functions"

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
    return planData
      .filter((entry) => entry.active && entry.prices.length > 0)
      .map((entry) => ({
        ...entry,
        prices: entry.prices.filter((price) => {
          const id = String(price.priceId ?? "").trim()
          return id.startsWith("price_") || id.startsWith("prod_")
        })
      }))
      .filter((entry) => entry.prices.length > 0)
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
      window.location.assign(
        `/billing/checkout?orgId=${encodeURIComponent(orgId)}&priceId=${encodeURIComponent(selectedPriceId)}`
      )
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
        {plans.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Stripe plans are not available yet. Verify active recurring prices in Stripe, then refresh this page.
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {plans.map((plan) => {
            const primaryPrice = [...plan.prices].sort((a, b) => a.unitAmount - b.unitAmount)[0]
            if (!primaryPrice) return null
            const active = selectedPriceId === primaryPrice.priceId
            return (
              <AppButton
                key={plan.productId}
                type="button"
                variant="secondary"
                className={`!h-auto flex min-h-[152px] w-full flex-col items-start justify-between rounded-2xl border p-4 text-left transition ${
                  active
                    ? "border-[color:var(--accent)] bg-app-surface-soft text-[color:var(--app-text)]"
                    : "border-app-border bg-app-surface-soft text-[color:var(--app-text)]"
                }`}
                onClick={() => setSelectedPriceId(primaryPrice.priceId)}
                disabled={!canManageBilling}
              >
                <p className="text-base font-semibold">{plan.name}</p>
                <p className="secondary-text mt-2 line-clamp-2">{plan.description || "Subscription plan"}</p>
                <p className="mt-4 text-xl font-semibold text-blue-400">
                  {formatPrice(primaryPrice.unitAmount, primaryPrice.currency, primaryPrice.interval)}
                </p>
              </AppButton>
            )
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {canManageBilling ? (
            <AppButton onClick={() => void startCheckout()} disabled={isBusy || !selectedPriceId || plans.length === 0}>
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
