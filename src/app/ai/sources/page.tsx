import { ArrowLeft, Database, FileCheck, Globe2, Save, ShieldCheck } from "lucide-react"

import { ActionButton } from "@/components/action-button"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { ButtonLink, Field, Panel, SelectInput, StatusPill, TextArea, TextInput, ToggleRow } from "@/components/ui"
import { productEvidence } from "@/lib/ai/product-intelligence"

export default function AiSourcesPage() {
  return (
    <>
      <PageHeader
        title="Assistant sources"
        description="Manage the evidence the assistant can use for compliance, product details, images, recalls, and local decisions."
        actions={
          <>
            <ButtonLink href="/ai" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
              Back to AI
            </ButtonLink>
            <ButtonLink href="/pending-review" variant="secondary" icon={<ShieldCheck className="h-4 w-4" />}>
              Pending review
            </ButtonLink>
            <ActionButton icon={<Save className="h-4 w-4" />}>Save sources</ActionButton>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel>
          <DataTable
            columns={["Product", "Kosher status", "Allergens", "Handling notes", "Sources"]}
            rows={productEvidence.map((product) => [
              <div key={`${product.productId}-name`}>
                <p className="font-semibold text-white">{product.productName}</p>
                <p className="mt-1 text-xs text-slate-500">{product.sku ?? "No SKU"}</p>
              </div>,
              <StatusPill
                key={`${product.productId}-kosher`}
                tone={product.kosherStatus === "verified" ? "green" : product.kosherStatus === "not_recorded" ? "amber" : "neutral"}
              >
                {product.kosherStatus.replace("_", " ")}
              </StatusPill>,
              product.allergens.join(", ") || "None recorded",
              product.handlingNotes[0] ?? "None recorded",
              `${product.sources.length} local source${product.sources.length === 1 ? "" : "s"}`
            ])}
          />
        </Panel>

        <Panel className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
              <FileCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Evidence record</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-slate-400">A future editable record for compliance and supplier proof.</p>
            </div>
          </div>

          <form className="grid gap-4">
            <Field label="Product">
              <TextInput name="product" defaultValue="Cabernet Sauvignon" />
            </Field>
            <Field label="Kosher status">
              <SelectInput name="kosherStatus" defaultValue="not_recorded">
                <option value="verified">Verified</option>
                <option value="not_verified">Not verified</option>
                <option value="not_recorded">Not recorded</option>
                <option value="not_applicable">Not applicable</option>
              </SelectInput>
            </Field>
            <Field label="Certification source">
              <TextInput name="certificationSource" placeholder="Certifying agency, supplier sheet, package mark, or source URL" />
            </Field>
            <Field label="Package or supplier image URL">
              <TextInput name="imageUrl" placeholder="https://..." />
            </Field>
            <Field label="Evidence notes">
              <TextArea name="evidenceNotes" placeholder="What did we verify, who approved it, and when should it be reviewed again?" />
            </Field>
          </form>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel className="p-4">
          <div className="mb-4 flex items-center gap-3">
            <Database className="h-5 w-5 text-blue-300" />
            <h2 className="font-semibold text-white">Local product evidence policy</h2>
          </div>
          <div className="grid gap-3">
            <ToggleRow name="requireComplianceSource" title="Require source before compliance claims" description="Kosher, organic, halal, gluten-free, and allergen-free answers must cite stored or external evidence." />
            <ToggleRow name="preferSupplierImages" title="Prefer supplier-owned images" description="Supplier and package images should beat generic web images when both exist." />
            <ToggleRow name="reviewExternalMatches" title="Review external matches before saving" description="Open Food Facts nutrition, images, labels, allergens, and ingredients stay pending until an approved reviewer saves them." />
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="mb-4 flex items-center gap-3">
            <Globe2 className="h-5 w-5 text-blue-300" />
            <h2 className="font-semibold text-white">National-awareness policy</h2>
          </div>
          <div className="grid gap-3">
            <ToggleRow name="useOpenFdaRecalls" title="Use openFDA for recall checks" description="Recall-like questions should check public FDA enforcement data and show source context." />
            <ToggleRow name="useOpenFoodFacts" title="Use Open Food Facts for public product data" description="Product labels, images, allergens, and ingredients can supplement local records." />
            <ToggleRow name="flagUncertainty" title="Flag uncertainty" description="A missing external label is not treated as proof that a claim is false." />
          </div>
        </Panel>
      </div>
    </>
  )
}
