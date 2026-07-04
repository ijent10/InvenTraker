import { notFound } from "next/navigation"
import { ArrowLeft, Building2, MapPin, PackageSearch, Store, Users } from "lucide-react"

import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { ButtonLink, Panel, StatusPill, ToggleRow } from "@/components/ui"
import { buildPlatformOrganizations } from "@/lib/platform-admin-data"
import { getPlatformSubscriptions, getStores } from "@/lib/server-data"

function toneForStatus(status: string) {
  if (status === "Active") return "green" as const
  if (status === "Past due") return "red" as const
  if (status === "Trialing") return "blue" as const
  return "neutral" as const
}

export default async function AdministratorOrganizationPage({
  params
}: {
  params: {
    organizationId: string
  }
}) {
  const [subscriptions, stores] = await Promise.all([getPlatformSubscriptions(), getStores()])
  const organization = buildPlatformOrganizations(subscriptions, stores).find((candidate) => candidate.id === params.organizationId)

  if (!organization) notFound()

  const totalItems = organization.stores.reduce((sum, store) => sum + store.activeItems, 0)
  const totalEmployees = organization.stores.reduce((sum, store) => sum + store.employees, 0)

  return (
    <>
      <PageHeader
        title={organization.name}
        description="Review the organization owner, subscription state, and the stores attached to this organization."
        actions={
          <ButtonLink href="/administrator" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to administrator
          </ButtonLink>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Panel className="p-4">
          <Building2 className="h-5 w-5 text-[var(--app-accent)]" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--app-subtle)]">Owner</p>
          <p className="mt-1 font-semibold text-[var(--app-text)]">{organization.owner}</p>
          <p className="mt-1 text-sm text-[var(--app-muted)]">{organization.ownerEmail}</p>
        </Panel>
        <Panel className="p-4">
          <Store className="h-5 w-5 text-[var(--app-accent)]" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--app-subtle)]">Stores</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--app-text)]">{organization.stores.length}</p>
        </Panel>
        <Panel className="p-4">
          <PackageSearch className="h-5 w-5 text-[var(--app-accent)]" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--app-subtle)]">Active items</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--app-text)]">{totalItems.toLocaleString()}</p>
        </Panel>
        <Panel className="p-4">
          <Users className="h-5 w-5 text-[var(--app-accent)]" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--app-subtle)]">Employees</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--app-text)]">{totalEmployees.toLocaleString()}</p>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel className="p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-[var(--app-text)]">Stores</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">
                Store rows use the user-facing owner label while keeping the current demo field behind the scenes until Firebase records replace it.
              </p>
            </div>
            <StatusPill tone={toneForStatus(organization.status)}>{organization.status}</StatusPill>
          </div>

          <DataTable
            columns={["Store", "Code", "Owner", "Active items", "Employees", "Address"]}
            rows={organization.stores.map((store) => [
              <span key={`${store.id}-name`} className="font-semibold text-[var(--app-text)]">
                {store.name}
              </span>,
              store.code,
              store.manager,
              store.activeItems.toLocaleString(),
              store.employees.toLocaleString(),
              <span key={`${store.id}-address`} className="inline-flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[var(--app-subtle)]" />
                {store.address}
              </span>
            ])}
          />
        </Panel>

        <Panel className="p-4">
          <h2 className="font-semibold text-[var(--app-text)]">Support controls</h2>
          <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">
            These controls are placeholders for scoped platform support actions that will write audit notes in Firebase.
          </p>
          <div className="mt-4 grid gap-3">
            <ToggleRow title="Owner support override" description="Allow a platform admin to help the organization owner resolve locked settings." checked={false} />
            <ToggleRow title="Store support edits" description="Allow scoped store corrections with an administrator audit note." />
            <ToggleRow title="Subscription review" description="Flag this organization for Stripe subscription follow-up." checked={organization.status === "Past due"} />
          </div>
        </Panel>
      </div>
    </>
  )
}
