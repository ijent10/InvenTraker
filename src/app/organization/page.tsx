import { Building2, ImageIcon, Palette, SlidersHorizontal } from "lucide-react"

import { DataTable } from "@/components/data-table"
import { EditableSettingsList } from "@/components/editable-settings-list"
import { OrganizationLiveFields } from "@/components/organization-live-fields"
import { OrganizationLogoPreview } from "@/components/organization-logo-preview"
import { OrganizationSaveButton } from "@/components/organization-save-button"
import { PageHeader } from "@/components/page-header"
import { ThemeControls } from "@/components/theme-controls"
import { Field, Panel, SelectInput, StatusPill, TextInput, ToggleRow } from "@/components/ui"
import {
  departments,
  jobTitles,
  organizationBranding,
  organizationCustomizationAreas,
  organizationSettings,
  salesSettings
} from "@/lib/demo-data"
import { permissionGroups } from "@/lib/permissions"

const storeOverridePolicies = [
  "Inventory counts",
  "Store locations",
  "Health check assignment",
  "Order draft notes",
  "Employee scheduling labels"
]

const permissionTemplateDefaults = permissionGroups.map((group) => `${group.title}: ${group.permissions.map((permission) => permission.label).join(", ")}`)

export default function OrganizationPage() {
  return (
    <>
      <OrganizationLiveFields />
      <PageHeader
        title="Manage organization"
        description="Organization-wide jobs, sales settings, defaults, permission templates, and owner-controlled policies."
        actions={<OrganizationSaveButton />}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel className="p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Organization profile</h2>
              <p className="app-tip mt-1 text-sm text-slate-400">Defaults used across stores and new employees.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Organization name">
              <TextInput name="organizationName" defaultValue="InvenTracker Demo" />
            </Field>
            <Field label="Primary timezone">
              <SelectInput name="primaryTimezone" defaultValue="America/New_York">
                <option>America/New_York</option>
                <option>America/Chicago</option>
                <option>America/Denver</option>
                <option>America/Los_Angeles</option>
              </SelectInput>
            </Field>
            <Field label="Default unit">
              <SelectInput name="defaultUnit" defaultValue="eaches">
                <option>eaches</option>
                <option>cases</option>
                <option>pounds</option>
                <option>ounces</option>
              </SelectInput>
            </Field>
            <Field label="Expiration default">
              <SelectInput name="expirationDefault" defaultValue="No expiration">
                <option>No expiration</option>
                <option>Tracks expiration</option>
              </SelectInput>
            </Field>
          </div>

          <div className="mt-6">
            <DataTable columns={["Setting", "Current value"]} rows={organizationSettings.map(([label, value]) => [label, value])} />
          </div>
        </Panel>

        <EditableSettingsList
          title="Job titles"
          description="Add, rename, delete, and save the roles employees can be assigned."
          initialItems={jobTitles}
          settingId="organizationLists"
          field="jobTitles"
          addLabel="Add title"
          placeholder="Department Trainer"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Company branding</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-slate-400">
                Controls the centered company identity in the app shell and future customer-facing surfaces.
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <Field label="Company display name">
              <TextInput name="companyDisplayName" defaultValue={organizationBranding.companyName} />
            </Field>
            <Field label="Logo URL">
              <TextInput name="logoUrl" defaultValue={organizationBranding.logoUrl} />
            </Field>
            <OrganizationLogoPreview />
            <Field label="Optional header text" hint="Leave blank if the company does not want text under the logo.">
              <TextInput name="headerText" defaultValue={organizationBranding.headerText} placeholder="Short line under the centered logo" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Primary accent">
                <TextInput name="primaryAccent" type="color" defaultValue={organizationBranding.accentColor} className="p-1" />
              </Field>
              <Field label="Secondary accent">
                <TextInput name="secondaryAccent" type="color" defaultValue={organizationBranding.secondaryColor} className="p-1" />
              </Field>
            </div>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-white">
                <Palette className="h-5 w-5 text-blue-300" />
                Organization theme defaults
              </h2>
              <p className="app-tip mt-1 text-sm leading-6 text-slate-400">
                These become the default look for every user unless personal themes are allowed.
              </p>
            </div>
            <StatusPill tone="blue">{organizationBranding.defaultMode}</StatusPill>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default theme">
              <SelectInput name="defaultTheme" defaultValue={organizationBranding.defaultTheme}>
                <option>Blue steel</option>
                <option>Fresh green</option>
                <option>High contrast</option>
                <option>Custom organization theme</option>
              </SelectInput>
            </Field>
            <Field label="Default mode">
              <SelectInput name="defaultMode" defaultValue={organizationBranding.defaultMode}>
                <option>Dark</option>
                <option>Light</option>
                <option>System</option>
              </SelectInput>
            </Field>
            <Field label="Navigation density">
              <SelectInput name="navigationDensity" defaultValue="Comfortable">
                <option>Comfortable</option>
                <option>Compact</option>
                <option>Expanded</option>
              </SelectInput>
            </Field>
            <Field label="Table density">
              <SelectInput name="tableDensity" defaultValue="Balanced">
                <option>Balanced</option>
                <option>Dense</option>
                <option>Roomy</option>
              </SelectInput>
            </Field>
          </div>
          <div className="mt-4">
            <ThemeControls
              defaultAccent={organizationBranding.accentColor}
              defaultSecondary={organizationBranding.secondaryColor}
              defaultMode={organizationBranding.defaultMode}
            />
          </div>

          <div className="mt-4 grid gap-3">
            <ToggleRow name="allowPersonalThemes" title="Allow personal themes" description="Employees can override the default colors for their own account only." />
            <ToggleRow name="deriveDarkModeFromBrand" title="Derive dark mode from brand colors" description="Dark mode deepens the chosen accent color and darkens panels, borders, and inputs." />
            <ToggleRow name="lockCustomerFacingColors" title="Lock customer-facing colors" description="Personal themes never affect public websites, forms, menus, or customer pages." />
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel className="p-4">
          <h2 className="font-semibold text-white">Sales and reporting</h2>
          <p className="app-tip mt-1 text-sm text-slate-400">Organization-level sales and variance defaults.</p>
          <div className="mt-4">
            <DataTable columns={["Policy", "Value"]} rows={salesSettings.map(([label, value]) => [label, value])} />
          </div>
        </Panel>

        <EditableSettingsList
          title="Default permission templates"
          description="Edit the templates used when inviting employees. Core permission keys stay protected so routes and security rules remain stable."
          initialItems={permissionTemplateDefaults}
          settingId="permissionTemplates"
          field="templates"
          addLabel="Add template"
          placeholder="Bakery lead: Inventory, Health checks, Orders"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Organization customization areas</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-slate-400">
                These are the company-wide surfaces owners can tune without rebuilding the product.
              </p>
            </div>
          </div>
          <DataTable columns={["Area", "What it controls"]} rows={organizationCustomizationAreas.map(([label, value]) => [label, value])} />
        </Panel>

        <EditableSettingsList
          title="Stores override policies"
          description="These policies apply to all stores. Stores no longer carry separate override lists unless the organization changes this global list."
          initialItems={storeOverridePolicies}
          settingId="storeOverridePolicies"
          field="policies"
          addLabel="Add policy"
          placeholder="Local display setup"
        />
      </div>

      <div className="mt-6">
        <EditableSettingsList
          title="Departments and category defaults"
          description="Departments drive item categories, permissions, reports, and product context."
          initialItems={departments}
          settingId="organizationLists"
          field="departments"
          addLabel="Add department"
          placeholder="Prepared Foods"
        />
      </div>
    </>
  )
}
