"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js"
import type { Stripe } from "@stripe/stripe-js"
import { loadStripe } from "@stripe/stripe-js"
import { AppButton, AppCard, appButtonClass } from "@inventracker/ui"

import { createCheckoutSession, createEmbeddedCheckoutSession, listPublicStripePlans } from "@/lib/firebase/functions"

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

function CheckoutContent() {
  const searchParams = useSearchParams()
  const orgId = useMemo(() => (searchParams.get("orgId") ?? "").trim(), [searchParams])
  const priceId = useMemo(() => (searchParams.get("priceId") ?? "").trim(), [searchParams])
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [isHostedFallbackBusy, setIsHostedFallbackBusy] = useState(false)
  const [isPreparingSession, setIsPreparingSession] = useState(true)
  const [stripeReady, setStripeReady] = useState(false)
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null)
  const [embeddedClientSecret, setEmbeddedClientSecret] = useState<string | null>(null)

  const publishableKey = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").trim()
  const { data: publicPlans = [] } = useQuery({
    queryKey: ["checkout-plan-summary"],
    queryFn: async () => {
      const response = await listPublicStripePlans({})
      return (response?.plans ?? []) as PublicPlan[]
    },
    staleTime: 60_000
  })

  const selectedPlan = useMemo(() => {
    for (const plan of publicPlans) {
      const directProductMatch = plan.productId === priceId
      const matchedPrice = plan.prices.find((entry) => entry.priceId === priceId)
      if (directProductMatch || matchedPrice) {
        return {
          name: plan.name,
          description: plan.description,
          price: matchedPrice ? formatPlanPrice(matchedPrice.unitAmount, matchedPrice.currency, matchedPrice.interval) : null
        }
      }
    }
    return null
  }, [publicPlans, priceId])

  useEffect(() => {
    setStripeReady(false)
    if (!publishableKey) {
      setStripePromise(null)
      return
    }

    const safeStripePromise = loadStripe(publishableKey)
      .then((stripe) => {
        if (!stripe) {
          setError("Failed to load Stripe.js. Use hosted checkout instead.")
          return null
        }
        setStripeReady(true)
        return stripe
      })
      .catch(() => {
        setError("Failed to load Stripe.js. Use hosted checkout instead.")
        return null
      })

    setStripePromise(safeStripePromise)
  }, [publishableKey])

  const startHostedCheckout = useCallback(async () => {
    if (!orgId || !priceId) return
    const origin = window.location.origin
    setIsHostedFallbackBusy(true)
    setError(null)
    try {
      const successUrl =
        `${origin}/billing/success?orgId=${encodeURIComponent(orgId)}&session_id={CHECKOUT_SESSION_ID}`
      const cancelUrl =
        `${origin}/billing/checkout?orgId=${encodeURIComponent(orgId)}&priceId=${encodeURIComponent(priceId)}`
      const response = await createCheckoutSession({
        orgId,
        priceId,
        successUrl,
        cancelUrl
      })
      if (response?.url) {
        window.location.assign(response.url)
        return
      }
      throw new Error("Hosted checkout is not ready yet.")
    } catch (checkoutError) {
      const message =
        String((checkoutError as { message?: string } | undefined)?.message ?? "").trim() ||
        "Could not open hosted checkout."
      setError(message)
    } finally {
      setIsHostedFallbackBusy(false)
    }
  }, [orgId, priceId])

  useEffect(() => {
    let cancelled = false

    const prepare = async () => {
      if (!orgId || !priceId || !publishableKey || !stripeReady) {
        setIsPreparingSession(false)
        return
      }

      setIsPreparingSession(true)
      setError(null)
      setInfo(null)

      try {
        const origin = window.location.origin
        const returnUrl =
          `${origin}/billing/success?orgId=${encodeURIComponent(orgId)}&session_id={CHECKOUT_SESSION_ID}`

        const response = await createEmbeddedCheckoutSession({
          orgId,
          priceId,
          returnUrl
        })

        if (cancelled) return

        if (response?.clientSecret) {
          setEmbeddedClientSecret(response.clientSecret)
          setIsPreparingSession(false)
          return
        }

        if (response?.url) {
          window.location.assign(response.url)
          return
        }

        setInfo("Embedded checkout not ready yet. Redirecting to hosted checkout…")
        await startHostedCheckout()
      } catch (sessionError) {
        if (cancelled) return
        const message =
          String((sessionError as { message?: string } | undefined)?.message ?? "").trim() ||
          "Embedded checkout failed to initialize."
        setError(message)
        setInfo("Redirecting to hosted checkout…")
        await startHostedCheckout()
      } finally {
        if (!cancelled) {
          setIsPreparingSession(false)
        }
      }
    }

    void prepare()

    return () => {
      cancelled = true
    }
  }, [orgId, priceId, publishableKey, stripeReady, startHostedCheckout])

  if (!orgId || !priceId) {
    return (
      <AppCard>
        <h1 className="page-title">Checkout unavailable</h1>
        <p className="secondary-text mt-3">Missing organization or selected plan. Start again from onboarding.</p>
        <div className="mt-6 flex gap-3">
          <Link href="/app" className={appButtonClass("primary")}>
            Return to App
          </Link>
          <Link href="/pricing" className={appButtonClass("secondary")}>
            View Pricing
          </Link>
        </div>
      </AppCard>
    )
  }

  if (!publishableKey || !stripePromise) {
    return (
      <AppCard>
        <h1 className="page-title">Stripe not configured</h1>
        <p className="secondary-text mt-3">
          Missing <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> in web environment.
        </p>
      </AppCard>
    )
  }

  if (error && !stripeReady) {
    return (
      <AppCard>
        <h1 className="page-title">Complete Billing</h1>
        <p className="secondary-text mt-3">Embedded checkout is unavailable right now.</p>
        <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <AppButton
            type="button"
            disabled={isHostedFallbackBusy}
            onClick={() => void startHostedCheckout()}
          >
            {isHostedFallbackBusy ? "Opening checkout…" : "Use Hosted Checkout"}
          </AppButton>
          <Link href="/pricing" className={appButtonClass("secondary")}>
            Back to Pricing
          </Link>
        </div>
      </AppCard>
    )
  }

  return (
    <div className="grid w-full gap-5 lg:grid-cols-[360px_1fr]">
      <AppCard className="h-fit">
        <h1 className="page-title">Complete Billing</h1>
        <p className="secondary-text mt-3">
          Secure checkout for your workspace subscription.
        </p>

        <div className="mt-5 space-y-3 rounded-2xl border border-app-border bg-app-surface-soft p-4">
          <p className="text-xs uppercase tracking-wide text-app-muted">Selected plan</p>
          <p className="text-lg font-semibold text-[color:var(--app-text)]">
            {selectedPlan?.name ?? "Subscription"}
          </p>
          {selectedPlan?.price ? (
            <p className="text-sm font-medium text-blue-300">{selectedPlan.price}</p>
          ) : null}
          {selectedPlan?.description ? (
            <p className="text-sm text-app-muted">{selectedPlan.description}</p>
          ) : null}
        </div>

        <div className="mt-5 space-y-2 text-sm text-app-muted">
          <p>• Payment is processed securely by Stripe.</p>
          <p>• Card details are never stored by InvenTraker.</p>
          <p>• You can manage or cancel billing later in settings.</p>
        </div>

        <div className="mt-6">
          <Link href="/pricing" className={appButtonClass("secondary")}>
            Back to Pricing
          </Link>
        </div>
      </AppCard>

      <AppCard className="min-h-[720px]">
        {info ? (
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
            {info}
          </div>
        ) : null}
        {error ? (
          <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <div className={`${info || error ? "mt-4" : ""}`}>
          {!stripeReady || isPreparingSession || !embeddedClientSecret ? (
            <div className="secondary-text rounded-2xl border border-app-border bg-app-surface-soft px-4 py-3">
              Preparing secure payment form…
            </div>
          ) : null}
          {embeddedClientSecret ? (
            <EmbeddedCheckoutProvider
              stripe={stripePromise}
              options={{
                clientSecret: embeddedClientSecret
              }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          ) : null}
        </div>
      </AppCard>
    </div>
  )
}

export default function BillingCheckoutPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-16">
      <Suspense
        fallback={
          <AppCard>
            <h1 className="page-title">Preparing Checkout…</h1>
            <p className="secondary-text mt-3">Loading secure payment form.</p>
          </AppCard>
        }
      >
        <CheckoutContent />
      </Suspense>
    </div>
  )
}
