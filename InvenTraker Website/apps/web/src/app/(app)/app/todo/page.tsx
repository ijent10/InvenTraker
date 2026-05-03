"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { AppButton, AppCard, AppCheckbox, AppInput, AppSelect, TipBanner } from "@inventracker/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  createOrgTodo,
  fetchExpirationEntries,
  fetchMembers,
  fetchOrgSettings,
  fetchOrgTodo,
  fetchStoreInventoryItems,
  fetchStoreSettings
} from "@/lib/data/firestore"
import { downloadSpreadsheetExport } from "@/lib/exports/spreadsheet"

export default function TodoPage() {
  const { user } = useAuthUser()
  const { activeOrgId, activeStoreId, activeOrg, activeStore, effectivePermissions } = useOrgContext()
  const queryClient = useQueryClient()
  const [titleDraft, setTitleDraft] = useState("")
  const [dueDateDraft, setDueDateDraft] = useState("")
  const [dueTimeDraft, setDueTimeDraft] = useState("09:00")
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([])
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const { data: todoRows = [] } = useQuery({
    queryKey: ["org-todo", activeOrgId, activeStoreId],
    queryFn: () => fetchOrgTodo(activeOrgId, activeStoreId || undefined),
    enabled: Boolean(activeOrgId),
    refetchInterval: 30_000
  })
  const { data: members = [] } = useQuery({
    queryKey: ["org-todo-members", activeOrgId],
    queryFn: () => fetchMembers(activeOrgId),
    enabled: Boolean(activeOrgId)
  })
  const { data: orgSettings } = useQuery({
    queryKey: ["org-todo-settings", activeOrgId],
    queryFn: () => fetchOrgSettings(activeOrgId),
    enabled: Boolean(activeOrgId)
  })
  const { data: storeSettings } = useQuery({
    queryKey: ["todo-store-export-settings", activeOrgId, activeStoreId],
    queryFn: () => fetchStoreSettings(activeOrgId, activeStore!),
    enabled: Boolean(activeOrgId && activeStore)
  })

  const { data: expiringRows = [] } = useQuery({
    queryKey: ["todo-expiring", activeOrgId, activeStoreId],
    queryFn: () => fetchExpirationEntries(activeOrgId, activeStoreId || undefined, 3),
    enabled: Boolean(activeOrgId),
    refetchInterval: 30_000
  })

  const { data: items = [] } = useQuery({
    queryKey: ["todo-items", activeOrgId, activeStoreId],
    queryFn: () => (activeStoreId ? fetchStoreInventoryItems(activeOrgId, activeStoreId) : Promise.resolve([])),
    enabled: Boolean(activeOrgId && activeStoreId),
    refetchInterval: 30_000
  })

  const derived = useMemo(() => {
    const lowStock = items
      .filter((item) => item.totalQuantity < item.minimumQuantity)
      .map((item) => ({
        id: `low-${item.id}`,
        title: `Low stock: ${item.name}`,
        status: "open",
        assignees: [] as string[],
        href: "/app/orders"
      }))

    const expiring = expiringRows.map((entry, idx) => ({
      id: `exp-${entry.itemId}-${idx}`,
      title: `Check expiration: ${entry.itemName}`,
      status: "open",
      assignees: [] as string[],
      href: "/app/expiration"
    }))

    return [...lowStock, ...expiring]
  }, [expiringRows, items])

  const allRows = useMemo(
    () => [
      ...todoRows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        assignees: [
          ...(row.assigneeRoleTitles ?? []),
          ...(row.assigneeDepartmentNames ?? []),
          ...(row.assigneeUserIds ?? [])
        ],
        href:
          row.title.toLowerCase().includes("order")
            ? "/app/orders"
            : row.title.toLowerCase().includes("expire")
              ? "/app/expiration"
              : row.title.toLowerCase().includes("waste")
                ? "/app/waste"
                : "/app/todo"
      })),
      ...derived
    ],
    [derived, todoRows]
  )

  const exportRows = useMemo(
    () => [
      ...todoRows,
      ...derived.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        dueAt: "",
        createdByName: "Auto"
      }))
    ],
    [derived, todoRows]
  )

  const roleOptions = useMemo(() => {
    const builtIn = ["Owner"]
    const orgRoles = (orgSettings?.jobTitles ?? []).map((entry) => entry.title).filter(Boolean)
    return [...new Set([...builtIn, ...orgRoles])]
  }, [orgSettings?.jobTitles])

  const departmentOptions = useMemo(() => {
    const fromSettings = (orgSettings?.departments ?? []).filter(Boolean)
    const fromMembers = members.flatMap((member) => member.departmentIds ?? []).filter(Boolean)
    return [...new Set([...fromSettings, ...fromMembers])]
  }, [members, orgSettings?.departments])

  const saveTask = async () => {
    if (!activeOrgId || !titleDraft.trim()) {
      setSaveError("Task title is required.")
      return
    }
    setSaveMessage(null)
    setSaveError(null)
    try {
      const dueAt = dueDateDraft
        ? new Date(`${dueDateDraft}T${dueTimeDraft || "09:00"}`)
        : undefined
      await createOrgTodo(activeOrgId, {
        title: titleDraft,
        type: "manual",
        dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : undefined,
        storeId: activeStoreId || undefined,
        createdBy: user?.uid,
        createdByName: user?.displayName ?? user?.email ?? undefined,
        assigneeUserIds: selectedUsers,
        assigneeRoleTitles: selectedRoles,
        assigneeDepartmentNames: selectedDepartments
      })
      setTitleDraft("")
      setDueDateDraft("")
      setDueTimeDraft("09:00")
      setSelectedUsers([])
      setSelectedRoles([])
      setSelectedDepartments([])
      await queryClient.invalidateQueries({ queryKey: ["org-todo", activeOrgId, activeStoreId] })
      setSaveMessage("Task created.")
    } catch {
      setSaveError("Could not create task.")
    }
  }

  const exportTodo = () => {
    if (exportRows.length === 0) return
    const storeName = activeStore?.title ?? activeStore?.name
    downloadSpreadsheetExport({
      dataset: "todo",
      rows: exportRows as unknown as Array<Record<string, unknown>>,
      settings: { orgSettings, storeSettings },
      organizationName: activeOrg?.organizationName,
      storeName,
      scopeLabel: storeName ? `${storeName} To-Do` : "To-Do"
    })
  }

  return (
    <div>
      <PageHead
        title="To-Do"
        subtitle="Manual + auto-generated tasks tied to inventory actions."
        actions={
          <AppButton
            variant="secondary"
            onClick={exportTodo}
            disabled={!effectivePermissions.exportData || exportRows.length === 0}
          >
            Export
          </AppButton>
        }
      />
      <TipBanner title="Tip" message="Tasks link directly to the module where the action is completed." accentColor="#A855F7" />
      <AppCard className="mt-4">
        <h2 className="card-title">Create Task</h2>
        <div className="mt-3 grid gap-3">
          <AppInput
            placeholder="Task title"
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <AppInput type="date" value={dueDateDraft} onChange={(event) => setDueDateDraft(event.target.value)} />
            <AppInput type="time" value={dueTimeDraft} onChange={(event) => setDueTimeDraft(event.target.value)} />
          </div>
          <div className="rounded-2xl border border-app-border p-3">
            <p className="mb-2 text-sm font-semibold">Assign by role</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {roleOptions.map((role) => (
                <AppCheckbox
                  key={`role-${role}`}
                  checked={selectedRoles.includes(role)}
                  onChange={(event) =>
                    setSelectedRoles((prev) =>
                      event.target.checked ? [...new Set([...prev, role])] : prev.filter((entry) => entry !== role)
                    )
                  }
                  label={role}
                />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-app-border p-3">
            <p className="mb-2 text-sm font-semibold">Assign by department</p>
            {departmentOptions.length === 0 ? (
              <p className="secondary-text text-xs">No departments configured yet.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {departmentOptions.map((department) => (
                  <AppCheckbox
                    key={`dept-${department}`}
                    checked={selectedDepartments.includes(department)}
                    onChange={(event) =>
                      setSelectedDepartments((prev) =>
                        event.target.checked
                          ? [...new Set([...prev, department])]
                          : prev.filter((entry) => entry !== department)
                      )
                    }
                    label={department}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-app-border p-3">
            <p className="mb-2 text-sm font-semibold">Assign to users</p>
            {members.length === 0 ? (
              <p className="secondary-text text-xs">No organization users found.</p>
            ) : (
              <AppSelect
                value=""
                onChange={(event) => {
                  const uid = event.target.value
                  if (!uid) return
                  setSelectedUsers((prev) => [...new Set([...prev, uid])])
                }}
              >
                <option value="">Select user to add</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {[member.firstName, member.lastName].filter(Boolean).join(" ").trim() || member.email || member.id}
                  </option>
                ))}
              </AppSelect>
            )}
            {selectedUsers.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedUsers.map((uid) => {
                  const member = members.find((row) => row.id === uid)
                  const label =
                    [member?.firstName, member?.lastName].filter(Boolean).join(" ").trim() ||
                    member?.email ||
                    uid
                  return (
                    <AppButton
                      type="button"
                      key={uid}
                      variant="secondary"
                      className="!h-8 !rounded-full !px-2 !py-1 !text-xs"
                      onClick={() => setSelectedUsers((prev) => prev.filter((entry) => entry !== uid))}
                    >
                      {label} ×
                    </AppButton>
                  )
                })}
              </div>
            ) : null}
          </div>
          <div>
            <AppButton onClick={() => void saveTask()}>Create Task</AppButton>
          </div>
          {saveMessage ? <p className="text-sm text-emerald-300">{saveMessage}</p> : null}
          {saveError ? <p className="text-sm text-rose-300">{saveError}</p> : null}
        </div>
      </AppCard>
      <AppCard className="mt-4">
        <div className="space-y-2 text-sm">
          {allRows.length === 0 ? (
            <p className="secondary-text">No tasks right now.</p>
          ) : (
            allRows.map((row) => (
              <Link key={row.id} href={row.href} className="block rounded-xl border border-app-border p-3 hover:bg-app-surface-soft">
                <p className="font-semibold">{row.title}</p>
                <p className="secondary-text">{row.status}</p>
                {row.assignees?.length ? (
                  <p className="secondary-text text-xs">Assigned: {row.assignees.join(", ")}</p>
                ) : null}
              </Link>
            ))
          )}
        </div>
      </AppCard>
    </div>
  )
}
