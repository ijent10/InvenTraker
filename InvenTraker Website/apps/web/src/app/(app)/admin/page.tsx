"use client"

import Link from "next/link"
import { AppCard, appButtonClass } from "@inventracker/ui"
import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"

export default function AdminConsolePage() {
  const { canViewAdmin, loading } = useOrgContext()

  if (loading) {
    return (
      <div>
        <PageHead title="Admin Console" subtitle="Loading access..." />
        <AppCard>
          <p className="secondary-text">Checking admin permissions.</p>
        </AppCard>
      </div>
    )
  }

  const isAdmin = canViewAdmin

  if (!isAdmin) {
    return (
      <div>
        <PageHead title="Admin Console" subtitle="Platform Admin only." />
        <AppCard>
          <p className="secondary-text">Access denied.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead title="Admin Console" subtitle="Platform-level controls for InvenTraker data, plans, and content." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AppCard>
          <h2 className="card-title">Inventory Database</h2>
          <p className="secondary-text mt-2">
            Manage central catalog items: barcode, title, uploaded image, expiration defaults, and archive/removal.
          </p>
          <Link className={appButtonClass("primary", "mt-4")} href="/admin/inventory-db">
            Open Inventory Database
          </Link>
        </AppCard>
        <AppCard>
          <h2 className="card-title">Organization Database</h2>
          <p className="secondary-text mt-2">
            Browse organizations, stores, users, settings, and scoped inventory tools.
          </p>
          <Link className={appButtonClass("primary", "mt-4")} href="/admin/org-db">
            Open Organization Database
          </Link>
        </AppCard>
        <AppCard>
          <h2 className="card-title">Notifications</h2>
          <p className="secondary-text mt-2">
            Send platform-wide notifications to organization owners and optionally employees.
          </p>
          <Link className={appButtonClass("primary", "mt-4")} href="/admin/notifications">
            Open Notifications
          </Link>
        </AppCard>
        <AppCard>
          <h2 className="card-title">Stripe</h2>
          <p className="secondary-text mt-2">
            Configure plan copy, trials, post-trial behavior, and sale messaging for web pricing surfaces.
          </p>
          <Link className={appButtonClass("primary", "mt-4")} href="/admin/stripe">
            Open Stripe Controls
          </Link>
        </AppCard>
        <AppCard>
          <h2 className="card-title">Content</h2>
          <p className="secondary-text mt-2">
            Edit Privacy, Terms, Contact details, and FAQ content shown on public website pages.
          </p>
          <Link className={appButtonClass("primary", "mt-4")} href="/admin/content">
            Open Content
          </Link>
        </AppCard>
        <AppCard>
          <h2 className="card-title">Feature Requests</h2>
          <p className="secondary-text mt-2">
            Review incoming feature requests from web settings and prioritize roadmap work.
          </p>
          <Link className={appButtonClass("primary", "mt-4")} href="/admin/feature-requests">
            Open Feature Requests
          </Link>
        </AppCard>
        <AppCard>
          <h2 className="card-title">Contact Inquiries</h2>
          <p className="secondary-text mt-2">
            Review support inquiries submitted through the public contact form.
          </p>
          <Link className={appButtonClass("primary", "mt-4")} href="/admin/contact-inquiries">
            Open Contact Inquiries
          </Link>
        </AppCard>
      </div>
    </div>
  )
}
