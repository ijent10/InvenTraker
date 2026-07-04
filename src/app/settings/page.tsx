import { KeyRound, Save, ShieldCheck } from "lucide-react"

import { ActionButton } from "@/components/action-button"
import { PageHeader } from "@/components/page-header"
import { Field, Panel, SelectInput, ToggleRow } from "@/components/ui"

const settings = [
  ["Session length", "12 hours"],
  ["Password reset", "Email reset link"],
  ["Owner access", "Always full control"],
  ["Permission checks", "Navigation and actions"],
  ["Database status", "Ready for Firebase wiring"]
]

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Account security, session behavior, and app-wide authorization defaults."
        actions={<ActionButton icon={<Save className="h-4 w-4" />}>Save settings</ActionButton>}
      />

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel className="p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Authentication</h2>
              <p className="app-tip mt-1 text-sm text-slate-400">Fast sign-in defaults for the new rebuild.</p>
            </div>
          </div>

          <div className="grid gap-4">
            <Field label="Primary sign-in method">
              <SelectInput name="primarySignInMethod" defaultValue="Email and password">
                <option>Email and password</option>
                <option>Email magic link</option>
                <option>SSO later</option>
              </SelectInput>
            </Field>
            <Field label="Session length">
              <SelectInput name="sessionLength" defaultValue="12 hours">
                <option>4 hours</option>
                <option>12 hours</option>
                <option>24 hours</option>
              </SelectInput>
            </Field>
            <ToggleRow
              name="lightweightAuthorization"
              title="Keep authorization checks lightweight"
              description="Use claims and membership records to avoid slow page-level permission lookups."
            />
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Authorization summary</h2>
              <p className="app-tip mt-1 text-sm text-slate-400">Current platform rules before Firebase rules are wired.</p>
            </div>
          </div>

          <div className="divide-y divide-slate-800">
            {settings.map(([label, value]) => (
              <div key={label} className="grid gap-2 py-4 sm:grid-cols-[220px_1fr]">
                <p className="text-sm font-semibold text-slate-300">{label}</p>
                <p className="text-sm text-white">{value}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  )
}
