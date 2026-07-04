import { ArrowLeft, ShieldCheck } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { PendingAutofillReviewCard } from "@/components/pending-autofill-review-card"
import { ButtonLink, Panel, StatusPill } from "@/components/ui"
import { getPendingAutofillBatches } from "@/lib/server-data"

export default async function PendingInventoryPage() {
  const pendingBatches = await getPendingAutofillBatches()

  return (
    <>
      <PageHeader
        title="Pending inventory review"
        description="AI-filled images, nutrition facts, ingredients, and product details wait here until someone with permission verifies them."
        actions={
          <ButtonLink href="/inventory" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to inventory
          </ButtonLink>
        }
      />

      <Panel className="mb-6 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-300" />
              <h2 className="font-semibold text-white">Review rule</h2>
            </div>
            <p className="app-tip mt-2 max-w-4xl text-sm leading-6 text-slate-400">
              The assistant can propose nutrition facts, product images, labels, allergens, ingredients, and national product data, but those fields stay
              pending until a permitted user approves them against a package label, supplier sheet, or trusted source.
            </p>
          </div>
          <StatusPill tone="blue">Approval required</StatusPill>
        </div>
      </Panel>

      <div className="grid gap-5">
        {pendingBatches.length > 0 ? (
          pendingBatches.map((batch) => <PendingAutofillReviewCard key={batch.id} batch={batch} />)
        ) : (
          <Panel className="p-6 text-sm text-[var(--app-muted)]">No pending inventory suggestions need review right now.</Panel>
        )}
      </div>
    </>
  )
}
