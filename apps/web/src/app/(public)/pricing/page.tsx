"use client"

import Link from "next/link"
import Script from "next/script"
import { createElement } from "react"
import { appButtonClass } from "@inventracker/ui"

const STRIPE_PRICING_TABLE_ID = "prctbl_1T9FqBHPu7BwMUiqVnE4BVdN"
const STRIPE_PUBLISHABLE_KEY =
  (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").trim() ||
  "pk_live_51T3WpNHPu7BwMUiqE2RjLNwFvcmTajCPSt4Vxn9WyKOBdAuE4a5yna0UijLloJs8mjwxrrsHeHlsB0187DvKMBKr00WX9I44De"

export default function PricingPage() {
  return (
    <div className="public-landing min-h-screen bg-white text-slate-900">
      <Script src="https://js.stripe.com/v3/pricing-table.js" strategy="afterInteractive" />

      <div className="mx-auto max-w-6xl px-6 py-16">
        <Link
          href="/"
          className={appButtonClass("secondary", "mb-6 !h-9 !w-auto !px-3 !py-2")}
          style={{ borderColor: "#2563EB", color: "#2563EB" }}
        >
          ← Back
        </Link>

        <h1 className="text-4xl font-bold tracking-tight">Pricing</h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          Choose the right plan for your team and start with secure, Stripe-powered billing.
        </p>

        <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(2,6,23,0.06)]">
          {STRIPE_PUBLISHABLE_KEY ? (
            createElement("stripe-pricing-table", {
              "pricing-table-id": STRIPE_PRICING_TABLE_ID,
              "publishable-key": STRIPE_PUBLISHABLE_KEY
            } as Record<string, string>)
          ) : (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Missing Stripe publishable key. Set <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> in{" "}
              <code>/Users/ianjent/Desktop/InvenTracker/apps/web/.env.local</code>.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
