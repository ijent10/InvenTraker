import { PageHeader } from "@/components/page-header"
import { Button, Panel } from "@/components/ui"

const settings = [
  ["Organization name", "InvenTracker Demo"],
  ["Default unit", "eaches"],
  ["Expiration default", "No expiration"],
  ["Order approval", "Manager review"],
  ["Database status", "Ready for new Firebase project"]
]

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Core organization defaults before we wire live authentication and database writes."
        actions={<Button>Save settings</Button>}
      />

      <Panel className="max-w-3xl p-4">
        <div className="divide-y divide-slate-800">
          {settings.map(([label, value]) => (
            <div key={label} className="grid gap-2 py-4 sm:grid-cols-[220px_1fr]">
              <p className="text-sm font-semibold text-slate-300">{label}</p>
              <p className="text-sm text-white">{value}</p>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}
