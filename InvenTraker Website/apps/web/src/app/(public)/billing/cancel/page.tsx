import Link from "next/link"
import { appButtonClass } from "@inventracker/ui"

export default function BillingCancelPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <div className="w-full rounded-card border border-app-border bg-app-surface p-8 shadow-card">
        <h1 className="page-title">Billing not completed</h1>
        <p className="secondary-text mt-3">
          No problem. You can return to your onboarding flow and choose a plan any time.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/app" className={appButtonClass("primary")}>
            Return to App
          </Link>
          <Link href="/pricing" className={appButtonClass("secondary")}>
            View Pricing
          </Link>
        </div>
      </div>
    </div>
  )
}
