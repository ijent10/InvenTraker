import Link from "next/link"
import { appButtonClass } from "@inventracker/ui"

export default function BillingSuccessPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <div className="w-full rounded-card border border-app-border bg-app-surface p-8 shadow-card">
        <h1 className="page-title">Activating subscription…</h1>
        <p className="secondary-text mt-3">
          Payment was successful. We’re finalizing your billing status from Stripe now. This usually takes just a few seconds.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/app" className={appButtonClass("primary")}>
            Open App
          </Link>
          <Link href="/app/org" className={appButtonClass("secondary")}>
            Go to Organization
          </Link>
        </div>
      </div>
    </div>
  )
}
