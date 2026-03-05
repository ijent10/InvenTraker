"use client"

import { useEffect, useMemo, useState } from "react"
import { AppButton, AppCard, AppCheckbox, AppInput, AppTextarea } from "@inventracker/ui"
import { useQuery } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  fetchOrgSettings,
  fetchStoreSettings,
  fetchVendors,
  permissionCatalog,
  removeVendor,
  saveStoreSettings,
  upsertVendor,
  type RoleTemplateRecord,
  type StoreSettingsRecord
} from "@/lib/data/firestore"

type RoleSource = "org" | "store"

type RoleWithSource = RoleTemplateRecord & {
  source: RoleSource
  locked: boolean
}

const permissionSectionOrder: Array<{ key: "general" | "app" | "web"; title: string }> = [
  { key: "general", title: "General Permissions" },
  { key: "app", title: "App Permissions" },
  { key: "web", title: "Website Permissions" }
]

function emptyPermissionFlags() {
  return Object.fromEntries(permissionCatalog.map((entry) => [entry.key, false])) as Record<string, boolean>
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

export default function StoreSettingsPage() {
  const { user } = useAuthUser()
  const { activeOrgId, activeStore, effectivePermissions } = useOrgContext()
  const canManageVendors =
    effectivePermissions.manageVendors === true ||
    effectivePermissions.manageStoreSettings === true ||
    effectivePermissions.manageOrgSettings === true

  const [form, setForm] = useState<Partial<StoreSettingsRecord>>({})
  const [localRoles, setLocalRoles] = useState<RoleTemplateRecord[]>([])
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>("")
  const [departmentsText, setDepartmentsText] = useState("")
  const [locationsText, setLocationsText] = useState("")
  const [vendorName, setVendorName] = useState("")
  const [vendorDays, setVendorDays] = useState("")
  const [vendorLeadDays, setVendorLeadDays] = useState("0")
  const [vendorCutoff, setVendorCutoff] = useState("08:00")
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: settings, refetch } = useQuery({
    queryKey: ["store-settings", activeOrgId, activeStore?.id],
    queryFn: () => fetchStoreSettings(activeOrgId, activeStore!),
    enabled: Boolean(activeOrgId && activeStore)
  })

  const { data: orgSettings } = useQuery({
    queryKey: ["org-settings-for-store-settings", activeOrgId],
    queryFn: () => fetchOrgSettings(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const { data: vendors = [], refetch: refetchVendors } = useQuery({
    queryKey: ["store-settings-vendors", activeOrgId],
    queryFn: () => fetchVendors(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  useEffect(() => {
    if (!settings) return
    setForm(settings)
    setLocalRoles(settings.jobTitles ?? [])
    setSelectedRoleKey("")
    setDepartmentsText((settings.departments ?? []).join(", "))
    setLocationsText((settings.locationTemplates ?? []).join(", "))
  }, [settings])

  const permissionSections = useMemo(
    () =>
      permissionSectionOrder.map((section) => ({
        ...section,
        permissions: permissionCatalog.filter((entry) => entry.section === section.key)
      })),
    []
  )

  const orgRoles = useMemo(() => orgSettings?.jobTitles ?? [], [orgSettings?.jobTitles])
  const combinedRoles = useMemo<RoleWithSource[]>(() => {
    const combined: RoleWithSource[] = []
    for (const roleTemplate of orgRoles) {
      combined.push({ ...roleTemplate, source: "org", locked: true })
    }
    for (const roleTemplate of localRoles) {
      combined.push({ ...roleTemplate, source: "store", locked: false })
    }
    return combined
  }, [localRoles, orgRoles])

  const selectedRole = useMemo(() => {
    const [source, id] = selectedRoleKey.split(":")
    if (!id || (source !== "org" && source !== "store")) return null
    return combinedRoles.find((entry) => entry.source === source && entry.id === id) ?? null
  }, [combinedRoles, selectedRoleKey])

  const save = async () => {
    if (!activeOrgId || !activeStore || !user?.uid) return
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const reworkedBarcodeRule = {
        enabled: Boolean(form.reworkedBarcodeRule?.enabled),
        productCodeLength: Math.max(1, Number(form.reworkedBarcodeRule?.productCodeLength ?? 6)),
        encodedPriceLength: Math.max(1, Number(form.reworkedBarcodeRule?.encodedPriceLength ?? 5)),
        trailingDigitsLength: Math.max(0, Number(form.reworkedBarcodeRule?.trailingDigitsLength ?? 1)),
        priceDivisor: Math.max(1, Number(form.reworkedBarcodeRule?.priceDivisor ?? 100))
      }
      await saveStoreSettings(
        activeOrgId,
        activeStore,
        {
          ...form,
          departments: departmentsText
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
          locationTemplates: locationsText
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
          jobTitles: localRoles.filter((entry) => entry.title.trim().length > 0),
          reworkedBarcodeRule
        },
        user.uid
      )
      await refetch()
      setStatusMessage("Store settings saved.")
    } catch {
      setErrorMessage("Could not save store settings.")
    }
  }

  const addVendor = async () => {
    if (!activeOrgId || !vendorName.trim()) return
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const orderingDays = vendorDays
        .split(",")
        .map((entry) => Number(entry.trim()))
        .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6)
      await upsertVendor(activeOrgId, {
        name: vendorName.trim(),
        orderingDays,
        cutoffTimeLocal: vendorCutoff.trim() || "08:00",
        leadDays: Math.max(0, Number(vendorLeadDays || "0"))
      })
      await refetchVendors()
      setVendorName("")
      setVendorDays("")
      setVendorLeadDays("0")
      setStatusMessage("Vendor saved.")
    } catch {
      setErrorMessage("Could not save vendor.")
    }
  }

  const addRoleDraft = () => {
    const nextIndex = localRoles.length + 1
    const title = `New Role ${nextIndex}`
    const nextRole: RoleTemplateRecord = {
      id: `role_${crypto.randomUUID()}`,
      title,
      baseRole: "Staff",
      singlePerStore: false,
      permissionFlags: emptyPermissionFlags()
    }
    setLocalRoles((prev) => [...prev, nextRole])
    setSelectedRoleKey("")
  }

  if (!effectivePermissions.manageStoreSettings) {
    return (
      <div>
        <PageHead title="Store Settings" subtitle="Store-level settings and permissions." />
        <AppCard>
          <p className="secondary-text">You do not have permission to edit store settings.</p>
        </AppCard>
      </div>
    )
  }

  if (!activeStore) {
    return (
      <div>
        <PageHead title="Store Settings" subtitle="Store-level settings and permissions." />
        <AppCard>
          <p className="secondary-text">Select a store first.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead
        title="Store Settings"
        subtitle={`Settings for ${activeStore.title ?? activeStore.name}`}
        actions={
          <AppButton onClick={() => void save()}>
            Save Store Settings
          </AppButton>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <AppCard>
          <h2 className="card-title">Core Controls</h2>
          <div className="mt-4 grid gap-3">
            <AppCheckbox
              checked={Boolean(form.canStoreRemoveItems)}
              onChange={(event) => setForm((prev) => ({ ...prev, canStoreRemoveItems: event.target.checked }))}
              label="Users at this store can remove items"
            />
            <p className="secondary-text text-xs">
              Sale controls and notification sending are now managed by each Role permission set.
            </p>
          </div>
        </AppCard>

        <AppCard>
          <h2 className="card-title">Reworked Barcode Parsing</h2>
          <p className="secondary-text mt-1 text-xs">
            Configure how this store decodes reworked labels. Example: product digits + encoded package price + trailing digit.
          </p>
          <div className="mt-4 grid gap-3">
            <AppCheckbox
              checked={Boolean(form.reworkedBarcodeRule?.enabled)}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  reworkedBarcodeRule: {
                    enabled: event.target.checked,
                    productCodeLength: Number(prev.reworkedBarcodeRule?.productCodeLength ?? 6),
                    encodedPriceLength: Number(prev.reworkedBarcodeRule?.encodedPriceLength ?? 5),
                    trailingDigitsLength: Number(prev.reworkedBarcodeRule?.trailingDigitsLength ?? 1),
                    priceDivisor: Number(prev.reworkedBarcodeRule?.priceDivisor ?? 100)
                  }
                }))
              }
              label="Enable store barcode parsing rule for reworked items"
            />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <p className="secondary-text mb-1 text-xs">Product code digits (first segment)</p>
                <AppInput
                  type="number"
                  min={1}
                  value={String(form.reworkedBarcodeRule?.productCodeLength ?? 6)}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      reworkedBarcodeRule: {
                        enabled: Boolean(prev.reworkedBarcodeRule?.enabled),
                        productCodeLength: Number(event.target.value || "6"),
                        encodedPriceLength: Number(prev.reworkedBarcodeRule?.encodedPriceLength ?? 5),
                        trailingDigitsLength: Number(prev.reworkedBarcodeRule?.trailingDigitsLength ?? 1),
                        priceDivisor: Number(prev.reworkedBarcodeRule?.priceDivisor ?? 100)
                      }
                    }))
                  }
                  placeholder="Example: 6"
                />
              </div>
              <div>
                <p className="secondary-text mb-1 text-xs">Encoded package price digits (middle segment)</p>
                <AppInput
                  type="number"
                  min={1}
                  value={String(form.reworkedBarcodeRule?.encodedPriceLength ?? 5)}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      reworkedBarcodeRule: {
                        enabled: Boolean(prev.reworkedBarcodeRule?.enabled),
                        productCodeLength: Number(prev.reworkedBarcodeRule?.productCodeLength ?? 6),
                        encodedPriceLength: Number(event.target.value || "5"),
                        trailingDigitsLength: Number(prev.reworkedBarcodeRule?.trailingDigitsLength ?? 1),
                        priceDivisor: Number(prev.reworkedBarcodeRule?.priceDivisor ?? 100)
                      }
                    }))
                  }
                  placeholder="Example: 5"
                />
              </div>
              <div>
                <p className="secondary-text mb-1 text-xs">Trailing check/control digits (last segment)</p>
                <AppInput
                  type="number"
                  min={0}
                  value={String(form.reworkedBarcodeRule?.trailingDigitsLength ?? 1)}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      reworkedBarcodeRule: {
                        enabled: Boolean(prev.reworkedBarcodeRule?.enabled),
                        productCodeLength: Number(prev.reworkedBarcodeRule?.productCodeLength ?? 6),
                        encodedPriceLength: Number(prev.reworkedBarcodeRule?.encodedPriceLength ?? 5),
                        trailingDigitsLength: Number(event.target.value || "1"),
                        priceDivisor: Number(prev.reworkedBarcodeRule?.priceDivisor ?? 100)
                      }
                    }))
                  }
                  placeholder="Example: 1"
                />
              </div>
              <div>
                <p className="secondary-text mb-1 text-xs">Price divisor (encoded cents to dollars)</p>
                <AppInput
                  type="number"
                  min={1}
                  value={String(form.reworkedBarcodeRule?.priceDivisor ?? 100)}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      reworkedBarcodeRule: {
                        enabled: Boolean(prev.reworkedBarcodeRule?.enabled),
                        productCodeLength: Number(prev.reworkedBarcodeRule?.productCodeLength ?? 6),
                        encodedPriceLength: Number(prev.reworkedBarcodeRule?.encodedPriceLength ?? 5),
                        trailingDigitsLength: Number(prev.reworkedBarcodeRule?.trailingDigitsLength ?? 1),
                        priceDivisor: Number(event.target.value || "100")
                      }
                    }))
                  }
                  placeholder="Example: 100"
                />
              </div>
            </div>
            <p className="secondary-text text-xs">
              With lengths 6 + 5 + 1 and divisor 100, barcode `657983008814` decodes package price as $8.81.
            </p>
          </div>
        </AppCard>

        <AppCard>
          <h2 className="card-title">Departments + Locations</h2>
          <div className="mt-4 grid gap-3">
            <AppTextarea
              className="min-h-[90px]"
              value={departmentsText}
              onChange={(event) => setDepartmentsText(event.target.value)}
              placeholder="Departments (comma-separated)"
            />
            <AppTextarea
              className="min-h-[90px]"
              value={locationsText}
              onChange={(event) => setLocationsText(event.target.value)}
              placeholder="Location templates (comma-separated)"
            />
          </div>
        </AppCard>

        <AppCard>
          <h2 className="card-title">Vendors</h2>
          <div className="mt-3 grid gap-2">
            <AppInput
              placeholder="Vendor name"
              value={vendorName}
              disabled={!canManageVendors}
              onChange={(event) => setVendorName(event.target.value)}
            />
            <div className="grid grid-cols-3 gap-2">
              <AppInput
                placeholder="Order days 0,2,5"
                value={vendorDays}
                disabled={!canManageVendors}
                onChange={(event) => setVendorDays(event.target.value)}
              />
              <AppInput
                placeholder="Lead days"
                type="number"
                value={vendorLeadDays}
                disabled={!canManageVendors}
                onChange={(event) => setVendorLeadDays(event.target.value)}
              />
              <AppInput
                placeholder="Cutoff HH:mm"
                value={vendorCutoff}
                disabled={!canManageVendors}
                onChange={(event) => setVendorCutoff(event.target.value)}
              />
            </div>
            <AppButton variant="secondary" disabled={!canManageVendors} onClick={() => void addVendor()}>
              Save Vendor
            </AppButton>
            {!canManageVendors ? (
              <p className="secondary-text text-xs">
                You do not have permission to manage vendors for this organization.
              </p>
            ) : null}
            <div className="mt-2 space-y-2">
              {vendors.map((vendor) => (
                <div key={vendor.id} className="flex items-center justify-between rounded-xl border border-app-border px-3 py-2 text-sm">
                  <span>{vendor.name}</span>
                  <AppButton
                    variant="secondary"
                    disabled={!canManageVendors}
                    className="!border-rose-500/50 !px-3 !py-1 !text-rose-300"
                    onClick={() => {
                      void (async () => {
                        if (!activeOrgId) return
                        setStatusMessage(null)
                        setErrorMessage(null)
                        try {
                          await removeVendor(activeOrgId, vendor.id)
                          await refetchVendors()
                          setStatusMessage("Vendor removed.")
                        } catch {
                          setErrorMessage("Could not remove vendor.")
                        }
                      })()
                    }}
                  >
                    Delete
                  </AppButton>
                </div>
              ))}
            </div>
          </div>
        </AppCard>
      </div>

      <AppCard className="mt-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="card-title">Roles</h2>
            <p className="secondary-text mt-1">
              Organization roles are inherited here. Store-specific roles can be added only if organization settings allow it.
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
          <div className="space-y-2">
            {combinedRoles.map((roleTemplate) => (
              <AppButton
                key={`${roleTemplate.source}:${roleTemplate.id}`}
                variant="secondary"
                className={`!h-auto !w-full !justify-start !rounded-full !px-4 !py-2 !text-left !text-sm ${
                  selectedRoleKey === `${roleTemplate.source}:${roleTemplate.id}`
                    ? "!border-[color:var(--accent)] !bg-app-surface-soft !text-[color:var(--app-text)]"
                    : "!border-[color:var(--app-border)] !text-[color:var(--app-muted)]"
                }`}
                onClick={() => {
                  setSelectedRoleKey(`${roleTemplate.source}:${roleTemplate.id}`)
                }}
              >
                {roleTemplate.title || "Untitled"}
                <span className="ml-2 text-xs text-app-muted">{roleTemplate.source === "org" ? "Org" : "Store"}</span>
              </AppButton>
            ))}
            {orgSettings?.allowStoreRoleCreation ? (
              <AppButton variant="secondary" className="!w-full" onClick={addRoleDraft}>
                Add Role
              </AppButton>
            ) : (
              <p className="secondary-text rounded-xl border border-app-border px-3 py-2 text-xs">
                Store role creation is disabled by organization settings.
              </p>
            )}
          </div>

          <div>
            {selectedRole ? (
              <div className="rounded-2xl border border-app-border p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <AppInput
                    value={selectedRole.title}
                    readOnly={selectedRole.locked}
                    onChange={(event) => {
                      if (selectedRole.locked) return
                      setLocalRoles((prev) =>
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
                    }}
                    placeholder="Role name"
                  />
                  {!selectedRole.locked ? (
                    <AppButton
                      variant="secondary"
                      className="!border-rose-500/50 !text-rose-300"
                      onClick={() => {
                        setLocalRoles((prev) => prev.filter((entry) => entry.id !== selectedRole.id))
                        setSelectedRoleKey("")
                      }}
                    >
                      Delete
                    </AppButton>
                  ) : null}
                </div>
                <AppCheckbox
                  className="mt-3"
                  checked={Boolean(selectedRole.singlePerStore)}
                  disabled={selectedRole.locked}
                  onChange={(event) => {
                    if (selectedRole.locked) return
                    setLocalRoles((prev) =>
                      prev.map((entry) =>
                        entry.id === selectedRole.id ? { ...entry, singlePerStore: event.target.checked } : entry
                      )
                    )
                  }}
                  label="Is there only one person with this role in a store?"
                />
                <div className="mt-3 grid gap-3">
                  {permissionSections.map((section) => (
                    <div key={`${selectedRole.source}-${selectedRole.id}-${section.key}`}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-app-muted">{section.title}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {section.permissions.map((permission) => (
                          <AppCheckbox
                            key={`${selectedRole.id}-${permission.key}`}
                            checked={Boolean(selectedRole.permissionFlags?.[permission.key])}
                            disabled={selectedRole.locked}
                            onChange={(event) => {
                              if (selectedRole.locked) return
                              setLocalRoles((prev) =>
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
                            }}
                            label={permission.label}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedRole.locked ? (
                  <p className="secondary-text mt-3 text-xs">
                    This role is inherited from Organization Settings. Edit it at the organization level.
                  </p>
                ) : null}
                {!selectedRole.locked ? (
                  <div className="mt-4 flex justify-end">
                    <AppButton onClick={() => setSelectedRoleKey("")}>
                      Save Role
                    </AppButton>
                  </div>
                ) : null}
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
