import { ArrowLeft, ClipboardCheck, Plus, Save } from "lucide-react"

import { ActionButton } from "@/components/action-button"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { ButtonLink, Field, Panel, SelectInput, StatusPill, TextArea, TextInput, ToggleRow } from "@/components/ui"
import { healthCheckDraftQuestions } from "@/lib/demo-data"

export default function HealthCheckDraftsPage() {
  return (
    <>
      <PageHeader
        title="Health check drafts"
        description="Build health-check templates with flexible answer types before publishing them to stores or departments."
        actions={
          <>
            <ButtonLink href="/health-checks" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
              Back to checks
            </ButtonLink>
            <ActionButton icon={<Save className="h-4 w-4" />}>Save draft</ActionButton>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Draft details</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-slate-400">Set the template identity, audience, and schedule.</p>
            </div>
          </div>

          <form className="grid gap-4">
            <Field label="Draft name">
              <TextInput name="draftName" defaultValue="Opening food safety" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Audience">
                <SelectInput name="audience" defaultValue="Store">
                  <option>Store</option>
                  <option>Department</option>
                  <option>District</option>
                  <option>Region</option>
                </SelectInput>
              </Field>
              <Field label="Schedule">
                <SelectInput name="schedule" defaultValue="Daily">
                  <option>Daily</option>
                  <option>Every 4 hours</option>
                  <option>Weekly</option>
                  <option>Monthly</option>
                  <option>Custom</option>
                </SelectInput>
              </Field>
              <Field label="Status">
                <SelectInput name="status" defaultValue="Draft">
                  <option>Draft</option>
                  <option>Ready for review</option>
                  <option>Published</option>
                </SelectInput>
              </Field>
            </div>
            <Field label="Instructions">
              <TextArea name="instructions" defaultValue="Complete before opening. Escalate any unsafe temperature or blocked prep area." />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <ToggleRow name="requireEmployeeSignature" title="Require employee signature" description="Capture employee identity and timestamp on submit." />
              <ToggleRow name="requireManagerReview" title="Require manager review" description="Hold flagged responses until a manager approves them." />
            </div>
          </form>
        </Panel>

        <Panel className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Answer types</h2>
              <p className="app-tip mt-1 text-sm text-slate-400">Reusable fields for question drafts.</p>
            </div>
            <StatusPill tone="blue">Builder</StatusPill>
          </div>
          <div className="grid gap-2">
            {healthCheckDraftQuestions.map(([type, label, detail]) => (
              <div key={type} className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{type}</p>
                    <p className="mt-1 text-sm text-slate-300">{label}</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <input
                      type="checkbox"
                      name={`include.${type}`}
                      defaultChecked
                      className="h-4 w-4 rounded border-slate-700 bg-slate-950 accent-blue-500"
                    />
                    Include
                  </label>
                </div>
                <p className="app-tip mt-2 text-xs leading-5 text-slate-500">{detail}</p>
                <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <input
                    type="checkbox"
                    name={`required.${type}`}
                    defaultChecked={["Number", "Multiple choice", "Signature"].includes(type)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 accent-blue-500"
                  />
                  Required before submit
                </label>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="mt-6">
        <DataTable
          columns={["Question", "Answer type", "Required", "Review rule"]}
          rows={healthCheckDraftQuestions.slice(0, 4).map(([type, label]) => [
            label,
            type,
            <StatusPill key={`${type}-required`} tone="green">Required</StatusPill>,
            type === "Number" ? "Flag outside range" : "Save with response"
          ])}
        />
      </Panel>
    </>
  )
}
