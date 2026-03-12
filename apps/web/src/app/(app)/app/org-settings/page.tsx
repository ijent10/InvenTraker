"use client"

import { useEffect, useMemo, useState } from "react"
import { AppButton, AppCard, AppCheckbox, AppInput, AppSelect, AppTextarea, appButtonClass } from "@inventracker/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  type DepartmentConfigRecord,
  fetchOrganizationBillingStatus,
  fetchOrgSettings,
  isProTierBilling,
  permissionCatalog,
  saveOrgSettings,
  uploadMediaAsset,
  type OrgSettingsRecord,
  type RoleTemplateRecord
} from "@/lib/data/firestore"

const permissionSectionOrder: Array<{ key: "general" | "app" | "web"; title: string }> = [
  { key: "general", title: "General Permissions" },
  { key: "app", title: "App Permissions" },
  { key: "web", title: "Website Permissions" }
]

function emptyPermissionFlags() {
  return Object.fromEntries(permissionCatalog.map((entry) => [entry.key, false])) as Record<string, boolean>
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function cleanText(value: string): string {
  return value.trim()
}

function normalizeDepartmentConfigs(configs: DepartmentConfigRecord[]): DepartmentConfigRecord[] {
  const seen = new Set<string>()
  const rows: DepartmentConfigRecord[] = []
  for (const config of configs) {
    const name = cleanText(config.name)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const locationSeen = new Set<string>()
    const locations: string[] = []
    for (const rawLocation of config.locations ?? []) {
      const location = cleanText(rawLocation)
      if (!location) continue
      const locationKey = location.toLowerCase()
      if (locationSeen.has(locationKey)) continue
      locationSeen.add(locationKey)
      locations.push(location)
    }

    rows.push({
      id: cleanText(config.id) || makeId("department"),
      name,
      locations
    })
  }
  return rows
}

function inferBaseRole(title: string, permissionFlags: Record<string, boolean>): "Owner" | "Manager" | "Staff" {
  const normalized = title.trim().toLowerCase()
  if (normalized === "owner" || normalized.includes("owner")) return "Owner"
  if (
    normalized.includes("manager") ||
    permissionFlags.manageUsers ||
    permissionFlags.manageStores ||
    permissionFlags.manageStoreSettings ||
    permissionFlags.manageOrgSettings
  ) {
    return "Manager"
  }
  return "Staff"
}

export default function OrganizationSettingsPage() {
  const { user } = useAuthUser()
  const { activeOrgId, effectivePermissions } = useOrgContext()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<Partial<OrgSettingsRecord>>({})
  const [roles, setRoles] = useState<RoleTemplateRecord[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<string>("")
  const [departmentConfigs, setDepartmentConfigs] = useState<DepartmentConfigRecord[]>([])
  const [newDepartmentName, setNewDepartmentName] = useState("")
  const [newLocationsByDepartment, setNewLocationsByDepartment] = useState<Record<string, string>>({})
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: settings, refetch } = useQuery({
    queryKey: ["org-settings", activeOrgId],
    queryFn: () => fetchOrgSettings(activeOrgId),
    enabled: Boolean(activeOrgId)
  })
  const { data: billingStatus } = useQuery({
    queryKey: ["org-settings-billing", activeOrgId],
    queryFn: () => fetchOrganizationBillingStatus(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const canUseProBranding = isProTierBilling(billingStatus)

  useEffect(() => {
    if (!settings) return
    setForm(settings)
    setRoles(settings.jobTitles ?? [])
    setSelectedRoleId(settings.jobTitles?.[0]?.id ?? "")
    setDepartmentConfigs(normalizeDepartmentConfigs(settings.departmentConfigs ?? []))
  }, [settings])

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? null,
    [roles, selectedRoleId]
  )

  const permissionSections = useMemo(
    () =>
      permissionSectionOrder.map((section) => ({
        ...section,
        permissions: permissionCatalog.filter((entry) => entry.section === section.key)
      })),
    []
  )

  const save = async () => {
    if (!activeOrgId || !user?.uid) return
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const normalizedConfigs = normalizeDepartmentConfigs(departmentConfigs)
      await saveOrgSettings(
        activeOrgId,
        {
          ...form,
          departmentConfigs: normalizedConfigs,
          departments: normalizedConfigs.map((entry) => entry.name),
          locationTemplates: Array.from(new Set(normalizedConfigs.flatMap((entry) => entry.locations))),
          jobTitles: roles.filter((role) => role.title.trim().length > 0)
        },
        user.uid
      )
      await refetch()
      await queryClient.invalidateQueries({ queryKey: ["shell-org-settings", activeOrgId] })
      setStatusMessage("Organization settings saved.")
    } catch {
      setErrorMessage("Could not save organization settings.")
    }
  }

  const addDepartment = () => {
    const name = cleanText(newDepartmentName)
    if (!name) return
    setDepartmentConfigs((prev) =>
      normalizeDepartmentConfigs([
        ...prev,
        {
          id: makeId("department"),
          name,
          locations: []
        }
      ])
    )
    setNewDepartmentName("")
  }

  const addLocation = (departmentId: string) => {
    const location = cleanText(newLocationsByDepartment[departmentId] ?? "")
    if (!location) return
    setDepartmentConfigs((prev) =>
      prev.map((department) =>
        department.id === departmentId
          ? {
              ...department,
              locations: Array.from(new Set([...department.locations, location]))
            }
          : department
      )
    )
    setNewLocationsByDepartment((prev) => ({ ...prev, [departmentId]: "" }))
  }

  const addRoleDraft = () => {
    const nextIndex = roles.length + 1
    const title = `New Role ${nextIndex}`
    const nextRole: RoleTemplateRecord = {
      id: `role_${crypto.randomUUID()}`,
      title,
      baseRole: "Staff",
      singlePerStore: false,
      permissionFlags: emptyPermissionFlags()
    }
    setRoles((prev) => [...prev, nextRole])
    setSelectedRoleId("")
  }

  const uploadBrandLogo = async (file: File, target: "primary" | "light" | "dark") => {
    if (!activeOrgId || !user?.uid) return
    if (!canUseProBranding) {
      setErrorMessage("Custom branding is available on the Pro tier.")
      return
    }
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const uploaded = await uploadMediaAsset({
        file,
        orgId: activeOrgId,
        userId: user.uid,
        type: "image"
      })
      if (!uploaded?.downloadUrl) {
        throw new Error("No logo URL")
      }
      setForm((prev) => {
        if (target === "light") {
          return {
            ...prev,
            customBrandingEnabled: true,
            replaceAppNameWithLogo: true,
            logoLightUrl: uploaded.downloadUrl,
            logoLightAssetId: uploaded.id
          }
        }
        if (target === "dark") {
          return {
            ...prev,
            customBrandingEnabled: true,
            replaceAppNameWithLogo: true,
            logoDarkUrl: uploaded.downloadUrl,
            logoDarkAssetId: uploaded.id
          }
        }
        return {
          ...prev,
          customBrandingEnabled: true,
          replaceAppNameWithLogo: true,
          brandLogoUrl: uploaded.downloadUrl,
          brandLogoAssetId: uploaded.id
        }
      })
      setStatusMessage("Brand logo uploaded.")
    } catch {
      setErrorMessage("Could not upload brand logo.")
    }
  }

  if (!effectivePermissions.manageOrgSettings) {
    return (
      <div>
        <PageHead title="Organization Settings" subtitle="Organization-wide policy and permissions." />
        <AppCard>
          <p className="secondary-text">You do not have permission to edit organization settings.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead
        title="Organization Settings"
        subtitle="Global controls. Organization metadata changes flow to all stores."
        actions={
          <AppButton onClick={() => void save()}>
            Save Organization Settings
          </AppButton>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <AppCard>
          <h2 className="card-title">Core Controls</h2>
          <div className="mt-4 grid gap-3">
            <AppInput
              placeholder="Organization name"
              value={String(form.organizationName ?? "")}
              onChange={(event) => setForm((prev) => ({ ...prev, organizationName: event.target.value }))}
            />
            <AppInput
              className="uppercase"
              placeholder="Company code (used for employee signup)"
              value={String(form.companyCode ?? "")}
              onChange={(event) => setForm((prev) => ({ ...prev, companyCode: event.target.value.toUpperCase() }))}
            />
            <AppCheckbox
              checked={Boolean(form.canStoreRemoveItems)}
              onChange={(event) => setForm((prev) => ({ ...prev, canStoreRemoveItems: event.target.checked }))}
              label="Store can remove items from inventory"
            />
            <AppCheckbox
              checked={Boolean(form.allowStoreRoleCreation)}
              onChange={(event) => setForm((prev) => ({ ...prev, allowStoreRoleCreation: event.target.checked }))}
              label="Allow stores to create additional roles"
            />
            <AppCheckbox
              checked={Boolean(form.managerCanManageUsersOnlyInOwnStore)}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, managerCanManageUsersOnlyInOwnStore: event.target.checked }))
              }
              label="Managers can add users only to their own store"
            />
          </div>
        </AppCard>

        <AppCard>
          <h2 className="card-title">Departments + Locations</h2>
          <p className="secondary-text mt-1">
            Configure departments and locations in the new model used by web + app.
          </p>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <AppInput
                placeholder="New department name"
                value={newDepartmentName}
                onChange={(event) => setNewDepartmentName(event.target.value)}
              />
              <AppButton variant="secondary" onClick={addDepartment}>
                Add Department
              </AppButton>
            </div>

            {departmentConfigs.length === 0 ? (
              <p className="secondary-text rounded-2xl border border-app-border bg-app-surface-soft p-3 text-sm">
                No departments configured yet.
              </p>
            ) : (
              departmentConfigs.map((department) => (
                <div key={department.id} className="rounded-2xl border border-app-border bg-app-surface-soft p-3">
                  <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <AppInput
                      value={department.name}
                      onChange={(event) =>
                        setDepartmentConfigs((prev) =>
                          prev.map((entry) =>
                            entry.id === department.id ? { ...entry, name: event.target.value } : entry
                          )
                        )
                      }
                      placeholder="Department name"
                    />
                    <AppButton
                      variant="secondary"
                      className="!border-rose-500/40 !text-rose-300"
                      onClick={() =>
                        setDepartmentConfigs((prev) => prev.filter((entry) => entry.id !== department.id))
                      }
                    >
                      Remove
                    </AppButton>
                  </div>

                  <div className="mb-2 flex flex-wrap gap-2">
                    {department.locations.length === 0 ? (
                      <span className="secondary-text text-sm">No locations yet.</span>
                    ) : (
                      department.locations.map((location) => (
                        <AppButton
                          key={`${department.id}-${location}`}
                          type="button"
                          variant="secondary"
                          className="h-7 rounded-full border border-app-border px-3 py-1 text-xs text-app-muted hover:!border-rose-500/50 hover:!text-rose-300"
                          onClick={() =>
                            setDepartmentConfigs((prev) =>
                              prev.map((entry) =>
                                entry.id === department.id
                                  ? { ...entry, locations: entry.locations.filter((item) => item !== location) }
                                  : entry
                              )
                            )
                          }
                          title="Remove location"
                        >
                          {location} ×
                        </AppButton>
                      ))
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <AppInput
                      placeholder="Add location"
                      value={newLocationsByDepartment[department.id] ?? ""}
                      onChange={(event) =>
                        setNewLocationsByDepartment((prev) => ({ ...prev, [department.id]: event.target.value }))
                      }
                    />
                    <AppButton variant="secondary" onClick={() => addLocation(department.id)}>
                      Add Location
                    </AppButton>
                  </div>
                </div>
              ))
            )}
          </div>
        </AppCard>

        <AppCard>
          <h2 className="card-title">Feature Access</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {Object.entries(form.featureFlags ?? {}).map(([feature, enabled]) => (
              <AppCheckbox
                key={feature}
                checked={Boolean(enabled)}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    featureFlags: { ...(prev.featureFlags ?? {}), [feature]: event.target.checked }
                  }))
                }
                label={feature}
              />
            ))}
          </div>
        </AppCard>

        <AppCard>
          <h2 className="card-title">Branding (Pro)</h2>
          <p className="secondary-text mt-1">
            Pro organizations can replace InvenTraker app-name references with their own logo.
          </p>
          {!canUseProBranding ? (
            <p className="mt-4 rounded-2xl border border-app-border bg-app-surface-soft px-4 py-3 text-sm text-app-muted">
              Upgrade this organization to Pro to unlock logo branding.
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              <AppCheckbox
                checked={Boolean(form.customBrandingEnabled)}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, customBrandingEnabled: event.target.checked }))
                }
                label="Enable custom branding"
              />
              <AppCheckbox
                checked={Boolean(form.replaceAppNameWithLogo)}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, replaceAppNameWithLogo: event.target.checked }))
                }
                label="Replace app-name references with logo in the signed-in shell"
              />
              <AppInput
                placeholder="Brand display name (optional)"
                value={String(form.brandDisplayName ?? "")}
                onChange={(event) => setForm((prev) => ({ ...prev, brandDisplayName: event.target.value }))}
              />
              <AppTextarea
                className="min-h-[84px]"
                placeholder="Welcome message (optional)"
                value={String(form.welcomeMessage ?? "")}
                onChange={(event) => setForm((prev) => ({ ...prev, welcomeMessage: event.target.value }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-app-muted">Header style</p>
                  <AppSelect
                    value={String(form.appHeaderStyle ?? "icon_name")}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        appHeaderStyle: event.target.value === "icon_only" ? "icon_only" : "icon_name"
                      }))
                    }
                  >
                    <option value="icon_name">Icon + Name</option>
                    <option value="icon_only">Icon Only</option>
                  </AppSelect>
                </div>
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-app-muted">Module icon style</p>
                  <AppSelect
                    value={String(form.moduleIconStyle ?? "rounded")}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        moduleIconStyle: event.target.value === "square" ? "square" : "rounded"
                      }))
                    }
                  >
                    <option value="rounded">Rounded</option>
                    <option value="square">Square</option>
                  </AppSelect>
                </div>
              </div>
              <div className="rounded-2xl border border-app-border bg-app-surface-soft p-3">
                <p className="mb-2 text-xs uppercase tracking-wide text-app-muted">Primary logo</p>
                {form.brandLogoUrl ? (
                  <img
                    src={form.brandLogoUrl}
                    alt="Organization logo preview"
                    className="h-16 w-auto max-w-full rounded-xl border border-app-border bg-white object-contain p-2"
                  />
                ) : (
                  <p className="secondary-text text-sm">No logo uploaded yet.</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className={appButtonClass("secondary", "cursor-pointer !h-9 !px-3 !py-2")}>
                    Upload Logo
                    <AppInput
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (!file) return
                        void uploadBrandLogo(file, "primary")
                      }}
                    />
                  </label>
                  {form.brandLogoUrl ? (
                    <AppButton
                      variant="secondary"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          brandLogoUrl: "",
                          brandLogoAssetId: ""
                        }))
                      }
                    >
                      Remove Logo
                    </AppButton>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-app-border bg-app-surface-soft p-3">
                  <p className="mb-2 text-xs uppercase tracking-wide text-app-muted">Light theme logo</p>
                  {form.logoLightUrl ? (
                    <img
                      src={form.logoLightUrl}
                      alt="Light logo preview"
                      className="h-16 w-auto max-w-full rounded-xl border border-app-border bg-white object-contain p-2"
                    />
                  ) : (
                    <p className="secondary-text text-sm">Optional override for light mode.</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className={appButtonClass("secondary", "cursor-pointer !h-9 !px-3 !py-2")}>
                      Upload
                      <AppInput
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (!file) return
                          void uploadBrandLogo(file, "light")
                        }}
                      />
                    </label>
                    {form.logoLightUrl ? (
                      <AppButton
                        variant="secondary"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            logoLightUrl: "",
                            logoLightAssetId: ""
                          }))
                        }
                      >
                        Clear
                      </AppButton>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-2xl border border-app-border bg-app-surface-soft p-3">
                  <p className="mb-2 text-xs uppercase tracking-wide text-app-muted">Dark theme logo</p>
                  {form.logoDarkUrl ? (
                    <img
                      src={form.logoDarkUrl}
                      alt="Dark logo preview"
                      className="h-16 w-auto max-w-full rounded-xl border border-app-border bg-white object-contain p-2"
                    />
                  ) : (
                    <p className="secondary-text text-sm">Optional override for dark mode.</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className={appButtonClass("secondary", "cursor-pointer !h-9 !px-3 !py-2")}>
                      Upload
                      <AppInput
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (!file) return
                          void uploadBrandLogo(file, "dark")
                        }}
                      />
                    </label>
                    {form.logoDarkUrl ? (
                      <AppButton
                        variant="secondary"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            logoDarkUrl: "",
                            logoDarkAssetId: ""
                          }))
                        }
                      >
                        Clear
                      </AppButton>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}
        </AppCard>
      </div>

      <AppCard className="mt-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="card-title">Roles</h2>
            <p className="secondary-text mt-1">Select a role to edit permissions. Create additional roles as needed.</p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
          <div className="space-y-2">
            {roles.map((roleTemplate) => (
              <AppButton
                key={roleTemplate.id}
                variant="secondary"
                className={`!h-auto !w-full !justify-start !rounded-full !px-4 !py-2 !text-left !text-sm ${
                  selectedRoleId === roleTemplate.id
                    ? "!border-[color:var(--accent)] !bg-app-surface-soft !text-[color:var(--app-text)]"
                    : "!border-[color:var(--app-border)] !text-[color:var(--app-muted)]"
                }`}
                onClick={() => {
                  setSelectedRoleId(roleTemplate.id)
                }}
              >
                {roleTemplate.title || "Untitled"}
              </AppButton>
            ))}
            <AppButton variant="secondary" className="!w-full" onClick={addRoleDraft}>
              Add Role
            </AppButton>
          </div>

          <div>
            {selectedRole ? (
              <div className="rounded-2xl border border-app-border p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <AppInput
                    value={selectedRole.title}
                    onChange={(event) =>
                      setRoles((prev) =>
                        prev.map((entry) =>
                          entry.id === selectedRole.id
                            ? {
                                ...entry,
                                title: event.target.value,
                                baseRole: inferBaseRole(event.target.value, entry.permissionFlags)
                              }
                            : entry
                        )
                      )
                    }
                    placeholder="Role name"
                  />
                  <AppButton
                    variant="secondary"
                    className="!border-rose-500/50 !text-rose-300"
                    onClick={() => {
                      setRoles((prev) => prev.filter((entry) => entry.id !== selectedRole.id))
                      setSelectedRoleId("")
                    }}
                  >
                    Delete
                  </AppButton>
                </div>
                <AppCheckbox
                  className="mt-3"
                  checked={Boolean(selectedRole.singlePerStore)}
                  onChange={(event) =>
                    setRoles((prev) =>
                      prev.map((entry) =>
                        entry.id === selectedRole.id ? { ...entry, singlePerStore: event.target.checked } : entry
                      )
                    )
                  }
                  label="Is there only one person with this role in a store?"
                />
                <div className="mt-3 grid gap-3">
                  {permissionSections.map((section) => (
                    <div key={`${selectedRole.id}-${section.key}`}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-app-muted">{section.title}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {section.permissions.map((permission) => (
                          <AppCheckbox
                            key={`${selectedRole.id}-${permission.key}`}
                            checked={Boolean(selectedRole.permissionFlags?.[permission.key])}
                            onChange={(event) =>
                              setRoles((prev) =>
                                prev.map((entry) =>
                                  entry.id === selectedRole.id
                                    ? {
                                        ...entry,
                                        baseRole: inferBaseRole(entry.title, {
                                          ...entry.permissionFlags,
                                          [permission.key]: event.target.checked
                                        }),
                                        permissionFlags: {
                                          ...entry.permissionFlags,
                                          [permission.key]: event.target.checked
                                        }
                                      }
                                    : entry
                                )
                              )
                            }
                            label={permission.label}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <AppButton onClick={() => setSelectedRoleId("")}>
                    Save Role
                  </AppButton>
                </div>
              </div>
            ) : (
              <p className="secondary-text rounded-2xl border border-app-border p-4">Select a role or click Add Role.</p>
            )}
          </div>
        </div>
      </AppCard>

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
