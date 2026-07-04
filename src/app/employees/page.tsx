import Link from "next/link"
import { Plus } from "lucide-react"

import { ActionButton } from "@/components/action-button"
import { DataTable } from "@/components/data-table"
import { EmployeeProfileEditor } from "@/components/employee-profile-editor"
import { PageHeader } from "@/components/page-header"
import { Panel, StatusPill, ToggleRow } from "@/components/ui"
import { departments, jobTitles, type Employee } from "@/lib/demo-data"
import { permissionGroups } from "@/lib/permissions"
import { getEmployees, getStores } from "@/lib/server-data"

const emptyEmployee: Employee = {
  id: "new-employee",
  name: "",
  employeeId: "",
  phone: "",
  email: "",
  jobTitle: "",
  department: "",
  location: "",
  store: "",
  status: "Invite sent",
  lastActive: "Not active yet",
  permissions: []
}

export default async function EmployeesPage({ searchParams }: { searchParams?: { employee?: string } }) {
  const [employees, stores] = await Promise.all([getEmployees(), getStores()])
  const selectedEmployee = employees.find((employee) => employee.id === searchParams?.employee) ?? employees[0] ?? emptyEmployee

  return (
    <>
      <PageHeader
        title="Employees"
        description="Manage employee identity, contact details, job titles, password resets, and specific permissions."
        actions={<ActionButton doneLabel="Invite staged" icon={<Plus className="h-4 w-4" />}>Invite employee</ActionButton>}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel>
          <DataTable
            columns={["Employee", "Employee ID", "Job title", "Department", "Location", "Status", "Last active"]}
            rows={employees.map((employee) => [
              <div key={`${employee.id}-name`}>
                <Link href={`/employees?employee=${employee.id}`} className="font-semibold text-white hover:text-[var(--app-accent)]">
                  {employee.name}
                </Link>
                <p className="mt-1 text-xs text-slate-500">{employee.email}</p>
              </div>,
              employee.employeeId,
              employee.jobTitle,
              employee.department,
              employee.location,
              <StatusPill
                key={`${employee.id}-status`}
                tone={employee.status === "Active" ? "green" : employee.status === "Suspended" ? "red" : "amber"}
              >
                {employee.status}
              </StatusPill>,
              employee.lastActive
            ])}
          />
        </Panel>

        <EmployeeProfileEditor employee={selectedEmployee} stores={stores} jobTitles={jobTitles} departments={departments} />
      </div>

      <Panel className="mt-6 p-4">
        <div className="mb-4">
          <h2 className="font-semibold text-white">Permission matrix</h2>
          <p className="app-tip mt-1 text-sm text-slate-400">
            Owners always retain full control. Other employees only see tabs and actions they are allowed to use.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {permissionGroups.map((group) => (
            <div key={group.id} className="rounded-md border border-slate-800 bg-slate-950/40 p-4">
              <h3 className="font-semibold text-white">{group.title}</h3>
              <p className="app-tip mt-1 text-sm leading-5 text-slate-400">{group.description}</p>
              <div className="mt-4 grid gap-3">
                {group.permissions.map((permission) => (
                  <ToggleRow
                    key={permission.key}
                    title={permission.label}
                    description={permission.description}
                    name={`permission.${permission.key}`}
                    checked={selectedEmployee.permissions.includes(permission.key)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}
