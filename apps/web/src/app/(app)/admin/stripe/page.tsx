"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AppButton, AppCard, AppCheckbox, AppInput, AppSelect, AppTextarea } from "@inventracker/ui"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchStripePlanOverrides, upsertStripePlanOverride, type StripePlanOverrideRecord } from "@/lib/data/firestore"
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

function formatPrice(amount: number, currency: string, interval: string) {
  return `${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: amount % 100 === 0 ? 0 : 2
  }).format(amount / 100)}/${interval}`
}

export default function AdminStripePage() {
  const { canViewAdmin } = useOrgContext()
  const { user } = useAuthUser()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: plans = [] } = useQuery({
    queryKey: ["admin-stripe-plans"],
    queryFn: async () => (await listPublicStripePlans({}))?.plans ?? [],
    enabled: canViewAdmin
  })

  const { data: overrides = [], refetch: refetchOverrides } = useQuery({
    queryKey: ["admin-stripe-overrides"],
    queryFn: fetchStripePlanOverrides,
    enabled: canViewAdmin
  })

  const overrideMap = useMemo(() => new Map(overrides.map((entry) => [entry.priceId, entry])), [overrides])

  const saveOverride = async (override: StripePlanOverrideRecord) => {
    if (!user?.uid) return
    setMessage(null)
    setError(null)
    try {
      await upsertStripePlanOverride(user.uid, override)
      await refetchOverrides()
      setMessage(`Saved ${override.displayName || override.productName || override.priceId}.`)
    } catch {
      setError("Could not save Stripe plan override.")
    }
  }

  if (!canViewAdmin) {
    return (
      <div>
        <PageHead title="Stripe" subtitle="Platform Admin only." />
        <AppCard>
          <p className="secondary-text">Access denied.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead title="Stripe" subtitle="Adjust plan descriptions, trial behavior, sale status, and public pricing copy." />
      <div className="space-y-4">
        {plans.map((plan) => {
          const primaryPrice = plan.prices[0]
          if (!primaryPrice) return null
          const existing = overrideMap.get(primaryPrice.priceId)
          return (
            <PlanOverrideCard
              key={primaryPrice.priceId}
              plan={plan as PublicPlan}
              existing={existing}
              onSave={saveOverride}
            />
          )
        })}
      </div>
      {message ? <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
      {error ? <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
    </div>
  )
}

function PlanOverrideCard({
  plan,
  existing,
  onSave
}: {
  plan: PublicPlan
  existing?: StripePlanOverrideRecord
  onSave: (override: StripePlanOverrideRecord) => Promise<void>
}) {
  const price = plan.prices[0] ?? {
    priceId: `${plan.productId}_default`,
    unitAmount: 0,
    currency: "USD",
    interval: "month",
    intervalCount: 1,
    trialPeriodDays: null
  }
  const [displayName, setDisplayName] = useState(existing?.displayName ?? plan.name)
  const [description, setDescription] = useState(existing?.description ?? plan.description)
  const [trialMode, setTrialMode] = useState<"none" | "fixed" | "indefinite">(existing?.trialMode ?? "none")
  const [trialDays, setTrialDays] = useState(String(existing?.trialDays ?? price.trialPeriodDays ?? 14))
  const [trialEndBehavior, setTrialEndBehavior] = useState<"halt" | "grace_2_days" | "grace_7_days">(
    existing?.trialEndBehavior ?? "halt"
  )
  const [saleEnabled, setSaleEnabled] = useState(existing?.saleEnabled ?? false)
  const [saleLabel, setSaleLabel] = useState(existing?.saleLabel ?? "On sale")

  return (
    <AppCard>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div>
          <h2 className="card-title">{plan.name}</h2>
          <p className="secondary-text mt-2">Stripe product: {plan.productId}</p>
          <p className="mt-2 text-lg font-semibold text-app-text">{formatPrice(price.unitAmount, price.currency, price.interval)}</p>
          <p className="mt-1 text-xs text-app-muted">Price ID: {price.priceId}</p>
        </div>

        <div className="grid gap-3">
          <AppInput placeholder="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          <AppTextarea
            placeholder="Public description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />

          <label className="text-sm font-semibold">Trial mode</label>
          <AppSelect value={trialMode} onChange={(event) => setTrialMode(event.target.value as "none" | "fixed" | "indefinite")}>
            <option value="none">No trial</option>
            <option value="fixed">Fixed duration</option>
            <option value="indefinite">Indefinite trial</option>
          </AppSelect>

          {trialMode === "fixed" ? (
            <AppInput
              type="number"
              min={1}
              max={90}
              placeholder="Trial days"
              value={trialDays}
              onChange={(event) => setTrialDays(event.target.value)}
            />
          ) : null}

          <label className="text-sm font-semibold">After trial ends</label>
          <AppSelect value={trialEndBehavior} onChange={(event) => setTrialEndBehavior(event.target.value as "halt" | "grace_2_days" | "grace_7_days")}>
            <option value="halt">Prompt to pay and halt services</option>
            <option value="grace_2_days">Prompt to pay + 2 day grace</option>
            <option value="grace_7_days">Prompt to pay + 7 day grace</option>
          </AppSelect>

          <AppCheckbox
            checked={saleEnabled}
            onChange={(event) => setSaleEnabled(event.target.checked)}
            label="Mark this plan as on sale"
          />
          {saleEnabled ? (
            <AppInput placeholder="Sale label" value={saleLabel} onChange={(event) => setSaleLabel(event.target.value)} />
          ) : null}

          <AppButton
            onClick={() =>
              void onSave({
                id: price.priceId,
                priceId: price.priceId,
                productId: plan.productId,
                productName: plan.name,
                displayName,
                description,
                trialMode,
                trialDays: trialMode === "fixed" ? Number(trialDays || "0") : null,
                trialEndBehavior,
                saleEnabled,
                saleLabel
              })
            }
          >
            Save Plan Settings
          </AppButton>
        </div>
      </div>
    </AppCard>
  )
}
