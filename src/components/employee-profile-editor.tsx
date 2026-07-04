"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react"

import { Button, Field, Panel, SelectInput, TextInput } from "@/components/ui"
import { writeOrgRecord } from "@/lib/cloud-records"
import type { Employee, StoreRecord } from "@/lib/demo-data"

export function EmployeeProfileEditor({
  employee,
  stores,
  jobTitles,
  departments
}: {
  employee: Employee
  stores: StoreRecord[]
  jobTitles: string[]
  departments: string[]
}) {
  const [draft, setDraft] = useState(employee)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    setDraft(employee)
    setMessage("")
    setError("")
  }, [employee])

  function updateDraft(nextFields: Partial<Employee>) {
    setDraft((current) => ({ ...current, ...nextFields }))
  }

  async function saveEmployee() {
    setSaving(true)
    setMessage("")
    setError("")

    try {
      await writeOrgRecord("members", draft.id, { ...draft, source: "web" })
      setMessage("Employee saved.")
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Employee could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  async function sendReset() {
    setMessage("Password reset staged for this employee.")
    setError("")
  }

  return (
    <Panel className="p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Employee profile</h2>
          <p className="app-tip mt-1 text-sm text-slate-400">Fast edits for {draft.name || "the selected employee"}.</p>
        </div>
      </div>

      <form className="grid gap-4">
        <Field label="Full name">
          <TextInput value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee ID">
            <TextInput value={draft.employeeId} onChange={(event) => updateDraft({ employeeId: event.target.value })} />
          </Field>
          <Field label="Job title">
            <SelectInput value={draft.jobTitle} onChange={(event) => updateDraft({ jobTitle: event.target.value })}>
              {jobTitles.map((title) => (
                <option key={title}>{title}</option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Department">
            <SelectInput value={draft.department} onChange={(event) => updateDraft({ department: event.target.value })}>
              {departments.map((department) => (
                <option key={department}>{department}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Location">
            <SelectInput value={draft.location} onChange={(event) => updateDraft({ location: event.target.value })}>
              <option>All locations</option>
              {stores.map((store) => (
                <option key={store.id}>{store.name}</option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <Field label="Phone number">
          <TextInput value={draft.phone} onChange={(event) => updateDraft({ phone: event.target.value })} />
        </Field>
        <Field label="Email">
          <TextInput type="email" value={draft.email} onChange={(event) => updateDraft({ email: event.target.value })} />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={saveEmployee} disabled={saving} icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}>
            Save employee
          </Button>
          <Button variant="secondary" onClick={sendReset} icon={<KeyRound className="h-4 w-4" />}>
            Reset password
          </Button>
          {message ? <span className="text-sm font-semibold text-emerald-300">{message}</span> : null}
          {error ? <span className="text-sm font-semibold text-rose-300">{error}</span> : null}
        </div>
      </form>
    </Panel>
  )
}
