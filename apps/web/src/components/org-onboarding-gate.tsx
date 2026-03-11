"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { AppButton, AppCard, AppInput } from "@inventracker/ui"

import { createOrganizationWithInitialStore } from "@/lib/data/firestore"
import {
  claimOrganizationByCompanyCode,
  listPublicStripePlans
} from "@/lib/firebase/functions"

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

function formatPrice(unitAmount: number, currency: string, interval: string) {
  const amount = Number.isFinite(unitAmount) ? unitAmount / 100 : 0
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2
  }).format(amount)
  return `${formatted}/${interval}`
}

export function OrgOnboardingGate({ userId }: { userId: string }) {
  const [joinCompanyCode, setJoinCompanyCode] = useState("")
  const [joinEmployeeId, setJoinEmployeeId] = useState("")
  const [orgName, setOrgName] = useState("")
  const [storeTitle, setStoreTitle] = useState("")
  const [storeNumber, setStoreNumber] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [addressLine2, setAddressLine2] = useState("")
  const [city, setCity] = useState("")
  const [stateCode, setStateCode] = useState("")
  const [postalCode, setPostalCode] = useState("")
  const [country, setCountry] = useState("USA")
  const [selectedPriceId, setSelectedPriceId] = useState("")
  const [isBusy, setIsBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: planData } = useQuery({
    queryKey: ["public-stripe-plans"],
    queryFn: async () => {
      const response = await listPublicStripePlans({})
      return response?.plans ?? []
    },
    staleTime: 60_000
  })

  const plans = useMemo(() => {
    const incoming = Array.isArray(planData) ? (planData as PublicPlan[]) : []
    return incoming
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

  const createDisabled =
    !orgName.trim() ||
    !storeTitle.trim() ||
    !addressLine1.trim() ||
    !city.trim() ||
    !stateCode.trim() ||
    !postalCode.trim() ||
    !selectedPriceId

  const joinDisabled = !joinCompanyCode.trim() || !joinEmployeeId.trim()

  const joinOrganization = async () => {
    if (joinDisabled) return
    setErrorMessage(null)
    setStatusMessage(null)
    setIsBusy(true)
    try {
      const claimed = await claimOrganizationByCompanyCode({
        companyCode: joinCompanyCode.trim().toUpperCase(),
        employeeId: joinEmployeeId.trim()
      })
      if (!claimed?.orgId) {
        throw new Error("Could not join organization. Contact your manager.")
      }
      setStatusMessage(`Joined ${claimed.orgName}. Loading your workspace…`)
      window.location.assign("/app")
    } catch (error) {
      const message = String((error as { message?: string } | undefined)?.message ?? "")
      setErrorMessage(message || "Could not join organization.")
    } finally {
      setIsBusy(false)
    }
  }

  const createOrganization = async () => {
    if (!userId || createDisabled) return
    setErrorMessage(null)
    setStatusMessage(null)
    setIsBusy(true)
    try {
      const created = await createOrganizationWithInitialStore(userId, {
        organizationName: orgName.trim(),
        store: {
          title: storeTitle.trim(),
          storeNumber: storeNumber.trim() || undefined,
          addressLine1: addressLine1.trim(),
          addressLine2: addressLine2.trim() || undefined,
          city: city.trim(),
          state: stateCode.trim(),
          postalCode: postalCode.trim(),
          country: country.trim() || "USA"
        }
      })
      if (!created.orgId) {
        throw new Error("Could not create organization.")
      }

      window.location.assign(
        `/billing/checkout?orgId=${encodeURIComponent(created.orgId)}&priceId=${encodeURIComponent(selectedPriceId)}`
      )
    } catch (error) {
      const message = String((error as { message?: string } | undefined)?.message ?? "")
      setErrorMessage(message || "Could not create organization.")
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <div className="mb-8">
        <h1 className="page-title">Set up your workspace</h1>
        <p className="secondary-text mt-2">
          Choose a plan, then join an existing organization or create a new one. You need organization access before using InvenTraker.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <AppCard>
          <h2 className="card-title">1) Choose a plan</h2>
          <p className="secondary-text mt-2">Pricing is synced from Stripe, so updates appear here automatically.</p>
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
        </AppCard>

        <div className="space-y-4">
          <AppCard>
            <h2 className="card-title">2) Join existing organization</h2>
            <p className="secondary-text mt-2">Use your company code + employee ID.</p>
            <div className="mt-4 grid gap-3">
              <AppInput
                className="uppercase"
                placeholder="Company code"
                value={joinCompanyCode}
                onChange={(event) => setJoinCompanyCode(event.target.value.toUpperCase())}
              />
              <AppInput
                placeholder="Employee ID"
                value={joinEmployeeId}
                onChange={(event) => setJoinEmployeeId(event.target.value)}
              />
              <AppButton disabled={isBusy || joinDisabled} onClick={() => void joinOrganization()}>
                {isBusy ? "Working..." : "Join Organization"}
              </AppButton>
            </div>
          </AppCard>

          <AppCard>
            <h2 className="card-title">3) Or create a new organization</h2>
            <p className="secondary-text mt-2">Create your company and first store, then continue to billing.</p>
            <div className="mt-4 grid gap-3">
              <AppInput
                placeholder="Organization name"
                value={orgName}
                onChange={(event) => setOrgName(event.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <AppInput
                  placeholder="Store title"
                  value={storeTitle}
                  onChange={(event) => setStoreTitle(event.target.value)}
                />
                <AppInput
                  placeholder="Store number (optional)"
                  value={storeNumber}
                  onChange={(event) => setStoreNumber(event.target.value)}
                />
              </div>
              <AppInput
                placeholder="Address line 1"
                value={addressLine1}
                onChange={(event) => setAddressLine1(event.target.value)}
              />
              <AppInput
                placeholder="Address line 2 (optional)"
                value={addressLine2}
                onChange={(event) => setAddressLine2(event.target.value)}
              />
              <div className="grid grid-cols-3 gap-3">
                <AppInput
                  placeholder="City"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                />
                <AppInput
                  placeholder="State"
                  value={stateCode}
                  onChange={(event) => setStateCode(event.target.value)}
                />
                <AppInput
                  placeholder="Postal code"
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                />
              </div>
              <AppInput
                placeholder="Country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              />
              <AppButton disabled={isBusy || createDisabled || plans.length === 0} onClick={() => void createOrganization()}>
                {isBusy ? "Working..." : "Create Organization + Continue to Billing"}
              </AppButton>
            </div>
          </AppCard>
        </div>
      </div>

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
