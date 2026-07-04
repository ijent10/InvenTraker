import { ArrowLeft, UserCircle } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { ButtonLink, Panel } from "@/components/ui"
import { getCurrentEmployee } from "@/lib/account-data"

export default async function AccountProfilePage() {
  const employee = await getCurrentEmployee()
  const fields = [
    ["Name", employee.name],
    ["Employee ID", employee.employeeId],
    ["Phone", employee.phone],
    ["Email", employee.email],
    ["Title", employee.jobTitle],
    ["Department", employee.department],
    ["Location", employee.location],
    ["Store", employee.store],
    ["Account status", employee.status],
    ["Last active", employee.lastActive]
  ]

  return (
    <>
      <PageHeader
        title="Employee profile"
        description="View the employee details attached to your account. Editable employee fields are managed from Employees by someone with permission."
        actions={
          <ButtonLink href="/account" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to account
          </ButtonLink>
        }
      />

      <Panel className="max-w-4xl p-4">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
            <UserCircle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-[var(--app-text)]">Personal employee record</h2>
            <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">This is the identity the rest of the workspace uses for permissions and history.</p>
          </div>
        </div>

        <div className="grid gap-3">
          {fields.map(([label, value]) => (
            <div key={label} className="grid gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-control-bg)] p-3 sm:grid-cols-[180px_1fr]">
              <p className="text-sm font-semibold text-[var(--app-subtle)]">{label}</p>
              <p className="text-sm text-[var(--app-text)]">{value || "Not set"}</p>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}
