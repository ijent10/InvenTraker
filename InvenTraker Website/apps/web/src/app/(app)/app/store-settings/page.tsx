"use client"

import { useEffect, useMemo, useState } from "react"
import { AppButton, AppCard, AppCheckbox, AppInput, AppSelect } from "@inventracker/ui"
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
  type CategoryConfigRecord,
  type DepartmentConfigRecord,
  type ExportDataset,
  type ReworkedBarcodeSectionRecord,
  type RoleTemplateRecord,
  type SpreadsheetExportColumnRecord,
  type SpreadsheetExportPreferenceRecord,
  type StoreSettingsRecord
} from "@/lib/data/firestore"
import { exportDatasetLabels, mergeSpreadsheetColumns } from "@/lib/exports/spreadsheet"
import type { ImportInspectionResult } from "@/lib/imports/attribute-mapper"

type RoleSource = "org" | "store"
type ImportExpirationMode = "all" | "some" | "none"

type RoleWithSource = RoleTemplateRecord & {
  source: RoleSource
  locked: boolean
}

const permissionSectionOrder: Array<{ key: "general" | "app" | "web"; title: string }> = [
  { key: "general", title: "General Permissions" },
  { key: "app", title: "App Permissions" },
  { key: "web", title: "Website Permissions" }
]

const exportDatasetOptions: ExportDataset[] = ["inventory", "orders", "waste", "expiration", "production", "todo"]

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

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function cleanText(value: string): string {
  return value.trim()
}

function slugifyFieldPath(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+([a-z0-9])/g, (_, char: string) => char.toUpperCase())
  return slug || "customField"
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

function normalizeCategoryConfigs(configs: CategoryConfigRecord[]): CategoryConfigRecord[] {
  const seen = new Set<string>()
  const rows: CategoryConfigRecord[] = []
  for (const config of configs) {
    const name = cleanText(config.name)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const appliesTo = Array.from(
      new Set((config.appliesTo ?? []).filter((dataset) => exportDatasetOptions.includes(dataset)))
    )
    rows.push({
      id: cleanText(config.id) || makeId("category"),
      name,
      description: cleanText(config.description ?? "") || undefined,
      departmentIds: Array.from(new Set((config.departmentIds ?? []).map(cleanText).filter(Boolean))),
      appliesTo: appliesTo.length > 0 ? appliesTo : ["inventory", "orders", "waste"],
      custom: config.custom !== false,
      enabled: config.enabled !== false
    })
  }
  return rows
}

function normalizeSpreadsheetColumns(columns: SpreadsheetExportColumnRecord[]): SpreadsheetExportColumnRecord[] {
  const seen = new Set<string>()
  return columns
    .map((column, index) => {
      const id = cleanText(column.id) || makeId("export_column")
      const label = cleanText(column.label)
      const path = cleanText(column.path)
      if (!label || !path || seen.has(id)) return null
      seen.add(id)
      return {
        id,
        label,
        path,
        enabled: column.enabled !== false,
        order: index,
        categoryId: cleanText(column.categoryId ?? "") || undefined,
        custom: Boolean(column.custom)
      } as SpreadsheetExportColumnRecord
    })
    .filter((column): column is SpreadsheetExportColumnRecord => Boolean(column))
}

function normalizeExportPreferences(
  preferences: SpreadsheetExportPreferenceRecord[],
  categories: CategoryConfigRecord[]
): SpreadsheetExportPreferenceRecord[] {
  const categoryIds = new Set(categories.map((category) => category.id))
  const byDataset = new Map<ExportDataset, SpreadsheetExportPreferenceRecord>()
  for (const preference of preferences) {
    if (!exportDatasetOptions.includes(preference.dataset)) continue
    const columns = normalizeSpreadsheetColumns(preference.columns ?? []).map((column) => ({
      ...column,
      categoryId: column.categoryId && categoryIds.has(column.categoryId) ? column.categoryId : undefined
    }))
    byDataset.set(preference.dataset, {
      dataset: preference.dataset,
      columns,
      includeGeneratedAt: preference.includeGeneratedAt !== false,
      includeStoreInfo: preference.includeStoreInfo !== false,
      fileNameTemplate: cleanText(preference.fileNameTemplate ?? "") || undefined
    })
  }
  return exportDatasetOptions
    .map((dataset) => byDataset.get(dataset))
    .filter((preference): preference is SpreadsheetExportPreferenceRecord => Boolean(preference))
}

function ensureOneItemCodeSection(sections: ReworkedBarcodeSectionRecord[]): ReworkedBarcodeSectionRecord[] {
  if (sections.length === 0) return sections
  const firstSelectedIndex = sections.findIndex((section) => section.useAsItemCode)
  if (firstSelectedIndex < 0) {
    const fallbackIndex = sections.findIndex((section) => section.type === "other")
    const index = fallbackIndex >= 0 ? fallbackIndex : 0
    return sections.map((section, sectionIndex) => ({
      ...section,
      useAsItemCode: sectionIndex === index
    }))
  }
  return sections.map((section, sectionIndex) => ({
    ...section,
    useAsItemCode: sectionIndex === firstSelectedIndex
  }))
}

function normalizeBarcodeSections(sections: ReworkedBarcodeSectionRecord[]): ReworkedBarcodeSectionRecord[] {
  const normalized = sections
    .map((section, index) => {
      const type = section.type === "price" || section.type === "weight" || section.type === "other"
        ? section.type
        : "other"
      return {
        id: cleanText(section.id) || makeId(`barcode_section_${index + 1}`),
        name: cleanText(section.name) || `Section ${index + 1}`,
        digits: Math.max(1, Number(section.digits || 1)),
        type,
        useAsItemCode: Boolean(section.useAsItemCode),
        decimalPlaces:
          type === "price" || type === "weight"
            ? Math.max(0, Number(section.decimalPlaces ?? (type === "price" ? 2 : 3)))
            : undefined,
        weightUnit: type === "weight" ? section.weightUnit ?? "lbs" : undefined
      } as ReworkedBarcodeSectionRecord
    })
    .filter((section) => section.digits > 0)
  return ensureOneItemCodeSection(normalized)
}

function deriveLegacyRuleParts(sections: ReworkedBarcodeSectionRecord[]) {
  const normalizedSections = normalizeBarcodeSections(sections)
  const itemCode = normalizedSections.find((section) => section.useAsItemCode) ?? normalizedSections[0]
  const price = normalizedSections.find((section) => section.type === "price")
  const trailingDigitsLength = normalizedSections
    .filter((section) => section.id !== itemCode?.id && section.id !== price?.id)
    .reduce((sum, section) => sum + Math.max(0, section.digits), 0)
  const productCodeLength = Math.max(1, Number(itemCode?.digits ?? 6))
  const encodedPriceLength = Math.max(1, Number(price?.digits ?? 5))
  const priceDivisor = Math.pow(10, Math.max(0, Number(price?.decimalPlaces ?? 2)))
  return {
    sections: normalizedSections,
    productCodeLength,
    encodedPriceLength,
    trailingDigitsLength,
    priceDivisor
  }
}

function sectionFormatHint(section: ReworkedBarcodeSectionRecord): string {
  const digits = Math.max(1, Number(section.digits || 1))
  if (section.type === "price") {
    const decimals = Math.max(0, Number(section.decimalPlaces ?? 2))
    const leftDigits = Math.max(1, digits - decimals)
    return `${"0".repeat(leftDigits)}${decimals > 0 ? `.${"0".repeat(decimals)}` : ""}`
  }
  if (section.type === "weight") {
    const decimals = Math.max(0, Number(section.decimalPlaces ?? 3))
    const leftDigits = Math.max(1, digits - decimals)
    const unit = section.weightUnit ?? "lbs"
    return `${"0".repeat(leftDigits)}${decimals > 0 ? `.${"0".repeat(decimals)}` : ""} ${unit}`
  }
  return "Raw segment"
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
  const [departmentConfigs, setDepartmentConfigs] = useState<DepartmentConfigRecord[]>([])
  const [newDepartmentName, setNewDepartmentName] = useState("")
  const [newLocationsByDepartment, setNewLocationsByDepartment] = useState<Record<string, string>>({})
  const [categoryConfigs, setCategoryConfigs] = useState<CategoryConfigRecord[]>([])
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newCategoryDescription, setNewCategoryDescription] = useState("")
  const [newCategoryDepartmentId, setNewCategoryDepartmentId] = useState("")
  const [selectedExportDataset, setSelectedExportDataset] = useState<ExportDataset>("inventory")
  const [exportPreferences, setExportPreferences] = useState<SpreadsheetExportPreferenceRecord[]>([])
  const [newCustomColumnLabel, setNewCustomColumnLabel] = useState("")
  const [newCustomColumnPath, setNewCustomColumnPath] = useState("")
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importDataset, setImportDataset] = useState<ExportDataset | "auto">("auto")
  const [importExpirationMode, setImportExpirationMode] = useState<ImportExpirationMode>("all")
  const [importExpirationRows, setImportExpirationRows] = useState<number[]>([])
  const [importResult, setImportResult] = useState<ImportInspectionResult | null>(null)
  const [importIsInspecting, setImportIsInspecting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
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
    setDepartmentConfigs(normalizeDepartmentConfigs(settings.departmentConfigs ?? []))
    setCategoryConfigs(normalizeCategoryConfigs(settings.categoryConfigs ?? []))
    setExportPreferences(normalizeExportPreferences(settings.exportPreferences ?? [], settings.categoryConfigs ?? []))
    setSelectedRoleKey("")
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

  const activeExportPreference = useMemo(
    () => exportPreferences.find((entry) => entry.dataset === selectedExportDataset),
    [exportPreferences, selectedExportDataset]
  )

  const activeExportColumns = useMemo(
    () => mergeSpreadsheetColumns(selectedExportDataset, activeExportPreference),
    [activeExportPreference, selectedExportDataset]
  )

  const activeColumnCategories = useMemo(
    () =>
      categoryConfigs.filter(
        (category) => category.enabled && category.appliesTo.includes(selectedExportDataset)
      ),
    [categoryConfigs, selectedExportDataset]
  )

  const save = async () => {
    if (!activeOrgId || !activeStore || !user?.uid) return
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const normalizedConfigs = normalizeDepartmentConfigs(departmentConfigs)
      const normalizedCategories = normalizeCategoryConfigs(categoryConfigs)
      const preparedSections = deriveLegacyRuleParts(form.reworkedBarcodeRule?.sections ?? [])
      const reworkedBarcodeRule = {
        enabled: Boolean(form.reworkedBarcodeRule?.enabled),
        ruleName: cleanText(form.reworkedBarcodeRule?.ruleName ?? "") || "Default Rule",
        sections: preparedSections.sections,
        productCodeLength: preparedSections.productCodeLength,
        encodedPriceLength: preparedSections.encodedPriceLength,
        trailingDigitsLength: preparedSections.trailingDigitsLength,
        priceDivisor: preparedSections.priceDivisor
      }
      const patch: Partial<StoreSettingsRecord> = {
        departmentConfigs: normalizedConfigs,
        departments: normalizedConfigs.map((entry) => entry.name),
        locationTemplates: Array.from(new Set(normalizedConfigs.flatMap((entry) => entry.locations))),
        categoryConfigs: normalizedCategories,
        exportPreferences: normalizeExportPreferences(exportPreferences, normalizedCategories),
        jobTitles: localRoles.filter((entry) => entry.title.trim().length > 0),
        canStoreRemoveItems: Boolean(form.canStoreRemoveItems),
        maxSalePercent: Number(form.maxSalePercent ?? 30),
        featureFlags: { ...(form.featureFlags ?? {}) },
        reworkedBarcodeRule
      }
      if (form.roleDefaults) {
        patch.roleDefaults = form.roleDefaults
      }
      await saveStoreSettings(
        activeOrgId,
        activeStore,
        patch,
        user.uid
      )
      await refetch()
      setStatusMessage("Store settings saved.")
    } catch (error) {
      const detail = error instanceof Error && error.message ? ` ${error.message}` : ""
      setErrorMessage(`Could not save store settings.${detail}`)
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

  const addCategory = () => {
    const name = cleanText(newCategoryName)
    if (!name) return
    setCategoryConfigs((prev) =>
      normalizeCategoryConfigs([
        ...prev,
        {
          id: makeId("category"),
          name,
          description: cleanText(newCategoryDescription) || undefined,
          departmentIds: newCategoryDepartmentId ? [newCategoryDepartmentId] : [],
          appliesTo: ["inventory"],
          custom: true,
          enabled: true
        }
      ])
    )
    setNewCategoryName("")
    setNewCategoryDescription("")
    setNewCategoryDepartmentId("")
  }

  const updateExportPreference = (
    dataset: ExportDataset,
    updater: (preference: SpreadsheetExportPreferenceRecord) => SpreadsheetExportPreferenceRecord
  ) => {
    setExportPreferences((prev) => {
      const existing = prev.find((entry) => entry.dataset === dataset)
      const base: SpreadsheetExportPreferenceRecord = existing ?? {
        dataset,
        columns: mergeSpreadsheetColumns(dataset),
        includeGeneratedAt: true,
        includeStoreInfo: true
      }
      const next = updater(base)
      return normalizeExportPreferences(
        [
          ...prev.filter((entry) => entry.dataset !== dataset),
          {
            ...next,
            dataset,
            columns: normalizeSpreadsheetColumns(next.columns)
          }
        ],
        categoryConfigs
      )
    })
  }

  const updateActiveExportColumns = (columns: SpreadsheetExportColumnRecord[]) => {
    updateExportPreference(selectedExportDataset, (preference) => ({
      ...preference,
      columns
    }))
  }

  const updateActiveExportColumn = (columnId: string, patch: Partial<SpreadsheetExportColumnRecord>) => {
    updateActiveExportColumns(
      activeExportColumns.map((column) => (column.id === columnId ? { ...column, ...patch } : column))
    )
  }

  const moveActiveExportColumn = (columnId: string, direction: "up" | "down") => {
    const columns = [...activeExportColumns]
    const index = columns.findIndex((column) => column.id === columnId)
    if (index < 0) return
    const targetIndex = direction === "up" ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= columns.length) return
    const [picked] = columns.splice(index, 1)
    if (!picked) return
    columns.splice(targetIndex, 0, picked)
    updateActiveExportColumns(columns)
  }

  const addCustomExportColumn = () => {
    const label = cleanText(newCustomColumnLabel)
    const path = cleanText(newCustomColumnPath) || `companyFields.${slugifyFieldPath(label)}`
    if (!label || !path) return
    updateActiveExportColumns([
      ...activeExportColumns,
      {
        id: makeId("export_column"),
        label,
        path,
        enabled: true,
        order: activeExportColumns.length,
        custom: true
      }
    ])
    setNewCustomColumnLabel("")
    setNewCustomColumnPath("")
  }

  const inspectImportFile = async () => {
    if (!importFile) return
    setImportIsInspecting(true)
    setImportError(null)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append("file", importFile)
      if (importDataset !== "auto") {
        formData.append("dataset", importDataset)
      }
      const response = await fetch("/api/imports/inspect", {
        method: "POST",
        body: formData
      })
      const payload = await response.json() as ImportInspectionResult | { ok: false; reason?: string }
      if (!response.ok || !payload.ok) {
        setImportError("reason" in payload && payload.reason ? payload.reason : "Could not inspect this file.")
        return
      }
      setImportResult(payload)
      setSelectedExportDataset(payload.dataset)
      setImportExpirationRows([])
    } catch {
      setImportError("Could not inspect this file.")
    } finally {
      setImportIsInspecting(false)
    }
  }

  const applyImportMappingToExportLayout = () => {
    if (!importResult) return
    const dataset = importResult.dataset
    const defaults = mergeSpreadsheetColumns(dataset)
    const defaultsByPath = new Map(defaults.map((column) => [column.path, column]))
    const usedPaths = new Set<string>()
    const matchedColumns = importResult.columns
      .filter((column) => column.suggestedField && column.confidence >= 0.42)
      .map((column) => {
        const field = column.suggestedField!
        const base = defaultsByPath.get(field.path)
        if (usedPaths.has(field.path)) return null
        usedPaths.add(field.path)
        return {
          ...(base ?? {
            id: field.id,
            custom: false
          }),
          id: base?.id ?? field.id,
          label: cleanText(column.sourceHeader) || field.label,
          path: field.path,
          enabled: true,
          order: usedPaths.size - 1,
          custom: false
        } as SpreadsheetExportColumnRecord
      })
      .filter((column): column is SpreadsheetExportColumnRecord => Boolean(column))
    const remainingColumns = defaults
      .filter((column) => !usedPaths.has(column.path))
      .map((column, index) => ({
        ...column,
        enabled: false,
        order: matchedColumns.length + index
      }))
    updateExportPreference(dataset, (preference) => ({
      ...preference,
      columns: [...matchedColumns, ...remainingColumns],
      includeGeneratedAt: preference.includeGeneratedAt,
      includeStoreInfo: preference.includeStoreInfo
    }))
    setSelectedExportDataset(dataset)
    setStatusMessage(`${exportDatasetLabels[dataset]} export layout updated from ${importResult.fileName}. Save Store Settings to keep it.`)
  }

  const importItemLabel = (row: Record<string, string>): string => {
    const nameHeader = importResult?.columns.find((column) => column.suggestedField?.id === "name")?.sourceHeader
    if (nameHeader && row[nameHeader]) return row[nameHeader]
    const itemHeader = Object.keys(row).find((key) => /item|name|product|description/i.test(key))
    return itemHeader && row[itemHeader] ? row[itemHeader] : Object.values(row).find(Boolean) ?? "Item"
  }

  const barcodeSections = form.reworkedBarcodeRule?.sections ?? []

  const composeRule = (
    enabled: boolean,
    ruleName: string,
    sections: ReworkedBarcodeSectionRecord[]
  ): StoreSettingsRecord["reworkedBarcodeRule"] => {
    const legacy = deriveLegacyRuleParts(sections)
    return {
      enabled,
      ruleName: cleanText(ruleName) || "Default Rule",
      sections: legacy.sections,
      productCodeLength: legacy.productCodeLength,
      encodedPriceLength: legacy.encodedPriceLength,
      trailingDigitsLength: legacy.trailingDigitsLength,
      priceDivisor: legacy.priceDivisor
    }
  }

  const addBarcodeSection = () => {
    setForm((prev) => ({
      ...prev,
      reworkedBarcodeRule: composeRule(
        Boolean(prev.reworkedBarcodeRule?.enabled),
        prev.reworkedBarcodeRule?.ruleName ?? "Default Rule",
        [
          ...(prev.reworkedBarcodeRule?.sections ?? []),
          {
            id: makeId("barcode_section"),
            name: `Section ${(prev.reworkedBarcodeRule?.sections?.length ?? 0) + 1}`,
            digits: 1,
            type: "other",
            useAsItemCode: false
          }
        ]
      )
    }))
  }

  const updateBarcodeSection = (
    sectionId: string,
    patch: Partial<ReworkedBarcodeSectionRecord>
  ) => {
    setForm((prev) => {
      const sections = (prev.reworkedBarcodeRule?.sections ?? []).map((section) =>
        section.id === sectionId ? { ...section, ...patch } : section
      )
      return {
        ...prev,
        reworkedBarcodeRule: composeRule(
          Boolean(prev.reworkedBarcodeRule?.enabled),
          prev.reworkedBarcodeRule?.ruleName ?? "Default Rule",
          sections
        )
      }
    })
  }

  const removeBarcodeSection = (sectionId: string) => {
    setForm((prev) => {
      const sections = (prev.reworkedBarcodeRule?.sections ?? []).filter((section) => section.id !== sectionId)
      return {
        ...prev,
        reworkedBarcodeRule: composeRule(
          Boolean(prev.reworkedBarcodeRule?.enabled),
          prev.reworkedBarcodeRule?.ruleName ?? "Default Rule",
          ensureOneItemCodeSection(sections)
        )
      }
    })
  }

  const moveBarcodeSection = (sectionId: string, direction: "up" | "down") => {
    setForm((prev) => {
      const sections = [...(prev.reworkedBarcodeRule?.sections ?? [])]
      const index = sections.findIndex((section) => section.id === sectionId)
      if (index < 0) return prev
      const targetIndex = direction === "up" ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= sections.length) return prev
      const [picked] = sections.splice(index, 1)
      if (!picked) return prev
      sections.splice(targetIndex, 0, picked)
      return {
        ...prev,
        reworkedBarcodeRule: composeRule(
          Boolean(prev.reworkedBarcodeRule?.enabled),
          prev.reworkedBarcodeRule?.ruleName ?? "Default Rule",
          sections
        )
      }
    })
  }

  const setItemCodeSection = (sectionId: string) => {
    setForm((prev) => ({
      ...prev,
      reworkedBarcodeRule: composeRule(
        Boolean(prev.reworkedBarcodeRule?.enabled),
        prev.reworkedBarcodeRule?.ruleName ?? "Default Rule",
        (prev.reworkedBarcodeRule?.sections ?? []).map((section) => ({
          ...section,
          useAsItemCode: section.id === sectionId
        }))
      )
    }))
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
            Build an ordered parser. Mark one section as the Item Code so rewrapped scans match the right product.
          </p>
          <div className="mt-4 grid gap-3">
            <AppCheckbox
              checked={Boolean(form.reworkedBarcodeRule?.enabled)}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  reworkedBarcodeRule: composeRule(
                    event.target.checked,
                    prev.reworkedBarcodeRule?.ruleName ?? "Default Rule",
                    prev.reworkedBarcodeRule?.sections ?? []
                  )
                }))
              }
              label="Enable parser for rewrapped item barcodes"
            />
            <AppInput
              value={form.reworkedBarcodeRule?.ruleName ?? "Default Rule"}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  reworkedBarcodeRule: composeRule(
                    Boolean(prev.reworkedBarcodeRule?.enabled),
                    event.target.value,
                    prev.reworkedBarcodeRule?.sections ?? []
                  )
                }))
              }
              placeholder="Rule name (example: Cheese)"
            />
            {barcodeSections.length === 0 ? (
              <p className="secondary-text rounded-xl border border-app-border px-3 py-2 text-xs">
                No sections yet. Add one for item code, one for price/weight, and any trailing segments.
              </p>
            ) : null}
            <div className="space-y-2">
              {barcodeSections.map((section, index) => (
                <div key={section.id} className="rounded-2xl border border-app-border p-3">
                  <div className="grid gap-2 md:grid-cols-3">
                    <AppInput
                      value={section.name}
                      onChange={(event) => updateBarcodeSection(section.id, { name: event.target.value })}
                      placeholder="Section label"
                    />
                    <AppInput
                      type="number"
                      min={1}
                      value={String(section.digits)}
                      onChange={(event) =>
                        updateBarcodeSection(section.id, { digits: Math.max(1, Number(event.target.value || "1")) })
                      }
                      placeholder="Digits"
                    />
                    <AppSelect
                      value={section.type}
                      onChange={(event) =>
                        updateBarcodeSection(section.id, {
                          type: event.target.value as ReworkedBarcodeSectionRecord["type"]
                        })
                      }
                    >
                      <option value="other">Other</option>
                      <option value="price">Price</option>
                      <option value="weight">Weight</option>
                    </AppSelect>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {(section.type === "price" || section.type === "weight") ? (
                      <AppInput
                        type="number"
                        min={0}
                        value={String(section.decimalPlaces ?? (section.type === "price" ? 2 : 3))}
                        onChange={(event) =>
                          updateBarcodeSection(section.id, {
                            decimalPlaces: Math.max(0, Number(event.target.value || "0"))
                          })
                        }
                        placeholder="Decimal places"
                      />
                    ) : (
                      <div className="rounded-xl border border-app-border bg-app-surface px-3 py-2 text-xs text-app-muted">
                        No decimals for this section type.
                      </div>
                    )}
                    {section.type === "weight" ? (
                      <AppSelect
                        value={section.weightUnit ?? "lbs"}
                        onChange={(event) =>
                          updateBarcodeSection(section.id, {
                            weightUnit: event.target.value as ReworkedBarcodeSectionRecord["weightUnit"]
                          })
                        }
                      >
                        <option value="lbs">Pounds (lbs)</option>
                        <option value="oz">Ounces (oz)</option>
                        <option value="kg">Kilograms (kg)</option>
                        <option value="g">Grams (g)</option>
                        <option value="each">Each</option>
                      </AppSelect>
                    ) : (
                      <div className="rounded-xl border border-app-border bg-app-surface px-3 py-2 text-xs text-app-muted">
                        Weight unit applies only to weight sections.
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <AppCheckbox
                      checked={Boolean(section.useAsItemCode)}
                      onChange={() => setItemCodeSection(section.id)}
                      label="Use this section as Item Code"
                    />
                    <div className="flex items-center gap-2">
                      <AppButton variant="secondary" onClick={() => moveBarcodeSection(section.id, "up")} disabled={index === 0}>
                        Up
                      </AppButton>
                      <AppButton
                        variant="secondary"
                        onClick={() => moveBarcodeSection(section.id, "down")}
                        disabled={index === barcodeSections.length - 1}
                      >
                        Down
                      </AppButton>
                      <AppButton variant="secondary" onClick={() => removeBarcodeSection(section.id)}>
                        Remove
                      </AppButton>
                    </div>
                  </div>
                  <p className="secondary-text mt-2 text-xs">
                    Parsed format: <span className="font-semibold">{sectionFormatHint(section)}</span>
                  </p>
                </div>
              ))}
            </div>
            <AppButton variant="secondary" onClick={addBarcodeSection}>
              Add Section
            </AppButton>
            <p className="secondary-text text-xs">
              Example for Fresh Market: Item Code (6, Other) + Price (5, Price, 2 decimals) + Trailing (1, Other) parses
              `657983008814` as item code `657983` and package price `$8.81`.
            </p>
          </div>
        </AppCard>

        <AppCard>
          <h2 className="card-title">Departments + Locations</h2>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <AppInput
                value={newDepartmentName}
                onChange={(event) => setNewDepartmentName(event.target.value)}
                placeholder="Department name (example: Cheese)"
              />
              <AppButton variant="secondary" onClick={addDepartment}>
                Add Department
              </AppButton>
            </div>
            {departmentConfigs.length === 0 ? (
              <p className="secondary-text rounded-xl border border-app-border px-3 py-2 text-xs">
                No departments yet. Add one, then add locations inside it.
              </p>
            ) : null}
            <div className="space-y-2">
              {departmentConfigs.map((department) => (
                <div key={department.id} className="rounded-2xl border border-app-border p-3">
                  <div className="grid gap-2 md:grid-cols-[1fr_auto]">
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
                      onClick={() =>
                        setDepartmentConfigs((prev) => prev.filter((entry) => entry.id !== department.id))
                      }
                    >
                      Remove
                    </AppButton>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {department.locations.map((location) => (
                      <AppButton
                        key={`${department.id}-${location}`}
                        variant="secondary"
                        className="!h-auto !rounded-full !border-app-border !px-3 !py-1 !text-xs !text-app-muted hover:!border-rose-400 hover:!text-rose-300"
                        onClick={() =>
                          setDepartmentConfigs((prev) =>
                            prev.map((entry) =>
                              entry.id === department.id
                                ? {
                                    ...entry,
                                    locations: entry.locations.filter((row) => row !== location)
                                  }
                                : entry
                            )
                          )
                        }
                        title="Remove location"
                      >
                        {location} ×
                      </AppButton>
                    ))}
                    {department.locations.length === 0 ? (
                      <p className="secondary-text text-xs">No locations yet.</p>
                    ) : null}
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
                    <AppInput
                      value={newLocationsByDepartment[department.id] ?? ""}
                      onChange={(event) =>
                        setNewLocationsByDepartment((prev) => ({ ...prev, [department.id]: event.target.value }))
                      }
                      placeholder="Add location (example: Cooler 1)"
                    />
                    <AppButton variant="secondary" onClick={() => addLocation(department.id)}>
                      Add Location
                    </AppButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AppCard>

        <AppCard>
          <h2 className="card-title">Department Categories</h2>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <AppInput
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="Category name (example: Bread)"
              />
              <AppSelect
                value={newCategoryDepartmentId}
                onChange={(event) => setNewCategoryDepartmentId(event.target.value)}
              >
                <option value="">All departments</option>
                {departmentConfigs.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </AppSelect>
              <AppButton variant="secondary" onClick={addCategory}>
                Add Category
              </AppButton>
            </div>
            <AppInput
              value={newCategoryDescription}
              onChange={(event) => setNewCategoryDescription(event.target.value)}
              placeholder="Optional description"
            />
            {categoryConfigs.length === 0 ? (
              <p className="secondary-text rounded-xl border border-app-border px-3 py-2 text-xs">
                No department categories yet. Add the categories you use inside each department.
              </p>
            ) : null}
            <div className="space-y-2">
              {categoryConfigs.map((category) => (
                <div key={category.id} className="rounded-2xl border border-app-border p-3">
                  <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                    <AppInput
                      value={category.name}
                      onChange={(event) =>
                        setCategoryConfigs((prev) =>
                          prev.map((entry) =>
                            entry.id === category.id ? { ...entry, name: event.target.value } : entry
                          )
                        )
                      }
                      placeholder="Category name"
                    />
                    <AppButton
                      variant="secondary"
                      className="!border-rose-500/50 !text-rose-300"
                      onClick={() => {
                        setCategoryConfigs((prev) => prev.filter((entry) => entry.id !== category.id))
                        setExportPreferences((prev) =>
                          prev.map((preference) => ({
                            ...preference,
                            columns: preference.columns.map((column) =>
                              column.categoryId === category.id ? { ...column, categoryId: undefined } : column
                            )
                          }))
                        )
                      }}
                    >
                      Remove
                    </AppButton>
                  </div>
                  <AppInput
                    className="mt-2"
                    value={category.description ?? ""}
                    onChange={(event) =>
                      setCategoryConfigs((prev) =>
                        prev.map((entry) =>
                          entry.id === category.id ? { ...entry, description: event.target.value } : entry
                        )
                      )
                    }
                    placeholder="Optional description"
                  />
                  <div className="mt-2 flex flex-wrap gap-3">
                    <AppCheckbox
                      checked={category.enabled}
                      onChange={(event) =>
                        setCategoryConfigs((prev) =>
                          prev.map((entry) =>
                            entry.id === category.id ? { ...entry, enabled: event.target.checked } : entry
                          )
                        )
                      }
                      label="Enabled"
                    />
                    <AppCheckbox
                      checked={category.departmentIds.length === 0}
                      onChange={(event) =>
                        setCategoryConfigs((prev) =>
                          prev.map((entry) =>
                            entry.id === category.id
                              ? {
                                  ...entry,
                                  departmentIds: event.target.checked
                                    ? []
                                    : (departmentConfigs[0]?.id ? [departmentConfigs[0].id] : [])
                                }
                              : entry
                          )
                        )
                      }
                      label="All departments"
                    />
                    {departmentConfigs.length === 0 ? (
                      <span className="secondary-text text-xs">Add departments above to scope this category.</span>
                    ) : null}
                    {departmentConfigs.map((department) => (
                      <AppCheckbox
                        key={`${category.id}-${department.id}`}
                        checked={category.departmentIds.includes(department.id)}
                        disabled={category.departmentIds.length === 0}
                        onChange={(event) =>
                          setCategoryConfigs((prev) =>
                            prev.map((entry) =>
                              entry.id === category.id
                                ? {
                                    ...entry,
                                    departmentIds: event.target.checked
                                      ? Array.from(new Set([...entry.departmentIds, department.id]))
                                      : entry.departmentIds.filter((value) => value !== department.id)
                                  }
                                : entry
                            )
                          )
                        }
                        label={department.name}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AppCard>

        <AppCard className="xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="card-title">Spreadsheet Exports</h2>
              <p className="secondary-text mt-1 text-xs">
                Choose columns, ordering, and default file details for each export.
              </p>
            </div>
            <AppSelect
              value={selectedExportDataset}
              onChange={(event) => setSelectedExportDataset(event.target.value as ExportDataset)}
            >
              {exportDatasetOptions.map((dataset) => (
                <option key={dataset} value={dataset}>
                  {exportDatasetLabels[dataset]}
                </option>
              ))}
            </AppSelect>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <AppCheckbox
              checked={activeExportPreference?.includeGeneratedAt ?? true}
              onChange={(event) =>
                updateExportPreference(selectedExportDataset, (preference) => ({
                  ...preference,
                  includeGeneratedAt: event.target.checked
                }))
              }
              label="Include generated time"
            />
            <AppCheckbox
              checked={activeExportPreference?.includeStoreInfo ?? true}
              onChange={(event) =>
                updateExportPreference(selectedExportDataset, (preference) => ({
                  ...preference,
                  includeStoreInfo: event.target.checked
                }))
              }
              label="Include store info"
            />
            <AppInput
              value={activeExportPreference?.fileNameTemplate ?? ""}
              onChange={(event) =>
                updateExportPreference(selectedExportDataset, (preference) => ({
                  ...preference,
                  fileNameTemplate: event.target.value
                }))
              }
              placeholder="File name: {dataset}-{store}-{date}"
            />
          </div>

          <div className="mt-4 space-y-2">
            {activeExportColumns.map((column, index) => (
              <div key={column.id} className="grid gap-2 rounded-2xl border border-app-border p-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <div>
                  <AppCheckbox
                    checked={column.enabled}
                    onChange={(event) => updateActiveExportColumn(column.id, { enabled: event.target.checked })}
                    label={column.label}
                  />
                  <p className="secondary-text mt-1 text-xs">{column.custom ? "Custom field" : "Default field"}</p>
                </div>
                <AppInput
                  value={column.label}
                  onChange={(event) => updateActiveExportColumn(column.id, { label: event.target.value })}
                  placeholder="Column label"
                />
                {column.custom ? (
                  <AppInput
                    value={column.path}
                    onChange={(event) => updateActiveExportColumn(column.id, { path: event.target.value })}
                    placeholder="Data path"
                  />
                ) : (
                  <div className="rounded-xl border border-app-border bg-app-surface px-3 py-2 text-xs text-app-muted">
                    {column.path}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <AppSelect
                    value={column.categoryId ?? ""}
                    onChange={(event) =>
                      updateActiveExportColumn(column.id, {
                        categoryId: event.target.value || undefined
                      })
                    }
                  >
                    <option value="">No category</option>
                    {activeColumnCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </AppSelect>
                  <AppButton
                    variant="secondary"
                    onClick={() => moveActiveExportColumn(column.id, "up")}
                    disabled={index === 0}
                  >
                    Up
                  </AppButton>
                  <AppButton
                    variant="secondary"
                    onClick={() => moveActiveExportColumn(column.id, "down")}
                    disabled={index === activeExportColumns.length - 1}
                  >
                    Down
                  </AppButton>
                  {column.custom ? (
                    <AppButton
                      variant="secondary"
                      className="!border-rose-500/50 !text-rose-300"
                      onClick={() => updateActiveExportColumns(activeExportColumns.filter((entry) => entry.id !== column.id))}
                    >
                      Remove
                    </AppButton>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <AppInput
              value={newCustomColumnLabel}
              onChange={(event) => setNewCustomColumnLabel(event.target.value)}
              placeholder="Custom column label"
            />
            <AppInput
              value={newCustomColumnPath}
              onChange={(event) => setNewCustomColumnPath(event.target.value)}
              placeholder="Data path (auto: companyFields.fieldName)"
            />
            <AppButton variant="secondary" onClick={addCustomExportColumn}>
              Add Column
            </AppButton>
          </div>
        </AppCard>

        <AppCard className="xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="card-title">Import Mapper</h2>
              <p className="secondary-text mt-1 text-xs">
                Upload a spreadsheet or PDF template to match its columns to InvenTraker fields.
              </p>
            </div>
            <AppSelect
              value={importDataset}
              onChange={(event) => setImportDataset(event.target.value as ExportDataset | "auto")}
            >
              <option value="auto">Auto detect</option>
              {exportDatasetOptions.map((dataset) => (
                <option key={dataset} value={dataset}>
                  {exportDatasetLabels[dataset]}
                </option>
              ))}
            </AppSelect>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="rounded-xl border border-dashed border-app-border px-3 py-2 text-sm text-app-muted">
              <span>{importFile ? importFile.name : "Choose .xlsx, .csv, .tsv, .txt, or .pdf"}</span>
              <AppInput
                className="mt-2 h-auto text-xs"
                type="file"
                accept=".xlsx,.csv,.tsv,.txt,.pdf,application/pdf,text/csv,text/tab-separated-values"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  setImportFile(file)
                  setImportResult(null)
                  setImportError(null)
                  setImportExpirationRows([])
                }}
              />
            </div>
            <AppButton
              variant="secondary"
              onClick={() => void inspectImportFile()}
              disabled={!importFile || importIsInspecting}
            >
              {importIsInspecting ? "Inspecting..." : "Inspect File"}
            </AppButton>
          </div>

          {importError ? (
            <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {importError}
            </div>
          ) : null}

          {importResult ? (
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-app-border px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold">
                    Suggested type: {exportDatasetLabels[importResult.dataset as ExportDataset]}
                  </p>
                  <p className="secondary-text text-xs">
                    {importResult.columns.length} column(s), {importResult.rowCount} row(s) inspected.
                  </p>
                </div>
                <AppButton
                  variant="secondary"
                  onClick={applyImportMappingToExportLayout}
                  disabled={!importResult.columns.some((column) => column.suggestedField)}
                >
                  Use as Export Layout
                </AppButton>
              </div>

              {importResult.warnings.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {importResult.warnings.join(" ")}
                </div>
              ) : null}

              {importResult.dataset === "inventory" ? (
                <div className="mt-3 rounded-2xl border border-app-border p-3">
                  <p className="text-sm font-semibold">Expiration handling</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <AppCheckbox
                      checked={importExpirationMode === "all"}
                      onChange={() => {
                        setImportExpirationMode("all")
                        setImportExpirationRows([])
                      }}
                      label="All items expire"
                    />
                    <AppCheckbox
                      checked={importExpirationMode === "some"}
                      onChange={() => setImportExpirationMode("some")}
                      label="Some items expire"
                    />
                    <AppCheckbox
                      checked={importExpirationMode === "none"}
                      onChange={() => {
                        setImportExpirationMode("none")
                        setImportExpirationRows([])
                      }}
                      label="No items expire"
                    />
                  </div>
                  <p className="secondary-text mt-2 text-xs">
                    {importExpirationMode === "all"
                      ? "Imported items will default to hasExpiration = true."
                      : importExpirationMode === "none"
                        ? "Imported items will default to hasExpiration = false and no expiration date."
                        : "Choose which previewed items should default to hasExpiration = true."}
                  </p>
                  {importExpirationMode === "some" ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {importResult.previewRows.map((row, index) => (
                        <AppCheckbox
                          key={`import-expiration-${index}`}
                          checked={importExpirationRows.includes(index)}
                          onChange={(event) =>
                            setImportExpirationRows((prev) =>
                              event.target.checked
                                ? Array.from(new Set([...prev, index]))
                                : prev.filter((entry) => entry !== index)
                            )
                          }
                          label={importItemLabel(row)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 space-y-2">
                {importResult.columns.map((column) => (
                  <div
                    key={`${column.index}-${column.sourceHeader}`}
                    className="grid gap-2 rounded-2xl border border-app-border p-3 md:grid-cols-[1fr_1fr_auto]"
                  >
                    <div>
                      <p className="text-sm font-semibold">{column.sourceHeader}</p>
                      <p className="secondary-text text-xs">
                        {column.samples.length > 0 ? column.samples.join(", ") : "No sample values"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm">
                        {column.suggestedField ? column.suggestedField.label : "No confident match"}
                      </p>
                      <p className="secondary-text text-xs">
                        {column.suggestedField ? column.suggestedField.path : "Review this column manually."}
                      </p>
                    </div>
                    <span className="rounded-full border border-app-border bg-app-surface-soft px-3 py-1 text-xs text-app-muted">
                      {Math.round(column.confidence * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
