import { MapPin, Plus, Save, Truck } from "lucide-react"

import { ActionButton } from "@/components/action-button"
import { DataTable } from "@/components/data-table"
import { EditableSettingsList } from "@/components/editable-settings-list"
import { PageHeader } from "@/components/page-header"
import { Field, Panel, SelectInput, StatusPill, TextInput } from "@/components/ui"
import { departments, jobTitles, type StoreDisplay, type StoreRecord } from "@/lib/demo-data"
import { getStoreDisplays, getStores, getVendors } from "@/lib/server-data"

const storePermissionAreas = [
  ["Inventory counts", "Store teams can update front stock, back stock, and current quantity."],
  ["Store locations", "Store managers can edit aisles, coolers, backstock rooms, and shelf locations."],
  ["Health check assignment", "Store managers can assign local checks to employees."],
  ["Order draft notes", "Store managers can add notes without approving final orders."],
  ["Employee scheduling labels", "Store managers can update local job labels without changing organization roles."]
]

const storePermissionTemplates = [
  "Store manager: store profile, vendors, displays, local inventory counts",
  "Department lead: department inventory, displays, health checks",
  "Team member: assigned checks, restocks, receiving history"
]

const emptyStore: StoreRecord = {
  id: "new-store",
  name: "",
  code: "",
  address: "",
  manager: "",
  phone: "",
  activeItems: 0,
  employees: 0,
  editableAreas: []
}

const emptyDisplay: StoreDisplay = {
  id: "new-display",
  name: "",
  storeId: "",
  location: "",
  department: "",
  capacity: 0,
  status: "Draft",
  owner: ""
}

export default async function StoresPage() {
  const [stores, storeDisplays, vendors] = await Promise.all([getStores(), getStoreDisplays(), getVendors()])
  const selectedStore = stores[0] ?? emptyStore
  const selectedDisplay = storeDisplays[0] ?? emptyDisplay

  return (
    <>
      <PageHeader
        title="Stores"
        description="Manage store profiles, local rules, editable areas, and what store-level users are allowed to change."
        actions={<ActionButton doneLabel="Store staged" icon={<Plus className="h-4 w-4" />}>Add store</ActionButton>}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel>
          <DataTable
            columns={["Store", "Code", "Manager", "Active items", "Employees", "Editable areas"]}
            rows={stores.map((store) => [
              <div key={`${store.id}-name`}>
                <p className="font-semibold text-white">{store.name}</p>
                <p className="mt-1 text-xs text-slate-500">{store.address}</p>
              </div>,
              store.code,
              store.manager,
              store.activeItems.toLocaleString(),
              store.employees,
              <div key={`${store.id}-areas`} className="flex flex-wrap gap-1">
                {store.editableAreas.slice(0, 2).map((area) => (
                  <StatusPill key={area} tone="blue">
                    {area}
                  </StatusPill>
                ))}
              </div>
            ])}
          />
        </Panel>

        <Panel className="p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Store profile</h2>
              <p className="app-tip mt-1 text-sm text-slate-400">Local identity and operating defaults.</p>
            </div>
            <MapPin className="h-5 w-5 text-blue-300" />
          </div>

          <form className="grid gap-4">
            <Field label="Store name">
              <TextInput name="storeName" defaultValue={selectedStore.name} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Store code">
                <TextInput name="storeCode" defaultValue={selectedStore.code} />
              </Field>
              <Field label="Manager">
                <TextInput name="manager" defaultValue={selectedStore.manager} />
              </Field>
            </div>
            <Field label="Phone">
              <TextInput name="phone" defaultValue={selectedStore.phone} />
            </Field>
            <Field label="Default order approval">
              <SelectInput name="defaultOrderApproval" defaultValue="Manager review">
                <option>Manager review</option>
                <option>Owner approval</option>
                <option>Auto-save draft only</option>
              </SelectInput>
            </Field>
            <ActionButton icon={<Save className="h-4 w-4" />}>Save store</ActionButton>
          </form>
        </Panel>
      </div>

      <Panel className="mt-6">
        <div className="border-b border-[var(--app-border)] px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-[var(--app-text)]">
                <Truck className="h-5 w-5 text-[var(--app-accent)]" />
                Store vendors
              </h2>
              <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">
                Vendors live under the selected store so lead times, contacts, minimums, and ordering rules can differ by location.
              </p>
            </div>
            <ActionButton variant="secondary" doneLabel="Vendor staged" icon={<Plus className="h-4 w-4" />}>
              Add vendor
            </ActionButton>
          </div>
        </div>
        <DataTable
          columns={["Vendor", "Store", "Lead time", "Minimum", "Contact"]}
          rows={vendors.map((vendor) => [
            <span key={`${vendor.id}-name`} className="font-semibold text-[var(--app-text)]">
              {vendor.name}
            </span>,
            selectedStore.name,
            vendor.leadTime,
            vendor.minimum,
            vendor.contact
          ])}
        />
      </Panel>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel>
          <div className="border-b border-slate-800 px-4 py-4">
            <h2 className="font-semibold text-white">Displays</h2>
            <p className="app-tip mt-1 text-sm text-slate-400">
              Manage the display locations products can be assigned to from the product form.
            </p>
          </div>
          <DataTable
            columns={["Display", "Department", "Location", "Capacity", "Status", "Owner"]}
            rows={storeDisplays.map((display) => [
              <span key={`${display.id}-name`} className="font-semibold text-white">
                {display.name}
              </span>,
              display.department,
              display.location,
              `${display.capacity} units`,
              <StatusPill key={`${display.id}-status`} tone={display.status === "Active" ? "green" : "amber"}>
                {display.status}
              </StatusPill>,
              display.owner
            ])}
          />
        </Panel>

        <Panel className="p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Display setup</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-slate-400">Create or edit reusable display areas for this store.</p>
            </div>
            <ActionButton variant="secondary" doneLabel="Display staged" icon={<Plus className="h-4 w-4" />}>
              Add display
            </ActionButton>
          </div>

          <div className="grid gap-4">
            <Field label="Display name">
              <TextInput name="displayName" defaultValue={selectedDisplay.name} />
            </Field>
            <Field label="Location">
              <TextInput name="displayLocation" defaultValue={selectedDisplay.location} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department">
                <SelectInput name="displayDepartment" defaultValue={selectedDisplay.department}>
                  <option>Beer & Wine</option>
                  <option>Bakery</option>
                  <option>Produce</option>
                  <option>Grocery</option>
                  <option>Customer Service</option>
                </SelectInput>
              </Field>
              <Field label="Capacity">
                <TextInput name="displayCapacity" type="number" min="0" defaultValue={selectedDisplay.capacity} />
              </Field>
            </div>
            <Field label="Status">
              <SelectInput name="displayStatus" defaultValue={selectedDisplay.status}>
                <option>Active</option>
                <option>Seasonal</option>
                <option>Draft</option>
              </SelectInput>
            </Field>
            <ActionButton icon={<Save className="h-4 w-4" />}>Save display</ActionButton>
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <EditableSettingsList
          title="Store override policies"
          description="Store-level controls for this location. Organization-wide override policies still decide what stores are allowed to customize."
          initialItems={storePermissionAreas.map(([title]) => title)}
          scope="store"
          storeId={selectedStore.id}
          settingId="storeOverridePolicies"
          field="policies"
          addLabel="Add policy"
          placeholder="Local cooler map"
        />
        <EditableSettingsList
          title="Store job labels"
          description="Local labels for scheduling and store-specific responsibility, without changing organization-wide job titles."
          initialItems={jobTitles}
          scope="store"
          storeId={selectedStore.id}
          settingId="storePeople"
          field="jobLabels"
          addLabel="Add label"
          placeholder="Closing lead"
        />
        <EditableSettingsList
          title="Store departments"
          description="Departments active at this location. These can be narrower than the organization-wide department list."
          initialItems={departments.filter((department) => department !== "Executive")}
          scope="store"
          storeId={selectedStore.id}
          settingId="storePeople"
          field="departments"
          addLabel="Add department"
          placeholder="Prepared Foods"
        />
        <EditableSettingsList
          title="Store permission templates"
          description="Store-specific permission bundles used by managers when assigning local access."
          initialItems={storePermissionTemplates}
          scope="store"
          storeId={selectedStore.id}
          settingId="storePermissionTemplates"
          field="templates"
          addLabel="Add template"
          placeholder="Bakery opener: receiving, health checks"
        />
      </div>
    </>
  )
}
