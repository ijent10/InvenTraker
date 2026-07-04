export type PermissionKey =
  | "platform.admin"
  | "inventory.view"
  | "inventory.edit"
  | "inventory.archive"
  | "orders.view"
  | "orders.create"
  | "orders.approve"
  | "health.view"
  | "health.complete"
  | "health.manage"
  | "history.view"
  | "history.viewAll"
  | "history.viewRegion"
  | "history.viewDistrict"
  | "history.viewStore"
  | "history.viewDepartment"
  | "history.viewIndividual"
  | "files.view"
  | "files.upload"
  | "files.manage"
  | "ai.use"
  | "ai.manage"
  | "ai.verifyAutofill"
  | "insights.view"
  | "products.view"
  | "products.edit"
  | "vendors.view"
  | "vendors.edit"
  | "employees.view"
  | "employees.edit"
  | "employees.resetPassword"
  | "employees.permissions"
  | "organization.view"
  | "organization.manage"
  | "stores.view"
  | "stores.manage"
  | "settings.view"

export type PermissionGroup = {
  id: string
  title: string
  description: string
  permissions: Array<{
    key: PermissionKey
    label: string
    description: string
  }>
}

export const permissionGroups: PermissionGroup[] = [
  {
    id: "platform",
    title: "Platform administrator",
    description: "Global InvenTracker controls for legal content, organizations, subscriptions, and support operations.",
    permissions: [
      {
        key: "platform.admin",
        label: "Platform admin",
        description: "Manage platform legal content, feature requests, FAQs, organizations, stores, users, and subscriptions."
      }
    ]
  },
  {
    id: "inventory",
    title: "Inventory",
    description: "Item records, stock counts, archives, and store-level quantities.",
    permissions: [
      { key: "inventory.view", label: "View inventory", description: "Open inventory lists and item records." },
      { key: "inventory.edit", label: "Edit inventory", description: "Create items and update stock, locations, pars, and units." },
      { key: "inventory.archive", label: "Archive or delete", description: "Remove active items and manage archived records." },
      { key: "products.view", label: "View catalog", description: "Open central product and category records." },
      { key: "products.edit", label: "Edit catalog", description: "Change product identity, defaults, and expiration behavior." }
    ]
  },
  {
    id: "ordering",
    title: "Orders and Vendors",
    description: "Vendor setup, order drafts, approvals, and exports.",
    permissions: [
      { key: "orders.view", label: "View orders", description: "Open order drafts and submitted order history." },
      { key: "orders.create", label: "Create drafts", description: "Build order drafts manually or with future AI assistance." },
      { key: "orders.approve", label: "Approve orders", description: "Approve and submit orders to vendors." },
      { key: "vendors.view", label: "View vendors", description: "Open vendor profiles, minimums, and lead times." },
      { key: "vendors.edit", label: "Edit vendors", description: "Change contacts, lead times, minimums, and ordering rules." }
    ]
  },
  {
    id: "operations",
    title: "Operations and AI",
    description: "Health checks, task completion, AI assistance, and store performance visibility.",
    permissions: [
      { key: "health.view", label: "View health checks", description: "Open checklists, schedules, and completion history." },
      { key: "health.complete", label: "Complete checks", description: "Submit assigned store health check responses." },
      { key: "health.manage", label: "Manage checks", description: "Create check templates and assign schedules." },
      { key: "history.view", label: "View history", description: "Open operation history pages and permitted snippets." },
      { key: "history.viewAll", label: "All history", description: "View history across the full organization." },
      { key: "history.viewRegion", label: "Region history", description: "View selected regional history scopes." },
      { key: "history.viewDistrict", label: "District history", description: "View selected district history scopes." },
      { key: "history.viewStore", label: "Store history", description: "View selected store history scopes." },
      { key: "history.viewDepartment", label: "Department history", description: "View selected department history scopes." },
      { key: "history.viewIndividual", label: "Individual history", description: "View selected employee or direct-report history scopes." },
      { key: "files.view", label: "View files", description: "Open approved company documents, SOPs, guides, policies, and vendor sheets." },
      { key: "files.upload", label: "Upload files", description: "Add company files for review, parsing, and approval." },
      { key: "files.manage", label: "Manage files", description: "Approve, archive, supersede, categorize, and reprocess company documents." },
      { key: "ai.use", label: "Use AI assistant", description: "Ask product, inventory, waste, and ordering questions." },
      { key: "ai.manage", label: "Manage AI sources", description: "Configure product evidence, external search, and AI behavior." },
      { key: "ai.verifyAutofill", label: "Verify AI autofill", description: "Approve or reject AI-proposed product details before they save." },
      { key: "insights.view", label: "View insights", description: "Open trend, sales, shrink, and future AI insight pages." }
    ]
  },
  {
    id: "admin",
    title: "Admin",
    description: "Employee records, organization settings, store settings, and permission defaults.",
    permissions: [
      { key: "employees.view", label: "View employees", description: "Open employee profiles and access summaries." },
      { key: "employees.edit", label: "Edit employees", description: "Change names, job titles, IDs, phone numbers, and email." },
      { key: "employees.resetPassword", label: "Reset passwords", description: "Send password reset flows for employee accounts." },
      { key: "employees.permissions", label: "Change permissions", description: "Grant, remove, and audit user permissions." },
      { key: "organization.view", label: "View organization", description: "Open organization-wide business settings." },
      { key: "organization.manage", label: "Manage organization", description: "Change job titles, sales settings, defaults, and policies." },
      { key: "stores.view", label: "View stores", description: "Open store profiles, departments, and local rules." },
      { key: "stores.manage", label: "Manage stores", description: "Change store-level permissions, locations, and operating rules." }
    ]
  }
]

export const currentSession = {
  userId: "emp-001",
  name: "Ian",
  role: "Organization owner",
  permissions: ["*"]
}

const platformAdministratorUserIds = new Set(["emp-001"])

export function can(required?: PermissionKey) {
  if (!required) return true
  if (required === "platform.admin") {
    return platformAdministratorUserIds.has(currentSession.userId) || currentSession.permissions.includes("platform.admin")
  }
  return currentSession.permissions.includes("*") || currentSession.permissions.includes(required)
}
