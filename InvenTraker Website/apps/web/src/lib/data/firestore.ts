import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore/lite"
import { getDownloadURL, ref, uploadBytes } from "firebase/storage"

import { db, storage } from "@/lib/firebase/client"
import {
  requestStoreAccess as requestStoreAccessCallable,
  reviewStoreAccessRequest as reviewStoreAccessCallable,
  reviewItemSubmission as reviewItemSubmissionCallable,
  savePublicSiteContentByCallable
} from "@/lib/firebase/functions"
import type { MemberRole, AppModule } from "@/lib/rbac/modules"

type AnyDocRecord = { id: string } & Record<string, unknown>

export type OrgContext = {
  organizationId: string
  organizationName: string
  role: MemberRole
  storeIds: string[]
  departmentIds: string[]
  locationIds: string[]
  permissionFlags: Record<string, boolean>
  isPlatformAdmin: boolean
}

export type StoreWithPath = {
  id: string
  name: string
  title?: string
  storeNumber?: string
  status: string
  regionId: string
  districtId: string
  lastSyncAt?: unknown
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

export type ItemRecord = {
  id: string
  organizationId: string
  storeId?: string
  name: string
  upc?: string
  reworkItemCode?: string
  unit: "each" | "lbs"
  // Canonical + legacy aliases (iOS currently writes legacy names)
  minQuantity: number
  minimumQuantity: number
  qtyPerCase: number
  quantityPerBox: number
  caseSize: number
  hasExpiration: boolean
  defaultExpirationDays: number
  defaultExpiration: number
  defaultPackedExpiration: number
  price: number
  vendorId?: string
  vendorName?: string
  departmentId?: string
  department?: string
  locationId?: string
  categoryId?: string
  departmentLocation?: string
  tags: string[]
  archived: boolean
  isArchived: boolean
  isPrepackaged: boolean
  rewrapsWithUniqueBarcode: boolean
  totalQuantity: number
  batches: Array<{
    id?: string
    quantity: number
    expirationDate?: unknown
    receivedDate?: unknown
    stockAreaRaw?: string
    packageBarcode?: string
    packageWeight?: number
    packagePrice?: number
    storeId?: string
  }>
  pictures?: string[]
  includeInInsights?: boolean
  isOnSale?: boolean
  salePercentage?: number
  createdAt?: unknown
  lastModified?: unknown
  updatedAt?: unknown
  revision?: number
  updatedByUid?: string
  backendId?: string
  lastSyncedAt?: unknown
}

export type StoreItemOverrideRecord = {
  id: string
  organizationId: string
  storeId: string
  itemId: string
  minimumQuantity?: number
  departmentLocation?: string
  updatedAt?: unknown
  updatedBy?: string
}

export type StoreInventoryItemRecord = ItemRecord & {
  storeMinimumQuantity: number
  storeDepartmentLocation?: string
  backStockQuantity: number
  frontStockQuantity: number
}

export type VendorRecord = {
  id: string
  organizationId?: string
  name: string
  orderingDays: number[]
  cutoffTimeLocal?: string
  leadDays: number
  truckDays?: number[]
  orderDays?: number[]
  daysFromOrderToDelivery?: number
  orderWindowStart?: unknown
  orderWindowEnd?: unknown
  notes?: string
  isActive?: boolean
  updatedAt?: unknown
}

export type ExpirationEntryRecord = {
  itemId: string
  itemName: string
  upc?: string
  quantity: number
  unit: "each" | "lbs"
  expirationDate: Date
  daysUntilExpiration: number
  isExpired: boolean
}

export type SpotCheckRecord = {
  id: string
  organizationId: string
  storeId: string
  itemId: string
  itemName: string
  upc?: string
  packageBarcode?: string
  quantity: number
  unit: "each" | "lbs"
  expiresAt?: Date
  checkedAt: Date
  stockAreaRaw?: string
}

export type TodoRecord = {
  id: string
  organizationId: string
  storeId?: string
  type: "manual" | "auto"
  title: string
  dueAt?: unknown
  status: string
  createdAt?: unknown
  createdBy?: string
  createdByName?: string
  taskType?: string
  relatedItemId?: string
  relatedVendorId?: string
  assigneeUserIds?: string[]
  assigneeRoleTitles?: string[]
  assigneeDepartmentIds?: string[]
  assigneeDepartmentNames?: string[]
}

export type NotificationRecord = {
  id: string
  organizationId: string
  storeId?: string
  name: string
  content: string
  attachmentAssetId?: string
  attachmentName?: string
  attachmentUrl?: string
  attachmentContentType?: string
  attachmentSizeBytes?: number
  roleTargets: string[]
  dispatchMode: "immediate" | "scheduled"
  status: "queued" | "sent"
  scheduledFor?: Date
  createdAt?: unknown
  createdBy?: string
}

export type StoreAccessRequestRecord = {
  id: string
  organizationId: string
  requesterUid: string
  requesterName?: string
  requesterEmployeeId?: string
  targetStoreId: string
  targetStoreLabel?: string
  reason?: string
  status: "pending" | "approved" | "denied"
  reviewedByUid?: string
  reviewedByName?: string
  reviewedAt?: unknown
  createdAt?: unknown
  updatedAt?: unknown
}

export type ItemSubmissionDraftRecord = {
  backendItemId?: string
  name: string
  upc?: string
  unit: "each" | "lbs"
  price: number
  hasExpiration: boolean
  defaultExpirationDays: number
  defaultPackedExpiration: number
  minQuantity: number
  qtyPerCase: number
  caseSize: number
  vendorId?: string
  vendorName?: string
  departmentId?: string
  department?: string
  locationId?: string
  departmentLocation?: string
  tags: string[]
  photoUrl?: string
  photoAssetId?: string
  reworkItemCode?: string
  canBeReworked: boolean
  reworkShelfLifeDays: number
  maxReworkCount: number
}

export type ItemSubmissionRecord = {
  id: string
  organizationId: string
  storeId: string
  submittedByUid: string
  submittedByName?: string
  submittedByEmployeeId?: string
  scannedUpc?: string
  note?: string
  status: "pending" | "approved" | "rejected" | "promoted"
  reviewNote?: string
  reviewedByUid?: string
  reviewedByName?: string
  reviewedAt?: unknown
  createdAt?: unknown
  updatedAt?: unknown
  itemDraft: ItemSubmissionDraftRecord
}

export type OrganizationBillingStatusRecord = {
  organizationId: string
  subscriptionStatus: string
  planName?: string
  planTier?: "starter" | "growth" | "pro" | "custom"
  priceId?: string
  currentPeriodEnd?: Date | null
  isActive?: boolean
  entitlements?: Record<string, boolean>
  paymentVerification?: {
    provider?: string
    verified?: boolean
    verifiedAt?: Date | null
    sourceSubscriptionId?: string
    sourceCustomerUid?: string
  }
}

export function isProTierBilling(status: OrganizationBillingStatusRecord | null | undefined): boolean {
  if (!status) return false
  const normalizedStatus = (status.subscriptionStatus ?? "").trim().toLowerCase()
  if (normalizedStatus !== "active" && normalizedStatus !== "trialing") return false
  if (status.planTier === "pro") return true
  if (status.entitlements?.customBranding === true) return true
  const planName = (status.planName ?? "").trim().toLowerCase()
  const priceId = (status.priceId ?? "").trim().toLowerCase()
  return planName.includes("pro") || planName.includes("plus") || priceId.includes("pro")
}

export type OrderSuggestionLine = {
  itemId: string
  itemName: string
  suggestedQty: number
  unit: "each" | "lbs"
  rationale: string
  caseRounded: boolean
  onHand: number
  minQuantity: number
  qtyPerCase: number
}

export type OrgOrderRecord = {
  id: string
  organizationId: string
  storeId?: string
  itemId?: string
  itemName?: string
  itemUnit?: "each" | "lbs"
  itemQuantityPerBox?: number
  vendorId?: string
  vendorName?: string
  recommendedQuantity?: number
  orderedQuantity?: number
  isChecked?: boolean
  wasReceived?: boolean
  orderDate?: unknown
  expectedDeliveryDate?: unknown
  receivedDate?: unknown
  status?: string
  createdAt?: unknown
}

export type InventoryBatchRecord = {
  id: string
  organizationId: string
  storeId: string
  itemId: string
  quantity: number
  unit: "each" | "lbs"
  expiresAt: unknown
  lot?: string
  source: "received" | "spotcheck" | "manual"
}

export type ProductionProductRecord = {
  id: string
  organizationId: string
  storeId?: string
  name: string
  outputItemID?: string
  outputItemNameSnapshot?: string
  outputUnitRaw: string
  howToGuideID?: string
  defaultBatchYield: number
  targetDaysOnHand: number
  defaultServingTarget?: number
  instructions: string[]
  isActive: boolean
  lastSpotCheckQuantity: number
  lastSpotCheckDate?: unknown
  createdAt?: unknown
  updatedAt?: unknown
  backendId?: string
  revision?: number
  updatedByUid?: string
}

export type ProductionIngredientRecord = {
  id: string
  organizationId: string
  storeId?: string
  productionProductID: string
  inventoryItemID?: string
  inventoryItemNameSnapshot: string
  quantityPerBatch: number
  unitRaw: string
  needsConversion?: boolean
  convertToUnitRaw?: string
  createdAt?: unknown
  updatedAt?: unknown
  backendId?: string
  revision?: number
  updatedByUid?: string
}

export type ProductionSpotCheckRecord = {
  id: string
  organizationId: string
  storeId?: string
  productionProductID: string
  countedQuantity: number
  previousQuantity: number
  quantityProducedSinceLast: number
  usageObserved: number
  checkedAt?: unknown
}

export type ProductionRunRecord = {
  id: string
  organizationId: string
  storeId?: string
  productionProductID: string
  outputItemID?: string
  quantityMade: number
  packageBarcode?: string
  expirationDate?: unknown
  madeAt?: unknown
}

export type MemberRecord = {
  id: string
  email?: string
  role: MemberRole
  storeIds: string[]
  departmentIds: string[]
  locationIds: string[]
  employeeId?: string
  firstName?: string
  lastName?: string
  jobTitle?: string
  assignmentType?: "corporate" | "store"
  permissionFlags?: Record<string, boolean>
  profileImageUrl?: string
  canManageStoreUsersOnly?: boolean
  status?: "active" | "invited" | "disabled"
  createdAt?: unknown
}

export type PendingUserRecord = {
  id: string
  email: string
  employeeId: string
  firstName: string
  lastName: string
  jobTitle: string
  assignmentType: "corporate" | "store"
  storeIds: string[]
  departmentIds: string[]
  locationIds: string[]
  role: MemberRole
  permissionFlags: Record<string, boolean>
  status: "pending"
  createdAt?: unknown
}

export type RoleTemplateRecord = {
  id: string
  title: string
  baseRole: MemberRole
  permissionFlags: Record<string, boolean>
  singlePerStore?: boolean
}

export type DepartmentConfigRecord = {
  id: string
  name: string
  locations: string[]
}

export type ExportDataset = "inventory" | "orders" | "waste" | "expiration" | "production" | "todo"

export type CategoryConfigRecord = {
  id: string
  name: string
  description?: string
  departmentIds: string[]
  appliesTo: ExportDataset[]
  custom: boolean
  enabled: boolean
}

export type SpreadsheetExportColumnRecord = {
  id: string
  label: string
  path: string
  enabled: boolean
  order: number
  categoryId?: string
  custom: boolean
}

export type SpreadsheetExportPreferenceRecord = {
  dataset: ExportDataset
  columns: SpreadsheetExportColumnRecord[]
  includeGeneratedAt: boolean
  includeStoreInfo: boolean
  fileNameTemplate?: string
}

export type ReworkedBarcodeSectionType = "price" | "weight" | "other"
export type ReworkedBarcodeWeightUnit = "lbs" | "oz" | "kg" | "g" | "each"

export type ReworkedBarcodeSectionRecord = {
  id: string
  name: string
  digits: number
  type: ReworkedBarcodeSectionType
  useAsItemCode?: boolean
  decimalPlaces?: number
  weightUnit?: ReworkedBarcodeWeightUnit
}

export type ReworkedBarcodeRuleRecord = {
  enabled: boolean
  ruleName: string
  sections: ReworkedBarcodeSectionRecord[]
  productCodeLength: number
  encodedPriceLength: number
  trailingDigitsLength: number
  priceDivisor: number
}

export type OrgSettingsRecord = {
  id: string
  organizationId: string
  organizationName: string
  companyCode?: string
  customBrandingEnabled: boolean
  replaceAppNameWithLogo: boolean
  brandDisplayName?: string
  brandLogoUrl?: string
  brandLogoAssetId?: string
  logoLightUrl?: string
  logoLightAssetId?: string
  logoDarkUrl?: string
  logoDarkAssetId?: string
  appHeaderStyle: "icon_only" | "icon_name"
  moduleIconStyle: "rounded" | "square"
  welcomeMessage?: string
  canStoreRemoveItems: boolean
  maxSalePercent: number
  allowStoreRoleCreation: boolean
  managerCanManageUsersOnlyInOwnStore: boolean
  featureFlags: Record<string, boolean>
  jobTitles: RoleTemplateRecord[]
  roleDefaults: Array<{ role: MemberRole; enabled: boolean; permissionFlags: Record<string, boolean> }>
  departmentConfigs: DepartmentConfigRecord[]
  departments: string[]
  locationTemplates: string[]
  categoryConfigs: CategoryConfigRecord[]
  exportPreferences: SpreadsheetExportPreferenceRecord[]
  storeOverrideKeys: string[]
  reworkedBarcodeRule: ReworkedBarcodeRuleRecord
  updatedAt?: unknown
  updatedBy?: string
}

export type StoreSettingsRecord = {
  id: string
  organizationId: string
  storeId: string
  departmentConfigs: DepartmentConfigRecord[]
  departments: string[]
  locationTemplates: string[]
  categoryConfigs: CategoryConfigRecord[]
  exportPreferences: SpreadsheetExportPreferenceRecord[]
  jobTitles: RoleTemplateRecord[]
  roleDefaults: Array<{ role: MemberRole; enabled: boolean; permissionFlags: Record<string, boolean> }>
  canStoreRemoveItems: boolean
  maxSalePercent: number
  featureFlags: Record<string, boolean>
  reworkedBarcodeRule: ReworkedBarcodeRuleRecord
  updatedAt?: unknown
  updatedBy?: string
}

export type HealthCheckQuestionType =
  | "text"
  | "number"
  | "true_false"
  | "multiple_choice"
  | "multiple_select"
  | "insights_metric"
  | "expiration_metric"
  | "transfer_metric"

export type HealthCheckQuestionRecord = {
  id: string
  prompt: string
  inputType: HealthCheckQuestionType
  required: boolean
  options: string[]
  metricKey?: string
}

export type HealthCheckFormRecord = {
  id: string
  organizationId: string
  title: string
  description?: string
  scope: "organization" | "store"
  storeId?: string
  roleTargets: string[]
  departmentTargets: string[]
  questions: HealthCheckQuestionRecord[]
  isActive: boolean
  createdAt?: unknown
  createdBy?: string
  updatedAt?: unknown
  updatedBy?: string
}

export type SaveHealthCheckFormInput = {
  id?: string
  title: string
  description?: string
  scope: "organization" | "store"
  storeId?: string
  roleTargets: string[]
  departmentTargets: string[]
  questions: HealthCheckQuestionRecord[]
  isActive: boolean
  actorUid: string
}

export type HealthCheckResponseRecord = {
  id: string
  organizationId: string
  storeId: string
  healthCheckId: string
  healthCheckTitle: string
  answers: Record<string, unknown>
  submittedByUid?: string
  submittedByName?: string
  roleTitle?: string
  departmentNames: string[]
  submittedAt?: unknown
}

export type CentralCatalogItemRecord = {
  id: string
  upc: string
  name: string
  photoUrl?: string
  photoAssetId?: string
  thumbnailBase64?: string
  defaultExpirationDays?: number
  hasExpiration?: boolean
  updatedAt?: unknown
}

export type AccountProfileRecord = {
  employeeId?: string
  profileImageUrl?: string
  firstName?: string
  lastName?: string
  email?: string
}

export type HowToBlock = {
  id: string
  type: "text" | "photo" | "video"
  text?: string
  mediaAssetId?: string
  orderIndex: number
}

export type HowToStep = {
  id: string
  stepNumber: number
  title?: string
  blocks: HowToBlock[]
}

export type HowToGuide = {
  id: string
  title: string
  description: string
  tags: string[]
  scope: "org" | "store"
  storeId: string | null
  version: number
  updatedAt?: unknown
  updatedBy?: string
}

export type MediaAssetRecord = {
  id: string
  organizationId: string
  storeId?: string
  ownerUserId: string
  type: "image" | "video" | "pdf" | "file"
  storagePath: string
  storageBucket?: string
  contentType: string
  originalName: string
  sizeBytes: number
  createdAt?: unknown
  downloadUrl?: string
}

export type SaveProductionIngredientInput = {
  id?: string
  inventoryItemID?: string
  inventoryItemNameSnapshot: string
  quantityPerBatch: number
  unitRaw: string
  needsConversion?: boolean
  convertToUnitRaw?: string
}

export type SaveProductionProductInput = {
  id?: string
  name: string
  storeId?: string
  outputItemID?: string
  outputItemNameSnapshot?: string
  outputUnitRaw: string
  howToGuideID?: string
  defaultBatchYield: number
  targetDaysOnHand: number
  defaultServingTarget?: number
  instructions: string[]
  isActive?: boolean
  ingredients: SaveProductionIngredientInput[]
  actorUid: string
}

export type ThemeMode = "light" | "dark" | "system"

export type PlatformPreferenceProfile = {
  id: string
  userId: string
  organizationId: string
  platform: "WEB" | "IOS"
  theme: ThemeMode
  accentColor: string
  boldText: boolean
  showTips: boolean
}

export type AuditLogRecord = {
  id: string
  action?: string
  targetPath?: string
  createdAt?: unknown
  actorDisplayName?: string
  actorEmployeeId?: string
  [key: string]: unknown
}

export type UpsertMemberInput = {
  userId: string
  role: MemberRole
  storeIds: string[]
  departmentIds?: string[]
  locationIds?: string[]
  email?: string
  firstName?: string
  lastName?: string
  employeeId?: string
  jobTitle?: string
  assignmentType?: "corporate" | "store"
  permissionFlags?: Record<string, boolean>
  profileImageUrl?: string
  canManageStoreUsersOnly?: boolean
}

export type CreateNotificationInput = {
  name: string
  content: string
  attachmentAssetId?: string
  attachmentName?: string
  attachmentUrl?: string
  attachmentContentType?: string
  attachmentSizeBytes?: number
  roleTargets: string[]
  dispatchMode: "immediate" | "scheduled"
  scheduledFor?: Date
  storeId?: string
  senderName?: string
  senderEmployeeId?: string
}

export const permissionCatalog: Array<{
  key: string
  label: string
  description: string
  section: "general" | "app" | "web"
}> = [
  { key: "viewDashboard", label: "View Dashboard", description: "Open dashboard modules and metrics.", section: "general" },
  { key: "viewInventory", label: "View Inventory", description: "View inventory and item metadata.", section: "general" },
  { key: "viewExpiration", label: "View Expiration", description: "Access expiration and near-date workflows.", section: "general" },
  { key: "viewWaste", label: "View Waste", description: "Access waste records and waste trends.", section: "general" },
  { key: "viewOrders", label: "View Orders", description: "View and review order queues and history.", section: "general" },
  { key: "viewTodo", label: "View To-Do", description: "Access task lists and recurring task schedules.", section: "general" },
  { key: "viewInsights", label: "View Insights", description: "Access financial and trend insights.", section: "general" },
  { key: "viewProduction", label: "View Production", description: "Open production and pull planning views.", section: "general" },
  { key: "viewHowTos", label: "View How-To Library", description: "Browse searchable SOP and prep guides.", section: "general" },
  { key: "viewHealthChecks", label: "View Health Checks", description: "See assigned health checks and history.", section: "general" },
  { key: "viewNotifications", label: "View Notifications", description: "Read organization notifications and alerts.", section: "general" },
  { key: "viewStores", label: "View Stores", description: "Open store list and store-level status.", section: "general" },
  { key: "viewUsers", label: "View Users", description: "View user list, profiles, and role assignments.", section: "general" },
  { key: "manageInventory", label: "Manage Inventory", description: "Manage inventory data and workflows.", section: "general" },
  { key: "manageSales", label: "Can put items on sale", description: "Put items on sale and set sale pricing.", section: "general" },
  { key: "manageOrders", label: "Manage Orders", description: "Edit and complete orders.", section: "general" },
  { key: "generateOrders", label: "Generate Orders", description: "Run order suggestions.", section: "general" },
  { key: "manageTodo", label: "Manage To-Do", description: "Create and complete tasks.", section: "general" },
  { key: "sendNotifications", label: "Can send notifications", description: "Send web + mobile notifications.", section: "general" },
  { key: "exportData", label: "Export Data", description: "Export inventory, transfers, waste, and reports.", section: "general" },
  { key: "requestStoreAccess", label: "Request Store Access", description: "Request manager approval to access another store.", section: "general" },
  { key: "approveStoreAccessRequests", label: "Approve Store Access Requests", description: "Approve or deny cross-store access requests.", section: "general" },
  { key: "adjustStoreQuantity", label: "Adjust Quantity", description: "Adjust on-hand quantity/batches.", section: "app" },
  { key: "appSpotCheck", label: "Spot Check", description: "Run spot check workflows in the mobile app.", section: "app" },
  { key: "appReceive", label: "Receive Orders", description: "Receive deliveries and update stock in the mobile app.", section: "app" },
  { key: "appWaste", label: "Record Waste", description: "Record waste and spoilage in the mobile app.", section: "app" },
  { key: "appExpiration", label: "Expiration Tasks", description: "Manage expiration workflows in the mobile app.", section: "app" },
  { key: "appTransfers", label: "Transfers", description: "Move inventory between departments on mobile.", section: "app" },
  { key: "appRework", label: "Rework", description: "Use rework workflows for rewrapped items.", section: "app" },
  { key: "appProductionRuns", label: "Production Runs", description: "Log production runs and yields in mobile.", section: "app" },
  { key: "appChop", label: "Chop / Prep", description: "Access chop and prep conversion workflows.", section: "app" },
  { key: "appHealthChecks", label: "Health Checks (App)", description: "Complete assigned health checks in app.", section: "app" },
  { key: "appNotificationsFeed", label: "Notifications Feed (App)", description: "Access in-app notification feed.", section: "app" },
  { key: "appManualEntry", label: "Manual Entry", description: "Use manual entry when barcode scan is unavailable.", section: "app" },
  { key: "appOfflineSync", label: "Offline Sync", description: "Queue offline operations and sync when online.", section: "app" },
  { key: "manageUsers", label: "Manage Users", description: "Create, edit, disable users and memberships.", section: "web" },
  { key: "inviteUsers", label: "Invite Users", description: "Invite and pre-stage new user accounts.", section: "web" },
  { key: "editUserRoles", label: "Edit User Roles", description: "Change user roles and permission assignments.", section: "web" },
  { key: "resetUserCredentials", label: "Reset User Credentials", description: "Trigger password reset and account recovery actions.", section: "web" },
  { key: "deactivateUsers", label: "Deactivate Users", description: "Disable or re-enable users.", section: "web" },
  { key: "manageStores", label: "Manage Stores", description: "Create/edit stores and assignments.", section: "web" },
  { key: "createStores", label: "Create Stores", description: "Create new stores in the organization.", section: "web" },
  { key: "editStores", label: "Edit Stores", description: "Edit existing store metadata and assignments.", section: "web" },
  { key: "archiveStores", label: "Archive Stores", description: "Archive or restore stores.", section: "web" },
  { key: "manageOrgSettings", label: "Manage Organization Settings", description: "Control org-wide policies.", section: "web" },
  { key: "manageStoreSettings", label: "Manage Store Settings", description: "Control store policy and templates.", section: "web" },
  { key: "manageHealthChecks", label: "Manage Health Checks", description: "Create and assign health check forms.", section: "web" },
  { key: "viewOrganizationInventory", label: "View Organization Inventory", description: "Open org-wide inventory metadata across stores.", section: "web" },
  { key: "editOrgInventoryMeta", label: "Edit Org Inventory Fields", description: "Edit org-level item fields.", section: "web" },
  { key: "editStoreInventory", label: "Edit Store Inventory Fields", description: "Edit store-level overrides and stock.", section: "web" },
  { key: "manageVendors", label: "Manage Vendors", description: "Create and edit vendor schedules.", section: "web" },
  { key: "manageJobTitles", label: "Manage Roles", description: "Create/edit role templates.", section: "web" },
  { key: "manageCentralCatalog", label: "Manage Central Catalog", description: "Edit central database catalog.", section: "web" },
  { key: "managePermissions", label: "Manage Permissions", description: "Edit role permissions and grants.", section: "web" },
  { key: "viewBilling", label: "View Billing", description: "View billing status, plan, and invoices.", section: "web" },
  { key: "manageBilling", label: "Manage Billing", description: "Update plan, trial rules, and billing controls.", section: "web" },
  { key: "viewAuditLogs", label: "View Audit Logs", description: "View security and data change logs.", section: "web" },
  { key: "exportAuditLogs", label: "Export Audit Logs", description: "Export audit and compliance logs.", section: "web" },
  { key: "manageFeatureRequests", label: "Manage Feature Requests", description: "Review and triage feature request inbox.", section: "web" },
  { key: "manageContactInbox", label: "Manage Contact Inbox", description: "Review and respond to contact inquiries.", section: "web" },
  { key: "managePublicContent", label: "Manage Public Content", description: "Edit public landing page and marketing copy.", section: "web" },
  { key: "managePrivacyContent", label: "Manage Privacy Content", description: "Edit privacy policy content.", section: "web" },
  { key: "manageTermsContent", label: "Manage Terms Content", description: "Edit terms and legal content.", section: "web" },
  { key: "manageFaqContent", label: "Manage FAQ Content", description: "Edit FAQ questions and answers.", section: "web" },
  { key: "manageIntegrations", label: "Manage Integrations", description: "Configure integrations and external services.", section: "web" },
  { key: "manageSecuritySettings", label: "Manage Security Settings", description: "Control advanced security and compliance settings.", section: "web" }
]

const defaultPermissionFlags: Record<string, boolean> = Object.fromEntries(
  permissionCatalog.map((entry) => [entry.key, false])
)

const legacyInventoryReadFallbackByEnv = process.env.NEXT_PUBLIC_ENABLE_LEGACY_INVENTORY_READS === "1"
const legacyFallbackCache = new Map<string, boolean>()

async function canUseLegacyInventoryFallback(orgId: string): Promise<boolean> {
  if (!legacyInventoryReadFallbackByEnv || !db || !orgId) return false
  if (legacyFallbackCache.has(orgId)) return legacyFallbackCache.get(orgId) ?? false

  try {
    const [runtimeSnap, orgSnap] = await Promise.all([
      getDoc(doc(db, "organizations", orgId, "settings", "runtime")),
      getDoc(doc(db, "organizations", orgId))
    ])
    const runtime = (runtimeSnap.data() as Record<string, unknown> | undefined) ?? {}
    const orgData = (orgSnap.data() as Record<string, unknown> | undefined) ?? {}
    const migrationFlags =
      orgData.migrationFlags && typeof orgData.migrationFlags === "object"
        ? (orgData.migrationFlags as Record<string, unknown>)
        : {}
    const canonicalMigrationComplete = migrationFlags.storeInventoryCanonicalization === true
    const enabledByRuntime = runtime.legacyInventoryFallbackEnabled === true
    const disabledByMigration = runtime.legacyInventoryFallbackDisabled === true
    const enabled = enabledByRuntime && !disabledByMigration && !canonicalMigrationComplete
    legacyFallbackCache.set(orgId, enabled)
    return enabled
  } catch {
    legacyFallbackCache.set(orgId, false)
    return false
  }
}

function normalizeBaseRole(raw: unknown): MemberRole {
  const role = typeof raw === "string" ? raw.trim().toLowerCase() : ""
  if (role === "owner") return "Owner"
  if (role === "manager") return "Manager"
  return "Staff"
}

function normalizeJobTitles(raw: unknown) {
  if (!Array.isArray(raw)) return [] as RoleTemplateRecord[]
  return (
    raw
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null
      const record = entry as Record<string, unknown>
      const title = typeof record.title === "string" ? record.title.trim() : ""
      if (!title) return null
      if (title.toLowerCase() === "owner") return null
      const baseRole = normalizeBaseRole(record.baseRole)
      return {
        id: typeof record.id === "string" && record.id.trim() ? record.id : `job_${index + 1}`,
        title,
        baseRole,
        singlePerStore: Boolean(record.singlePerStore),
        permissionFlags:
          record.permissionFlags && typeof record.permissionFlags === "object"
            ? { ...permissionDefaultsForRole(baseRole), ...(record.permissionFlags as Record<string, boolean>) }
            : permissionDefaultsForRole(baseRole)
      }
    })
    .filter(Boolean) as RoleTemplateRecord[]
  )
}

function normalizeRoleDefaults(raw: unknown) {
  if (!Array.isArray(raw)) return [...baseRoleDefaults]
  const defaults = raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null
      const record = entry as Record<string, unknown>
      const role = normalizeBaseRole(record.role)
      return {
        role,
        enabled: typeof record.enabled === "boolean" ? record.enabled : true,
        permissionFlags:
          record.permissionFlags && typeof record.permissionFlags === "object"
            ? { ...permissionDefaultsForRole(role), ...(record.permissionFlags as Record<string, boolean>) }
            : permissionDefaultsForRole(role)
      }
    })
    .filter((entry): entry is { role: MemberRole; enabled: boolean; permissionFlags: Record<string, boolean> } => Boolean(entry))

  const byRole = new Map<MemberRole, { role: MemberRole; enabled: boolean; permissionFlags: Record<string, boolean> }>()
  for (const entry of defaults) byRole.set(entry.role, entry)
  for (const role of ["Owner", "Manager", "Staff"] as MemberRole[]) {
    if (!byRole.has(role)) {
      byRole.set(role, {
        role,
        enabled: role === "Owner",
        permissionFlags: permissionDefaultsForRole(role)
      })
    }
  }
  return Array.from(byRole.values())
}

const defaultReworkedBarcodeRule: ReworkedBarcodeRuleRecord = {
  enabled: false,
  ruleName: "Default Rule",
  sections: [
    {
      id: "item_code",
      name: "Item Code",
      digits: 6,
      type: "other",
      useAsItemCode: true
    },
    {
      id: "price",
      name: "Price",
      digits: 5,
      type: "price",
      decimalPlaces: 2
    },
    {
      id: "trailing",
      name: "Trailing Digit",
      digits: 1,
      type: "other"
    }
  ],
  productCodeLength: 6,
  encodedPriceLength: 5,
  trailingDigitsLength: 1,
  priceDivisor: 100
}

function normalizeDepartmentConfigs(raw: unknown): DepartmentConfigRecord[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const rows: DepartmentConfigRecord[] = []
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== "object") continue
    const record = entry as Record<string, unknown>
    const name = asString(record.name)?.trim() ?? ""
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const locations = Array.isArray(record.locations)
      ? Array.from(
          new Set(
            record.locations
              .map((value) => (typeof value === "string" ? value.trim() : ""))
              .filter(Boolean)
              .map((value) => value.toLowerCase())
          )
        )
          .map((lower) =>
            (record.locations as unknown[])
              .map((value) => (typeof value === "string" ? value.trim() : ""))
              .find((value) => value.toLowerCase() === lower) ?? lower
          )
      : []
    rows.push({
      id: asString(record.id)?.trim() || `department_${index + 1}`,
      name,
      locations
    })
  }
  return rows.sort((lhs, rhs) => lhs.name.localeCompare(rhs.name))
}

function deriveDepartmentConfigsFromLegacy(
  departments: string[] | undefined,
  locationTemplates: string[] | undefined
): DepartmentConfigRecord[] {
  const cleanedDepartments = (departments ?? []).map((entry) => entry.trim()).filter(Boolean)
  const cleanedLocations = (locationTemplates ?? []).map((entry) => entry.trim()).filter(Boolean)
  return cleanedDepartments.map((name, index) => ({
    id: `department_${index + 1}`,
    name,
    locations: cleanedLocations
  }))
}

const exportDatasets: ExportDataset[] = ["inventory", "orders", "waste", "expiration", "production", "todo"]

function normalizeExportDatasets(raw: unknown): ExportDataset[] {
  if (!Array.isArray(raw)) return ["inventory", "orders", "waste"]
  const normalized = raw
    .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
    .filter((entry): entry is ExportDataset => exportDatasets.includes(entry as ExportDataset))
  return Array.from(new Set(normalized))
}

function normalizeCategoryConfigs(raw: unknown): CategoryConfigRecord[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const rows: CategoryConfigRecord[] = []
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== "object") continue
    const record = entry as Record<string, unknown>
    const name = asString(record.name)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      id: asString(record.id) ?? `category_${index + 1}`,
      name,
      description: asString(record.description),
      departmentIds: asStringArray(record.departmentIds),
      appliesTo: normalizeExportDatasets(record.appliesTo),
      custom: record.custom === undefined ? true : Boolean(record.custom),
      enabled: record.enabled === undefined ? true : Boolean(record.enabled)
    })
  }
  return rows.sort((left, right) => left.name.localeCompare(right.name))
}

function normalizeSpreadsheetExportColumns(raw: unknown): SpreadsheetExportColumnRecord[] {
  if (!Array.isArray(raw)) return []
  const rows: SpreadsheetExportColumnRecord[] = []
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== "object") continue
    const record = entry as Record<string, unknown>
    const id = asString(record.id)
    const label = asString(record.label)
    const path = asString(record.path)
    if (!id || !label || !path) continue
    rows.push({
      id,
      label,
      path,
      enabled: record.enabled === undefined ? true : Boolean(record.enabled),
      order: Math.max(0, Math.floor(asNumber(record.order, index))),
      categoryId: asString(record.categoryId),
      custom: Boolean(record.custom)
    })
  }
  return rows.sort((left, right) => left.order - right.order || left.label.localeCompare(right.label))
}

function normalizeSpreadsheetExportPreferences(raw: unknown): SpreadsheetExportPreferenceRecord[] {
  if (!Array.isArray(raw)) return []
  const byDataset = new Map<ExportDataset, SpreadsheetExportPreferenceRecord>()
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const record = entry as Record<string, unknown>
    const datasetRaw = asString(record.dataset)?.toLowerCase()
    if (!datasetRaw || !exportDatasets.includes(datasetRaw as ExportDataset)) continue
    const dataset = datasetRaw as ExportDataset
    byDataset.set(dataset, {
      dataset,
      columns: normalizeSpreadsheetExportColumns(record.columns),
      includeGeneratedAt: record.includeGeneratedAt === undefined ? true : Boolean(record.includeGeneratedAt),
      includeStoreInfo: record.includeStoreInfo === undefined ? true : Boolean(record.includeStoreInfo),
      fileNameTemplate: asString(record.fileNameTemplate)
    })
  }
  return Array.from(byDataset.values()).sort(
    (left, right) => exportDatasets.indexOf(left.dataset) - exportDatasets.indexOf(right.dataset)
  )
}

function normalizeReworkedBarcodeSections(raw: unknown): ReworkedBarcodeSectionRecord[] {
  if (!Array.isArray(raw)) return []
  const rows: ReworkedBarcodeSectionRecord[] = []
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== "object") continue
    const record = entry as Record<string, unknown>
    const digits = Math.max(1, Math.floor(asNumber(record.digits, 1)))
    const typeRaw = asString(record.type)?.trim().toLowerCase()
    const type: ReworkedBarcodeSectionType =
      typeRaw === "price" || typeRaw === "weight" || typeRaw === "other" ? typeRaw : "other"
    const decimals = Math.max(0, Math.floor(asNumber(record.decimalPlaces, type === "price" ? 2 : 3)))
    const weightUnitRaw = asString(record.weightUnit)?.trim().toLowerCase()
    const weightUnit: ReworkedBarcodeWeightUnit =
      weightUnitRaw === "lbs" ||
      weightUnitRaw === "oz" ||
      weightUnitRaw === "kg" ||
      weightUnitRaw === "g" ||
      weightUnitRaw === "each"
        ? weightUnitRaw
        : "lbs"

    const section: ReworkedBarcodeSectionRecord = {
      id: asString(record.id)?.trim() || `section_${index + 1}`,
      name: asString(record.name)?.trim() || `Section ${index + 1}`,
      digits,
      type,
      useAsItemCode: Boolean(record.useAsItemCode)
    }
    if (type === "price" || type === "weight") {
      section.decimalPlaces = decimals
    }
    if (type === "weight") {
      section.weightUnit = weightUnit
    }
    rows.push(section)
  }
  if (rows.length === 0) return []
  const hasItemCode = rows.some((row) => row.useAsItemCode)
  if (!hasItemCode) {
    const firstOther = rows.findIndex((row) => row.type === "other")
    const index = firstOther >= 0 ? firstOther : 0
    const selected = rows[index]
    if (selected) {
      rows[index] = { ...selected, useAsItemCode: true }
    }
  } else {
    let seen = false
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      if (!row?.useAsItemCode) continue
      if (!seen) {
        seen = true
      } else {
        rows[i] = { ...row, useAsItemCode: false }
      }
    }
  }
  return rows
}

function normalizeReworkedBarcodeRule(raw: unknown): ReworkedBarcodeRuleRecord {
  const rule = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const productCodeLength = Math.max(1, Math.floor(Number(rule.productCodeLength) || 6))
  const encodedPriceLength = Math.max(1, Math.floor(Number(rule.encodedPriceLength) || 5))
  const trailingDigitsLength = Math.max(0, Math.floor(Number(rule.trailingDigitsLength) || 1))
  const priceDivisorRaw = Number(rule.priceDivisor)
  const legacyPriceDivisor =
    Number.isFinite(priceDivisorRaw) && priceDivisorRaw > 0
      ? Math.floor(priceDivisorRaw)
      : defaultReworkedBarcodeRule.priceDivisor

  const normalizedSections = normalizeReworkedBarcodeSections(rule.sections)
  const fallbackSections: ReworkedBarcodeSectionRecord[] = []
  if (productCodeLength > 0) {
    fallbackSections.push({
      id: "item_code",
      name: "Item Code",
      digits: productCodeLength,
      type: "other",
      useAsItemCode: true
    })
  }
  if (encodedPriceLength > 0) {
    fallbackSections.push({
      id: "price",
      name: "Price",
      digits: encodedPriceLength,
      type: "price",
      decimalPlaces: Math.max(0, String(legacyPriceDivisor).length - 1)
    })
  }
  if (trailingDigitsLength > 0) {
    fallbackSections.push({
      id: "trailing",
      name: "Trailing Digit",
      digits: trailingDigitsLength,
      type: "other"
    })
  }

  const sections = normalizedSections.length > 0 ? normalizedSections : fallbackSections

  const itemCodeSection = sections.find((section) => section.useAsItemCode) ?? sections[0]
  const priceSection = sections.find((section) => section.type === "price")
  const derivedProductCodeLength = itemCodeSection ? Math.max(1, itemCodeSection.digits) : productCodeLength
  const derivedEncodedPriceLength = priceSection ? Math.max(1, priceSection.digits) : encodedPriceLength
  const derivedTrailingDigitsLength = Math.max(
    0,
    sections
      .filter((section) => section.id !== itemCodeSection?.id && section.id !== priceSection?.id)
      .reduce((sum, section) => sum + Math.max(0, section.digits), 0)
  )
  const priceDecimals = Math.max(0, priceSection?.decimalPlaces ?? 2)
  const derivedPriceDivisor = Math.pow(10, priceDecimals)

  return {
    enabled: rule.enabled === undefined ? defaultReworkedBarcodeRule.enabled : Boolean(rule.enabled),
    ruleName: asString(rule.ruleName)?.trim() || defaultReworkedBarcodeRule.ruleName,
    sections,
    productCodeLength: derivedProductCodeLength,
    encodedPriceLength: derivedEncodedPriceLength,
    trailingDigitsLength: derivedTrailingDigitsLength,
    priceDivisor: Math.max(1, Math.floor(derivedPriceDivisor))
  }
}

export function permissionDefaultsForRole(role: MemberRole): Record<string, boolean> {
  const ownerDefaults = Object.fromEntries(permissionCatalog.map((entry) => [entry.key, true])) as Record<string, boolean>
  if (role === "Owner") {
    return ownerDefaults
  }
  if (role === "Manager") {
    return {
      ...defaultPermissionFlags,
      manageUsers: true,
      manageStores: true,
      viewDashboard: true,
      viewInventory: true,
      viewExpiration: true,
      viewWaste: true,
      viewOrders: true,
      viewTodo: true,
      viewInsights: true,
      viewProduction: true,
      viewHowTos: true,
      viewHealthChecks: true,
      viewNotifications: true,
      viewStores: true,
      viewUsers: true,
      manageOrgSettings: false,
      manageStoreSettings: true,
      manageHealthChecks: true,
      viewOrganizationInventory: false,
      manageInventory: true,
      editOrgInventoryMeta: true,
      editStoreInventory: true,
      adjustStoreQuantity: true,
      manageVendors: true,
      manageJobTitles: true,
      manageSales: true,
      manageOrders: true,
      generateOrders: true,
      manageTodo: true,
      sendNotifications: true,
      exportData: true,
      appSpotCheck: true,
      appReceive: true,
      appWaste: true,
      appExpiration: true,
      appTransfers: true,
      appRework: true,
      appProductionRuns: true,
      appChop: true,
      appHealthChecks: true,
      appNotificationsFeed: true,
      appManualEntry: true,
      appOfflineSync: true,
      inviteUsers: true,
      editUserRoles: true,
      resetUserCredentials: true,
      deactivateUsers: true,
      createStores: false,
      editStores: true,
      archiveStores: false,
      manageCentralCatalog: false,
      managePermissions: false,
      viewBilling: true,
      manageBilling: false,
      viewAuditLogs: true,
      exportAuditLogs: true,
      manageFeatureRequests: false,
      manageContactInbox: false,
      managePublicContent: false,
      managePrivacyContent: false,
      manageTermsContent: false,
      manageFaqContent: false,
      manageIntegrations: true,
      manageSecuritySettings: false,
      requestStoreAccess: true,
      approveStoreAccessRequests: true
    }
  }
  return {
    ...defaultPermissionFlags,
    viewDashboard: true,
    viewInventory: true,
    viewExpiration: true,
    viewWaste: true,
    viewOrders: true,
    viewTodo: true,
    manageInventory: true,
    manageOrders: true,
    viewProduction: true,
    viewHowTos: true,
    viewHealthChecks: true,
    viewNotifications: true,
    appSpotCheck: true,
    appReceive: true,
    appWaste: true,
    appExpiration: true,
    appTransfers: true,
    appRework: true,
    appProductionRuns: true,
    appChop: true,
    appHealthChecks: true,
    appNotificationsFeed: true,
    appManualEntry: true,
    appOfflineSync: true,
    viewInsights: true,
    generateOrders: true,
    manageTodo: true,
    requestStoreAccess: true,
    approveStoreAccessRequests: false
  }
}

function normalizeMemberRole(rawRole: unknown): MemberRole {
  const role = typeof rawRole === "string" ? rawRole.toLowerCase().trim() : ""
  if (role === "owner") return "Owner"
  if (role === "manager") return "Manager"
  return "Staff"
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
}

function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined
  if (Array.isArray(value)) {
    return value
      .map((entry) => stripUndefinedDeep(entry))
      .filter((entry) => entry !== undefined)
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    if (typeof record._methodName === "string") return value
    if (typeof (record as { toDate?: unknown }).toDate === "function") return value
  }
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value)
    const isPlainObject = prototype === Object.prototype || prototype === null
    if (!isPlainObject) {
      // Preserve Firestore sentinel values and special object types (Timestamp, Date, etc).
      return value
    }
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(record)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)] as const)
        .filter(([, entry]) => entry !== undefined)
    )
  }
  return value
}

function normalizeOptionalStringPatchValue(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const ORG_SETTINGS_WRITABLE_KEYS: Array<keyof OrgSettingsRecord> = [
  "organizationName",
  "companyCode",
  "customBrandingEnabled",
  "replaceAppNameWithLogo",
  "brandDisplayName",
  "brandLogoUrl",
  "brandLogoAssetId",
  "logoLightUrl",
  "logoLightAssetId",
  "logoDarkUrl",
  "logoDarkAssetId",
  "appHeaderStyle",
  "moduleIconStyle",
  "welcomeMessage",
  "canStoreRemoveItems",
  "maxSalePercent",
  "allowStoreRoleCreation",
  "managerCanManageUsersOnlyInOwnStore",
  "featureFlags",
  "jobTitles",
  "roleDefaults",
  "departmentConfigs",
  "departments",
  "locationTemplates",
  "categoryConfigs",
  "exportPreferences",
  "storeOverrideKeys",
  "reworkedBarcodeRule"
]

const STORE_SETTINGS_WRITABLE_KEYS: Array<keyof StoreSettingsRecord> = [
  "departmentConfigs",
  "departments",
  "locationTemplates",
  "categoryConfigs",
  "exportPreferences",
  "jobTitles",
  "roleDefaults",
  "canStoreRemoveItems",
  "maxSalePercent",
  "featureFlags",
  "reworkedBarcodeRule"
]

function pickWriteableKeys<T extends Record<string, unknown>>(source: Partial<T>, keys: Array<keyof T>): Partial<T> {
  const target: Partial<T> = {}
  for (const key of keys) {
    if (!(key in source)) continue
    ;(target as Record<string, unknown>)[key as string] = source[key]
  }
  return target
}

function sanitizeFirestoreWriteData(value: unknown): unknown {
  if (value === undefined) return undefined
  if (value === null) return null
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeFirestoreWriteData(entry))
      .filter((entry) => entry !== undefined)
  }
  if (value instanceof Date) return value
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    // Preserve Firebase FieldValue sentinels and Firestore-native timestamp-like values.
    if (typeof record._methodName === "string") return value
    if (typeof (record as { toDate?: unknown }).toDate === "function") return value
    const cleaned: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(record)) {
      const sanitized = sanitizeFirestoreWriteData(entry)
      if (sanitized !== undefined) {
        cleaned[key] = sanitized
      }
    }
    return cleaned
  }
  return value
}

function asImageSources(data: Record<string, unknown>): string[] {
  const fromPictures = asStringArray(data.pictures)
  if (fromPictures.length > 0) {
    return Array.from(new Set(fromPictures))
  }

  const fromPhotoUrl = asString(data.photoUrl)
  if (fromPhotoUrl) {
    return [fromPhotoUrl]
  }

  const rawBase64 = asString(data.thumbnailBase64)
  if (!rawBase64) {
    return []
  }

  const trimmed = rawBase64.trim()
  if (!trimmed) {
    return []
  }

  if (trimmed.startsWith("data:image/")) {
    return [trimmed]
  }

  // iOS writes thumbnailBase64 without a data URL prefix.
  return [`data:image/jpeg;base64,${trimmed}`]
}

function asTimestampDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return ((value as { toDate: () => Date }).toDate()) ?? null
    } catch {
      return null
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuidLike(value: string | undefined | null): value is string {
  if (!value) return false
  return uuidPattern.test(value.trim())
}

function makeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16)
    const value = char === "x" ? rand : (rand & 0x3) | 0x8
    return value.toString(16)
  })
}

function normalizeBatches(value: unknown): ItemRecord["batches"] {
  if (!Array.isArray(value)) return []
  const batches: ItemRecord["batches"] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue
    const record = entry as Record<string, unknown>
    const quantity = asNumber(record.quantity, 0)
    if (quantity <= 0) continue
    batches.push({
      id: asString(record.id),
      quantity,
      expirationDate: record.expirationDate,
      receivedDate: record.receivedDate,
      stockAreaRaw: asString(record.stockAreaRaw),
      packageBarcode: asString(record.packageBarcode),
      packageWeight: asNumber(record.packageWeight, 0) || undefined,
      packagePrice: asNumber(record.packagePrice, 0) || undefined,
      storeId: asString(record.storeId)
    })
  }
  return batches
}

function totalQuantityFromBatches(batches: ItemRecord["batches"]): number {
  return Number(
    batches.reduce((sum, batch) => sum + Math.max(0, asNumber(batch.quantity, 0)), 0).toFixed(3)
  )
}

function normalizeItemRecord(
  id: string,
  data: Record<string, unknown>,
  override?: { minimumQuantity?: number; departmentLocation?: string }
): ItemRecord {
  const minQuantity = asNumber(data.minQuantity ?? data.minimumQuantity, 0)
  const qtyPerCase = Math.max(1, asNumber(data.qtyPerCase ?? data.quantityPerBox, 1))
  const rawExpirationValue = data.defaultExpirationDays ?? data.defaultExpiration
  const hasExpiration = data.hasExpiration === undefined ? asNumber(rawExpirationValue, 7) > 0 : Boolean(data.hasExpiration)
  const defaultExpiration = Math.max(0, asNumber(rawExpirationValue, hasExpiration ? 7 : 0))
  const packedExpiration = Math.max(
    0,
    asNumber(data.defaultPackedExpiration ?? defaultExpiration, defaultExpiration)
  )
  const batches = normalizeBatches(data.batches)
  const totalQuantity = Number(
    asNumber(data.totalQuantity, totalQuantityFromBatches(batches)).toFixed(3)
  )
  const departmentLocation = override?.departmentLocation ?? asString(data.departmentLocation)
  const minimumQuantity = Number((override?.minimumQuantity ?? minQuantity).toFixed(3))
  return {
    id,
    organizationId: String(data.organizationId ?? "local-default"),
    storeId: asString(data.storeId),
    name: String(data.name ?? "Unnamed Item"),
    upc: asString(data.upc),
    reworkItemCode: asString(data.reworkItemCode),
    unit: data.unit === "lbs" ? "lbs" : "each",
    minQuantity: minimumQuantity,
    minimumQuantity,
    qtyPerCase,
    quantityPerBox: qtyPerCase,
    caseSize: Math.max(1, asNumber(data.caseSize ?? qtyPerCase, qtyPerCase)),
    hasExpiration,
    defaultExpirationDays: defaultExpiration,
    defaultExpiration,
    defaultPackedExpiration: packedExpiration,
    price: asNumber(data.price, 0),
    vendorId: asString(data.vendorId),
    vendorName: asString(data.vendorName),
    departmentId: asString(data.departmentId),
    department: asString(data.department),
    locationId: asString(data.locationId),
    categoryId: asString(data.categoryId),
    departmentLocation,
    tags: asStringArray(data.tags),
    archived: Boolean(data.archived ?? data.isArchived),
    isArchived: Boolean(data.archived ?? data.isArchived),
    isPrepackaged: Boolean(data.isPrepackaged),
    rewrapsWithUniqueBarcode: Boolean(data.rewrapsWithUniqueBarcode),
    totalQuantity,
    batches,
    pictures: asImageSources(data),
    includeInInsights: typeof data.includeInInsights === "boolean" ? data.includeInInsights : undefined,
    isOnSale: typeof data.isOnSale === "boolean" ? data.isOnSale : undefined,
    salePercentage: Number.isFinite(asNumber(data.salePercentage, Number.NaN))
      ? asNumber(data.salePercentage, 0)
      : undefined,
    createdAt: data.createdAt,
    lastModified: data.lastModified,
    updatedAt: data.updatedAt,
    revision: Number.isFinite(asNumber(data.revision, Number.NaN)) ? asNumber(data.revision, 0) : undefined,
    updatedByUid: asString(data.updatedByUid),
    backendId: asString(data.backendId),
    lastSyncedAt: data.lastSyncedAt
  }
}

function normalizeProductionProduct(
  id: string,
  data: Record<string, unknown>
): ProductionProductRecord {
  return {
    id,
    organizationId: String(data.organizationId ?? ""),
    storeId: asString(data.storeId),
    name: asString(data.name) ?? "Untitled Product",
    outputItemID: asString(data.outputItemID),
    outputItemNameSnapshot: asString(data.outputItemNameSnapshot),
    outputUnitRaw: asString(data.outputUnitRaw) ?? "pieces",
    howToGuideID: asString(data.howToGuideID),
    defaultBatchYield: Math.max(0.001, asNumber(data.defaultBatchYield, 1)),
    targetDaysOnHand: Math.max(0.25, asNumber(data.targetDaysOnHand, 1.5)),
    defaultServingTarget: Number.isFinite(asNumber(data.defaultServingTarget, Number.NaN))
      ? Math.max(0, asNumber(data.defaultServingTarget, 0))
      : undefined,
    instructions: asStringArray(data.instructions),
    isActive: data.isActive === undefined ? true : Boolean(data.isActive),
    lastSpotCheckQuantity: Math.max(0, asNumber(data.lastSpotCheckQuantity, 0)),
    lastSpotCheckDate: data.lastSpotCheckDate,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    backendId: asString(data.backendId),
    revision: Number.isFinite(asNumber(data.revision, Number.NaN))
      ? Math.max(0, asNumber(data.revision, 0))
      : undefined,
    updatedByUid: asString(data.updatedByUid)
  }
}

function normalizeProductionIngredient(
  id: string,
  data: Record<string, unknown>
): ProductionIngredientRecord {
  return {
    id,
    organizationId: String(data.organizationId ?? ""),
    storeId: asString(data.storeId),
    productionProductID: asString(data.productionProductID) ?? "",
    inventoryItemID: asString(data.inventoryItemID),
    inventoryItemNameSnapshot: asString(data.inventoryItemNameSnapshot) ?? "Ingredient",
    quantityPerBatch: Math.max(0, asNumber(data.quantityPerBatch, 0)),
    unitRaw: asString(data.unitRaw) ?? "pieces",
    needsConversion: data.needsConversion === undefined ? undefined : Boolean(data.needsConversion),
    convertToUnitRaw: asString(data.convertToUnitRaw),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    backendId: asString(data.backendId),
    revision: Number.isFinite(asNumber(data.revision, Number.NaN))
      ? Math.max(0, asNumber(data.revision, 0))
      : undefined,
    updatedByUid: asString(data.updatedByUid)
  }
}

function normalizeProductionSpotCheck(
  id: string,
  data: Record<string, unknown>
): ProductionSpotCheckRecord {
  return {
    id,
    organizationId: String(data.organizationId ?? ""),
    storeId: asString(data.storeId),
    productionProductID: asString(data.productionProductID) ?? "",
    countedQuantity: Math.max(0, asNumber(data.countedQuantity, 0)),
    previousQuantity: Math.max(0, asNumber(data.previousQuantity, 0)),
    quantityProducedSinceLast: Math.max(0, asNumber(data.quantityProducedSinceLast, 0)),
    usageObserved: Math.max(0, asNumber(data.usageObserved, 0)),
    checkedAt: data.checkedAt
  }
}

function normalizeProductionRun(
  id: string,
  data: Record<string, unknown>
): ProductionRunRecord {
  return {
    id,
    organizationId: String(data.organizationId ?? ""),
    storeId: asString(data.storeId),
    productionProductID: asString(data.productionProductID) ?? "",
    outputItemID: asString(data.outputItemID),
    quantityMade: Math.max(0, asNumber(data.quantityMade, 0)),
    packageBarcode: asString(data.packageBarcode),
    expirationDate: data.expirationDate,
    madeAt: data.madeAt
  }
}

function organizationItemPatch(patch: Partial<ItemRecord>): Record<string, unknown> {
  const record: Record<string, unknown> = { updatedAt: serverTimestamp(), lastModified: serverTimestamp() }

  if (patch.name !== undefined) record.name = patch.name
  if (patch.upc !== undefined) record.upc = patch.upc?.trim() || null
  if (patch.reworkItemCode !== undefined) record.reworkItemCode = patch.reworkItemCode?.trim() || null
  if (patch.price !== undefined) record.price = Math.max(0, asNumber(patch.price, 0))
  if (patch.qtyPerCase !== undefined || patch.quantityPerBox !== undefined) {
    const caseQty = Math.max(1, asNumber(patch.qtyPerCase ?? patch.quantityPerBox, 1))
    record.qtyPerCase = caseQty
    record.quantityPerBox = caseQty
  }
  if (patch.caseSize !== undefined) record.caseSize = Math.max(1, asNumber(patch.caseSize, 1))
  if (patch.hasExpiration !== undefined) record.hasExpiration = Boolean(patch.hasExpiration)
  if (patch.defaultExpirationDays !== undefined || patch.defaultExpiration !== undefined) {
    const expiration = Math.max(0, asNumber(patch.defaultExpirationDays ?? patch.defaultExpiration, 7))
    record.defaultExpirationDays = expiration
    record.defaultExpiration = expiration
  }
  if (patch.defaultPackedExpiration !== undefined) {
    record.defaultPackedExpiration = Math.max(0, asNumber(patch.defaultPackedExpiration, 1))
  }
  if (patch.vendorId !== undefined) record.vendorId = patch.vendorId?.trim() || null
  if (patch.vendorName !== undefined) record.vendorName = patch.vendorName?.trim() || null
  if (patch.department !== undefined) record.department = patch.department?.trim() || null
  if (patch.departmentId !== undefined) record.departmentId = patch.departmentId?.trim() || null
  if (patch.categoryId !== undefined) record.categoryId = patch.categoryId?.trim() || null
  if (patch.tags !== undefined) record.tags = asStringArray(patch.tags)
  if (patch.rewrapsWithUniqueBarcode !== undefined) record.rewrapsWithUniqueBarcode = Boolean(patch.rewrapsWithUniqueBarcode)
  if (patch.isPrepackaged !== undefined) record.isPrepackaged = Boolean(patch.isPrepackaged)
  if (patch.archived !== undefined || patch.isArchived !== undefined) {
    const archived = Boolean(patch.archived ?? patch.isArchived)
    record.archived = archived
    record.isArchived = archived
  }
  if (patch.pictures !== undefined) record.pictures = asStringArray(patch.pictures)
  if (patch.includeInInsights !== undefined) record.includeInInsights = patch.includeInInsights
  if (patch.isOnSale !== undefined) record.isOnSale = patch.isOnSale
  if (patch.salePercentage !== undefined) record.salePercentage = asNumber(patch.salePercentage, 0)
  return record
}

export function formatStoreLabel(store: Pick<StoreWithPath, "name" | "title" | "storeNumber">) {
  const title = (store.title ?? store.name ?? "").trim()
  const number = (store.storeNumber ?? "").trim()
  if (title && number) return `${title} (${number})`
  if (title) return title
  if (number) return number
  return "Store"
}

export async function fetchUserOrganizations(uid: string): Promise<OrgContext[]> {
  if (!db || !uid) return []
  const rowsByOrgId = new Map<string, OrgContext>()

  const addContext = (
    orgId: string,
    orgName: string,
    member: {
      role?: string
      storeIds?: string[]
      departmentIds?: string[]
      locationIds?: string[]
      permissionFlags?: Record<string, boolean>
    } | null,
    ownerByArray: boolean,
    isPlatformAdmin: boolean
  ) => {
    const role = normalizeMemberRole(member?.role ?? (ownerByArray ? "Owner" : "Staff"))
    const rawFlags = (member?.permissionFlags as Record<string, boolean> | undefined) ?? {}
    rowsByOrgId.set(orgId, {
      organizationId: orgId,
      organizationName: orgName,
      role,
      storeIds: member?.storeIds ?? [],
      departmentIds: member?.departmentIds ?? [],
      locationIds: member?.locationIds ?? [],
      permissionFlags: { ...permissionDefaultsForRole(role), ...rawFlags },
      isPlatformAdmin
    })
  }

  const userSnap = await getDoc(doc(db, "users", uid))
  const userData = (userSnap.data() as Record<string, unknown> | undefined) ?? {}
  const defaultOrgId = typeof userData.defaultOrganizationId === "string" ? userData.defaultOrganizationId : ""
  const isPlatformAdmin = Boolean(
    (userData.platformRoles as { platformAdmin?: boolean } | undefined)?.platformAdmin
  )

  let membershipsDocs: Awaited<ReturnType<typeof getDocs>>["docs"] = []
  try {
    const memberships = await getDocs(
      query(collectionGroup(db, "members"), where("userId", "==", uid), limit(200))
    )
    membershipsDocs = memberships.docs
  } catch {
    membershipsDocs = []
  }

  for (const memberSnap of membershipsDocs) {
    const member = memberSnap.data() as {
      role?: string
      storeIds?: string[]
      departmentIds?: string[]
      locationIds?: string[]
      permissionFlags?: Record<string, boolean>
    }
    const orgRef = memberSnap.ref.parent.parent
    if (!orgRef) continue
    const org = await getDoc(orgRef)
    if (!org.exists()) continue
    addContext(
      orgRef.id,
      String((org.data().name as string) ?? "Organization"),
      member,
      false,
      isPlatformAdmin
    )
  }

  try {
    const ownerOrgs = await getDocs(
      query(collection(db, "organizations"), where("ownerUserIds", "array-contains", uid), limit(100))
    )
    for (const org of ownerOrgs.docs) {
      const orgData = org.data() as Record<string, unknown>
      addContext(
        org.id,
        String((orgData.name as string) ?? "Organization"),
        null,
        true,
        isPlatformAdmin
      )
    }
  } catch {
    // Fallback handled below with direct document reads.
  }

  try {
    const legacyOwnerOrgs = await getDocs(
      query(collection(db, "organizations"), where("ownerUid", "==", uid), limit(100))
    )
    for (const org of legacyOwnerOrgs.docs) {
      const orgData = org.data() as Record<string, unknown>
      addContext(org.id, String((orgData.name as string) ?? "Organization"), null, true, isPlatformAdmin)
    }
  } catch {
    // Legacy owner field may not exist across all org docs.
  }

  if (isPlatformAdmin) {
    try {
      const allOrgs = await getDocs(query(collection(db, "organizations"), limit(500)))
      for (const org of allOrgs.docs) {
        const orgData = org.data() as Record<string, unknown>
        addContext(org.id, String((orgData.name as string) ?? "Organization"), { role: "Owner" }, true, true)
      }
    } catch {
      // Keep best-effort contexts.
    }
  }

  if (rowsByOrgId.size === 0 && defaultOrgId) {
    try {
      const orgSnap = await getDoc(doc(db, "organizations", defaultOrgId))
      if (orgSnap.exists()) {
        const orgData = orgSnap.data() as Record<string, unknown>
        const ownerByArray = Array.isArray(orgData.ownerUserIds) && orgData.ownerUserIds.includes(uid)
        const memberSnap = await getDoc(doc(db, "organizations", defaultOrgId, "members", uid))
        const memberData = memberSnap.exists()
          ? (memberSnap.data() as {
              role?: string
              storeIds?: string[]
              departmentIds?: string[]
              locationIds?: string[]
              permissionFlags?: Record<string, boolean>
            })
          : null

        addContext(
          defaultOrgId,
          String((orgData.name as string) ?? "Organization"),
          memberData,
          ownerByArray,
          isPlatformAdmin
        )
      }
    } catch {
      // Ignore; caller will surface empty org state.
    }
  }

  return Array.from(rowsByOrgId.values()).sort((a, b) => a.organizationName.localeCompare(b.organizationName))
}

export async function fetchStores(orgId: string): Promise<StoreWithPath[]> {
  if (!db || !orgId) return []
  const stores: StoreWithPath[] = []
  const regions = await getDocs(collection(db, "organizations", orgId, "regions"))

  for (const region of regions.docs) {
    const districts = await getDocs(collection(db, "organizations", orgId, "regions", region.id, "districts"))
    for (const district of districts.docs) {
      const storeSnap = await getDocs(
        collection(db, "organizations", orgId, "regions", region.id, "districts", district.id, "stores")
      )
      for (const store of storeSnap.docs) {
        const data = store.data() as Record<string, unknown>
        stores.push({
          id: store.id,
          name: String(data.name ?? "Store"),
          title: typeof data.title === "string" ? data.title : undefined,
          storeNumber: typeof data.storeNumber === "string" ? data.storeNumber : undefined,
          status: String(data.status ?? "active"),
          regionId: region.id,
          districtId: district.id,
          lastSyncAt: data.lastSyncAt,
          addressLine1: typeof data.addressLine1 === "string" ? data.addressLine1 : undefined,
          addressLine2: typeof data.addressLine2 === "string" ? data.addressLine2 : undefined,
          city: typeof data.city === "string" ? data.city : undefined,
          state: typeof data.state === "string" ? data.state : undefined,
          postalCode: typeof data.postalCode === "string" ? data.postalCode : undefined,
          country: typeof data.country === "string" ? data.country : undefined
        })
      }
    }
  }

  return stores.sort((a, b) => formatStoreLabel(a).localeCompare(formatStoreLabel(b)))
}

export async function fetchStoreItemOverrides(
  orgId: string,
  storeId: string
): Promise<Record<string, StoreItemOverrideRecord>> {
  if (!db || !orgId || !storeId) return {}
  const snap = await getDocs(
    query(
      collection(db, "organizations", orgId, "storeItemOverrides"),
      where("storeId", "==", storeId),
      limit(2500)
    )
  ).catch(() => null)
  if (!snap) return {}
  const byItemId: Record<string, StoreItemOverrideRecord> = {}
  for (const entry of snap.docs) {
    const data = entry.data() as Record<string, unknown>
    const itemId = asString(data.itemId)
    if (!itemId) continue
    byItemId[itemId] = {
      id: entry.id,
      organizationId: orgId,
      storeId,
      itemId,
      minimumQuantity: Number.isFinite(asNumber(data.minimumQuantity, Number.NaN))
        ? asNumber(data.minimumQuantity, 0)
        : undefined,
      departmentLocation: asString(data.departmentLocation),
      updatedAt: data.updatedAt,
      updatedBy: asString(data.updatedBy)
    }
  }
  return byItemId
}

export async function fetchItems(orgId: string, options?: { storeId?: string }): Promise<ItemRecord[]> {
  if (!db || !orgId) return []
  const requestedStoreId = options?.storeId?.trim() ?? ""
  const overrides = (() => {
    if (!requestedStoreId) return Promise.resolve({} as Record<string, StoreItemOverrideRecord>)
    return fetchStoreItemOverrides(orgId, requestedStoreId).catch(() => ({} as Record<string, StoreItemOverrideRecord>))
  })()
  const [snap, resolvedOverrides] = await Promise.all([
    getDocs(query(collection(db, "organizations", orgId, "items"), orderBy("name"), limit(2500))),
    overrides
  ])

  const stores = requestedStoreId
    ? await fetchStores(orgId).catch(() => [] as StoreWithPath[])
    : []
  const batchDocs = requestedStoreId
    ? await fetchStoreInventoryBatchDocs(orgId, requestedStoreId, { preloadedStores: stores }).catch(() => [])
    : []
  const batchesByItemId = new Map<string, ItemRecord["batches"]>()
  if (requestedStoreId) {
    for (const batchDoc of batchDocs) {
      const data = batchDoc.data
      const itemId = asString(data.itemId)
      if (!itemId) continue
      const quantity = Math.max(0, asNumber(data.quantity, 0))
      if (quantity <= 0) continue
      const normalizedBatch: ItemRecord["batches"][number] = {
        id: batchDoc.id,
        quantity,
        expirationDate: data.expiresAt ?? data.expirationDate,
        receivedDate: data.receivedDate ?? data.createdAt,
        stockAreaRaw: asString(data.stockAreaRaw),
        packageBarcode: asString(data.packageBarcode),
        packageWeight: Number.isFinite(asNumber(data.packageWeight, Number.NaN))
          ? asNumber(data.packageWeight, 0)
          : undefined,
        packagePrice: Number.isFinite(asNumber(data.packagePrice, Number.NaN))
          ? asNumber(data.packagePrice, 0)
          : undefined,
        storeId: requestedStoreId
      }
      const rows = batchesByItemId.get(itemId) ?? []
      rows.push(normalizedBatch)
      batchesByItemId.set(itemId, rows)
    }
  }

  const normalizedItems = snap.docs.map((item) =>
    normalizeItemRecord(item.id, item.data() as Record<string, unknown>, resolvedOverrides[item.id])
  )
  if (!requestedStoreId) {
    return normalizedItems
  }

  return normalizedItems.map((item) => {
      const batches = batchesByItemId.get(item.id) ?? []
      const totalQuantity = Number(
        batches.reduce((sum, batch) => sum + Math.max(0, asNumber(batch.quantity, 0)), 0).toFixed(3)
      )
      return {
        ...item,
        storeId: requestedStoreId,
        batches,
        totalQuantity
      }
    })
}

export async function fetchItem(
  orgId: string,
  itemId: string,
  options?: { storeId?: string }
): Promise<ItemRecord | null> {
  if (!db || !orgId || !itemId) return null
  const snap = await getDoc(doc(db, "organizations", orgId, "items", itemId))
  if (!snap.exists()) return null
  const requestedStoreId = options?.storeId?.trim() ?? ""
  const override = requestedStoreId
    ? (await fetchStoreItemOverrides(orgId, requestedStoreId))[itemId]
    : undefined
  const normalized = normalizeItemRecord(snap.id, snap.data() as Record<string, unknown>, override)
  if (!requestedStoreId) {
    return normalized
  }
  const stores = await fetchStores(orgId).catch(() => [] as StoreWithPath[])
  const batchDocs = await fetchStoreInventoryBatchDocs(orgId, requestedStoreId, {
    itemId,
    preloadedStores: stores
  }).catch(() => [])
  const batches: ItemRecord["batches"] = []
  for (const batchDoc of batchDocs) {
    const data = batchDoc.data
    const quantity = Math.max(0, asNumber(data.quantity, 0))
    if (quantity <= 0) continue
    batches.push({
      id: batchDoc.id,
      quantity,
      expirationDate: data.expiresAt ?? data.expirationDate,
      receivedDate: data.receivedDate ?? data.createdAt,
      stockAreaRaw: asString(data.stockAreaRaw),
      packageBarcode: asString(data.packageBarcode),
      packageWeight: Number.isFinite(asNumber(data.packageWeight, Number.NaN))
        ? asNumber(data.packageWeight, 0)
        : undefined,
      packagePrice: Number.isFinite(asNumber(data.packagePrice, Number.NaN))
        ? asNumber(data.packagePrice, 0)
        : undefined,
      storeId: requestedStoreId
    })
  }
  const totalQuantity = Number(
    batches.reduce((sum, batch) => sum + Math.max(0, asNumber(batch.quantity, 0)), 0).toFixed(3)
  )
  return {
    ...normalized,
    storeId: requestedStoreId,
    batches,
    totalQuantity
  }
}

export async function updateItem(orgId: string, itemId: string, patch: Partial<ItemRecord>): Promise<void> {
  if (!db || !orgId || !itemId) return
  const itemRef = doc(db, "organizations", orgId, "items", itemId)
  const currentSnap = await getDoc(itemRef)
  const currentData = (currentSnap.data() as Record<string, unknown> | undefined) ?? {}
  await setDoc(itemRef, organizationItemPatch(patch), {
    merge: true
  })

  const upc = (patch.upc ?? asString(currentData.upc) ?? "").trim()
  if (!upc) return

  await setDoc(
    doc(db, "organizations", orgId, "companyCatalog", upc),
    {
      upc,
      tags: patch.tags ?? currentData.tags ?? [],
      price: patch.price ?? currentData.price ?? 0,
      casePack: patch.qtyPerCase ?? patch.quantityPerBox ?? currentData.qtyPerCase ?? currentData.quantityPerBox ?? 1,
      hasExpiration: patch.hasExpiration ?? currentData.hasExpiration ?? true,
      defaultExpiration:
        patch.defaultExpirationDays ?? patch.defaultExpiration ?? currentData.defaultExpirationDays ?? currentData.defaultExpiration ?? 7,
      defaultPackedExpiration:
        patch.defaultPackedExpiration ??
        currentData.defaultPackedExpiration ??
        patch.defaultExpirationDays ??
        patch.defaultExpiration ??
        currentData.defaultExpirationDays ??
        currentData.defaultExpiration ??
        7,
      vendorName: patch.vendorName ?? currentData.vendorName ?? null,
      department: patch.department ?? currentData.department ?? null,
      departmentLocation: currentData.departmentLocation ?? null,
      unitRaw: patch.unit ?? currentData.unit ?? "each",
      isPrepackaged: patch.isPrepackaged ?? currentData.isPrepackaged ?? false,
      rewrapsWithUniqueBarcode:
        patch.rewrapsWithUniqueBarcode ?? currentData.rewrapsWithUniqueBarcode ?? false,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  )
}

export async function updateStoreItemOverride(
  orgId: string,
  storeId: string,
  itemId: string,
  patch: Partial<Pick<StoreItemOverrideRecord, "minimumQuantity" | "departmentLocation">> & {
    actorUid?: string
  }
): Promise<void> {
  if (!db || !orgId || !storeId || !itemId) return
  const ref = doc(db, "organizations", orgId, "storeItemOverrides", `${storeId}_${itemId}`)
  const data: Record<string, unknown> = {
    organizationId: orgId,
    storeId,
    itemId,
    updatedAt: serverTimestamp()
  }
  if (patch.minimumQuantity !== undefined) data.minimumQuantity = Math.max(0, asNumber(patch.minimumQuantity, 0))
  if (patch.departmentLocation !== undefined) {
    data.departmentLocation = patch.departmentLocation?.trim() ? patch.departmentLocation.trim() : null
  }
  if (patch.actorUid) data.updatedBy = patch.actorUid
  await setDoc(ref, data, { merge: true })
}

export async function fetchStoreInventoryItems(
  orgId: string,
  storeId: string
): Promise<StoreInventoryItemRecord[]> {
  const normalizedStoreId = storeId.trim()
  if (!normalizedStoreId || !db || !orgId) return []

  const [allItems, overrides] = await Promise.all([
    fetchItems(orgId, { storeId: normalizedStoreId }),
    fetchStoreItemOverrides(orgId, normalizedStoreId).catch(() => ({} as Record<string, StoreItemOverrideRecord>)),
  ])
  const itemById = new Map(allItems.map((item) => [item.id, item]))
  const rows: StoreInventoryItemRecord[] = []

  for (const metadata of itemById.values()) {
    const batches = metadata.batches.filter((batch) => Math.max(0, asNumber(batch.quantity, 0)) > 0)
    if (batches.length === 0) continue
    const itemId = metadata.id
    if (!metadata) continue

    const override = overrides[itemId]
    const minimumQuantity = override?.minimumQuantity ?? metadata.minimumQuantity
    const departmentLocation = override?.departmentLocation ?? metadata.departmentLocation
    const totalQuantity = Number(
      batches.reduce((sum, batch) => sum + Math.max(0, asNumber(batch.quantity, 0)), 0).toFixed(3)
    )
    const backStock = Number(
      batches
        .filter((batch) => !batch.stockAreaRaw || batch.stockAreaRaw === "back_of_house")
        .reduce((sum, batch) => sum + batch.quantity, 0)
        .toFixed(3)
    )
    const frontStock = Number(
      batches
        .filter((batch) => batch.stockAreaRaw === "front_of_house")
        .reduce((sum, batch) => sum + batch.quantity, 0)
        .toFixed(3)
    )

    rows.push({
      ...metadata,
      storeId: normalizedStoreId,
      batches,
      totalQuantity,
      minQuantity: minimumQuantity,
      minimumQuantity,
      departmentLocation,
      storeMinimumQuantity: minimumQuantity,
      storeDepartmentLocation: departmentLocation,
      backStockQuantity: backStock,
      frontStockQuantity: frontStock
    })
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export async function upsertStoreInventoryItem(
  orgId: string,
  storeId: string,
  itemId: string,
  payload: Partial<ItemRecord> & {
    storeMinimumQuantity?: number
    storeDepartmentLocation?: string
    actorUid?: string
  }
): Promise<void> {
  if (!db || !orgId || !storeId || !itemId) return
  const { storeMinimumQuantity, storeDepartmentLocation, actorUid } = payload
  const requestedStoreId = storeId.trim()
  const hasQuantityPayload = payload.totalQuantity !== undefined || payload.batches !== undefined
  const orgPatch: Partial<ItemRecord> = { ...payload }
  delete (orgPatch as { storeMinimumQuantity?: number }).storeMinimumQuantity
  delete (orgPatch as { storeDepartmentLocation?: string }).storeDepartmentLocation
  delete (orgPatch as { actorUid?: string }).actorUid
  delete (orgPatch as { minimumQuantity?: number }).minimumQuantity
  delete (orgPatch as { minQuantity?: number }).minQuantity
  delete (orgPatch as { departmentLocation?: string }).departmentLocation
  delete (orgPatch as { totalQuantity?: number }).totalQuantity
  delete (orgPatch as { batches?: ItemRecord["batches"] }).batches
  await updateItem(orgId, itemId, orgPatch)
  await updateStoreItemOverride(orgId, storeId, itemId, {
    minimumQuantity: storeMinimumQuantity,
    departmentLocation: storeDepartmentLocation,
    actorUid
  })

  const upc = (payload.upc ?? "").trim()
  if (upc) {
    await setDoc(
      doc(db!, "organizations", orgId, "stores", storeId, "catalog", upc),
      {
        upc,
        storeId,
        minimumQuantity: Math.max(0, asNumber(storeMinimumQuantity, 0)),
        departmentLocation: storeDepartmentLocation?.trim() || null,
        department: payload.department?.trim() || null,
        updatedByUid: actorUid ?? null,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    )
  }

  if (!hasQuantityPayload) return

  const resolvedStore = (await fetchStores(orgId).catch(() => [] as StoreWithPath[])).find(
    (entry) => entry.id === requestedStoreId
  )
  const batchCollection = resolvedStore
    ? storeCollectionPath(orgId, resolvedStore, "inventoryBatches")
    : collection(db, "organizations", orgId, "stores", requestedStoreId, "inventoryBatches")

  const existingBatches = await getDocs(
    query(batchCollection, where("itemId", "==", itemId), limit(2500))
  ).catch(() => null)

  const normalizedUnit: "each" | "lbs" = payload.unit === "lbs" ? "lbs" : "each"
  const normalizedBatches: Array<{
    quantity: number
    expirationDate: Date | null
    stockAreaRaw: string
    packageBarcode?: string
    packageWeight?: number
    packagePrice?: number
  }> = []

  for (const batch of payload.batches ?? []) {
    const quantity = Math.max(0, asNumber(batch.quantity, 0))
    if (quantity <= 0) continue
    const expiresAt = asTimestampDate(batch.expirationDate) ?? null
    normalizedBatches.push({
      quantity: Number(quantity.toFixed(3)),
      expirationDate: expiresAt,
      stockAreaRaw: batch.stockAreaRaw?.trim() || "back_of_house",
      packageBarcode: asString(batch.packageBarcode),
      packageWeight: Number.isFinite(asNumber(batch.packageWeight, Number.NaN))
        ? asNumber(batch.packageWeight, 0)
        : undefined,
      packagePrice: Number.isFinite(asNumber(batch.packagePrice, Number.NaN))
        ? asNumber(batch.packagePrice, 0)
        : undefined
    })
  }

  if (normalizedBatches.length === 0 && payload.totalQuantity !== undefined) {
    const quantity = Math.max(0, asNumber(payload.totalQuantity, 0))
    if (quantity > 0) {
      const itemExpires = payload.hasExpiration !== false
      const fallbackExpiresAt = itemExpires ? new Date() : null
      if (fallbackExpiresAt) {
        const fallbackExpiration = Math.max(
          1,
          asNumber(payload.defaultExpirationDays ?? payload.defaultExpiration, 7)
        )
        fallbackExpiresAt.setDate(fallbackExpiresAt.getDate() + fallbackExpiration)
      }
      normalizedBatches.push({
        quantity: Number(quantity.toFixed(3)),
        expirationDate: fallbackExpiresAt,
        stockAreaRaw: "back_of_house"
      })
    }
  }

  const batchWriter = writeBatch(db)
  for (const row of existingBatches?.docs ?? []) {
    batchWriter.delete(row.ref)
  }

  for (const batch of normalizedBatches) {
    const batchRef = doc(batchCollection)
    batchWriter.set(batchRef, {
      organizationId: orgId,
      storeId: requestedStoreId,
      itemId,
      quantity: batch.quantity,
      unit: normalizedUnit,
      expiresAt: batch.expirationDate,
      lot: null,
      source: "manual",
      stockAreaRaw: batch.stockAreaRaw,
      packageBarcode: batch.packageBarcode ?? null,
      packageWeight: batch.packageWeight ?? null,
      packagePrice: batch.packagePrice ?? null,
      backendId: makeUuid(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedByUid: actorUid ?? null
    })
  }

  await batchWriter.commit()
}

export async function fetchMembers(orgId: string): Promise<MemberRecord[]> {
  if (!db || !orgId) return []
  const snap = await getDocs(collection(db, "organizations", orgId, "members"))

  return snap.docs
    .map((member) => {
      const data = member.data() as Record<string, unknown>
      return {
        id: member.id,
        email: typeof data.email === "string" ? data.email : undefined,
        role: normalizeMemberRole(data.role),
        storeIds: (data.storeIds as string[]) ?? [],
        departmentIds: (data.departmentIds as string[]) ?? [],
        locationIds: (data.locationIds as string[]) ?? [],
        employeeId: typeof data.employeeId === "string" ? data.employeeId : undefined,
        firstName: typeof data.firstName === "string" ? data.firstName : undefined,
        lastName: typeof data.lastName === "string" ? data.lastName : undefined,
        jobTitle: typeof data.jobTitle === "string" ? data.jobTitle : undefined,
        assignmentType:
          data.assignmentType === "corporate" || data.assignmentType === "store"
            ? (data.assignmentType as "corporate" | "store")
            : "store",
        permissionFlags: {
          ...permissionDefaultsForRole(normalizeMemberRole(data.role)),
          ...((data.permissionFlags as Record<string, boolean> | undefined) ?? {})
        },
        profileImageUrl: typeof data.profileImageUrl === "string" ? data.profileImageUrl : undefined,
        canManageStoreUsersOnly: Boolean(data.canManageStoreUsersOnly),
        status:
          data.status === "active" || data.status === "invited" || data.status === "disabled"
            ? (data.status as "active" | "invited" | "disabled")
            : "active",
        createdAt: data.createdAt
      } satisfies MemberRecord
    })
    .sort((a, b) =>
      `${a.lastName ?? ""} ${a.firstName ?? ""}`.trim().localeCompare(`${b.lastName ?? ""} ${b.firstName ?? ""}`.trim())
    )
}

export async function upsertMember(orgId: string, input: UpsertMemberInput): Promise<void> {
  if (!db) return
  const role = input.role
  const userId = input.userId
  const storeIds = input.storeIds
  if (role === "Owner") {
    const memberSnap = await getDocs(collection(db, "organizations", orgId, "members"))
    const existingOtherOwner = memberSnap.docs.find((entry) => {
      if (entry.id === userId) return false
      const data = entry.data() as Record<string, unknown>
      return normalizeMemberRole(data.role) === "Owner"
    })
    if (existingOtherOwner) {
      throw new Error("Only one Owner is allowed per organization.")
    }
    await setDoc(
      doc(db, "organizations", orgId),
      {
        ownerUserIds: [userId],
        ownerUid: userId,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    )
  }
  await setDoc(
    doc(db, "organizations", orgId, "members", userId),
    {
      organizationId: orgId,
      userId,
      role,
      storeIds,
      departmentIds: input.departmentIds ?? [],
      locationIds: input.locationIds ?? [],
      email: input.email ?? null,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      employeeId: input.employeeId ?? null,
      jobTitle: input.jobTitle ?? null,
      assignmentType: input.assignmentType ?? "store",
      permissionFlags: input.permissionFlags ?? permissionDefaultsForRole(role),
      profileImageUrl: input.profileImageUrl ?? null,
      canManageStoreUsersOnly: Boolean(input.canManageStoreUsersOnly),
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  )
}

export async function createPendingUser(orgId: string, input: Omit<PendingUserRecord, "id" | "status" | "createdAt">) {
  if (!db) return null
  if (input.role === "Owner") {
    const memberSnap = await getDocs(collection(db, "organizations", orgId, "members"))
    const existingOtherOwner = memberSnap.docs.find((entry) => {
      const data = entry.data() as Record<string, unknown>
      return normalizeMemberRole(data.role) === "Owner"
    })
    if (existingOtherOwner) {
      throw new Error("Only one Owner is allowed per organization.")
    }
  }
  const ref = doc(collection(db, "organizations", orgId, "pendingUsers"))
  await setDoc(ref, {
    organizationId: orgId,
    ...input,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return ref.id
}

function storeCollectionPath(orgId: string, store: StoreWithPath, leaf: string) {
  return collection(
    db!,
    "organizations",
    orgId,
    "regions",
    store.regionId,
    "districts",
    store.districtId,
    "stores",
    store.id,
    leaf
  )
}

async function fetchStoreInventoryBatchDocs(
  orgId: string,
  storeId: string,
  options?: {
    itemId?: string
    preloadedStore?: StoreWithPath
    preloadedStores?: StoreWithPath[]
  }
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  if (!db || !orgId || !storeId) return []
  const allowLegacyFallback = await canUseLegacyInventoryFallback(orgId)

  const normalizedStoreId = storeId.trim()
  if (!normalizedStoreId) return []
  const rows: Array<{ id: string; data: Record<string, unknown> }> = []
  const seenBatchKeys = new Set<string>()

  const batchKey = (batchId: string, data: Record<string, unknown>) => {
    const itemId = asString(data.itemId)
    const store = asString(data.storeId) || normalizedStoreId
    const backendId = asString(data.backendId)
    if (backendId) {
      return `${store}|${itemId}|${backendId}`
    }
    return `${store}|${itemId}|${batchId}`
  }

  let resolvedStore =
    options?.preloadedStore?.id === normalizedStoreId
      ? options.preloadedStore
      : options?.preloadedStores?.find((entry) => entry.id === normalizedStoreId)

  if (!resolvedStore) {
    const stores = await fetchStores(orgId).catch(() => [] as StoreWithPath[])
    resolvedStore = stores.find((entry) => entry.id === normalizedStoreId)
  }

  if (resolvedStore) {
    const nestedBase = storeCollectionPath(orgId, resolvedStore, "inventoryBatches")
    const nestedQuery = options?.itemId
      ? query(nestedBase, where("itemId", "==", options.itemId), limit(2500))
      : query(nestedBase, limit(2500))
    const nestedSnap = await getDocs(nestedQuery).catch(() => null)
    for (const docSnap of nestedSnap?.docs ?? []) {
      const data = docSnap.data() as Record<string, unknown>
      const key = batchKey(docSnap.id, data)
      if (seenBatchKeys.has(key)) continue
      seenBatchKeys.add(key)
      rows.push({ id: docSnap.id, data })
    }
  }

  if (rows.length > 0 || !allowLegacyFallback) {
    return rows
  }

  const legacyByStoreBase = collection(db, "organizations", orgId, "stores", storeId, "inventoryBatches")
  const legacyByStoreQuery = options?.itemId
    ? query(legacyByStoreBase, where("itemId", "==", options.itemId), limit(2500))
    : query(legacyByStoreBase, limit(2500))
  const legacyByStore = await getDocs(legacyByStoreQuery).catch(() => null)
  for (const docSnap of legacyByStore?.docs ?? []) {
    const data = docSnap.data() as Record<string, unknown>
    const key = batchKey(docSnap.id, data)
    if (seenBatchKeys.has(key)) continue
    seenBatchKeys.add(key)
    rows.push({ id: docSnap.id, data })
  }

  const legacyOrgBase = collection(db, "organizations", orgId, "inventoryBatches")
  const legacyOrgQuery = options?.itemId
    ? query(
        legacyOrgBase,
        where("storeId", "==", storeId),
        where("itemId", "==", options.itemId),
        limit(2500)
      )
    : query(legacyOrgBase, where("storeId", "==", storeId), limit(2500))
  const legacyOrg = await getDocs(legacyOrgQuery).catch(() => null)
  for (const docSnap of legacyOrg?.docs ?? []) {
    const data = docSnap.data() as Record<string, unknown>
    const key = batchKey(docSnap.id, data)
    if (seenBatchKeys.has(key)) continue
    seenBatchKeys.add(key)
    rows.push({ id: docSnap.id, data })
  }

  if (rows.length > 0) {
    return rows
  }

  // One-release compatibility path for pre-migration data outside canonical store hierarchy.
  const legacyCollectionGroupQuery = options?.itemId
    ? query(
        collectionGroup(db, "inventoryBatches"),
        where("organizationId", "==", orgId),
        where("storeId", "==", normalizedStoreId),
        where("itemId", "==", options.itemId),
        limit(2500)
      )
    : query(
        collectionGroup(db, "inventoryBatches"),
        where("organizationId", "==", orgId),
        where("storeId", "==", normalizedStoreId),
        limit(2500)
      )
  const legacyCollectionGroupSnap = await getDocs(legacyCollectionGroupQuery).catch(() => null)
  for (const docSnap of legacyCollectionGroupSnap?.docs ?? []) {
    const data = docSnap.data() as Record<string, unknown>
    const key = batchKey(docSnap.id, data)
    if (seenBatchKeys.has(key)) continue
    seenBatchKeys.add(key)
    rows.push({ id: docSnap.id, data })
  }

  return rows
}

export async function fetchStoreBatches(orgId: string, store: StoreWithPath): Promise<InventoryBatchRecord[]> {
  if (!db || !orgId) return []
  const docs = await fetchStoreInventoryBatchDocs(orgId, store.id, { preloadedStore: store }).catch(() => [])
  return docs.map((batch) => ({
    id: batch.id,
    organizationId: String(batch.data.organizationId ?? orgId),
    storeId: String(batch.data.storeId ?? store.id),
    itemId: String(batch.data.itemId ?? ""),
    quantity: asNumber(batch.data.quantity, 0),
    unit: batch.data.unit === "lbs" ? "lbs" : "each",
    expiresAt: batch.data.expiresAt ?? batch.data.expirationDate ?? null,
    lot: asString(batch.data.lot),
    source:
      batch.data.source === "received" || batch.data.source === "spotcheck" || batch.data.source === "manual"
        ? batch.data.source
        : "manual"
  }))
}

export async function fetchStoreWaste(orgId: string, store: StoreWithPath): Promise<AnyDocRecord[]> {
  if (!db || !orgId) return []
  const allowLegacyFallback = await canUseLegacyInventoryFallback(orgId)
  const nestedSnap = await getDocs(
    query(storeCollectionPath(orgId, store, "wasteRecords"), orderBy("createdAt", "desc"), limit(500))
  )
  const nested: AnyDocRecord[] = nestedSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Record<string, unknown>)
  }) as AnyDocRecord)
  if (!allowLegacyFallback) {
    return nested
  }
  const legacySnap = await getDocs(
    query(collection(db, "organizations", orgId, "waste"), orderBy("date", "desc"), limit(1000))
  )
  const legacy: AnyDocRecord[] = legacySnap.docs
    .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Record<string, unknown>) }) as AnyDocRecord)
    .filter((entry) => asString(entry.storeId) === store.id)
  return [...nested, ...legacy]
}

export async function fetchStoreOrders(orgId: string, store: StoreWithPath): Promise<AnyDocRecord[]> {
  if (!db || !orgId) return []
  const allowLegacyFallback = await canUseLegacyInventoryFallback(orgId)
  const nestedSnap = await getDocs(
    query(storeCollectionPath(orgId, store, "orders"), orderBy("createdAt", "desc"), limit(500))
  )
  const nested: AnyDocRecord[] = nestedSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Record<string, unknown>)
  }) as AnyDocRecord)
  if (!allowLegacyFallback) {
    return nested
  }
  const legacySnap = await getDocs(
    query(collection(db, "organizations", orgId, "orders"), orderBy("orderDate", "desc"), limit(2000))
  )
  const legacy: AnyDocRecord[] = legacySnap.docs
    .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Record<string, unknown>) }) as AnyDocRecord)
    .filter((entry) => asString(entry.storeId) === store.id)
  return [...nested, ...legacy]
}

export async function fetchStoreTodo(orgId: string, store: StoreWithPath): Promise<AnyDocRecord[]> {
  if (!db || !orgId) return []
  const allowLegacyFallback = await canUseLegacyInventoryFallback(orgId)
  const nestedSnap = await getDocs(
    query(storeCollectionPath(orgId, store, "toDo"), orderBy("dueAt", "asc"), limit(500))
  )
  const nested: AnyDocRecord[] = nestedSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Record<string, unknown>)
  }) as AnyDocRecord)
  if (!allowLegacyFallback) {
    return nested
  }
  const legacyOrgTodoSnap = await getDocs(
    query(collection(db, "organizations", orgId, "toDo"), orderBy("dueAt", "asc"), limit(1000))
  )
  const legacy: AnyDocRecord[] = legacyOrgTodoSnap.docs
    .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Record<string, unknown>) }) as AnyDocRecord)
    .filter((entry) => asString(entry.storeId) === store.id)
  return [...nested, ...legacy]
}

export async function fetchVendors(orgId: string): Promise<VendorRecord[]> {
  if (!db || !orgId) return []
  const snap = await getDocs(query(collection(db, "organizations", orgId, "vendors"), orderBy("name"), limit(1000)))
  return snap.docs.map((entry) => {
    const data = entry.data() as Record<string, unknown>
    return {
      id: entry.id,
      organizationId: orgId,
      name: String(data.name ?? "Vendor"),
      orderingDays: Array.isArray(data.orderingDays)
        ? (data.orderingDays as number[]).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        : [],
      cutoffTimeLocal: asString(data.cutoffTimeLocal),
      leadDays: Math.max(0, asNumber(data.leadDays ?? data.daysFromOrderToDelivery, 0)),
      truckDays: Array.isArray(data.truckDays) ? (data.truckDays as number[]) : undefined,
      orderDays: Array.isArray(data.orderDays) ? (data.orderDays as number[]) : undefined,
      daysFromOrderToDelivery: Number.isFinite(asNumber(data.daysFromOrderToDelivery, Number.NaN))
        ? asNumber(data.daysFromOrderToDelivery, 0)
        : undefined,
      orderWindowStart: data.orderWindowStart,
      orderWindowEnd: data.orderWindowEnd,
      notes: asString(data.notes),
      isActive: typeof data.isActive === "boolean" ? data.isActive : true,
      updatedAt: data.updatedAt
    }
  })
}

export async function upsertVendor(
  orgId: string,
  vendor: Partial<VendorRecord> & { id?: string; name: string }
): Promise<string> {
  if (!db || !orgId || !vendor.name.trim()) return ""
  const ref = vendor.id
    ? doc(db, "organizations", orgId, "vendors", vendor.id)
    : doc(collection(db, "organizations", orgId, "vendors"))
  await setDoc(
    ref,
    {
      organizationId: orgId,
      name: vendor.name.trim(),
      orderingDays: vendor.orderingDays ?? vendor.orderDays ?? [],
      cutoffTimeLocal: vendor.cutoffTimeLocal ?? null,
      leadDays: Math.max(0, asNumber(vendor.leadDays ?? vendor.daysFromOrderToDelivery, 0)),
      truckDays: vendor.truckDays ?? [],
      orderDays: vendor.orderDays ?? vendor.orderingDays ?? [],
      daysFromOrderToDelivery: Math.max(0, asNumber(vendor.daysFromOrderToDelivery ?? vendor.leadDays, 0)),
      orderWindowStart: vendor.orderWindowStart ?? null,
      orderWindowEnd: vendor.orderWindowEnd ?? null,
      notes: vendor.notes ?? null,
      isActive: vendor.isActive ?? true,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  )
  return ref.id
}

export async function removeVendor(orgId: string, vendorId: string): Promise<void> {
  if (!db || !orgId || !vendorId) return
  await deleteDoc(doc(db, "organizations", orgId, "vendors", vendorId))
}

export async function fetchOrgWasteRecords(orgId: string, storeId?: string): Promise<AnyDocRecord[]> {
  if (!db || !orgId) return []
  const allowLegacyFallback = await canUseLegacyInventoryFallback(orgId)
  const rows = new Map<string, AnyDocRecord>()
  const stores = await fetchStores(orgId).catch(() => [] as StoreWithPath[])
  const scopedStores = storeId ? stores.filter((store) => store.id === storeId) : stores
  await Promise.all(
    scopedStores.map(async (store) => {
      const nestedSnap = await getDocs(
        query(storeCollectionPath(orgId, store, "wasteRecords"), orderBy("createdAt", "desc"), limit(1000))
      ).catch(() => null)
      for (const docSnap of nestedSnap?.docs ?? []) {
        const key = `${store.id}_${docSnap.id}`
        rows.set(key, {
          id: key,
          storeId: store.id,
          ...(docSnap.data() as Record<string, unknown>)
        })
      }
    })
  )

  if (allowLegacyFallback) {
    const legacySnap = await getDocs(collection(db, "organizations", orgId, "waste")).catch(() => null)
    for (const docSnap of legacySnap?.docs ?? []) {
      const data = docSnap.data() as Record<string, unknown>
      const linkedStore = asString(data.storeId)
      if (storeId && linkedStore !== storeId) continue
      if (!storeId && linkedStore && !scopedStores.some((store) => store.id === linkedStore)) continue
      rows.set(`legacy_${docSnap.id}`, { id: `legacy_${docSnap.id}`, ...data })
    }
  }

  return Array.from(rows.values())
    .filter((entry) => {
      if (!storeId) return true
      const linkedStore = asString(entry.storeId)
      return linkedStore === storeId
    })
    .sort((a, b) => {
      const left = asTimestampDate(a.date ?? a.createdAt)?.getTime() ?? 0
      const right = asTimestampDate(b.date ?? b.createdAt)?.getTime() ?? 0
      return right - left
    })
}

export async function fetchOrgOrders(orgId: string, storeId?: string): Promise<OrgOrderRecord[]> {
  if (!db || !orgId) return []
  const allowLegacyFallback = await canUseLegacyInventoryFallback(orgId)
  const rows = new Map<string, OrgOrderRecord>()

  const stores = await fetchStores(orgId).catch(() => [] as StoreWithPath[])
  const scopedStores = storeId ? stores.filter((store) => store.id === storeId) : stores
  await Promise.all(
    scopedStores.map(async (store) => {
      const nestedSnap = await getDocs(
        query(storeCollectionPath(orgId, store, "orders"), orderBy("createdAt", "desc"), limit(1000))
      ).catch(() => null)
      for (const docSnap of nestedSnap?.docs ?? []) {
        const data = docSnap.data() as Record<string, unknown>
        const key = `${store.id}_${docSnap.id}`
        rows.set(key, {
          id: key,
          organizationId: orgId,
          storeId: store.id,
          itemId: asString(data.itemId),
          itemName: asString(data.itemName),
          itemUnit: data.itemUnit === "lbs" ? "lbs" : "each",
          itemQuantityPerBox: asNumber(data.itemQuantityPerBox, 1),
          vendorId: asString(data.vendorId),
          vendorName: asString(data.vendorName),
          recommendedQuantity: Number.isFinite(asNumber(data.recommendedQuantity, Number.NaN))
            ? asNumber(data.recommendedQuantity, 0)
            : undefined,
          orderedQuantity: Number.isFinite(asNumber(data.orderedQuantity, Number.NaN))
            ? asNumber(data.orderedQuantity, 0)
            : undefined,
          isChecked: typeof data.isChecked === "boolean" ? data.isChecked : undefined,
          wasReceived: typeof data.wasReceived === "boolean" ? data.wasReceived : undefined,
          orderDate: data.orderDate ?? data.createdAt,
          expectedDeliveryDate: data.expectedDeliveryDate,
          receivedDate: data.receivedDate,
          status: asString(data.status),
          createdAt: data.createdAt
        })
      }
    })
  )

  if (allowLegacyFallback) {
    const legacySnap = await getDocs(collection(db, "organizations", orgId, "orders")).catch(() => null)
    for (const docSnap of legacySnap?.docs ?? []) {
      const data = docSnap.data() as Record<string, unknown>
      const linkedStore = asString(data.storeId)
      if (storeId && linkedStore !== storeId) continue
      if (!storeId && linkedStore && !scopedStores.some((store) => store.id === linkedStore)) continue
      rows.set(`legacy_${docSnap.id}`, {
        id: `legacy_${docSnap.id}`,
        organizationId: orgId,
        storeId: linkedStore,
        itemId: asString(data.itemId),
        itemName: asString(data.itemName),
        itemUnit: data.itemUnit === "lbs" ? "lbs" : "each",
        itemQuantityPerBox: asNumber(data.itemQuantityPerBox, 1),
        vendorId: asString(data.vendorId),
        vendorName: asString(data.vendorName),
        recommendedQuantity: Number.isFinite(asNumber(data.recommendedQuantity, Number.NaN))
          ? asNumber(data.recommendedQuantity, 0)
          : undefined,
        orderedQuantity: Number.isFinite(asNumber(data.orderedQuantity, Number.NaN))
          ? asNumber(data.orderedQuantity, 0)
          : undefined,
        isChecked: typeof data.isChecked === "boolean" ? data.isChecked : undefined,
        wasReceived: typeof data.wasReceived === "boolean" ? data.wasReceived : undefined,
        orderDate: data.orderDate,
        expectedDeliveryDate: data.expectedDeliveryDate,
        receivedDate: data.receivedDate,
        status: asString(data.status),
        createdAt: data.createdAt
      })
    }
  }

  return Array.from(rows.values())
    .filter((entry) => !storeId || entry.storeId === storeId)
    .sort((a, b) => {
      const left = asTimestampDate(a.orderDate)?.getTime() ?? 0
      const right = asTimestampDate(b.orderDate)?.getTime() ?? 0
      return right - left
    })
}

export async function fetchOrgTodo(orgId: string, storeId?: string): Promise<TodoRecord[]> {
  if (!db || !orgId) return []
  const allowLegacyFallback = await canUseLegacyInventoryFallback(orgId)
  const rows = new Map<string, TodoRecord>()

  const stores = await fetchStores(orgId).catch(() => [] as StoreWithPath[])
  const scopedStores = storeId ? stores.filter((store) => store.id === storeId) : stores
  await Promise.all(
    scopedStores.map(async (store) => {
      const nestedSnap = await getDocs(
        query(storeCollectionPath(orgId, store, "toDo"), orderBy("dueAt", "asc"), limit(1000))
      ).catch(() => null)
      for (const docSnap of nestedSnap?.docs ?? []) {
        const data = docSnap.data() as Record<string, unknown>
        const key = `${store.id}_${docSnap.id}`
        rows.set(key, {
          id: key,
          organizationId: orgId,
          storeId: store.id,
          type: data.type === "manual" ? "manual" : "auto",
          title: String(data.title ?? "Task"),
          dueAt: data.dueAt,
          status: asString(data.status) ?? "open",
          createdAt: data.createdAt,
          createdBy: asString(data.createdBy),
          createdByName: asString(data.createdByName),
          taskType: asString(data.taskType),
          relatedItemId: asString(data.relatedItemId),
          relatedVendorId: asString(data.relatedVendorId),
          assigneeUserIds: asStringArray(data.assigneeUserIds),
          assigneeRoleTitles: asStringArray(data.assigneeRoleTitles),
          assigneeDepartmentIds: asStringArray(data.assigneeDepartmentIds),
          assigneeDepartmentNames: asStringArray(data.assigneeDepartmentNames)
        })
      }
    })
  )

  if (allowLegacyFallback) {
    const legacySnap = await getDocs(collection(db, "organizations", orgId, "toDo")).catch(() => null)
    for (const docSnap of legacySnap?.docs ?? []) {
      const data = docSnap.data() as Record<string, unknown>
      const linkedStore = asString(data.storeId)
      if (storeId && linkedStore !== storeId) continue
      if (!storeId && linkedStore && !scopedStores.some((store) => store.id === linkedStore)) continue
      rows.set(`legacy_${docSnap.id}`, {
        id: `legacy_${docSnap.id}`,
        organizationId: orgId,
        storeId: linkedStore,
        type: data.type === "manual" ? "manual" : "auto",
        title: String(data.title ?? "Task"),
        dueAt: data.dueAt,
        status: asString(data.status) ?? "open",
        createdAt: data.createdAt,
        createdBy: asString(data.createdBy),
        createdByName: asString(data.createdByName),
        taskType: asString(data.taskType),
        relatedItemId: asString(data.relatedItemId),
        relatedVendorId: asString(data.relatedVendorId),
        assigneeUserIds: asStringArray(data.assigneeUserIds),
        assigneeRoleTitles: asStringArray(data.assigneeRoleTitles),
        assigneeDepartmentIds: asStringArray(data.assigneeDepartmentIds),
        assigneeDepartmentNames: asStringArray(data.assigneeDepartmentNames)
      })
    }
  }

  return Array.from(rows.values())
    .filter((entry) => !storeId || entry.storeId === storeId)
    .sort((a, b) => {
      const left = asTimestampDate(a.dueAt)?.getTime() ?? 0
      const right = asTimestampDate(b.dueAt)?.getTime() ?? 0
      return left - right
    })
}

export async function createOrgTodo(
  orgId: string,
  input: {
    title: string
    dueAt?: Date
    type?: "manual" | "auto"
    storeId?: string
    createdBy?: string
    createdByName?: string
    assigneeUserIds?: string[]
    assigneeRoleTitles?: string[]
    assigneeDepartmentIds?: string[]
    assigneeDepartmentNames?: string[]
  }
): Promise<string> {
  if (!db || !orgId || !input.title.trim()) return ""
  const ref = doc(collection(db, "organizations", orgId, "toDo"))
  await setDoc(ref, {
    organizationId: orgId,
    storeId: input.storeId?.trim() || null,
    type: input.type ?? "manual",
    title: input.title.trim(),
    dueAt: input.dueAt ?? null,
    status: "open",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: input.createdBy?.trim() || null,
    createdByName: input.createdByName?.trim() || null,
    assigneeUserIds: asStringArray(input.assigneeUserIds),
    assigneeRoleTitles: asStringArray(input.assigneeRoleTitles),
    assigneeDepartmentIds: asStringArray(input.assigneeDepartmentIds),
    assigneeDepartmentNames: asStringArray(input.assigneeDepartmentNames)
  })
  return ref.id
}

export async function fetchOrgNotifications(orgId: string, storeId?: string): Promise<NotificationRecord[]> {
  if (!db || !orgId) return []
  const rows = new Map<string, NotificationRecord>()

  const snap = await getDocs(
    query(collection(db, "organizations", orgId, "notifications"), orderBy("createdAt", "desc"), limit(1000))
  ).catch(() => null)

  for (const docSnap of snap?.docs ?? []) {
    const data = docSnap.data() as Record<string, unknown>
    const rowStoreId = asString(data.storeId)
    if (storeId && rowStoreId && rowStoreId !== storeId) continue
    rows.set(docSnap.id, {
      id: docSnap.id,
      organizationId: orgId,
      storeId: rowStoreId,
      name: asString(data.name) ?? "Notification",
      content: asString(data.content) ?? "",
      attachmentAssetId: asString(data.attachmentAssetId),
      attachmentName: asString(data.attachmentName),
      attachmentUrl: asString(data.attachmentUrl),
      attachmentContentType: asString(data.attachmentContentType),
      attachmentSizeBytes: Number.isFinite(Number(data.attachmentSizeBytes)) ? Number(data.attachmentSizeBytes) : undefined,
      roleTargets: asStringArray(data.roleTargets),
      dispatchMode: data.dispatchMode === "scheduled" ? "scheduled" : "immediate",
      status: data.status === "queued" ? "queued" : "sent",
      scheduledFor: asTimestampDate(data.scheduledFor) ?? undefined,
      createdAt: data.createdAt,
      createdBy: asString(data.createdBy)
    })
  }

  return Array.from(rows.values()).sort((a, b) => {
    const left = asTimestampDate(a.createdAt)?.getTime() ?? 0
    const right = asTimestampDate(b.createdAt)?.getTime() ?? 0
    return right - left
  })
}

export async function createOrgNotification(
  orgId: string,
  actorUserId: string,
  input: CreateNotificationInput
): Promise<string> {
  if (!db || !orgId || !actorUserId) return ""
  const ref = doc(collection(db, "organizations", orgId, "notifications"))
  await setDoc(ref, {
    organizationId: orgId,
    storeId: input.storeId ?? null,
    name: input.name.trim(),
    content: input.content.trim(),
    attachmentAssetId: input.attachmentAssetId ?? null,
    attachmentName: input.attachmentName ?? null,
    attachmentUrl: input.attachmentUrl ?? null,
    attachmentContentType: input.attachmentContentType ?? null,
    attachmentSizeBytes: input.attachmentSizeBytes ?? null,
    roleTargets: Array.from(new Set(input.roleTargets.map((entry) => entry.trim()).filter(Boolean))),
    dispatchMode: input.dispatchMode,
    status: input.dispatchMode === "scheduled" ? "queued" : "sent",
    scheduledFor: input.dispatchMode === "scheduled" && input.scheduledFor ? input.scheduledFor : null,
    senderName: input.senderName ?? null,
    senderEmployeeId: input.senderEmployeeId ?? null,
    createdBy: actorUserId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return ref.id
}

export async function removeOrgNotification(orgId: string, notificationId: string): Promise<void> {
  if (!db || !orgId || !notificationId) return
  await deleteDoc(doc(db, "organizations", orgId, "notifications", notificationId))
}

export async function fetchStoreAccessRequests(orgId: string): Promise<StoreAccessRequestRecord[]> {
  if (!db || !orgId) return []
  const [requestsSnap, members, stores] = await Promise.all([
    getDocs(
      query(
        collection(db, "organizations", orgId, "storeAccessRequests"),
        orderBy("createdAt", "desc"),
        limit(1000)
      )
    ).catch(() => null),
    fetchMembers(orgId).catch(() => [] as MemberRecord[]),
    fetchStores(orgId).catch(() => [] as StoreWithPath[])
  ])
  const memberByUid = new Map(members.map((member) => [member.id, member]))
  const storeById = new Map(stores.map((store) => [store.id, formatStoreLabel(store)]))

  return (requestsSnap?.docs ?? []).map((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>
    const requesterUid = asString(data.requesterUid) ?? ""
    const reviewerUid = asString(data.reviewedByUid)
    const requester = requesterUid ? memberByUid.get(requesterUid) : undefined
    const reviewer = reviewerUid ? memberByUid.get(reviewerUid) : undefined
    const targetStoreId = asString(data.targetStoreId) ?? ""
    return {
      id: docSnap.id,
      organizationId: orgId,
      requesterUid,
      requesterName:
        [requester?.firstName, requester?.lastName].filter(Boolean).join(" ").trim() || requester?.email || undefined,
      requesterEmployeeId: requester?.employeeId,
      targetStoreId,
      targetStoreLabel: storeById.get(targetStoreId),
      reason: asString(data.reason),
      status:
        data.status === "approved" || data.status === "denied" || data.status === "pending"
          ? data.status
          : "pending",
      reviewedByUid: reviewerUid,
      reviewedByName:
        reviewer ? [reviewer.firstName, reviewer.lastName].filter(Boolean).join(" ").trim() || reviewer.email : undefined,
      reviewedAt: data.reviewedAt,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    } satisfies StoreAccessRequestRecord
  })
}

function normalizeItemSubmissionDraft(raw: unknown): ItemSubmissionDraftRecord {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const rawExpirationValue = data.defaultExpirationDays
  const hasExpiration = data.hasExpiration === undefined ? asNumber(rawExpirationValue, 7) > 0 : Boolean(data.hasExpiration)
  return {
    backendItemId: asString(data.backendItemId),
    name: asString(data.name) ?? "Untitled Item",
    upc: asString(data.upc),
    unit: data.unit === "lbs" ? "lbs" : "each",
    price: Math.max(0, asNumber(data.price, 0)),
    hasExpiration,
    defaultExpirationDays: Math.max(0, asNumber(data.defaultExpirationDays, hasExpiration ? 7 : 0)),
    defaultPackedExpiration: Math.max(0, asNumber(data.defaultPackedExpiration, asNumber(data.defaultExpirationDays, hasExpiration ? 7 : 0))),
    minQuantity: Math.max(0, asNumber(data.minQuantity, 0)),
    qtyPerCase: Math.max(1, asNumber(data.qtyPerCase, 1)),
    caseSize: Math.max(1, asNumber(data.caseSize, asNumber(data.qtyPerCase, 1))),
    vendorId: asString(data.vendorId),
    vendorName: asString(data.vendorName),
    departmentId: asString(data.departmentId),
    department: asString(data.department),
    locationId: asString(data.locationId),
    departmentLocation: asString(data.departmentLocation),
    tags: asStringArray(data.tags),
    photoUrl: asString(data.photoUrl),
    photoAssetId: asString(data.photoAssetId),
    reworkItemCode: asString(data.reworkItemCode),
    canBeReworked: data.canBeReworked === true,
    reworkShelfLifeDays: Math.max(1, asNumber(data.reworkShelfLifeDays, 1)),
    maxReworkCount: Math.max(1, asNumber(data.maxReworkCount, 1))
  }
}

export async function fetchItemSubmissions(
  orgId: string,
  options?: { status?: ItemSubmissionRecord["status"] | "all"; storeId?: string }
): Promise<ItemSubmissionRecord[]> {
  if (!db || !orgId) return []

  const membersPromise = fetchMembers(orgId).catch(() => [] as MemberRecord[])

  let base = query(collection(db, "organizations", orgId, "itemSubmissions"), orderBy("createdAt", "desc"), limit(1000))
  if (options?.status && options.status !== "all") {
    base = query(
      collection(db, "organizations", orgId, "itemSubmissions"),
      where("status", "==", options.status),
      orderBy("createdAt", "desc"),
      limit(1000)
    )
  }
  const submissionsSnap = await getDocs(base).catch(() => null)
  const members = await membersPromise
  const memberByUid = new Map(members.map((member) => [member.id, member]))

  const rows: ItemSubmissionRecord[] = []
  for (const docSnap of submissionsSnap?.docs ?? []) {
    const data = docSnap.data() as Record<string, unknown>
    const storeId = asString(data.storeId) ?? ""
    if (options?.storeId && options.storeId.trim() && storeId !== options.storeId.trim()) continue

    const submittedByUid = asString(data.submittedByUid) ?? ""
    const reviewedByUid = asString(data.reviewedByUid)
    const submittedBy = submittedByUid ? memberByUid.get(submittedByUid) : undefined
    const reviewedBy = reviewedByUid ? memberByUid.get(reviewedByUid) : undefined
    const submissionStatusRaw = asString(data.status)?.toLowerCase()
    const status: ItemSubmissionRecord["status"] =
      submissionStatusRaw === "approved" ||
      submissionStatusRaw === "rejected" ||
      submissionStatusRaw === "promoted" ||
      submissionStatusRaw === "pending"
        ? (submissionStatusRaw as ItemSubmissionRecord["status"])
        : "pending"
    rows.push({
      id: docSnap.id,
      organizationId: orgId,
      storeId,
      submittedByUid,
      submittedByName:
        [submittedBy?.firstName, submittedBy?.lastName].filter(Boolean).join(" ").trim() || submittedBy?.email || undefined,
      submittedByEmployeeId: submittedBy?.employeeId,
      scannedUpc: asString(data.scannedUpc),
      note: asString(data.note),
      status,
      reviewNote: asString(data.reviewNote),
      reviewedByUid,
      reviewedByName:
        reviewedBy ? [reviewedBy.firstName, reviewedBy.lastName].filter(Boolean).join(" ").trim() || reviewedBy.email : undefined,
      reviewedAt: data.reviewedAt,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      itemDraft: normalizeItemSubmissionDraft(data.itemDraft)
    })
  }

  return rows.sort((lhs, rhs) => {
    const left = asTimestampDate(lhs.createdAt)?.getTime() ?? 0
    const right = asTimestampDate(rhs.createdAt)?.getTime() ?? 0
    return right - left
  })
}

function normalizeSubscriptionStatus(raw: unknown): string {
  if (typeof raw !== "string") return "inactive"
  const normalized = raw.trim().toLowerCase()
  return normalized || "inactive"
}

function toDateOrNull(value: unknown): Date | null {
  const parsed = asTimestampDate(value)
  return parsed ?? null
}

export async function fetchOrganizationBillingStatus(orgId: string): Promise<OrganizationBillingStatusRecord | null> {
  if (!db || !orgId) return null

  const [billingSnap, orgSnap] = await Promise.all([
    getDoc(doc(db, "organizations", orgId, "billing", "default")).catch(() => null),
    getDoc(doc(db, "organizations", orgId)).catch(() => null)
  ])

  const billingData = (billingSnap?.data() as Record<string, unknown> | undefined) ?? {}
  const orgData = (orgSnap?.data() as Record<string, unknown> | undefined) ?? {}
  const orgSubscription = (orgData.subscription as Record<string, unknown> | undefined) ?? {}

  const subscriptionStatus = normalizeSubscriptionStatus(
    billingData.subscriptionStatus ?? orgSubscription.status
  )
  const planName = asString(billingData.planName) ?? asString(orgData.planName)
  const planTierRaw = asString(billingData.planTier) ?? asString(orgData.planTier)
  const planTier =
    planTierRaw === "starter" || planTierRaw === "growth" || planTierRaw === "pro" || planTierRaw === "custom"
      ? planTierRaw
      : undefined
  const priceId = asString(billingData.priceId) ?? asString(orgData.planId)
  const currentPeriodEnd = toDateOrNull(
    billingData.currentPeriodEnd ?? orgSubscription.renewsAt
  )
  const billingIsActiveRaw = billingData.isActive
  const billingIsActive =
    typeof billingIsActiveRaw === "boolean"
      ? billingIsActiveRaw
      : subscriptionStatus === "active" || subscriptionStatus === "trialing"

  const entitlementsRaw = billingData.entitlements
  const entitlements =
    entitlementsRaw && typeof entitlementsRaw === "object"
      ? Object.fromEntries(
          Object.entries(entitlementsRaw as Record<string, unknown>).map(([key, value]) => [key, value === true])
        )
      : undefined

  const paymentVerificationRaw = billingData.paymentVerification as Record<string, unknown> | undefined
  const paymentVerification = paymentVerificationRaw
    ? {
        provider: asString(paymentVerificationRaw.provider) ?? undefined,
        verified: paymentVerificationRaw.verified === true,
        verifiedAt: toDateOrNull(paymentVerificationRaw.verifiedAt),
        sourceSubscriptionId: asString(paymentVerificationRaw.sourceSubscriptionId) ?? undefined,
        sourceCustomerUid: asString(paymentVerificationRaw.sourceCustomerUid) ?? undefined
      }
    : undefined

  return {
    organizationId: orgId,
    subscriptionStatus,
    planName: planName ?? undefined,
    planTier,
    priceId: priceId ?? undefined,
    currentPeriodEnd,
    isActive: billingIsActive,
    entitlements,
    paymentVerification
  }
}

export async function submitStoreAccessRequest(input: {
  orgId: string
  storeId: string
  reason?: string
}): Promise<{ ok: boolean; requestId: string; status: "pending" } | null> {
  return requestStoreAccessCallable(input)
}

export async function reviewStoreAccessRequest(input: {
  orgId: string
  requestId: string
  decision: "approved" | "denied"
  note?: string
}): Promise<{ ok: boolean; status: "approved" | "denied" } | null> {
  return reviewStoreAccessCallable(input)
}

export async function reviewItemSubmission(input: {
  orgId: string
  submissionId: string
  decision: "approved" | "rejected" | "promoted"
  reviewNote?: string
  centralOverride?: {
    name?: string
    upc?: string
    defaultExpirationDays?: number
    photoUrl?: string
    photoAssetId?: string
  }
}): Promise<{ ok: boolean; submissionId: string; status: "approved" | "rejected" | "promoted" } | null> {
  return reviewItemSubmissionCallable(input)
}

export async function fetchExpirationEntries(
  orgId: string,
  storeId?: string,
  maxDays = 7
): Promise<ExpirationEntryRecord[]> {
  if (!db || !orgId) return []
  const stores = await fetchStores(orgId).catch(() => [] as StoreWithPath[])
  const scopedStores = storeId
    ? stores.filter((store) => store.id === storeId)
    : stores
  const storeItemsList: Array<{ storeId: string; items: ItemRecord[] }> = []
  if (scopedStores.length > 0) {
    const loaded = await Promise.all(
      scopedStores.map(async (store) => ({
        storeId: store.id,
        items: await fetchItems(orgId, { storeId: store.id })
      }))
    )
    storeItemsList.push(...loaded)
  } else if (storeId) {
    storeItemsList.push({
      storeId,
      items: await fetchItems(orgId, { storeId })
    })
  } else {
    storeItemsList.push({
      storeId: "",
      items: await fetchItems(orgId)
    })
  }
  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() + maxDays)
  const entries: ExpirationEntryRecord[] = []
  for (const { storeId: resolvedStoreId, items } of storeItemsList) {
    for (const item of items) {
      if (item.hasExpiration === false) continue
      for (const batch of item.batches) {
        const expirationDate = asTimestampDate(batch.expirationDate)
        if (!expirationDate) continue
        if (expirationDate > cutoff) continue
        const batchStoreId = asString(batch.storeId) ?? resolvedStoreId
        if (storeId && batchStoreId && batchStoreId !== storeId) continue
        const daysUntilExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        entries.push({
          itemId: item.id,
          itemName: item.name,
          upc: item.upc,
          quantity: Number(batch.quantity.toFixed(3)),
          unit: item.unit,
          expirationDate,
          daysUntilExpiration,
          isExpired: daysUntilExpiration < 0
        })
      }
    }
  }
  return entries.sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime())
}

export async function fetchSpotCheckRecords(orgId: string, storeId: string): Promise<SpotCheckRecord[]> {
  if (!db || !orgId || !storeId) return []

  const normalizedStoreId = storeId.trim()
  if (!normalizedStoreId) return []

  const [items, batchDocs] = await Promise.all([
    fetchItems(orgId, { storeId: normalizedStoreId }).catch(() => [] as ItemRecord[]),
    fetchStoreInventoryBatchDocs(orgId, normalizedStoreId).catch(() => [] as Array<{ id: string; data: Record<string, unknown> }>)
  ])

  const itemMetaById = new Map(items.map((item) => [item.id, item]))
  const rows: SpotCheckRecord[] = []

  for (const entry of batchDocs) {
    const data = entry.data
    const source = asString(data.source)?.toLowerCase()
    if (source !== "spotcheck") continue

    const itemId = asString(data.itemId) ?? ""
    if (!itemId) continue

    const quantity = Math.max(0, asNumber(data.quantity, 0))
    if (quantity <= 0) continue

    const metadata = itemMetaById.get(itemId)
    const checkedAt =
      asTimestampDate(data.updatedAt ?? data.lastSyncedAt ?? data.createdAt ?? data.receivedDate) ?? new Date(0)

    rows.push({
      id: entry.id,
      organizationId: asString(data.organizationId) ?? orgId,
      storeId: asString(data.storeId) ?? normalizedStoreId,
      itemId,
      itemName: asString(data.itemName) ?? metadata?.name ?? "Inventory Item",
      upc: asString(data.upc) ?? metadata?.upc,
      packageBarcode: asString(data.packageBarcode),
      quantity: Number(quantity.toFixed(3)),
      unit:
        data.unit === "lbs" || metadata?.unit === "lbs"
          ? "lbs"
          : "each",
      expiresAt: asTimestampDate(data.expiresAt ?? data.expirationDate) ?? undefined,
      checkedAt,
      stockAreaRaw: asString(data.stockAreaRaw)
    })
  }

  return rows.sort((left, right) => right.checkedAt.getTime() - left.checkedAt.getTime())
}

export async function computeFinancialHealthFromOrgData(orgId: string, storeId?: string, expiringDays = 7) {
  const [items, wasteRows] = await Promise.all([fetchItems(orgId, { storeId }), fetchOrgWasteRecords(orgId, storeId)])
  const now = new Date()
  const weekAgo = new Date(now)
  weekAgo.setDate(now.getDate() - 7)
  const monthAgo = new Date(now)
  monthAgo.setDate(now.getDate() - 30)
  const expiringCutoff = new Date(now)
  expiringCutoff.setDate(now.getDate() + expiringDays)

  const priceByItemId = new Map(items.map((item) => [item.id, item.price]))

  const inventoryValue = Number(
    items.reduce((sum, item) => sum + item.price * item.totalQuantity, 0).toFixed(2)
  )
  const wasteByWindow = wasteRows.reduce(
    (acc, row) => {
      const itemId = asString(row.itemId) ?? ""
      const quantity = asNumber(row.quantity ?? row.amount, 0)
      const price = asNumber(row.itemPriceSnapshot ?? (itemId ? priceByItemId.get(itemId) : 0), 0)
      const eventAt = asTimestampDate(row.date ?? row.createdAt)
      if (!eventAt) return acc
      const delta = quantity * price
      if (eventAt >= weekAgo) acc.week += delta
      if (eventAt >= monthAgo) acc.month += delta
      return acc
    },
    { week: 0, month: 0 }
  )

  const expiringSoonValue = Number(
    items
      .flatMap((item) =>
        item.batches
          .map((batch) => {
            const expirationDate = asTimestampDate(batch.expirationDate)
            if (!expirationDate || expirationDate > expiringCutoff) return 0
            return item.price * batch.quantity
          })
          .reduce((sum, amount) => sum + amount, 0)
      )
      .reduce((sum, amount) => sum + amount, 0)
      .toFixed(2)
  )

  const overstocked = items
    .filter((item) => item.totalQuantity > item.minimumQuantity * 2)
    .map((item) => ({
      itemId: item.id,
      itemName: item.name,
      onHand: Number(item.totalQuantity.toFixed(3)),
      minQuantity: Number(item.minimumQuantity.toFixed(3))
    }))
    .sort((a, b) => b.onHand - a.onHand)
    .slice(0, 25)

  return {
    inventoryValue,
    wasteCostWeek: Number(wasteByWindow.week.toFixed(2)),
    wasteCostMonth: Number(wasteByWindow.month.toFixed(2)),
    expiringSoonValue,
    overstocked
  }
}

export async function generateOrderSuggestionsFromOrgData(
  orgId: string,
  storeId?: string,
  vendorId?: string,
  actorUid?: string
): Promise<{ lines: OrderSuggestionLine[]; orderIds: string[]; todoId?: string }> {
  // Deprecated compatibility helper retained for old imports.
  // Recommendation math is backend-only: use getStoreRecommendations + commitOrderRecommendations.
  void orgId
  void storeId
  void vendorId
  void actorUid
  return { lines: [], orderIds: [] }
}

export type CreateStoreInput = {
  title: string
  storeNumber?: string
  regionName?: string
  districtName?: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  postalCode: string
  country: string
}

export async function createStore(orgId: string, input: CreateStoreInput): Promise<string> {
  if (!db) return ""
  const cleanedRegionName = input.regionName?.trim() || "General Region"
  const cleanedDistrictName = input.districtName?.trim() || "General District"
  const regionsRef = collection(db, "organizations", orgId, "regions")
  const regionByName = await getDocs(query(regionsRef, where("name", "==", cleanedRegionName), limit(1)))
  const regionId = regionByName.docs[0]?.id ?? doc(regionsRef).id
  if (!regionByName.docs[0]) {
    await setDoc(doc(db, "organizations", orgId, "regions", regionId), {
      organizationId: orgId,
      name: cleanedRegionName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  }

  const districtsRef = collection(db, "organizations", orgId, "regions", regionId, "districts")
  const districtByName = await getDocs(query(districtsRef, where("name", "==", cleanedDistrictName), limit(1)))
  const districtId = districtByName.docs[0]?.id ?? doc(districtsRef).id
  if (!districtByName.docs[0]) {
    await setDoc(doc(db, "organizations", orgId, "regions", regionId, "districts", districtId), {
      organizationId: orgId,
      regionId,
      name: cleanedDistrictName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  }

  const storeRef = doc(
    collection(db, "organizations", orgId, "regions", regionId, "districts", districtId, "stores")
  )
  const title = input.title.trim()
  await setDoc(storeRef, {
    organizationId: orgId,
    regionId,
    districtId,
    name: title || `Store ${input.storeNumber ?? storeRef.id.slice(0, 5)}`,
    title: title || null,
    storeNumber: input.storeNumber?.trim() || null,
    status: "active",
    addressLine1: input.addressLine1.trim(),
    addressLine2: input.addressLine2?.trim() || null,
    city: input.city.trim(),
    state: input.state.trim(),
    postalCode: input.postalCode.trim(),
    country: input.country.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastSyncAt: null
  })
  return storeRef.id
}

export async function syncOrganizationItemsToStoreCatalog(
  orgId: string,
  storeId: string,
  actorUid?: string
): Promise<number> {
  if (!db || !orgId || !storeId.trim()) return 0
  const firestore = db

  const normalizedStoreId = storeId.trim()
  const itemsSnap = await getDocs(query(collection(firestore, "organizations", orgId, "items"), limit(2500)))
  if (itemsSnap.empty) return 0

  let writes = 0
  let pending = 0
  let batch = writeBatch(firestore)

  const flush = async () => {
    if (pending === 0) return
    await batch.commit()
    batch = writeBatch(firestore)
    pending = 0
  }

  for (const item of itemsSnap.docs) {
    const data = item.data() as Record<string, unknown>
    const upc = asString(data.upc) ?? ""
    const catalogDocId = upc.trim() || item.id
    const qtyPerCase = Math.max(1, asNumber(data.qtyPerCase ?? data.quantityPerBox, 1))
    const hasExpiration = data.hasExpiration === undefined ? true : Boolean(data.hasExpiration)
    const defaultExpiration = Math.max(
      0,
      asNumber(data.defaultExpirationDays ?? data.defaultExpiration, hasExpiration ? 7 : 0)
    )
    const defaultPackedExpiration = Math.max(
      0,
      asNumber(data.defaultPackedExpiration ?? data.defaultPackedExpirationDays ?? defaultExpiration, defaultExpiration)
    )

    batch.set(
      doc(firestore, "organizations", orgId, "stores", normalizedStoreId, "catalog", catalogDocId),
      {
        organizationId: orgId,
        storeId: normalizedStoreId,
        itemId: item.id,
        upc: upc.trim() || null,
        name: asString(data.name) ?? "Item",
        unitRaw: (asString(data.unit) ?? "each").toLowerCase() === "lbs" ? "lbs" : "each",
        qtyPerCase,
        caseSize: Math.max(1, asNumber(data.caseSize, qtyPerCase)),
        hasExpiration,
        defaultExpirationDays: defaultExpiration,
        defaultPackedExpiration,
        vendorId: asString(data.vendorId) ?? null,
        vendorName: asString(data.vendorName) ?? null,
        department: asString(data.department) ?? null,
        departmentId: asString(data.departmentId) ?? null,
        tags: asStringArray(data.tags),
        price: Math.max(0, asNumber(data.price, 0)),
        isPrepackaged: Boolean(data.isPrepackaged ?? false),
        rewrapsWithUniqueBarcode: Boolean(data.rewrapsWithUniqueBarcode ?? false),
        canBeReworked: Boolean(data.canBeReworked ?? false),
        reworkItemCode: asString(data.reworkItemCode) ?? null,
        reworkShelfLifeDays: Math.max(1, asNumber(data.reworkShelfLifeDays, 1)),
        maxReworkCount: Math.max(1, asNumber(data.maxReworkCount, 1)),
        syncedFromOrganizationItems: true,
        updatedByUid: actorUid ?? null,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      },
      { merge: true }
    )

    pending += 1
    writes += 1
    if (pending >= 450) {
      await flush()
    }
  }

  await flush()
  return writes
}

export async function updateStore(
  orgId: string,
  store: StoreWithPath,
  patch: Partial<CreateStoreInput> & { status?: string }
): Promise<void> {
  if (!db || !orgId || !store.id) return
  const storeRef = doc(
    db,
    "organizations",
    orgId,
    "regions",
    store.regionId,
    "districts",
    store.districtId,
    "stores",
    store.id
  )
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp()
  }
  if (patch.title !== undefined) {
    const title = patch.title.trim()
    payload.title = title || null
    payload.name = title || store.name
  }
  if (patch.storeNumber !== undefined) payload.storeNumber = patch.storeNumber.trim() || null
  if (patch.addressLine1 !== undefined) payload.addressLine1 = patch.addressLine1.trim()
  if (patch.addressLine2 !== undefined) payload.addressLine2 = patch.addressLine2.trim() || null
  if (patch.city !== undefined) payload.city = patch.city.trim()
  if (patch.state !== undefined) payload.state = patch.state.trim()
  if (patch.postalCode !== undefined) payload.postalCode = patch.postalCode.trim()
  if (patch.country !== undefined) payload.country = patch.country.trim()
  if (patch.status !== undefined) payload.status = patch.status.trim() || "active"
  await setDoc(storeRef, payload, { merge: true })
}

export async function createOrganizationWithInitialStore(
  userId: string,
  input: {
    organizationName: string
    companyCode?: string
    store: CreateStoreInput
  }
): Promise<{ orgId: string; storeId: string }> {
  if (!db || !userId) return { orgId: "", storeId: "" }
  const orgName = input.organizationName.trim()
  if (!orgName) throw new Error("Organization name is required.")

  const orgRef = doc(collection(db, "organizations"))
  const normalizedCompanyCode = input.companyCode?.trim().toUpperCase() || null

  await setDoc(orgRef, {
    name: orgName,
    status: "active",
    ownerUid: userId,
    ownerUserIds: [userId],
    companyCode: normalizedCompanyCode,
    companyCodeUpper: normalizedCompanyCode,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })

  await setDoc(
    doc(db, "organizations", orgRef.id, "members", userId),
    {
      organizationId: orgRef.id,
      userId,
      role: "Owner",
      storeIds: [],
      departmentIds: [],
      locationIds: [],
      status: "active",
      permissionFlags: permissionDefaultsForRole("Owner"),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  )

  await setDoc(
    doc(db, "organizations", orgRef.id, "settings", "default"),
    Object.fromEntries(
      Object.entries({
        ...defaultOrgSettings,
        organizationId: orgRef.id,
        organizationName: orgName,
        companyCode: normalizedCompanyCode,
        updatedBy: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }).filter(([, value]) => value !== undefined)
    ),
    { merge: true }
  )

  const storeId = await createStore(orgRef.id, input.store)

  await setDoc(
    doc(db, "users", userId),
    {
      defaultOrganizationId: orgRef.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  )

  return { orgId: orgRef.id, storeId }
}

export async function fetchProductionProducts(orgId: string, storeId?: string): Promise<ProductionProductRecord[]> {
  if (!db || !orgId) return []
  const snapshot = await getDocs(collection(db, "organizations", orgId, "productionProducts")).catch(() => null)
  if (!snapshot) return []
  const normalizedStore = storeId?.trim()
  return snapshot.docs
    .map((row) => normalizeProductionProduct(row.id, row.data() as Record<string, unknown>))
    .filter((row) => row.organizationId === orgId)
    .filter((row) => {
      if (!normalizedStore) return true
      return row.storeId === normalizedStore
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function fetchProductionIngredients(orgId: string, storeId?: string): Promise<ProductionIngredientRecord[]> {
  if (!db || !orgId) return []
  const snapshot = await getDocs(collection(db, "organizations", orgId, "productionIngredients")).catch(() => null)
  if (!snapshot) return []
  const normalizedStore = storeId?.trim()
  return snapshot.docs
    .map((row) => normalizeProductionIngredient(row.id, row.data() as Record<string, unknown>))
    .filter((row) => row.organizationId === orgId && row.productionProductID)
    .filter((row) => {
      if (!normalizedStore) return true
      return row.storeId === normalizedStore
    })
    .sort((a, b) => a.inventoryItemNameSnapshot.localeCompare(b.inventoryItemNameSnapshot))
}

export async function fetchProductionSpotChecks(orgId: string, storeId?: string): Promise<ProductionSpotCheckRecord[]> {
  if (!db || !orgId) return []
  const snapshot = await getDocs(collection(db, "organizations", orgId, "productionSpotChecks")).catch(() => null)
  if (!snapshot) return []
  const normalizedStore = storeId?.trim()
  return snapshot.docs
    .map((row) => normalizeProductionSpotCheck(row.id, row.data() as Record<string, unknown>))
    .filter((row) => row.organizationId === orgId && row.productionProductID)
    .filter((row) => {
      if (!normalizedStore) return true
      return row.storeId === normalizedStore
    })
    .sort((a, b) => {
      const left = asTimestampDate(a.checkedAt)?.getTime() ?? 0
      const right = asTimestampDate(b.checkedAt)?.getTime() ?? 0
      return right - left
    })
    .slice(0, 500)
}

export async function fetchProductionRuns(orgId: string, storeId?: string): Promise<ProductionRunRecord[]> {
  if (!db || !orgId) return []
  const snapshot = await getDocs(collection(db, "organizations", orgId, "productionRuns")).catch(() => null)
  if (!snapshot) return []
  const normalizedStore = storeId?.trim()
  return snapshot.docs
    .map((row) => normalizeProductionRun(row.id, row.data() as Record<string, unknown>))
    .filter((row) => row.organizationId === orgId && row.productionProductID)
    .filter((row) => {
      if (!normalizedStore) return true
      return row.storeId === normalizedStore
    })
    .sort((a, b) => {
      const left = asTimestampDate(a.madeAt)?.getTime() ?? 0
      const right = asTimestampDate(b.madeAt)?.getTime() ?? 0
      return right - left
    })
    .slice(0, 500)
}

export async function saveProductionProduct(orgId: string, input: SaveProductionProductInput): Promise<string> {
  if (!db || !orgId) return ""
  const incomingProductId = input.id?.trim()
  const productId = isUuidLike(incomingProductId) ? incomingProductId : makeUuid()
  const productRef = doc(db, "organizations", orgId, "productionProducts", productId)
  const existingProduct = await getDoc(productRef).catch(() => null)

  const batch = writeBatch(db)
  batch.set(
    productRef,
    {
      id: productId,
      organizationId: orgId,
      storeId: input.storeId?.trim() || "",
      name: input.name.trim(),
      outputItemID: input.outputItemID?.trim() || null,
      outputItemNameSnapshot: input.outputItemNameSnapshot?.trim() || null,
      outputUnitRaw: input.outputUnitRaw.trim() || "pieces",
      howToGuideID: input.howToGuideID?.trim() || null,
      defaultBatchYield: Math.max(0.001, asNumber(input.defaultBatchYield, 1)),
      targetDaysOnHand: Math.max(0.25, asNumber(input.targetDaysOnHand, 1.5)),
      defaultServingTarget: Math.max(0, asNumber(input.defaultServingTarget, 0)),
      instructions: asStringArray(input.instructions),
      isActive: input.isActive === undefined ? true : Boolean(input.isActive),
      lastSpotCheckQuantity: existingProduct?.data()?.lastSpotCheckQuantity ?? 0,
      lastSpotCheckDate: existingProduct?.data()?.lastSpotCheckDate ?? null,
      backendId: productId,
      updatedByUid: input.actorUid,
      updatedAt: serverTimestamp(),
      createdAt: existingProduct?.exists() ? existingProduct.data()?.createdAt ?? serverTimestamp() : serverTimestamp(),
      revision: Math.max(0, asNumber(existingProduct?.data()?.revision, 0)) + 1,
      lastSyncedAt: serverTimestamp()
    },
    { merge: true }
  )

  const existingIngredientSnapshot = await getDocs(collection(db, "organizations", orgId, "productionIngredients")).catch(() => null)
  for (const row of existingIngredientSnapshot?.docs ?? []) {
    const data = row.data() as Record<string, unknown>
    if (asString(data.productionProductID) === productId) {
      batch.delete(row.ref)
    }
  }

  for (const ingredientInput of input.ingredients) {
    const quantityPerBatch = Math.max(0, asNumber(ingredientInput.quantityPerBatch, 0))
    if (!quantityPerBatch) continue
    const incomingIngredientId = ingredientInput.id?.trim()
    const ingredientId = isUuidLike(incomingIngredientId) ? incomingIngredientId : makeUuid()
    const ingredientRef = doc(db, "organizations", orgId, "productionIngredients", ingredientId)
    batch.set(
      ingredientRef,
      {
        id: ingredientId,
        organizationId: orgId,
        storeId: input.storeId?.trim() || "",
        productionProductID: productId,
        inventoryItemID: ingredientInput.inventoryItemID?.trim() || null,
        inventoryItemNameSnapshot: ingredientInput.inventoryItemNameSnapshot.trim() || "Ingredient",
        quantityPerBatch,
        unitRaw: ingredientInput.unitRaw.trim() || "pieces",
        needsConversion: Boolean(ingredientInput.needsConversion),
        convertToUnitRaw: ingredientInput.convertToUnitRaw?.trim() || null,
        backendId: ingredientId,
        updatedByUid: input.actorUid,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        revision: 1,
        lastSyncedAt: serverTimestamp()
      },
      { merge: true }
    )
  }

  batch.set(doc(collection(db, "auditLogs")), {
    actorUserId: input.actorUid,
    actorRoleSnapshot: "Manager",
    organizationId: orgId,
    storeId: input.storeId?.trim() || null,
    targetPath: productRef.path,
    action: existingProduct?.exists() ? "update" : "create",
    before: existingProduct?.exists() ? existingProduct.data() : null,
    after: {
      productId,
      name: input.name.trim(),
      ingredientCount: input.ingredients.length
    },
    createdAt: serverTimestamp()
  })

  await batch.commit()
  return productId
}

export async function deleteProductionProduct(
  orgId: string,
  productId: string,
  actorUid: string
): Promise<void> {
  if (!db || !orgId || !productId) return
  const productRef = doc(db, "organizations", orgId, "productionProducts", productId)
  const existing = await getDoc(productRef).catch(() => null)
  const batch = writeBatch(db)
  batch.delete(productRef)

  const existingIngredientSnapshot = await getDocs(collection(db, "organizations", orgId, "productionIngredients")).catch(() => null)
  for (const row of existingIngredientSnapshot?.docs ?? []) {
    const data = row.data() as Record<string, unknown>
    if (asString(data.productionProductID) === productId) {
      batch.delete(row.ref)
    }
  }

  batch.set(doc(collection(db, "auditLogs")), {
    actorUserId: actorUid,
    actorRoleSnapshot: "Manager",
    organizationId: orgId,
    storeId: null,
    targetPath: productRef.path,
    action: "delete",
    before: existing?.exists() ? existing.data() : null,
    after: null,
    createdAt: serverTimestamp()
  })

  await batch.commit()
}

export async function fetchHowToGuides(orgId: string, storeId?: string): Promise<HowToGuide[]> {
  if (!db) return []
  const [modernSnap, legacySnap] = await Promise.all([
    getDocs(collection(db, "organizations", orgId, "howtos")).catch(() => null),
    getDocs(collection(db, "organizations", orgId, "howToGuides")).catch(() => null)
  ])

  type GuideCandidate = HowToGuide & { source: "modern" | "legacy" }
  const candidates: GuideCandidate[] = []
  const modernBackendIDs = new Set<string>()
  const modernTitleKeys = new Set<string>()

  for (const guide of modernSnap?.docs ?? []) {
    const data = guide.data() as Omit<HowToGuide, "id"> & { backendId?: string }
    if (data.scope !== "org" && storeId && data.storeId !== storeId) continue
    const entry: GuideCandidate = { id: guide.id, ...data, source: "modern" }
    const backend = String(data.backendId ?? guide.id).trim().toLowerCase()
    const titleKey = entry.title.trim().toLowerCase()
    if (backend) modernBackendIDs.add(backend)
    if (titleKey) modernTitleKeys.add(titleKey)
    candidates.push(entry)
  }

  for (const legacy of legacySnap?.docs ?? []) {
    const data = legacy.data() as Record<string, unknown>
    const legacyStoreId = asString(data.storeId) ?? null
    if (storeId && legacyStoreId && legacyStoreId !== storeId) continue

    const backend = String(asString(data.backendId) ?? legacy.id).trim().toLowerCase()
    const title = asString(data.title) ?? "Untitled Guide"
    const titleKey = title.trim().toLowerCase()
    if (modernBackendIDs.has(backend) || (titleKey && modernTitleKeys.has(titleKey))) {
      continue
    }

    const entry: GuideCandidate = {
      id: legacy.id,
      title,
      description: asString(data.notes) ?? "",
      tags: asStringArray(data.keywords),
      scope: legacyStoreId ? "store" : "org",
      storeId: legacyStoreId,
      version: Math.max(1, asNumber(data.revision, 1)),
      updatedAt: data.updatedAt,
      updatedBy: asString(data.updatedByUid),
      source: "legacy"
    }
    candidates.push(entry)
  }

  const dedupedByTitle = new Map<string, GuideCandidate>()
  for (const candidate of candidates) {
    const key = candidate.title.trim().toLowerCase()
    if (!key) continue
    const current = dedupedByTitle.get(key)
    if (!current) {
      dedupedByTitle.set(key, candidate)
      continue
    }

    const currentUpdated = asTimestampDate(current.updatedAt)?.getTime() ?? 0
    const candidateUpdated = asTimestampDate(candidate.updatedAt)?.getTime() ?? 0
    const currentStoreMatch = Boolean(storeId && current.scope === "store" && current.storeId === storeId)
    const candidateStoreMatch = Boolean(storeId && candidate.scope === "store" && candidate.storeId === storeId)

    let replace = false
    if (current.source !== "modern" && candidate.source === "modern") {
      replace = true
    } else if (!currentStoreMatch && candidateStoreMatch) {
      replace = true
    } else if ((candidate.version ?? 0) > (current.version ?? 0)) {
      replace = true
    } else if (candidateUpdated > currentUpdated) {
      replace = true
    }

    if (replace) {
      dedupedByTitle.set(key, candidate)
    }
  }

  return Array.from(dedupedByTitle.values())
    .map((candidate) => {
      const { source, ...guide } = candidate
      void source
      return guide
    })
    .sort((a, b) => {
      const left = asTimestampDate(a.updatedAt)?.getTime() ?? 0
      const right = asTimestampDate(b.updatedAt)?.getTime() ?? 0
      return right - left
    })
}

export async function fetchHowToGuide(orgId: string, guideId: string): Promise<(HowToGuide & { steps: HowToStep[] }) | null> {
  if (!db) return null
  const guideSnap = await getDoc(doc(db, "organizations", orgId, "howtos", guideId))
  if (!guideSnap.exists()) {
    const legacySnap = await getDoc(doc(db, "organizations", orgId, "howToGuides", guideId))
    if (!legacySnap.exists()) return null
    const legacy = legacySnap.data() as Record<string, unknown>
    const legacySteps = asStringArray(legacy.steps)
    return {
      id: legacySnap.id,
      title: asString(legacy.title) ?? "Untitled Guide",
      description: asString(legacy.notes) ?? "",
      tags: asStringArray(legacy.keywords),
      scope: asString(legacy.storeId) ? "store" : "org",
      storeId: asString(legacy.storeId) ?? null,
      version: Math.max(1, asNumber(legacy.revision, 1)),
      updatedAt: legacy.updatedAt,
      updatedBy: asString(legacy.updatedByUid),
      steps: legacySteps.length
        ? legacySteps.map((line, idx) => ({
            id: `legacy-${idx + 1}`,
            stepNumber: idx + 1,
            title: `Step ${idx + 1}`,
            blocks: [{ id: `legacy-block-${idx + 1}`, type: "text", text: line, orderIndex: 0 }]
          }))
        : [
            {
              id: "legacy-1",
              stepNumber: 1,
              title: "Step 1",
              blocks: []
            }
          ]
    }
  }

  const stepsSnap = await getDocs(query(collection(db, "organizations", orgId, "howtos", guideId, "steps"), orderBy("stepNumber", "asc")))
  const steps: HowToStep[] = []
  for (const step of stepsSnap.docs) {
    const blocksSnap = await getDocs(
      query(collection(db, "organizations", orgId, "howtos", guideId, "steps", step.id, "blocks"), orderBy("orderIndex", "asc"))
    )
    steps.push({
      id: step.id,
      ...(step.data() as Omit<HowToStep, "id" | "blocks">),
      blocks: blocksSnap.docs.map((block) => ({ id: block.id, ...(block.data() as Omit<HowToBlock, "id">) }))
    })
  }

  return {
    id: guideSnap.id,
    ...(guideSnap.data() as Omit<HowToGuide, "id">),
    steps
  }
}

function flattenGuideStepsForLegacy(
  steps: Array<{
    stepNumber: number
    title?: string
    blocks: Array<{ type: "text" | "photo" | "video"; text?: string }>
  }>
): string[] {
  return steps
    .sort((a, b) => a.stepNumber - b.stepNumber)
    .map((step) => {
      const textBlocks = step.blocks
        .filter((block) => block.type === "text")
        .map((block) => (block.text ?? "").trim())
        .filter(Boolean)
      if (textBlocks.length > 0) return textBlocks.join(" ")
      return (step.title ?? `Step ${step.stepNumber}`).trim()
    })
    .filter(Boolean)
}

export async function saveHowToGuide(
  orgId: string,
  actorUid: string,
  input: {
    id?: string
    title: string
    description: string
    tags: string[]
    scope: "org" | "store"
    storeId: string | null
    steps: Array<{ stepNumber: number; title?: string; blocks: Array<{ type: "text" | "photo" | "video"; text?: string; mediaAssetId?: string; orderIndex: number }> }>
  }
): Promise<string> {
  if (!db) return ""

  const guideId = input.id ?? doc(collection(db, "organizations", orgId, "howtos")).id
  const guideRef = doc(db, "organizations", orgId, "howtos", guideId)
  const legacyGuideRef = doc(db, "organizations", orgId, "howToGuides", guideId)
  const existing = await getDoc(guideRef)
  const existingLegacy = await getDoc(legacyGuideRef)
  const currentVersion = (existing.data()?.version as number | undefined) ?? 0

  const batch = writeBatch(db)
  batch.set(
    guideRef,
    {
      organizationId: orgId,
      title: input.title,
      description: input.description,
      tags: input.tags,
      scope: input.scope,
      storeId: input.storeId,
      version: currentVersion + 1,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
      createdAt: existing.exists() ? existing.data()?.createdAt : serverTimestamp(),
      createdBy: existing.exists() ? existing.data()?.createdBy ?? actorUid : actorUid
    },
    { merge: true }
  )

  const stepsRef = collection(db, "organizations", orgId, "howtos", guideId, "steps")
  const previousSteps = await getDocs(stepsRef)
  for (const previousStep of previousSteps.docs) {
    const blocks = await getDocs(collection(db, "organizations", orgId, "howtos", guideId, "steps", previousStep.id, "blocks"))
    blocks.docs.forEach((block) => batch.delete(block.ref))
    batch.delete(previousStep.ref)
  }

  input.steps.forEach((step) => {
    const stepRef = doc(stepsRef)
    batch.set(stepRef, {
      organizationId: orgId,
      stepNumber: step.stepNumber,
      title: step.title ?? "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })

    step.blocks.forEach((block) => {
      const blockRef = doc(collection(db!, "organizations", orgId, "howtos", guideId, "steps", stepRef.id, "blocks"))
      batch.set(blockRef, {
        organizationId: orgId,
        type: block.type,
        text: block.text ?? "",
        mediaAssetId: block.mediaAssetId ?? null,
        orderIndex: block.orderIndex
      })
    })
  })

  const flattenedLegacySteps = flattenGuideStepsForLegacy(input.steps)
  const fallbackKeywords =
    input.tags.length > 0
      ? input.tags
      : input.title
          .split(/\s+/)
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 2)

  batch.set(
    legacyGuideRef,
    {
      id: guideId,
      organizationId: orgId,
      title: input.title,
      keywords: fallbackKeywords,
      steps: flattenedLegacySteps,
      notes: input.description,
      isActive: true,
      storeId: input.storeId ?? "",
      backendId: guideId,
      createdAt: existingLegacy.exists() ? existingLegacy.data()?.createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
      revision: currentVersion + 1,
      updatedByUid: actorUid,
      lastSyncedAt: serverTimestamp()
    },
    { merge: true }
  )

  batch.set(doc(collection(db, "auditLogs")), {
    actorUserId: actorUid,
    actorRoleSnapshot: "Manager",
    organizationId: orgId,
    storeId: input.storeId,
    targetPath: guideRef.path,
    action: existing.exists() ? "update" : "create",
    before: existing.exists() ? existing.data() : null,
    after: {
      title: input.title,
      version: currentVersion + 1
    },
    createdAt: serverTimestamp()
  })

  await batch.commit()
  return guideId
}

export async function deleteHowToGuide(orgId: string, guideId: string, actorUid: string): Promise<void> {
  if (!db || !orgId || !guideId) return
  const guideRef = doc(db, "organizations", orgId, "howtos", guideId)
  const legacyGuideRef = doc(db, "organizations", orgId, "howToGuides", guideId)
  const existing = await getDoc(guideRef)
  const batch = writeBatch(db)

  const stepsSnap = await getDocs(collection(db, "organizations", orgId, "howtos", guideId, "steps")).catch(() => null)
  for (const step of stepsSnap?.docs ?? []) {
    const blocksSnap = await getDocs(
      collection(db, "organizations", orgId, "howtos", guideId, "steps", step.id, "blocks")
    ).catch(() => null)
    for (const block of blocksSnap?.docs ?? []) {
      batch.delete(block.ref)
    }
    batch.delete(step.ref)
  }

  batch.delete(guideRef)
  batch.delete(legacyGuideRef)

  batch.set(doc(collection(db, "auditLogs")), {
    actorUserId: actorUid,
    actorRoleSnapshot: "Manager",
    organizationId: orgId,
    storeId: null,
    targetPath: guideRef.path,
    action: "delete",
    before: existing.exists() ? existing.data() : null,
    after: null,
    createdAt: serverTimestamp()
  })

  await batch.commit()
}

export async function uploadMediaAsset(input: {
  file: File
  orgId: string
  storeId?: string
  userId: string
  type: "image" | "video" | "pdf" | "file"
}): Promise<MediaAssetRecord | null> {
  if (!storage || !db) return null

  const ext = input.file.name.split(".").pop() ?? "bin"
  const assetId = doc(collection(db, "mediaAssets")).id
  const path = `orgs/${input.orgId}/assets/${assetId}.${ext}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, input.file, { contentType: input.file.type })
  const downloadUrl = await getDownloadURL(storageRef)

  await setDoc(doc(db, "mediaAssets", assetId), {
    organizationId: input.orgId,
    storeId: input.storeId ?? null,
    ownerUserId: input.userId,
    type: input.type,
    storagePath: path,
    storageBucket: storageRef.bucket,
    contentType: input.file.type,
    originalName: input.file.name,
    sizeBytes: input.file.size,
    createdAt: serverTimestamp()
  })

  return {
    id: assetId,
    organizationId: input.orgId,
    storeId: input.storeId,
    ownerUserId: input.userId,
    type: input.type,
    storagePath: path,
    storageBucket: storageRef.bucket,
    contentType: input.file.type,
    originalName: input.file.name,
    sizeBytes: input.file.size,
    downloadUrl
  }
}

export async function fetchMediaAssetsByIds(assetIds: string[]): Promise<Record<string, MediaAssetRecord>> {
  if (!db || !assetIds.length) return {}
  const firestore = db
  const unique = Array.from(new Set(assetIds.filter(Boolean)))
  const rows = await Promise.all(
    unique.map(async (assetId) => {
      const snap = await getDoc(doc(firestore, "mediaAssets", assetId)).catch(() => null)
      if (!snap?.exists()) return null
      const data = snap.data() as Record<string, unknown>
      let downloadUrl: string | undefined
      if (storage && asString(data.storagePath)) {
        try {
          downloadUrl = await getDownloadURL(ref(storage, String(data.storagePath)))
        } catch {
          downloadUrl = undefined
        }
      }
      const row: MediaAssetRecord = {
        id: snap.id,
        organizationId: asString(data.organizationId) ?? "",
        storeId: asString(data.storeId),
        ownerUserId: asString(data.ownerUserId) ?? "",
        type: (asString(data.type) as "image" | "video" | "pdf" | "file") ?? "image",
        storagePath: asString(data.storagePath) ?? "",
        storageBucket: asString(data.storageBucket),
        contentType: asString(data.contentType) ?? "",
        originalName: asString(data.originalName) ?? "asset",
        sizeBytes: asNumber(data.sizeBytes, 0),
        createdAt: data.createdAt,
        downloadUrl
      }
      return row
    })
  )

  const byId: Record<string, MediaAssetRecord> = {}
  for (const row of rows) {
    if (!row) continue
    byId[row.id] = row
  }
  return byId
}

export async function fetchPreferenceProfile(userId: string, orgId: string, platform: "WEB" | "IOS"): Promise<PlatformPreferenceProfile | null> {
  if (!db) return null
  const id = `${userId}_${orgId}_${platform}`
  const snap = await getDoc(doc(db, "platformPreferenceProfiles", id))
  if (!snap.exists()) return null
  const data = snap.data() as Record<string, unknown>
  return {
    id: snap.id,
    userId: String(data.userId ?? userId),
    organizationId: String(data.organizationId ?? orgId),
    platform: data.platform === "IOS" ? "IOS" : "WEB",
    theme: data.theme === "light" || data.theme === "system" ? data.theme : "dark",
    accentColor: asString(data.accentColor) ?? "#2563EB",
    boldText: Boolean(data.boldText),
    showTips: data.showTips === undefined ? true : Boolean(data.showTips)
  }
}

export async function savePreferenceProfile(profile: PlatformPreferenceProfile): Promise<void> {
  if (!db) return
  await setDoc(
    doc(db, "platformPreferenceProfiles", profile.id),
    {
      userId: profile.userId,
      organizationId: profile.organizationId,
      platform: profile.platform,
      theme: profile.theme,
      accentColor: profile.accentColor,
      boldText: profile.boldText,
      showTips: profile.showTips,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    },
    { merge: true }
  )
}

const baseRoleDefaults: OrgSettingsRecord["roleDefaults"] = (["Owner", "Manager", "Staff"] as const).map(
  (role): OrgSettingsRecord["roleDefaults"][number] => ({
    role,
    enabled: true,
    permissionFlags: permissionDefaultsForRole(role)
  })
)

const baseJobTitles: OrgSettingsRecord["jobTitles"] = [
  {
    id: "role_manager",
    title: "Manager",
    baseRole: "Manager",
    singlePerStore: false,
    permissionFlags: permissionDefaultsForRole("Manager")
  },
  {
    id: "role_staff",
    title: "Staff",
    baseRole: "Staff",
    singlePerStore: false,
    permissionFlags: permissionDefaultsForRole("Staff")
  }
]

const defaultOrgSettings: Omit<OrgSettingsRecord, "id" | "organizationId"> = {
  organizationName: "",
  customBrandingEnabled: false,
  replaceAppNameWithLogo: false,
  appHeaderStyle: "icon_name",
  moduleIconStyle: "rounded",
  canStoreRemoveItems: false,
  maxSalePercent: 30,
  allowStoreRoleCreation: false,
  managerCanManageUsersOnlyInOwnStore: true,
  featureFlags: {
    inventory: true,
    expiration: true,
    waste: true,
    orders: true,
    todo: true,
    insights: true,
    production: true,
    howtos: true
  },
  jobTitles: baseJobTitles,
  roleDefaults: baseRoleDefaults,
  departmentConfigs: [],
  departments: [],
  locationTemplates: [],
  categoryConfigs: [],
  exportPreferences: [],
  storeOverrideKeys: [],
  reworkedBarcodeRule: { ...defaultReworkedBarcodeRule }
}

const defaultStoreSettings: Omit<StoreSettingsRecord, "id" | "organizationId" | "storeId"> = {
  departmentConfigs: [],
  departments: [],
  locationTemplates: [],
  categoryConfigs: [],
  exportPreferences: [],
  // Store settings inherit org roles; store-local roles should start empty.
  jobTitles: [],
  roleDefaults: baseRoleDefaults,
  canStoreRemoveItems: false,
  maxSalePercent: 30,
  featureFlags: {
    inventory: true,
    expiration: true,
    waste: true,
    orders: true,
    todo: true,
    insights: true,
    production: true,
    howtos: true
  },
  reworkedBarcodeRule: { ...defaultReworkedBarcodeRule }
}

export async function fetchOrgSettings(orgId: string): Promise<OrgSettingsRecord> {
  if (!db || !orgId) {
    return { id: "default", organizationId: orgId, ...defaultOrgSettings }
  }
  const orgSnap = await getDoc(doc(db, "organizations", orgId))
  const orgName = String((orgSnap.data()?.name as string | undefined) ?? "Organization")
  const snap = await getDoc(doc(db, "organizations", orgId, "settings", "default"))
  if (!snap.exists()) {
    return {
      id: "default",
      organizationId: orgId,
      ...defaultOrgSettings,
      organizationName: orgName
    }
  }
  const data = snap.data() as Record<string, unknown>
  const rawDepartments = (data.departments as string[] | undefined) ?? []
  const rawLocations = (data.locationTemplates as string[] | undefined) ?? []
  const departmentConfigs = (() => {
    const normalized = normalizeDepartmentConfigs(data.departmentConfigs)
    return normalized.length > 0 ? normalized : deriveDepartmentConfigsFromLegacy(rawDepartments, rawLocations)
  })()
  const derivedDepartments = departmentConfigs.map((config) => config.name)
  const derivedLocations = Array.from(new Set(departmentConfigs.flatMap((config) => config.locations)))
  return {
    id: snap.id,
    organizationId: orgId,
    organizationName: String(data.organizationName ?? orgName),
    companyCode: asString(data.companyCode) ?? asString(orgSnap.data()?.companyCode),
    customBrandingEnabled: Boolean(data.customBrandingEnabled),
    replaceAppNameWithLogo: Boolean(data.replaceAppNameWithLogo),
    brandDisplayName: asString(data.brandDisplayName),
    brandLogoUrl: asString(data.brandLogoUrl),
    brandLogoAssetId: asString(data.brandLogoAssetId),
    logoLightUrl: asString(data.logoLightUrl),
    logoLightAssetId: asString(data.logoLightAssetId),
    logoDarkUrl: asString(data.logoDarkUrl),
    logoDarkAssetId: asString(data.logoDarkAssetId),
    appHeaderStyle: data.appHeaderStyle === "icon_only" ? "icon_only" : "icon_name",
    moduleIconStyle: data.moduleIconStyle === "square" ? "square" : "rounded",
    welcomeMessage: asString(data.welcomeMessage),
    canStoreRemoveItems: Boolean(data.canStoreRemoveItems),
    maxSalePercent: Number(data.maxSalePercent ?? 30),
    allowStoreRoleCreation: Boolean(data.allowStoreRoleCreation),
    managerCanManageUsersOnlyInOwnStore:
      data.managerCanManageUsersOnlyInOwnStore === undefined
        ? true
        : Boolean(data.managerCanManageUsersOnlyInOwnStore),
    featureFlags: (data.featureFlags as Record<string, boolean> | undefined) ?? defaultOrgSettings.featureFlags,
    // Do not auto-reseed defaults when an org intentionally clears roles.
    // Defaults are only used when the settings doc does not exist.
    jobTitles: normalizeJobTitles(data.jobTitles),
    roleDefaults: normalizeRoleDefaults(data.roleDefaults),
    departmentConfigs,
    departments: derivedDepartments.length > 0 ? derivedDepartments : rawDepartments,
    locationTemplates: derivedLocations.length > 0 ? derivedLocations : rawLocations,
    categoryConfigs: normalizeCategoryConfigs(data.categoryConfigs),
    exportPreferences: normalizeSpreadsheetExportPreferences(data.exportPreferences),
    storeOverrideKeys: (data.storeOverrideKeys as string[] | undefined) ?? [],
    reworkedBarcodeRule: normalizeReworkedBarcodeRule(data.reworkedBarcodeRule),
    updatedAt: data.updatedAt,
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : undefined
  }
}

export async function saveOrgSettings(
  orgId: string,
  patch: Partial<OrgSettingsRecord>,
  actorUserId: string
): Promise<void> {
  if (!db || !orgId) return
  const orgDocPatch: Record<string, unknown> = {}
  if (patch.organizationName && patch.organizationName.trim()) {
    orgDocPatch.name = patch.organizationName.trim()
  }
  if (patch.companyCode !== undefined) {
    const companyCode = patch.companyCode.trim().toUpperCase()
    orgDocPatch.companyCode = companyCode || null
    orgDocPatch.companyCodeUpper = companyCode || null
  }
  if (Object.keys(orgDocPatch).length > 0) {
    orgDocPatch.updatedAt = serverTimestamp()
    await updateDoc(doc(db, "organizations", orgId), orgDocPatch)
  }
  const sanitizedPatch = sanitizeFirestoreWriteData(
    pickWriteableKeys(patch, ORG_SETTINGS_WRITABLE_KEYS)
  ) as Partial<OrgSettingsRecord>
  const optionalStringKeys: Array<
    | "brandDisplayName"
    | "welcomeMessage"
    | "brandLogoUrl"
    | "brandLogoAssetId"
    | "logoLightUrl"
    | "logoLightAssetId"
    | "logoDarkUrl"
    | "logoDarkAssetId"
  > = [
    "brandDisplayName",
    "welcomeMessage",
    "brandLogoUrl",
    "brandLogoAssetId",
    "logoLightUrl",
    "logoLightAssetId",
    "logoDarkUrl",
    "logoDarkAssetId"
  ]
  for (const key of optionalStringKeys) {
    if (!(key in patch)) continue
    const normalized = normalizeOptionalStringPatchValue((patch as Record<string, unknown>)[key])
    if (normalized === undefined) {
      delete (sanitizedPatch as Record<string, unknown>)[key]
    } else {
      const targetPatch = sanitizedPatch as Record<string, unknown>
      targetPatch[key] = normalized
    }
  }
  const normalizedPatch = stripUndefinedDeep(sanitizedPatch) as Partial<OrgSettingsRecord>
  if (normalizedPatch.departmentConfigs !== undefined) {
    const normalizedConfigs = normalizeDepartmentConfigs(normalizedPatch.departmentConfigs)
    normalizedPatch.departmentConfigs = normalizedConfigs
    normalizedPatch.departments = normalizedConfigs.map((config) => config.name)
    normalizedPatch.locationTemplates = Array.from(new Set(normalizedConfigs.flatMap((config) => config.locations)))
  }
  if (normalizedPatch.reworkedBarcodeRule !== undefined) {
    normalizedPatch.reworkedBarcodeRule = normalizeReworkedBarcodeRule(normalizedPatch.reworkedBarcodeRule)
  }
  if (normalizedPatch.categoryConfigs !== undefined) {
    normalizedPatch.categoryConfigs = normalizeCategoryConfigs(normalizedPatch.categoryConfigs)
  }
  if (normalizedPatch.exportPreferences !== undefined) {
    normalizedPatch.exportPreferences = normalizeSpreadsheetExportPreferences(normalizedPatch.exportPreferences)
  }
  const payload: Record<string, unknown> = {
    organizationId: orgId,
    updatedAt: serverTimestamp(),
    updatedBy: actorUserId
  }
  for (const [key, value] of Object.entries(normalizedPatch)) {
    if (value === undefined) continue
    payload[key] = value
  }
  const cleanedPayload = stripUndefinedDeep(
    sanitizeFirestoreWriteData(payload)
  ) as Record<string, unknown>
  await setDoc(
    doc(db, "organizations", orgId, "settings", "default"),
    cleanedPayload,
    { merge: true }
  )
}

export async function fetchStoreSettings(orgId: string, store: StoreWithPath): Promise<StoreSettingsRecord> {
  if (!db || !orgId) {
    return { id: "default", organizationId: orgId, storeId: store.id, ...defaultStoreSettings }
  }
  const snap = await getDoc(
    doc(
      db,
      "organizations",
      orgId,
      "regions",
      store.regionId,
      "districts",
      store.districtId,
      "stores",
      store.id,
      "settings",
      "default"
    )
  )
  if (!snap.exists()) {
    return {
      id: "default",
      organizationId: orgId,
      storeId: store.id,
      ...defaultStoreSettings
    }
  }
  const data = snap.data() as Record<string, unknown>
  const rawDepartments = (data.departments as string[] | undefined) ?? []
  const rawLocations = (data.locationTemplates as string[] | undefined) ?? []
  const departmentConfigs = (() => {
    const normalized = normalizeDepartmentConfigs(data.departmentConfigs)
    return normalized.length > 0 ? normalized : deriveDepartmentConfigsFromLegacy(rawDepartments, rawLocations)
  })()
  const derivedDepartments = departmentConfigs.map((config) => config.name)
  const derivedLocations = Array.from(new Set(departmentConfigs.flatMap((config) => config.locations)))
  return {
    id: snap.id,
    organizationId: orgId,
    storeId: store.id,
    departmentConfigs,
    departments: derivedDepartments.length > 0 ? derivedDepartments : rawDepartments,
    locationTemplates: derivedLocations.length > 0 ? derivedLocations : rawLocations,
    // Do not auto-insert Manager/Staff here. Empty means no store-specific roles.
    jobTitles: normalizeJobTitles(data.jobTitles),
    roleDefaults: normalizeRoleDefaults(data.roleDefaults),
    canStoreRemoveItems: Boolean(data.canStoreRemoveItems),
    maxSalePercent: Number(data.maxSalePercent ?? 30),
    featureFlags: (data.featureFlags as Record<string, boolean> | undefined) ?? defaultStoreSettings.featureFlags,
    categoryConfigs: normalizeCategoryConfigs(data.categoryConfigs),
    exportPreferences: normalizeSpreadsheetExportPreferences(data.exportPreferences),
    reworkedBarcodeRule: normalizeReworkedBarcodeRule(data.reworkedBarcodeRule),
    updatedAt: data.updatedAt,
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : undefined
  }
}

export async function saveStoreSettings(
  orgId: string,
  store: StoreWithPath,
  patch: Partial<StoreSettingsRecord>,
  actorUserId: string
): Promise<void> {
  if (!db || !orgId) return
  const sanitizedPatch = sanitizeFirestoreWriteData(
    pickWriteableKeys(patch, STORE_SETTINGS_WRITABLE_KEYS)
  ) as Partial<StoreSettingsRecord>
  const normalizedPatch = stripUndefinedDeep(sanitizedPatch) as Partial<StoreSettingsRecord>
  if (normalizedPatch.departmentConfigs !== undefined) {
    const normalizedConfigs = normalizeDepartmentConfigs(normalizedPatch.departmentConfigs)
    normalizedPatch.departmentConfigs = normalizedConfigs
    normalizedPatch.departments = normalizedConfigs.map((config) => config.name)
    normalizedPatch.locationTemplates = Array.from(new Set(normalizedConfigs.flatMap((config) => config.locations)))
  }
  if (normalizedPatch.reworkedBarcodeRule !== undefined) {
    normalizedPatch.reworkedBarcodeRule = normalizeReworkedBarcodeRule(normalizedPatch.reworkedBarcodeRule)
  }
  if (normalizedPatch.categoryConfigs !== undefined) {
    normalizedPatch.categoryConfigs = normalizeCategoryConfigs(normalizedPatch.categoryConfigs)
  }
  if (normalizedPatch.exportPreferences !== undefined) {
    normalizedPatch.exportPreferences = normalizeSpreadsheetExportPreferences(normalizedPatch.exportPreferences)
  }
  const payload = stripUndefinedDeep(
    sanitizeFirestoreWriteData({
      organizationId: orgId,
      storeId: store.id,
      ...normalizedPatch,
      updatedAt: serverTimestamp(),
      updatedBy: actorUserId
    })
  ) as Record<string, unknown>
  await setDoc(
    doc(
      db,
      "organizations",
      orgId,
      "regions",
      store.regionId,
      "districts",
      store.districtId,
      "stores",
      store.id,
      "settings",
      "default"
    ),
    payload,
    { merge: true }
  )
}

export async function saveAccountProfile(
  orgId: string,
  userId: string,
  patch: AccountProfileRecord
): Promise<void> {
  if (!db) return
  await setDoc(
    doc(db, "users", userId),
    {
      ...patch,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  )
  if (orgId) {
    await setDoc(
      doc(db, "organizations", orgId, "members", userId),
      {
        ...patch,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    )
  }
}

export async function fetchAccountProfile(userId: string): Promise<AccountProfileRecord | null> {
  if (!db || !userId) return null
  const snap = await getDoc(doc(db, "users", userId))
  if (!snap.exists()) return null
  const data = snap.data() as Record<string, unknown>
  return {
    email: typeof data.email === "string" ? data.email : undefined,
    employeeId: typeof data.employeeId === "string" ? data.employeeId : undefined,
    profileImageUrl: typeof data.profileImageUrl === "string" ? data.profileImageUrl : undefined,
    firstName: typeof data.firstName === "string" ? data.firstName : undefined,
    lastName: typeof data.lastName === "string" ? data.lastName : undefined
  }
}

export async function fetchCentralCatalogItems(): Promise<CentralCatalogItemRecord[]> {
  if (!db) return []
  const globalSnap = await getDocs(collection(db, "centralCatalog", "global", "items")).catch(() => null)
  const legacySnap = await getDocs(query(collection(db, "centralCatalogItems"), orderBy("name"), limit(2000))).catch(
    () => null
  )

  const merged = new Map<string, CentralCatalogItemRecord>()

  if (globalSnap) {
    for (const docSnap of globalSnap.docs) {
      const data = docSnap.data() as Record<string, unknown>
      const upc = asString(data.upc) ?? docSnap.id
      const rawExpirationValue = data.defaultExpiration ?? data.defaultExpirationDays
      const hasExpiration = data.hasExpiration === undefined ? asNumber(rawExpirationValue, 7) > 0 : Boolean(data.hasExpiration)
      merged.set(docSnap.id, {
        id: docSnap.id,
        upc,
        name: asString(data.title) ?? asString(data.name) ?? upc,
        photoUrl: asString(data.photoUrl),
        photoAssetId: asString(data.photoAssetId),
        thumbnailBase64: asString(data.thumbnailBase64),
        hasExpiration,
        defaultExpirationDays: Math.max(0, asNumber(rawExpirationValue, hasExpiration ? 7 : 0)),
        updatedAt: data.updatedAt
      })
    }
  }

  if (legacySnap) {
    for (const docSnap of legacySnap.docs) {
      if (merged.has(docSnap.id)) continue
      const data = docSnap.data() as Record<string, unknown>
      const rawExpirationValue = data.defaultExpirationDays ?? data.defaultExpiration
      const hasExpiration = data.hasExpiration === undefined ? asNumber(rawExpirationValue, 7) > 0 : Boolean(data.hasExpiration)
      merged.set(docSnap.id, {
        id: docSnap.id,
        upc: String(data.upc ?? docSnap.id),
        name: String(data.name ?? data.title ?? "Catalog Item"),
        photoUrl: asString(data.photoUrl),
        photoAssetId: asString(data.photoAssetId),
        thumbnailBase64: asString(data.thumbnailBase64),
        hasExpiration,
        defaultExpirationDays: Math.max(0, asNumber(rawExpirationValue, hasExpiration ? 7 : 0)),
        updatedAt: data.updatedAt
      })
    }
  }
  const rows = Array.from(merged.values())
  const unresolvedAssetIds = Array.from(
    new Set(
      rows
        .filter((row) => !row.photoUrl && row.photoAssetId)
        .map((row) => row.photoAssetId as string)
    )
  )

  if (unresolvedAssetIds.length > 0) {
    const assets = await fetchMediaAssetsByIds(unresolvedAssetIds).catch(() => ({} as Record<string, MediaAssetRecord>))
    for (const row of rows) {
      if (row.photoUrl || !row.photoAssetId) continue
      const resolved = assets[row.photoAssetId]
      if (resolved?.downloadUrl) {
        row.photoUrl = resolved.downloadUrl
      }
    }
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export async function upsertCentralCatalogItem(
  item: Omit<CentralCatalogItemRecord, "id" | "updatedAt"> & { id?: string }
): Promise<string> {
  if (!db) return ""
  const normalizedUpc = (item.upc || item.id || "").trim()
  if (!normalizedUpc) return ""
  const globalRef = doc(db, "centralCatalog", "global", "items", normalizedUpc)
  const legacyRef = doc(db, "centralCatalogItems", normalizedUpc)
  const payload = {
    upc: normalizedUpc,
    name: item.name.trim(),
    title: item.name.trim(),
    photoUrl: item.photoUrl?.trim() || null,
    photoAssetId: item.photoAssetId?.trim() || null,
    thumbnailBase64: item.thumbnailBase64?.trim() || null,
    hasExpiration: item.hasExpiration !== false,
    defaultExpiration: item.hasExpiration === false ? 0 : Math.max(1, Number(item.defaultExpirationDays ?? 7)),
    defaultExpirationDays: item.hasExpiration === false ? 0 : Math.max(1, Number(item.defaultExpirationDays ?? 7)),
    updatedAt: serverTimestamp()
  }
  await setDoc(
    globalRef,
    payload,
    { merge: true }
  )
  await setDoc(
    legacyRef,
    {
      ...payload,
      id: normalizedUpc
    },
    { merge: true }
  )
  return normalizedUpc
}

export async function removeCentralCatalogItem(itemId: string): Promise<void> {
  if (!db || !itemId) return
  await Promise.all([
    deleteDoc(doc(db, "centralCatalog", "global", "items", itemId)),
    deleteDoc(doc(db, "centralCatalogItems", itemId))
  ])
}

export async function fetchAuditLogs(orgId: string, storeId?: string): Promise<AuditLogRecord[]> {
  if (!db) return []
  const membersSnapshot = await getDocs(collection(db, "organizations", orgId, "members"))
  const actorMap = new Map<
    string,
    {
      actorDisplayName: string
      actorEmployeeId?: string
    }
  >()
  for (const member of membersSnapshot.docs) {
    const data = member.data() as Record<string, unknown>
    const firstName = typeof data.firstName === "string" ? data.firstName : ""
    const lastName = typeof data.lastName === "string" ? data.lastName : ""
    const fullName = `${firstName} ${lastName}`.trim()
    const email = typeof data.email === "string" ? data.email : ""
    actorMap.set(member.id, {
      actorDisplayName: fullName || email || member.id,
      actorEmployeeId: typeof data.employeeId === "string" ? data.employeeId : undefined
    })
  }

  const baseQuery = storeId
    ? query(collection(db, "auditLogs"), where("organizationId", "==", orgId), where("storeId", "==", storeId), orderBy("createdAt", "desc"), limit(200))
    : query(collection(db, "auditLogs"), where("organizationId", "==", orgId), orderBy("createdAt", "desc"), limit(200))
  const snap = await getDocs(baseQuery)
  return snap.docs.map((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>
    const actorId = typeof data.actorUserId === "string" ? data.actorUserId : ""
    const mapped = actorMap.get(actorId)
    return {
      id: docSnap.id,
      ...data,
      actorDisplayName: mapped?.actorDisplayName ?? actorId,
      actorEmployeeId: mapped?.actorEmployeeId
    }
  })
}

type AdminOrganizationRecord = {
  id: string
  name?: string
  status?: string
  createdAt?: unknown
  planId?: string
  [key: string]: unknown
}

type AdminStoreRecord = {
  id: string
  name?: string
  title?: string
  storeNumber?: string
  regionId?: string
  districtId?: string
  status?: string
  [key: string]: unknown
}

export async function fetchAdminOrganizationsDirect(): Promise<AdminOrganizationRecord[]> {
  if (!db) return []
  const snap = await getDocs(query(collection(db, "organizations"), limit(500)))
  return snap.docs
    .map((org) => ({ id: org.id, ...(org.data() as Record<string, unknown>) }) as AdminOrganizationRecord)
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")))
}

export async function fetchAdminOrganizationDetailDirect(orgId: string): Promise<{
  organization: AdminOrganizationRecord & { stores: AdminStoreRecord[] }
  organizationSettings: Record<string, unknown> | null
  items: Array<Record<string, unknown>>
  members: Array<Record<string, unknown>>
}> {
  if (!db || !orgId) {
    return {
      organization: { id: orgId, stores: [] },
      organizationSettings: null,
      items: [],
      members: []
    }
  }

  const [orgSnap, settingsSnap, itemsSnap, membersSnap, stores] = await Promise.all([
    getDoc(doc(db, "organizations", orgId)),
    getDoc(doc(db, "organizations", orgId, "settings", "default")),
    getDocs(query(collection(db, "organizations", orgId, "items"), limit(2000))),
    getDocs(query(collection(db, "organizations", orgId, "members"), limit(2000))),
    fetchStores(orgId)
  ])

  const organization = {
    id: orgId,
    ...(orgSnap.exists() ? (orgSnap.data() as Record<string, unknown>) : {}),
    stores: stores.map((store) => ({
      id: store.id,
      name: store.name,
      title: store.title,
      storeNumber: store.storeNumber,
      regionId: store.regionId,
      districtId: store.districtId,
      status: store.status
    }))
  }

  return {
    organization,
    organizationSettings: settingsSnap.exists() ? (settingsSnap.data() as Record<string, unknown>) : null,
    items: itemsSnap.docs.map((item) => ({ id: item.id, ...(item.data() as Record<string, unknown>) })),
    members: membersSnap.docs.map((member) => ({ id: member.id, ...(member.data() as Record<string, unknown>) }))
  }
}

export async function fetchAdminStoreDetailDirect(orgId: string, storeId: string): Promise<{
  store: Record<string, unknown>
  storeSettings: Record<string, unknown> | null
  inventoryBatches: Array<Record<string, unknown>>
  wasteRecords: Array<Record<string, unknown>>
  orders: Array<Record<string, unknown>>
  toDo: Array<Record<string, unknown>>
}> {
  if (!db || !orgId || !storeId) {
    return {
      store: { id: storeId },
      storeSettings: null,
      inventoryBatches: [],
      wasteRecords: [],
      orders: [],
      toDo: []
    }
  }

  const stores = await fetchStores(orgId)
  const store = stores.find((entry) => entry.id === storeId)
  if (!store) {
    return {
      store: { id: storeId },
      storeSettings: null,
      inventoryBatches: [],
      wasteRecords: [],
      orders: [],
      toDo: []
    }
  }

  const storeBase = doc(
    db,
    "organizations",
    orgId,
    "regions",
    store.regionId,
    "districts",
    store.districtId,
    "stores",
    store.id
  )

  const [storeSnap, settingsSnap, batchesSnap, wasteSnap, ordersSnap, todoSnap] = await Promise.all([
    getDoc(storeBase),
    getDoc(doc(storeBase, "settings", "default")),
    getDocs(query(collection(storeBase, "inventoryBatches"), limit(2000))),
    getDocs(query(collection(storeBase, "wasteRecords"), limit(2000))),
    getDocs(query(collection(storeBase, "orders"), limit(2000))),
    getDocs(query(collection(storeBase, "toDo"), limit(2000)))
  ])

  return {
    store: {
      id: store.id,
      regionId: store.regionId,
      districtId: store.districtId,
      ...(storeSnap.exists() ? (storeSnap.data() as Record<string, unknown>) : {})
    },
    storeSettings: settingsSnap.exists() ? (settingsSnap.data() as Record<string, unknown>) : null,
    inventoryBatches: batchesSnap.docs.map((batch) => ({ id: batch.id, ...(batch.data() as Record<string, unknown>) })),
    wasteRecords: wasteSnap.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Record<string, unknown>) })),
    orders: ordersSnap.docs.map((order) => ({ id: order.id, ...(order.data() as Record<string, unknown>) })),
    toDo: todoSnap.docs.map((todo) => ({ id: todo.id, ...(todo.data() as Record<string, unknown>) }))
  }
}

export type SiteFaqEntry = {
  id: string
  question: string
  answer: string
}

export type PublicSiteContentRecord = {
  id: string
  privacyContent: string
  termsContent: string
  contactEmail: string
  contactPhone: string
  faq: SiteFaqEntry[]
  featureRequestCategories: string[]
  updatedAt?: unknown
  updatedBy?: string
}

export type StripePlanOverrideRecord = {
  id: string
  priceId: string
  productId?: string
  productName?: string
  displayName?: string
  description?: string
  trialMode: "none" | "fixed" | "indefinite"
  trialDays?: number | null
  trialEndBehavior: "halt" | "grace_2_days" | "grace_7_days"
  saleEnabled: boolean
  saleLabel?: string
  updatedAt?: unknown
  updatedBy?: string
}

export type ContactInquiryRecord = {
  id: string
  email: string
  subject: string
  content: string
  status: "new" | "reviewed" | "closed"
  createdAt?: unknown
}

export type FeatureRequestRecord = {
  id: string
  title: string
  content: string
  email?: string
  uid?: string
  category?: string
  source?: string
  organizationId?: string
  organizationName?: string
  storeId?: string
  createdByName?: string
  createdByRole?: string
  createdByJobTitle?: string
  createdByEmployeeId?: string
  createdByIsOwner?: boolean
  status: "new" | "planned" | "shipped" | "closed"
  createdAt?: unknown
}

function normalizeFaq(raw: unknown): SiteFaqEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry, index) => {
      const data = (entry ?? {}) as Record<string, unknown>
      const question = asString(data.question) ?? ""
      const answer = asString(data.answer) ?? ""
      if (!question && !answer) return null
      return {
        id: asString(data.id) ?? `faq_${index + 1}`,
        question,
        answer
      } satisfies SiteFaqEntry
    })
    .filter((entry): entry is SiteFaqEntry => Boolean(entry))
}

function normalizeFeatureRequestCategories(raw: unknown): string[] {
  const defaults = ["workflow", "inventory", "analytics", "account", "other"]
  if (!Array.isArray(raw)) return defaults
  const cleaned = Array.from(
    new Set(
      raw
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean)
    )
  ).slice(0, 50)
  return cleaned.length > 0 ? cleaned : defaults
}

export async function fetchPublicSiteContent(): Promise<PublicSiteContentRecord> {
  if (!db) {
    return {
      id: "default",
      privacyContent: "",
      termsContent: "",
      contactEmail: "",
      contactPhone: "",
      faq: [],
      featureRequestCategories: ["workflow", "inventory", "analytics", "account", "other"]
    }
  }
  const snap = await getDoc(doc(db, "siteContent", "public")).catch(() => null)
  const data = (snap?.data() as Record<string, unknown> | undefined) ?? {}
  return {
    id: "public",
    privacyContent:
      asString(data.privacyContent) ??
      "We protect your account and operational data using least-privilege access and encrypted transport.",
    termsContent:
      asString(data.termsContent) ??
      "By using InvenTraker, you agree to operate within your organization permissions and applicable food safety policies.",
    contactEmail: asString(data.contactEmail) ?? "support@inventraker.com",
    contactPhone: asString(data.contactPhone) ?? "(000) 000-0000",
    faq: normalizeFaq(data.faq),
    featureRequestCategories: normalizeFeatureRequestCategories(data.featureRequestCategories),
    updatedAt: data.updatedAt,
    updatedBy: asString(data.updatedBy)
  }
}

export async function savePublicSiteContent(
  actorUid: string,
  patch: Partial<Omit<PublicSiteContentRecord, "id">>
): Promise<void> {
  if (!db) return
  const callablePayload: {
    privacyContent?: string
    termsContent?: string
    contactEmail?: string
    contactPhone?: string
    faq?: SiteFaqEntry[]
    featureRequestCategories?: string[]
  } = {}
  if ("privacyContent" in patch) callablePayload.privacyContent = patch.privacyContent ?? ""
  if ("termsContent" in patch) callablePayload.termsContent = patch.termsContent ?? ""
  if ("contactEmail" in patch) callablePayload.contactEmail = patch.contactEmail ?? ""
  if ("contactPhone" in patch) callablePayload.contactPhone = patch.contactPhone ?? ""
  if ("faq" in patch) callablePayload.faq = patch.faq ?? []
  if ("featureRequestCategories" in patch) {
    callablePayload.featureRequestCategories = normalizeFeatureRequestCategories(patch.featureRequestCategories)
  }

  let callableError: unknown = null
  try {
    const result = await savePublicSiteContentByCallable(callablePayload)
    if (result?.ok) return
  } catch (error) {
    callableError = error
  }

  try {
    await setDoc(
      doc(db, "siteContent", "public"),
      Object.assign(
        {
          updatedBy: actorUid,
          updatedAt: serverTimestamp()
        },
        "privacyContent" in patch ? { privacyContent: patch.privacyContent ?? null } : {},
        "termsContent" in patch ? { termsContent: patch.termsContent ?? null } : {},
        "contactEmail" in patch ? { contactEmail: patch.contactEmail ?? null } : {},
        "contactPhone" in patch ? { contactPhone: patch.contactPhone ?? null } : {},
        "faq" in patch ? { faq: patch.faq ?? [] } : {},
        "featureRequestCategories" in patch
          ? { featureRequestCategories: normalizeFeatureRequestCategories(patch.featureRequestCategories) }
          : {}
      ),
      { merge: true }
    )
  } catch (directWriteError) {
    throw directWriteError ?? callableError ?? new Error("Failed to save public content.")
  }
}

export async function createContactInquiry(input: {
  email: string
  subject: string
  content: string
  organizationId?: string
  storeId?: string
}): Promise<string> {
  if (!db) return ""
  const ref = doc(collection(db, "contactInquiries"))
  await setDoc(ref, {
    email: input.email.trim(),
    subject: input.subject.trim(),
    content: input.content.trim(),
    organizationId: input.organizationId ?? null,
    storeId: input.storeId ?? null,
    status: "new",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return ref.id
}

export async function fetchContactInquiries(): Promise<ContactInquiryRecord[]> {
  if (!db) return []
  const snap = await getDocs(query(collection(db, "contactInquiries"), orderBy("createdAt", "desc"), limit(1000)))
  return snap.docs.map((entry) => {
    const data = entry.data() as Record<string, unknown>
    return {
      id: entry.id,
      email: asString(data.email) ?? "",
      subject: asString(data.subject) ?? "",
      content: asString(data.content) ?? "",
      status:
        data.status === "reviewed" || data.status === "closed" || data.status === "new"
          ? data.status
          : "new",
      createdAt: data.createdAt
    } satisfies ContactInquiryRecord
  })
}

export async function createFeatureRequest(input: {
  title: string
  content: string
  email?: string
  uid?: string
  category?: string
  source?: string
  organizationId?: string
  organizationName?: string
  storeId?: string
  createdByName?: string
  createdByRole?: string
  createdByJobTitle?: string
  createdByEmployeeId?: string
  createdByIsOwner?: boolean
}): Promise<string> {
  if (!db) return ""
  const ref = doc(collection(db, "featureRequests"))
  await setDoc(ref, {
    title: input.title.trim(),
    content: input.content.trim(),
    category: (input.category ?? "other").trim().toLowerCase(),
    source: (input.source ?? "web").trim().toLowerCase(),
    email: input.email ?? null,
    uid: input.uid ?? null,
    organizationId: input.organizationId ?? null,
    organizationName: input.organizationName ?? null,
    storeId: input.storeId ?? null,
    createdByName: input.createdByName ?? null,
    createdByRole: input.createdByRole ?? null,
    createdByJobTitle: input.createdByJobTitle ?? null,
    createdByEmployeeId: input.createdByEmployeeId ?? null,
    createdByIsOwner: input.createdByIsOwner === true,
    status: "new",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return ref.id
}

export async function fetchFeatureRequests(): Promise<FeatureRequestRecord[]> {
  if (!db) return []
  const snap = await getDocs(query(collection(db, "featureRequests"), orderBy("createdAt", "desc"), limit(1000)))
  return snap.docs.map((entry) => {
    const data = entry.data() as Record<string, unknown>
    const content = asString(data.content) ?? asString(data.details) ?? ""
    const email = asString(data.email) ?? asString(data.createdByEmail) ?? undefined
    const uid = asString(data.uid) ?? asString(data.createdByUid) ?? undefined
    const createdByRole = asString(data.createdByRole) ?? undefined
    return {
      id: entry.id,
      title: asString(data.title) ?? "",
      content,
      email,
      uid,
      category: asString(data.category) ?? "other",
      source: asString(data.source) ?? undefined,
      organizationId: asString(data.organizationId) ?? undefined,
      organizationName: asString(data.organizationName) ?? undefined,
      storeId: asString(data.storeId) ?? undefined,
      createdByName: asString(data.createdByName) ?? asString(data.displayName) ?? undefined,
      createdByRole,
      createdByJobTitle: asString(data.createdByJobTitle) ?? undefined,
      createdByEmployeeId: asString(data.createdByEmployeeId) ?? undefined,
      createdByIsOwner:
        typeof data.createdByIsOwner === "boolean"
          ? data.createdByIsOwner
          : createdByRole?.toLowerCase() === "owner",
      status:
        data.status === "planned" || data.status === "shipped" || data.status === "closed" || data.status === "new"
          ? data.status
          : "new",
      createdAt: data.createdAt
    } satisfies FeatureRequestRecord
  })
}

export async function updateFeatureRequestStatus(
  requestId: string,
  status: FeatureRequestRecord["status"]
): Promise<void> {
  if (!db || !requestId.trim()) return
  await updateDoc(doc(db, "featureRequests", requestId.trim()), {
    status,
    updatedAt: serverTimestamp()
  })
}

export async function fetchStripePlanOverrides(): Promise<StripePlanOverrideRecord[]> {
  if (!db) return []
  const snap = await getDocs(query(collection(db, "stripePlanOverrides"), limit(500)))
  return snap.docs.map((entry) => {
    const data = entry.data() as Record<string, unknown>
    return {
      id: entry.id,
      priceId: asString(data.priceId) ?? entry.id,
      productId: asString(data.productId) ?? undefined,
      productName: asString(data.productName) ?? undefined,
      displayName: asString(data.displayName) ?? undefined,
      description: asString(data.description) ?? undefined,
      trialMode:
        data.trialMode === "fixed" || data.trialMode === "indefinite" || data.trialMode === "none"
          ? data.trialMode
          : "none",
      trialDays: Number.isFinite(Number(data.trialDays)) ? Number(data.trialDays) : null,
      trialEndBehavior:
        data.trialEndBehavior === "grace_2_days" || data.trialEndBehavior === "grace_7_days" || data.trialEndBehavior === "halt"
          ? data.trialEndBehavior
          : "halt",
      saleEnabled: data.saleEnabled === true,
      saleLabel: asString(data.saleLabel) ?? undefined,
      updatedAt: data.updatedAt,
      updatedBy: asString(data.updatedBy) ?? undefined
    } satisfies StripePlanOverrideRecord
  })
}

export async function upsertStripePlanOverride(
  actorUid: string,
  override: StripePlanOverrideRecord
): Promise<void> {
  if (!db) return
  const ref = doc(db, "stripePlanOverrides", override.priceId)
  await setDoc(
    ref,
    {
      priceId: override.priceId,
      productId: override.productId ?? null,
      productName: override.productName ?? null,
      displayName: override.displayName ?? null,
      description: override.description ?? null,
      trialMode: override.trialMode,
      trialDays: override.trialDays ?? null,
      trialEndBehavior: override.trialEndBehavior,
      saleEnabled: override.saleEnabled,
      saleLabel: override.saleLabel ?? null,
      updatedBy: actorUid,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  )
}

function normalizeHealthCheckQuestionType(raw: unknown): HealthCheckQuestionType {
  const type = typeof raw === "string" ? raw.trim().toLowerCase() : ""
  switch (type) {
    case "multiple_choice":
    case "multiple_select":
    case "number":
    case "true_false":
    case "insights_metric":
    case "expiration_metric":
    case "transfer_metric":
      return type
    default:
      return "text"
  }
}

function normalizeHealthCheckQuestion(id: string, data: Record<string, unknown>): HealthCheckQuestionRecord {
  return {
    id,
    prompt: asString(data.prompt) ?? "",
    inputType: normalizeHealthCheckQuestionType(data.inputType),
    required: data.required === undefined ? true : Boolean(data.required),
    options: asStringArray(data.options),
    metricKey: asString(data.metricKey)
  }
}

function normalizeHealthCheckForm(id: string, data: Record<string, unknown>): HealthCheckFormRecord {
  const rawQuestions = Array.isArray(data.questions) ? data.questions : []
  const questions = rawQuestions
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null
      const questionData = entry as Record<string, unknown>
      const questionId = asString(questionData.id) ?? `q_${index + 1}`
      return normalizeHealthCheckQuestion(questionId, questionData)
    })
    .filter((entry): entry is HealthCheckQuestionRecord => Boolean(entry))

  return {
    id,
    organizationId: asString(data.organizationId) ?? "",
    title: asString(data.title) ?? "Untitled Health Check",
    description: asString(data.description),
    scope: data.scope === "store" ? "store" : "organization",
    storeId: asString(data.storeId),
    roleTargets: asStringArray(data.roleTargets),
    departmentTargets: asStringArray(data.departmentTargets),
    questions,
    isActive: data.isActive === undefined ? true : Boolean(data.isActive),
    createdAt: data.createdAt,
    createdBy: asString(data.createdBy),
    updatedAt: data.updatedAt,
    updatedBy: asString(data.updatedBy)
  }
}

export async function fetchHealthChecks(orgId: string, storeId?: string): Promise<HealthCheckFormRecord[]> {
  if (!db || !orgId) return []
  const snap = await getDocs(
    query(collection(db, "organizations", orgId, "healthChecks"), orderBy("updatedAt", "desc"), limit(300))
  ).catch(() => null)
  if (!snap) return []

  const forms = snap.docs.map((entry) =>
    normalizeHealthCheckForm(entry.id, entry.data() as Record<string, unknown>)
  )

  return forms
    .filter((form) => {
      if (form.scope === "organization") return true
      if (!storeId) return true
      return (form.storeId ?? "").trim() === storeId.trim()
    })
    .sort((left, right) => {
      const leftUpdated = asTimestampDate(left.updatedAt)?.getTime() ?? 0
      const rightUpdated = asTimestampDate(right.updatedAt)?.getTime() ?? 0
      return rightUpdated - leftUpdated
    })
}

export async function saveHealthCheckForm(orgId: string, input: SaveHealthCheckFormInput): Promise<string> {
  if (!db || !orgId || !input.actorUid) return ""
  const ref = input.id
    ? doc(db, "organizations", orgId, "healthChecks", input.id)
    : doc(collection(db, "organizations", orgId, "healthChecks"))
  const existingCreatedAt = input.id
    ? (await getDoc(ref).catch(() => null))?.data()?.createdAt
    : undefined

  const normalizedQuestions = input.questions
    .map((question, index) => ({
      id: question.id?.trim() || `q_${index + 1}`,
      prompt: question.prompt.trim(),
      inputType: normalizeHealthCheckQuestionType(question.inputType),
      required: question.required !== false,
      options: question.options.map((entry) => entry.trim()).filter(Boolean),
      metricKey: question.metricKey?.trim() || null
    }))
    .filter((question) => question.prompt.length > 0)

  await setDoc(
    ref,
    {
      organizationId: orgId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      scope: input.scope === "store" ? "store" : "organization",
      storeId: input.scope === "store" ? input.storeId?.trim() || null : null,
      roleTargets: Array.from(new Set(input.roleTargets.map((entry) => entry.trim()).filter(Boolean))),
      departmentTargets: Array.from(new Set(input.departmentTargets.map((entry) => entry.trim()).filter(Boolean))),
      questions: normalizedQuestions,
      isActive: input.isActive,
      createdBy: input.actorUid,
      createdAt: input.id ? existingCreatedAt ?? serverTimestamp() : serverTimestamp(),
      updatedBy: input.actorUid,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  )

  return ref.id
}

export async function deleteHealthCheckForm(orgId: string, formId: string): Promise<void> {
  if (!db || !orgId || !formId) return
  await deleteDoc(doc(db, "organizations", orgId, "healthChecks", formId))
}

export async function submitHealthCheckResponse(
  orgId: string,
  storeId: string,
  form: Pick<HealthCheckFormRecord, "id" | "title">,
  answers: Record<string, unknown>,
  actor: {
    uid: string
    name?: string
    roleTitle?: string
    departmentNames?: string[]
  }
): Promise<string> {
  if (!db || !orgId || !storeId || !actor.uid) return ""
  const stores = await fetchStores(orgId).catch(() => [] as StoreWithPath[])
  const resolvedStore = stores.find((entry) => entry.id === storeId)
  const responseCollection = resolvedStore
    ? storeCollectionPath(orgId, resolvedStore, "healthCheckResponses")
    : collection(db, "organizations", orgId, "stores", storeId, "healthCheckResponses")
  const ref = doc(responseCollection)
  await setDoc(
    ref,
    {
      organizationId: orgId,
      storeId,
      healthCheckId: form.id,
      healthCheckTitle: form.title,
      answers,
      submittedByUid: actor.uid,
      submittedByName: actor.name ?? null,
      roleTitle: actor.roleTitle ?? null,
      departmentNames: actor.departmentNames ?? [],
      submittedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  )
  return ref.id
}

export async function fetchHealthCheckResponses(
  orgId: string,
  storeId?: string
): Promise<HealthCheckResponseRecord[]> {
  if (!db || !orgId) return []
  const stores = storeId
    ? (await fetchStores(orgId).catch(() => [] as StoreWithPath[])).filter((entry) => entry.id === storeId)
    : await fetchStores(orgId).catch(() => [] as StoreWithPath[])
  const rows: HealthCheckResponseRecord[] = []

  await Promise.all(
    stores.map(async (store) => {
      const snap = await getDocs(
        query(
          storeCollectionPath(orgId, store, "healthCheckResponses"),
          orderBy("submittedAt", "desc"),
          limit(300)
        )
      ).catch(() => null)
      for (const entry of snap?.docs ?? []) {
        const data = entry.data() as Record<string, unknown>
        rows.push({
          id: entry.id,
          organizationId: asString(data.organizationId) ?? orgId,
          storeId: asString(data.storeId) ?? store.id,
          healthCheckId: asString(data.healthCheckId) ?? "",
          healthCheckTitle: asString(data.healthCheckTitle) ?? "Health Check",
          answers: data.answers && typeof data.answers === "object" ? (data.answers as Record<string, unknown>) : {},
          submittedByUid: asString(data.submittedByUid),
          submittedByName: asString(data.submittedByName),
          roleTitle: asString(data.roleTitle),
          departmentNames: asStringArray(data.departmentNames),
          submittedAt: data.submittedAt
        })
      }
    })
  )

  return rows.sort((left, right) => {
    const leftTime = asTimestampDate(left.submittedAt)?.getTime() ?? 0
    const rightTime = asTimestampDate(right.submittedAt)?.getTime() ?? 0
    return rightTime - leftTime
  })
}

export const modulePathMap: Record<AppModule, string> = {
  dashboard: "/app",
  inventory: "/app/inventory",
  healthChecks: "/app/health-checks",
  expiration: "/app/expiration",
  waste: "/app/waste",
  orders: "/app/orders",
  todo: "/app/todo",
  notifications: "/app/notifications",
  insights: "/app/insights",
  production: "/app/production",
  howtos: "/app/howtos",
  stores: "/app/stores",
  users: "/app/users",
  orgSettings: "/app/org-settings",
  storeSettings: "/app/store-settings",
  account: "/app/account",
  settings: "/app/settings",
  admin: "/admin"
}
