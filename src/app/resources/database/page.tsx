import { ArrowLeft, CheckCircle2, Database, GitBranch, LockKeyhole, Store } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { ButtonLink, Panel, StatusPill } from "@/components/ui"
import { databaseProvisioningPlan, productApprovalQueuePath, productFlowRules } from "@/lib/database-architecture"
import { DEFAULT_ORG_ID } from "@/lib/firestore-schema"

export default function AccountDatabasePage() {
  return (
    <>
      <PageHeader
        title="Database resource"
        description="A quick reference for central catalog, organization products, store inventory, and platform approval."
        actions={
          <ButtonLink href="/dashboard" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to dashboard
          </ButtonLink>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-[var(--app-text)]">Provisioning plan</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">
                The app can model each organization and store as its own named database, while local development still falls back to the default database.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {databaseProvisioningPlan.map((entry) => (
              <div key={entry.scope} className="rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold text-[var(--app-text)]">{entry.scope}</h3>
                  <StatusPill tone="blue">{entry.databaseId}</StatusPill>
                </div>
                <p className="app-tip mt-3 text-sm leading-6 text-[var(--app-muted)]">{entry.owns}</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[var(--app-text)]">{entry.rule}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-4">
          <h2 className="flex items-center gap-2 font-semibold text-[var(--app-text)]">
            <LockKeyhole className="h-5 w-5 text-[var(--app-accent)]" />
            Approval queue
          </h2>
          <p className="app-tip mt-2 text-sm leading-6 text-[var(--app-muted)]">
            Organization-created products should land here first, then a platform administrator approves or rejects them.
          </p>
          <div className="mt-4 rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3">
            <p className="text-xs font-semibold uppercase text-[var(--app-subtle)]">Queue path</p>
            <p className="mt-1 break-all text-sm font-semibold text-[var(--app-text)]">{productApprovalQueuePath}</p>
          </div>
          <div className="mt-4 rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3">
            <p className="text-xs font-semibold uppercase text-[var(--app-subtle)]">Current development org</p>
            <p className="mt-1 text-sm font-semibold text-[var(--app-text)]">{DEFAULT_ORG_ID}</p>
          </div>
        </Panel>
      </div>

      <Panel className="mt-6 p-4">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-[var(--app-text)]">Product flow</h2>
            <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">Products move downward from central catalog to organization approval to store inventory.</p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-4">
            <h3 className="font-semibold text-[var(--app-text)]">Central catalog</h3>
            <p className="app-tip mt-2 text-sm leading-6 text-[var(--app-muted)]">Everything ever approved: product identity, SKU, nutrition, images, averages, and sources.</p>
          </div>
          <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-4">
            <h3 className="font-semibold text-[var(--app-text)]">Organization catalog</h3>
            <p className="app-tip mt-2 text-sm leading-6 text-[var(--app-muted)]">Only products approved for that organization, with org notes, categories, and defaults.</p>
          </div>
          <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-4">
            <h3 className="flex items-center gap-2 font-semibold text-[var(--app-text)]">
              <Store className="h-4 w-4 text-[var(--app-accent)]" />
              Store inventory
            </h3>
            <p className="app-tip mt-2 text-sm leading-6 text-[var(--app-muted)]">Only products the organization already allows, plus store-specific quantities, vendors, prices, and locations.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {productFlowRules.map((rule) => (
            <div key={rule} className="flex gap-3 rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--app-accent)]" />
              <p className="app-tip text-sm leading-6 text-[var(--app-muted)]">{rule}</p>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}
