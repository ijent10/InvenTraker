import {
  BadgeDollarSign,
  BookOpenText,
  Building2,
  FileText,
  HelpCircle,
  ListChecks,
  Save,
  ShieldCheck,
  Store,
  Users
} from "lucide-react"

import { ActionButton } from "@/components/action-button"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { PlatformAdminBootstrap } from "@/components/platform-admin-bootstrap"
import { ButtonLink, Field, Panel, SelectInput, StatusPill, TextArea, TextInput, ToggleRow } from "@/components/ui"
import { assistantAllowedData, assistantBlockedData } from "@/lib/ai/privacy"
import { buildPlatformOrganizations } from "@/lib/platform-admin-data"
import { StripeSubscriptionActions } from "@/components/stripe-subscription-actions"
import { getPlatformFaqs, getPlatformFeatureRequests, getPlatformLegalDocuments, getPlatformSubscriptions, getStores } from "@/lib/server-data"

function toneForStatus(status: string) {
  if (["Active", "Published", "Shipped"].includes(status)) return "green" as const
  if (["Past due", "Needs review"].includes(status)) return "red" as const
  if (["Reviewing", "Planned", "Trialing"].includes(status)) return "blue" as const
  return "neutral" as const
}

export default async function AdministratorPage() {
  const [legalDocuments, featureRequests, faqs, subscriptions, stores] = await Promise.all([
    getPlatformLegalDocuments(),
    getPlatformFeatureRequests(),
    getPlatformFaqs(),
    getPlatformSubscriptions(),
    getStores()
  ])
  const organizations = buildPlatformOrganizations(subscriptions, stores)

  return (
    <>
      <PageHeader
        title="Administrator"
        description="Global InvenTracker controls for legal content, support, organizations, stores, users, subscriptions, and assistant data boundaries."
        actions={<ActionButton icon={<Save className="h-4 w-4" />}>Save administrator changes</ActionButton>}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-[var(--app-text)]">Platform access</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">
                Platform administrators sit above organizations. They can help support accounts and subscriptions without turning every organization owner into a global admin.
              </p>
            </div>
          </div>
          <PlatformAdminBootstrap />
          <div className="mt-4">
            <ButtonLink href="/administrator/access-lab" variant="secondary" icon={<ShieldCheck className="h-4 w-4" />}>
              Open permission lab
            </ButtonLink>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
              <ListChecks className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-[var(--app-text)]">Assistant boundary</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">
                The assistant can help with product and operational decisions, but personal identity and task-owner data stay outside its context.
              </p>
            </div>
          </div>
          <div className="grid gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-300">Allowed</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {assistantAllowedData.map((item) => (
                  <StatusPill key={item} tone="green">
                    {item}
                  </StatusPill>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-rose-300">Blocked</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {assistantBlockedData.map((item) => (
                  <StatusPill key={item} tone="red">
                    {item}
                  </StatusPill>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {legalDocuments.map((document) => (
          <Panel key={document.id} className="p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-[var(--app-text)]">{document.title}</h2>
                  <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">{document.summary}</p>
                </div>
              </div>
              <StatusPill tone={toneForStatus(document.status)}>{document.status}</StatusPill>
            </div>
            <form className="grid gap-4">
              <Field label="Title">
                <TextInput name={`${document.id}.title`} defaultValue={document.title} />
              </Field>
              <Field label="Summary">
                <TextInput name={`${document.id}.summary`} defaultValue={document.summary} />
              </Field>
              <Field label="Content">
                <TextArea name={`${document.id}.body`} defaultValue={document.body} className="min-h-40" />
              </Field>
              <Field label="Publication status">
                <SelectInput name={`${document.id}.status`} defaultValue={document.status}>
                  <option>Draft</option>
                  <option>Needs review</option>
                  <option>Published</option>
                </SelectInput>
              </Field>
              <ActionButton icon={<Save className="h-4 w-4" />} doneLabel={`${document.title} saved`}>
                Save {document.title}
              </ActionButton>
            </form>
          </Panel>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
              <BookOpenText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-[var(--app-text)]">Feature requests</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">Review requests, set priority, and track what should move into product planning.</p>
            </div>
          </div>
          <DataTable
            columns={["Request", "Organization", "Status", "Priority", "Votes"]}
            rows={featureRequests.map((request) => [
              request.title,
              request.organization,
              request.status,
              request.priority,
              String(request.votes)
            ])}
          />
        </Panel>

        <Panel className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-[var(--app-text)]">FAQs</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">Create and edit support answers that can appear in help centers, onboarding, and public pages.</p>
            </div>
          </div>
          <div className="grid gap-4">
            {faqs.map((faq) => (
              <form key={faq.id} className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--app-text)]">{faq.category}</p>
                    <p className="app-tip mt-1 text-xs text-[var(--app-muted)]">FAQ entry {faq.id}</p>
                  </div>
                  <StatusPill tone={toneForStatus(faq.status)}>{faq.status}</StatusPill>
                </div>
                <div className="grid gap-3">
                  <Field label="Question">
                    <TextInput name={`${faq.id}.question`} defaultValue={faq.question} />
                  </Field>
                  <Field label="Answer">
                    <TextArea name={`${faq.id}.answer`} defaultValue={faq.answer} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Category">
                      <TextInput name={`${faq.id}.category`} defaultValue={faq.category} />
                    </Field>
                    <Field label="Status">
                      <SelectInput name={`${faq.id}.status`} defaultValue={faq.status}>
                        <option>Draft</option>
                        <option>Published</option>
                      </SelectInput>
                    </Field>
                  </div>
                  <ActionButton variant="secondary" icon={<Save className="h-4 w-4" />} doneLabel="FAQ saved">
                    Save FAQ
                  </ActionButton>
                </div>
              </form>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-[var(--app-text)]">Organizations and stores</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">Open support controls for organizations, then drill into their stores and settings.</p>
            </div>
          </div>
          <DataTable
            columns={["Organization", "Owner", "Plan", "Status", "Stores", ""]}
            rows={organizations.map((organization) => [
              <span key={`${organization.id}-name`} className="font-semibold text-[var(--app-text)]">
                {organization.name}
              </span>,
              <div key={`${organization.id}-owner`}>
                <p className="font-semibold text-[var(--app-text)]">{organization.owner}</p>
                <p className="mt-1 text-xs text-[var(--app-muted)]">{organization.ownerEmail}</p>
              </div>,
              organization.plan,
              <StatusPill key={`${organization.id}-status`} tone={toneForStatus(organization.status)}>
                {organization.status}
              </StatusPill>,
              String(organization.stores.length),
              <ButtonLink key={`${organization.id}-open`} href={`/administrator/organizations/${organization.id}`} variant="secondary">
                Open stores
              </ButtonLink>
            ])}
          />
        </Panel>

        <Panel className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-[var(--app-text)]">Organization controls</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">Global support tools for resolving organization and store issues.</p>
            </div>
          </div>
          <div className="grid gap-3">
            <ToggleRow title="Allow support edits" description="Platform admins can make scoped corrections when an organization needs support." />
            <ToggleRow title="Require audit note" description="Sensitive platform changes should require a note before saving." />
            <ToggleRow title="Lock organization" description="Pause organization access during billing or security review." checked={false} />
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-[var(--app-text)]">Users</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">Search user status, password reset flows, permissions, and access issues without exposing them to the assistant.</p>
            </div>
          </div>
          <ButtonLink href="/administrator/users" icon={<Users className="h-4 w-4" />}>
            Search users
          </ButtonLink>
        </Panel>

        <Panel className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
              <BadgeDollarSign className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-[var(--app-text)]">Subscriptions</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">Stripe should own subscription lifecycle. InvenTracker stores the linked customer, subscription status, and support notes.</p>
            </div>
          </div>
          <div className="grid gap-3">
            {subscriptions.map((subscription) => (
              <form key={subscription.id} className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--app-text)]">{subscription.organization}</p>
                    <p className="app-tip mt-1 text-xs text-[var(--app-muted)]">Owner contact: {subscription.ownerEmail}</p>
                  </div>
                  <StatusPill tone={toneForStatus(subscription.status)}>{subscription.status}</StatusPill>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Plan">
                    <SelectInput name={`${subscription.id}.plan`} defaultValue={subscription.plan}>
                      <option>Trial</option>
                      <option>Starter</option>
                      <option>Growth</option>
                      <option>Enterprise</option>
                    </SelectInput>
                  </Field>
                  <Field label="Seats">
                    <TextInput name={`${subscription.id}.seats`} type="number" defaultValue={String(subscription.seats)} />
                  </Field>
                  <Field label="Status">
                    <SelectInput name={`${subscription.id}.status`} defaultValue={subscription.status}>
                      <option>Active</option>
                      <option>Trialing</option>
                      <option>Past due</option>
                      <option>Paused</option>
                    </SelectInput>
                  </Field>
                  <Field label="Renewal">
                    <TextInput name={`${subscription.id}.renewal`} defaultValue={subscription.renewal} />
                  </Field>
                </div>
                <div className="mt-3">
                  <div className="flex flex-wrap gap-2">
                    <ActionButton variant="secondary" icon={<Save className="h-4 w-4" />} doneLabel="Subscription saved">
                    Save subscription
                    </ActionButton>
                    <StripeSubscriptionActions subscription={subscription} />
                  </div>
                </div>
              </form>
            ))}
          </div>
        </Panel>
      </div>
    </>
  )
}
