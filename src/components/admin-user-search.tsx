"use client"

import { useMemo, useState } from "react"
import { KeyRound, RotateCcw, Search, UserCog } from "lucide-react"

import { DataTable } from "@/components/data-table"
import { Button, Field, Panel, SelectInput, StatusPill, TextInput } from "@/components/ui"
import type { Employee } from "@/lib/demo-data"

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

function statusTone(status: Employee["status"]) {
  if (status === "Active") return "green" as const
  if (status === "Suspended") return "red" as const
  return "blue" as const
}

function includesText(value: string, query: string) {
  return value.toLowerCase().includes(query)
}

export function AdminUserSearch({ employees }: { employees: Employee[] }) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("All")
  const [department, setDepartment] = useState("All")
  const [store, setStore] = useState("All")
  const [permission, setPermission] = useState("All")
  const [message, setMessage] = useState("")

  const departments = useMemo(() => unique(employees.map((employee) => employee.department)), [employees])
  const stores = useMemo(() => unique(employees.map((employee) => employee.store)), [employees])
  const permissions = useMemo(() => unique(employees.flatMap((employee) => employee.permissions)), [employees])

  const filteredEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return employees.filter((employee) => {
      const searchableText = [
        employee.name,
        employee.employeeId,
        employee.phone,
        employee.email,
        employee.jobTitle,
        employee.department,
        employee.location,
        employee.store,
        employee.status,
        employee.permissions.join(" ")
      ].join(" ")

      return (
        (!normalizedQuery || includesText(searchableText, normalizedQuery)) &&
        (status === "All" || employee.status === status) &&
        (department === "All" || employee.department === department) &&
        (store === "All" || employee.store === store) &&
        (permission === "All" || employee.permissions.includes(permission as Employee["permissions"][number]))
      )
    })
  }, [department, employees, permission, query, status, store])

  function resetFilters() {
    setQuery("")
    setStatus("All")
    setDepartment("All")
    setStore("All")
    setPermission("All")
    setMessage("Filters reset.")
  }

  return (
    <div className="grid gap-4">
      <Panel className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))_auto]">
          <Field label="Search users">
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, employee ID, email, phone, title, permission..."
            />
          </Field>
          <Field label="Status">
            <SelectInput value={status} onChange={(event) => setStatus(event.target.value)}>
              <option>All</option>
              <option>Active</option>
              <option>Invite sent</option>
              <option>Suspended</option>
            </SelectInput>
          </Field>
          <Field label="Department">
            <SelectInput value={department} onChange={(event) => setDepartment(event.target.value)}>
              <option>All</option>
              {departments.map((departmentOption) => (
                <option key={departmentOption}>{departmentOption}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Store">
            <SelectInput value={store} onChange={(event) => setStore(event.target.value)}>
              <option>All</option>
              {stores.map((storeOption) => (
                <option key={storeOption}>{storeOption}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Permission">
            <SelectInput value={permission} onChange={(event) => setPermission(event.target.value)}>
              <option>All</option>
              {permissions.map((permissionOption) => (
                <option key={permissionOption}>{permissionOption}</option>
              ))}
            </SelectInput>
          </Field>
          <div className="flex items-end">
            <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </div>
      </Panel>

      <Panel className="p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-[var(--app-text)]">
              <Search className="h-5 w-5 text-[var(--app-accent)]" />
              User results
            </h2>
            <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">
              Platform user search is intentionally separate from the assistant so personal identity data stays out of assistant context.
            </p>
          </div>
          <StatusPill tone="blue">{filteredEmployees.length} result{filteredEmployees.length === 1 ? "" : "s"}</StatusPill>
        </div>

        <DataTable
          columns={["User", "Employee ID", "Contact", "Role", "Scope", "Status", "Actions"]}
          rows={filteredEmployees.map((employee) => [
            <span key={`${employee.id}-name`} className="font-semibold text-[var(--app-text)]">
              {employee.name}
            </span>,
            employee.employeeId,
            <span key={`${employee.id}-contact`} className="block">
              <span className="block text-[var(--app-text)]">{employee.email}</span>
              <span className="mt-1 block text-xs text-[var(--app-muted)]">{employee.phone}</span>
            </span>,
            <span key={`${employee.id}-role`} className="block">
              <span className="block text-[var(--app-text)]">{employee.jobTitle}</span>
              <span className="mt-1 block text-xs text-[var(--app-muted)]">{employee.department}</span>
            </span>,
            <span key={`${employee.id}-scope`} className="block">
              <span className="block text-[var(--app-text)]">{employee.store}</span>
              <span className="mt-1 block text-xs text-[var(--app-muted)]">{employee.location}</span>
            </span>,
            <StatusPill key={`${employee.id}-status`} tone={statusTone(employee.status)}>
              {employee.status}
            </StatusPill>,
            <span key={`${employee.id}-actions`} className="flex flex-wrap gap-2">
              <Button variant="secondary" className="px-3" icon={<UserCog className="h-4 w-4" />} onClick={() => setMessage(`${employee.name} editor ready.`)}>
                Edit
              </Button>
              <Button
                variant="secondary"
                className="px-3"
                icon={<KeyRound className="h-4 w-4" />}
                onClick={() => setMessage(`Password reset flow staged for ${employee.email}.`)}
              >
                Reset
              </Button>
            </span>
          ])}
        />
        {filteredEmployees.length === 0 ? (
          <p className="mt-4 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3 text-sm text-[var(--app-muted)]">
            No users match those filters.
          </p>
        ) : null}
        {message ? <p className="mt-4 text-sm font-semibold text-[var(--app-muted)]">{message}</p> : null}
      </Panel>
    </div>
  )
}
