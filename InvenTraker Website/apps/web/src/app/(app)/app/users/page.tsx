"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AppButton, AppCard, AppCheckbox, AppInput, AppSelect, DataTable, type TableColumn } from "@inventracker/ui"
import { useQuery } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  createPendingUser,
  fetchMembers,
  fetchOrgSettings,
  fetchStoreSettings,
  permissionCatalog,
  upsertMember,
  type MemberRecord,
  type RoleTemplateRecord
} from "@/lib/data/firestore"

type RoleOptionWithSource = RoleTemplateRecord & {
  source: "org" | "store"
}

const permissionSectionOrder: Array<{ key: "general" | "app" | "web"; title: string }> = [
  { key: "general", title: "General Permissions" },
  { key: "app", title: "App Permissions" },
  { key: "web", title: "Website Permissions" }
]

export default function UsersPage() {
  const { activeOrgId, activeStoreId, stores, role, effectivePermissions } = useOrgContext()

  const formRef = useRef<HTMLDivElement | null>(null)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [employeeId, setEmployeeId] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>("")
  const [assignmentType, setAssignmentType] = useState<"corporate" | "store">("store")
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [departmentIdsText, setDepartmentIdsText] = useState("")
  const [locationIdsText, setLocationIdsText] = useState("")
  const [permissionFlags, setPermissionFlags] = useState<Record<string, boolean>>({})
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: members = [], refetch } = useQuery({
    queryKey: ["members", activeOrgId],
    queryFn: () => fetchMembers(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const { data: orgSettings } = useQuery({
    queryKey: ["org-settings-for-users", activeOrgId],
    queryFn: () => fetchOrgSettings(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const activeStoreForSettings = useMemo(() => stores.find((store) => store.id === activeStoreId), [activeStoreId, stores])

  const { data: storeSettings } = useQuery({
    queryKey: ["store-settings-for-users", activeOrgId, activeStoreForSettings?.id],
    queryFn: () => fetchStoreSettings(activeOrgId, activeStoreForSettings!),
    enabled: Boolean(activeOrgId && activeStoreForSettings)
  })

  const roleTemplates = useMemo<RoleOptionWithSource[]>(() => {
    const orgRoles = (orgSettings?.jobTitles ?? []).map((entry) => ({ ...entry, source: "org" as const }))
    const storeRoles = (storeSettings?.jobTitles ?? []).map((entry) => ({ ...entry, source: "store" as const }))
    return [...orgRoles, ...storeRoles]
  }, [orgSettings?.jobTitles, storeSettings?.jobTitles])

  const selectedRoleTemplate = useMemo(() => {
    const [source, id] = selectedRoleKey.split(":")
    if (!id || (source !== "org" && source !== "store")) return null
    return roleTemplates.find((entry) => entry.source === source && entry.id === id) ?? null
  }, [roleTemplates, selectedRoleKey])

  const currentMember = useMemo(
    () => members.find((entry) => entry.id === editingUserId) ?? null,
    [editingUserId, members]
  )

  const isEditingOwner = currentMember?.role === "Owner"

  const storeLabelById = useMemo(
    () =>
      new Map(
        stores.map((store) => [
          store.id,
          store.title && store.storeNumber
            ? `${store.title} (${store.storeNumber})`
            : store.title || store.storeNumber || store.name
        ])
      ),
    [stores]
  )

  const emptyPermissions = useCallback(
    () => Object.fromEntries(permissionCatalog.map((permission) => [permission.key, false])) as Record<string, boolean>,
    []
  )

  const parseCsv = (value: string) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)

  const managerRestrictedByOrg = role === "Manager" && Boolean(orgSettings?.managerCanManageUsersOnlyInOwnStore)
  const restrictToActiveStore = role !== "Owner" && (!effectivePermissions.manageStores || managerRestrictedByOrg)

  const effectiveStoreIds = useMemo(
    () =>
      assignmentType === "corporate"
        ? []
        : restrictToActiveStore
          ? activeStoreId
            ? [activeStoreId]
            : []
          : selectedStoreIds,
    [activeStoreId, assignmentType, restrictToActiveStore, selectedStoreIds]
  )

  const occupiedRoleStoreKeys = useMemo(() => {
    const occupied = new Set<string>()
    for (const member of members) {
      if (editingUserId && member.id === editingUserId) continue
      const roleTitle = (member.jobTitle ?? "").trim().toLowerCase()
      if (!roleTitle) continue
      const appliesToStores =
        member.assignmentType === "corporate" || (member.storeIds ?? []).length === 0
          ? stores.map((store) => store.id)
          : member.storeIds
      for (const storeId of appliesToStores) {
        occupied.add(`${roleTitle}|${storeId}`)
      }
    }
    return occupied
  }, [editingUserId, members, stores])

  const availableRoleTemplates = useMemo(() => {
    if (assignmentType !== "store") return roleTemplates
    const targetStoreIds = effectiveStoreIds.length ? effectiveStoreIds : activeStoreId ? [activeStoreId] : []
    return roleTemplates.filter((entry) => {
      if (!entry.singlePerStore || targetStoreIds.length === 0) return true
      const roleName = entry.title.trim().toLowerCase()
      return targetStoreIds.every((storeId) => !occupiedRoleStoreKeys.has(`${roleName}|${storeId}`))
    })
  }, [activeStoreId, assignmentType, effectiveStoreIds, occupiedRoleStoreKeys, roleTemplates])

  const resetForm = useCallback(() => {
    setEditingUserId(null)
    setEmail("")
    setEmployeeId("")
    setFirstName("")
    setLastName("")
    setSelectedRoleKey("")
    setAssignmentType("store")
    setSelectedStoreIds([])
    setDepartmentIdsText("")
    setLocationIdsText("")
    setPermissionFlags(emptyPermissions())
  }, [emptyPermissions])

  useEffect(() => {
    if (Object.keys(permissionFlags).length > 0) return
    setPermissionFlags(emptyPermissions())
  }, [emptyPermissions, permissionFlags])

  useEffect(() => {
    if (isEditingOwner) return
    if (!selectedRoleTemplate) return
    setPermissionFlags((current) => {
      if (Object.keys(current).length === 0) return { ...selectedRoleTemplate.permissionFlags }
      return current
    })
  }, [isEditingOwner, selectedRoleTemplate])

  useEffect(() => {
    if (isEditingOwner) return
    if (selectedRoleTemplate) return
    if (!availableRoleTemplates.length) return
    const first = availableRoleTemplates[0]
    if (!first) return
    setSelectedRoleKey(`${first.source}:${first.id}`)
    setPermissionFlags({ ...first.permissionFlags })
  }, [availableRoleTemplates, isEditingOwner, selectedRoleTemplate])

  const beginEdit = (member: MemberRecord) => {
    setEditingUserId(member.id)
    setEmail(member.email ?? "")
    setEmployeeId(member.employeeId ?? "")
    setFirstName(member.firstName ?? "")
    setLastName(member.lastName ?? "")
    setAssignmentType(member.assignmentType ?? "store")
    setSelectedStoreIds(member.storeIds ?? [])
    setDepartmentIdsText((member.departmentIds ?? []).join(", "))
    setLocationIdsText((member.locationIds ?? []).join(", "))

    const roleTitle = (member.jobTitle ?? "").trim().toLowerCase()
    const matchingTemplate = roleTemplates.find((entry) => entry.title.trim().toLowerCase() === roleTitle)
    setSelectedRoleKey(matchingTemplate ? `${matchingTemplate.source}:${matchingTemplate.id}` : "")

    setPermissionFlags({
      ...(matchingTemplate?.permissionFlags ?? emptyPermissions()),
      ...(member.permissionFlags ?? {})
    })

    setStatusMessage(`Editing ${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() || "Editing user")
    setErrorMessage(null)
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 30)
  }

  const validateRoleSelection = () => {
    if (isEditingOwner) return true
    if (!selectedRoleTemplate) {
      setErrorMessage("Role is required.")
      return false
    }
    if (assignmentType === "store" && effectiveStoreIds.length === 0) {
      setErrorMessage("Select at least one store for a store-assigned user.")
      return false
    }
    return true
  }

  const saveExistingMembership = async () => {
    if (!activeOrgId || !editingUserId) return
    setStatusMessage(null)
    setErrorMessage(null)
    if (!validateRoleSelection()) return

    const selectedBaseRole = isEditingOwner ? "Owner" : selectedRoleTemplate?.baseRole ?? "Staff"
    const selectedRoleTitle = isEditingOwner ? "Owner" : selectedRoleTemplate?.title ?? ""

    try {
      await upsertMember(activeOrgId, {
        userId: editingUserId,
        role: selectedBaseRole,
        storeIds: effectiveStoreIds,
        departmentIds: parseCsv(departmentIdsText),
        locationIds: parseCsv(locationIdsText),
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        employeeId: employeeId.trim(),
        jobTitle: selectedRoleTitle,
        assignmentType,
        permissionFlags,
        canManageStoreUsersOnly:
          !isEditingOwner && selectedBaseRole === "Manager"
            ? Boolean(orgSettings?.managerCanManageUsersOnlyInOwnStore)
            : false
      })
      await refetch()
      setStatusMessage("User updated.")
    } catch (error) {
      const message = String((error as { message?: string } | undefined)?.message ?? "")
      setErrorMessage(message || "Could not update user.")
    }
  }

  const invitePendingUser = async () => {
    if (!activeOrgId || !email.trim() || !employeeId.trim() || !firstName.trim() || !lastName.trim()) return
    setStatusMessage(null)
    setErrorMessage(null)
    if (!validateRoleSelection()) return

    const selectedBaseRole = selectedRoleTemplate?.baseRole ?? "Staff"
    const selectedRoleTitle = selectedRoleTemplate?.title ?? ""

    try {
      await createPendingUser(activeOrgId, {
        email: email.trim(),
        employeeId: employeeId.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        jobTitle: selectedRoleTitle,
        assignmentType,
        storeIds: effectiveStoreIds,
        departmentIds: parseCsv(departmentIdsText),
        locationIds: parseCsv(locationIdsText),
        role: selectedBaseRole,
        permissionFlags
      })
      setStatusMessage("Pending user created. They can now join with company code + employee ID.")
      resetForm()
    } catch (error) {
      const message = String((error as { message?: string } | undefined)?.message ?? "")
      setErrorMessage(message || "Could not create pending user.")
    }
  }

  const permissionSections = useMemo(
    () =>
      permissionSectionOrder.map((section) => ({
        ...section,
        permissions: permissionCatalog.filter((entry) => entry.section === section.key)
      })),
    []
  )

  const columns: TableColumn<MemberRecord>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) => `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.email || row.id
    },
    { key: "employeeId", header: "Employee ID", render: (row) => row.employeeId ?? "—" },
    { key: "email", header: "Email", render: (row) => row.email ?? "—" },
    { key: "jobTitle", header: "Role", render: (row) => row.jobTitle ?? (row.role === "Owner" ? "Owner" : "—") },
    {
      key: "stores",
      header: "Stores",
      render: (row) =>
        row.storeIds.length ? row.storeIds.map((storeId) => storeLabelById.get(storeId) ?? storeId).join(", ") : "All"
    },
    { key: "status", header: "Status", render: (row) => row.status ?? "active" },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <AppButton variant="secondary" className="!px-3 !py-1" onClick={() => beginEdit(row)}>
          Edit
        </AppButton>
      )
    }
  ]

  const storeOptions = stores.map((store) => ({ id: store.id, label: storeLabelById.get(store.id) ?? store.id }))

  if (!effectivePermissions.manageUsers) {
    return (
      <div>
        <PageHead title="Users" subtitle="Role-based access and store assignments." />
        <AppCard>
          <p className="secondary-text">You do not have permission to manage users.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead title="Users" subtitle="Create pending users and edit active users with role-based permissions." />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_2fr]">
        <AppCard>
          <div ref={formRef} className="flex items-center justify-between gap-2">
            <h2 className="card-title">{editingUserId ? "Edit User" : "Add User"}</h2>
            {editingUserId ? (
              <AppButton variant="secondary" className="!px-3 !py-1" onClick={resetForm}>
                Clear
              </AppButton>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3">
            <AppInput
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <AppInput
              placeholder="Employee ID"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <AppInput
                placeholder="First name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
              <AppInput
                placeholder="Last name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
            <AppSelect
              value={assignmentType}
              onChange={(event) => setAssignmentType(event.target.value as "corporate" | "store")}
            >
              <option value="store">Store assignment</option>
              <option value="corporate">Corporate assignment</option>
            </AppSelect>

            {isEditingOwner ? (
              <AppInput value="Owner" readOnly />
            ) : (
              <AppSelect
                value={selectedRoleKey}
                onChange={(event) => {
                  const key = event.target.value
                  setSelectedRoleKey(key)
                  const [source, id] = key.split(":")
                  const template = roleTemplates.find((entry) => entry.source === source && entry.id === id)
                  setPermissionFlags(template ? { ...template.permissionFlags } : emptyPermissions())
                }}
              >
                <option value="">Select role (required)</option>
                {availableRoleTemplates.map((template) => (
                  <option key={`${template.source}:${template.id}`} value={`${template.source}:${template.id}`}>
                    {template.title} {template.source === "org" ? "(Org)" : "(Store)"}
                  </option>
                ))}
              </AppSelect>
            )}

            {assignmentType === "store" ? (
              <div className="rounded-2xl border border-app-border p-3">
                <p className="mb-2 text-sm font-semibold">Store assignments</p>
                <div className="grid gap-2">
                  {storeOptions.map((store) => (
                    <AppCheckbox
                      key={store.id}
                      disabled={restrictToActiveStore && store.id !== activeStoreId}
                      checked={effectiveStoreIds.includes(store.id)}
                      onChange={(event) =>
                        setSelectedStoreIds((prev) => {
                          if (event.target.checked) return [...new Set([...prev, store.id])]
                          return prev.filter((entry) => entry !== store.id)
                        })
                      }
                      label={store.label}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <AppInput
              placeholder="Departments (comma separated)"
              value={departmentIdsText}
              onChange={(event) => setDepartmentIdsText(event.target.value)}
            />
            <AppInput
              placeholder="Locations (comma separated)"
              value={locationIdsText}
              onChange={(event) => setLocationIdsText(event.target.value)}
            />

            <div className="rounded-2xl border border-app-border p-3">
              {permissionSections.map((section) => (
                <div key={section.key} className="mb-3 last:mb-0">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-app-muted">{section.title}</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {section.permissions.map((permission) => (
                      <AppCheckbox
                        key={permission.key}
                        checked={Boolean(permissionFlags[permission.key])}
                        onChange={(event) =>
                          setPermissionFlags((prev) => ({
                            ...prev,
                            [permission.key]: event.target.checked
                          }))
                        }
                        label={permission.label}
                        description={permission.description}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {editingUserId ? (
                <AppButton onClick={() => void saveExistingMembership()}>
                  Save User
                </AppButton>
              ) : (
                <AppButton onClick={() => void invitePendingUser()}>
                  Create Pending User
                </AppButton>
              )}
              <AppButton variant="secondary" onClick={resetForm}>
                Reset Form
              </AppButton>
            </div>
          </div>
        </AppCard>

        <AppCard>
          <DataTable columns={columns} rows={members} empty="No users found." />
        </AppCard>
      </div>

      {statusMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      ) : null}
    </div>
  )
}
