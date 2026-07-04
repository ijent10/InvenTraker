import { ArrowLeft, Users } from "lucide-react"

import { AdminUserSearch } from "@/components/admin-user-search"
import { PageHeader } from "@/components/page-header"
import { ButtonLink } from "@/components/ui"
import { getEmployees } from "@/lib/server-data"

export default async function AdministratorUsersPage() {
  const employees = await getEmployees()

  return (
    <>
      <PageHeader
        title="User search"
        description="Search users across identity, employee ID, contact details, role, location, status, and permissions."
        actions={
          <ButtonLink href="/administrator" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to administrator
          </ButtonLink>
        }
      />

      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--app-muted)]">
        <Users className="h-4 w-4 text-[var(--app-accent)]" />
        Personal user data is for platform administration only and is excluded from assistant context.
      </div>

      <AdminUserSearch employees={employees} />
    </>
  )
}
