import { z } from "zod"
import { auditActions, exportDatasets, memberRoles, orderStatuses, platforms, todoStatuses, todoTypes, units } from "../enums.js"

export const timestampSchema = z.union([z.date(), z.string(), z.number()])

export const userSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  createdAt: timestampSchema,
  platformRoles: z.object({ platformAdmin: z.boolean().default(false) }),
  lastLoginAt: timestampSchema.optional(),
  defaultOrganizationId: z.string().optional()
})

export const organizationSchema = z.object({
  name: z.string().min(1),
  createdAt: timestampSchema,
  status: z.enum(["active", "trial", "suspended", "archived"]),
  planId: z.string(),
  subscription: z.object({
    status: z.enum(["active", "trial", "past_due", "canceled"]),
    startedAt: timestampSchema,
    renewsAt: timestampSchema
  }),
  ownerUserIds: z.array(z.string()),
  metricsCache: z.record(z.any()).optional()
})

export const memberSchema = z.object({
  role: z.enum(memberRoles),
  storeIds: z.array(z.string()).default([]),
  createdAt: timestampSchema,
  organizationId: z.string()
})

export const regionSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1)
})

export const districtSchema = z.object({
  organizationId: z.string(),
  regionId: z.string(),
  name: z.string().min(1)
})

export const storeSchema = z.object({
  organizationId: z.string(),
  regionId: z.string(),
  districtId: z.string(),
  name: z.string().min(1),
  status: z.enum(["active", "inactive", "opening", "closed"]),
  lastSyncAt: timestampSchema.optional(),
  financialCache: z.record(z.any()).optional()
})

export const departmentSchema = z.object({
  organizationId: z.string(),
  storeId: z.string(),
  name: z.string().min(1)
})

export const locationSchema = z.object({
  organizationId: z.string(),
  storeId: z.string(),
  name: z.string().min(1),
  departmentId: z.string().optional()
})

export const categoryConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  appliesTo: z.array(z.enum(exportDatasets)).default(["inventory", "orders", "waste"]),
  custom: z.boolean().default(true),
  enabled: z.boolean().default(true)
})

export const spreadsheetExportColumnSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  path: z.string().min(1),
  enabled: z.boolean().default(true),
  order: z.number().int().min(0),
  categoryId: z.string().optional(),
  custom: z.boolean().default(false)
})

export const spreadsheetExportPreferenceSchema = z.object({
  dataset: z.enum(exportDatasets),
  columns: z.array(spreadsheetExportColumnSchema).default([]),
  includeGeneratedAt: z.boolean().default(true),
  includeStoreInfo: z.boolean().default(true),
  fileNameTemplate: z.string().optional()
})

export const vendorSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1),
  orderingDays: z.array(z.number().int().min(0).max(6)),
  cutoffTimeLocal: z.string().regex(/^\d{2}:\d{2}$/),
  leadDays: z.number().int().min(0).default(0),
  contactInfo: z.string().optional()
})

export const itemSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1),
  upc: z.string().optional(),
  unit: z.enum(units),
  hasExpiration: z.boolean().default(true),
  defaultExpirationDays: z.number().int().min(0),
  minQuantity: z.number().min(0),
  qtyPerCase: z.number().min(0),
  caseSize: z.number().min(0),
  price: z.number().min(0),
  vendorId: z.string().optional(),
  departmentId: z.string().optional(),
  locationId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  archived: z.boolean().default(false),
  weeklyUsage: z.number().min(0).optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export const inventoryBatchSchema = z.object({
  organizationId: z.string(),
  storeId: z.string(),
  itemId: z.string(),
  quantity: z.number(),
  unit: z.enum(units),
  expiresAt: timestampSchema,
  lot: z.string().optional(),
  source: z.enum(["received", "spotcheck", "manual"]),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export const wasteRecordSchema = z.object({
  organizationId: z.string(),
  storeId: z.string(),
  itemId: z.string(),
  quantity: z.number().min(0),
  unit: z.enum(units),
  costAtTime: z.number().min(0).optional(),
  reason: z.string().min(1),
  createdAt: timestampSchema,
  createdBy: z.string()
})

export const orderSchema = z.object({
  organizationId: z.string(),
  storeId: z.string(),
  vendorId: z.string(),
  status: z.enum(orderStatuses),
  createdAt: timestampSchema,
  createdBy: z.string(),
  vendorCutoffAt: timestampSchema.optional()
})

export const orderLineSchema = z.object({
  organizationId: z.string(),
  storeId: z.string(),
  itemId: z.string(),
  suggestedQty: z.number().min(0),
  finalQty: z.number().min(0),
  unit: z.enum(units),
  rationale: z.string(),
  caseRounded: z.boolean()
})

export const toDoItemSchema = z.object({
  organizationId: z.string(),
  storeId: z.string(),
  type: z.enum(todoTypes),
  title: z.string(),
  dueAt: timestampSchema,
  status: z.enum(todoStatuses),
  createdAt: timestampSchema,
  createdBy: z.string()
})

export const productionProductSchema = z.object({
  organizationId: z.string(),
  name: z.string(),
  yieldQuantity: z.number().min(0),
  yieldUnit: z.enum(units),
  storeScoped: z.boolean(),
  storeId: z.string().optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export const productionIngredientSchema = z.object({
  organizationId: z.string(),
  productId: z.string(),
  itemId: z.string(),
  quantity: z.number().min(0),
  unit: z.enum(units)
})

export const howToGuideSchema = z.object({
  organizationId: z.string(),
  title: z.string().min(1),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
  scope: z.enum(["org", "store"]),
  storeId: z.string().nullable(),
  version: z.number().int().min(1),
  updatedAt: timestampSchema,
  updatedBy: z.string(),
  createdAt: timestampSchema,
  createdBy: z.string()
})

export const howToStepSchema = z.object({
  organizationId: z.string(),
  stepNumber: z.number().int().min(1),
  title: z.string().optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export const howToStepBlockSchema = z.object({
  organizationId: z.string(),
  type: z.enum(["text", "photo", "video"]),
  text: z.string().optional(),
  mediaAssetId: z.string().optional(),
  orderIndex: z.number().int().min(0)
})

export const mediaAssetSchema = z.object({
  organizationId: z.string(),
  storeId: z.string().optional(),
  ownerUserId: z.string(),
  type: z.enum(["image", "video", "pdf"]),
  storagePath: z.string(),
  contentType: z.string(),
  originalName: z.string(),
  sizeBytes: z.number().int().min(0),
  createdAt: timestampSchema
})

export const auditLogSchema = z.object({
  actorUserId: z.string(),
  actorRoleSnapshot: z.union([z.enum(memberRoles), z.literal("PlatformAdmin")]),
  organizationId: z.string().nullable(),
  storeId: z.string().nullable(),
  targetPath: z.string(),
  action: z.enum(auditActions),
  before: z.record(z.any()).optional(),
  after: z.record(z.any()).optional(),
  createdAt: timestampSchema
})

export const platformPreferenceProfileSchema = z.object({
  userId: z.string(),
  organizationId: z.string(),
  platform: z.enum(platforms),
  theme: z.enum(["light", "dark", "system"]),
  accentColor: z.string(),
  boldText: z.boolean(),
  showTips: z.boolean().default(true),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
})

export type UserDoc = z.infer<typeof userSchema>
export type OrganizationDoc = z.infer<typeof organizationSchema>
export type MemberDoc = z.infer<typeof memberSchema>
export type RegionDoc = z.infer<typeof regionSchema>
export type DistrictDoc = z.infer<typeof districtSchema>
export type StoreDoc = z.infer<typeof storeSchema>
export type DepartmentDoc = z.infer<typeof departmentSchema>
export type LocationDoc = z.infer<typeof locationSchema>
export type CategoryConfigDoc = z.infer<typeof categoryConfigSchema>
export type SpreadsheetExportColumnDoc = z.infer<typeof spreadsheetExportColumnSchema>
export type SpreadsheetExportPreferenceDoc = z.infer<typeof spreadsheetExportPreferenceSchema>
export type VendorDoc = z.infer<typeof vendorSchema>
export type ItemDoc = z.infer<typeof itemSchema>
export type InventoryBatchDoc = z.infer<typeof inventoryBatchSchema>
export type WasteRecordDoc = z.infer<typeof wasteRecordSchema>
export type OrderDoc = z.infer<typeof orderSchema>
export type OrderLineDoc = z.infer<typeof orderLineSchema>
export type ToDoItemDoc = z.infer<typeof toDoItemSchema>
export type ProductionProductDoc = z.infer<typeof productionProductSchema>
export type ProductionIngredientDoc = z.infer<typeof productionIngredientSchema>
export type HowToGuideDoc = z.infer<typeof howToGuideSchema>
export type HowToStepDoc = z.infer<typeof howToStepSchema>
export type HowToStepBlockDoc = z.infer<typeof howToStepBlockSchema>
export type MediaAssetDoc = z.infer<typeof mediaAssetSchema>
export type AuditLogDoc = z.infer<typeof auditLogSchema>
export type PlatformPreferenceProfileDoc = z.infer<typeof platformPreferenceProfileSchema>
