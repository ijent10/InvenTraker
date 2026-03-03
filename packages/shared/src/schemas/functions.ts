import { z } from "zod"
import { platforms } from "../enums.js"
import { platformPreferenceProfileSchema } from "./domain.js"

export const listMyOrganizationsRequestSchema = z.object({}).default({})
export type ListMyOrganizationsRequest = z.infer<typeof listMyOrganizationsRequestSchema>

export const listMyOrganizationsResponseSchema = z.object({
  organizations: z.array(
    z.object({
      organizationId: z.string(),
      organizationName: z.string(),
      role: z.enum(["Owner", "Manager", "Staff"]),
      storeIds: z.array(z.string()).default([]),
      departmentIds: z.array(z.string()).default([]).optional(),
      locationIds: z.array(z.string()).default([]).optional(),
      permissionFlags: z.record(z.boolean()).optional()
    })
  ),
  isPlatformAdmin: z.boolean().default(false)
})
export type ListMyOrganizationsResponse = z.infer<typeof listMyOrganizationsResponseSchema>

export const ensurePlatformPreferenceProfileRequestSchema = z.object({
  userId: z.string().min(1),
  orgId: z.string().min(1),
  platform: z.enum(platforms)
})
export type EnsurePlatformPreferenceProfileRequest = z.infer<
  typeof ensurePlatformPreferenceProfileRequestSchema
>

export const ensurePlatformPreferenceProfileResponseSchema = z.object({
  profileId: z.string(),
  profile: platformPreferenceProfileSchema,
  source: z.enum(["existing", "cloned", "default"])
})
export type EnsurePlatformPreferenceProfileResponse = z.infer<
  typeof ensurePlatformPreferenceProfileResponseSchema
>

const howtoDraftBlockSchema = z.object({
  type: z.enum(["text", "photo", "video"]),
  text: z.string().optional(),
  mediaAssetId: z.string().optional(),
  orderIndex: z.number().int().min(0)
})

export const howtoDraftStepSchema = z.object({
  stepNumber: z.number().int().min(1),
  title: z.string().optional(),
  blocks: z.array(howtoDraftBlockSchema)
})

export const pdfToHowtoDraftRequestSchema = z.object({
  orgId: z.string().min(1),
  storeId: z.string().optional(),
  pdfAssetId: z.string().min(1)
})
export type PdfToHowtoDraftRequest = z.infer<typeof pdfToHowtoDraftRequestSchema>

export const pdfToHowtoDraftResponseSchema = z.object({
  ok: z.boolean(),
  fallback: z.boolean().default(false),
  reason: z.string().optional(),
  suggestedTitle: z.string().optional(),
  steps: z.array(howtoDraftStepSchema)
})
export type PdfToHowtoDraftResponse = z.infer<typeof pdfToHowtoDraftResponseSchema>

export const generateOrderSuggestionsRequestSchema = z.object({
  orgId: z.string().min(1),
  storeId: z.string().min(1),
  vendorId: z.string().optional()
})
export type GenerateOrderSuggestionsRequest = z.infer<
  typeof generateOrderSuggestionsRequestSchema
>

const generateOrderSuggestionLineSchema = z.object({
  itemId: z.string(),
  suggestedQty: z.number(),
  unit: z.enum(["each", "lbs"]),
  rationale: z.string(),
  caseRounded: z.boolean(),
  onHand: z.number(),
  minQuantity: z.number()
})

export const generateOrderSuggestionsResponseSchema = z.object({
  orderId: z.string(),
  lines: z.array(generateOrderSuggestionLineSchema),
  todosCreated: z.number().int().min(0)
})
export type GenerateOrderSuggestionsResponse = z.infer<
  typeof generateOrderSuggestionsResponseSchema
>

export const computeFinancialHealthRequestSchema = z.object({
  orgId: z.string().min(1),
  storeId: z.string().optional(),
  expiringDays: z.number().int().positive().max(30).default(7)
})
export type ComputeFinancialHealthRequest = z.infer<typeof computeFinancialHealthRequestSchema>

export const computeFinancialHealthResponseSchema = z.object({
  inventoryValue: z.number(),
  wasteCostWeek: z.number(),
  wasteCostMonth: z.number(),
  expiringSoonValue: z.number(),
  overstocked: z.array(
    z.object({
      itemId: z.string(),
      itemName: z.string(),
      onHand: z.number(),
      minQuantity: z.number()
    })
  )
})
export type ComputeFinancialHealthResponse = z.infer<typeof computeFinancialHealthResponseSchema>

export const adminSafeEditRequestSchema = z.object({
  orgId: z.string().min(1),
  targetType: z.enum(["item", "mediaAsset", "member"]),
  targetId: z.string().min(1),
  patch: z.record(z.any()),
  storeId: z.string().optional()
})
export type AdminSafeEditRequest = z.infer<typeof adminSafeEditRequestSchema>

export const adminSafeEditResponseSchema = z.object({
  ok: z.boolean(),
  targetPath: z.string(),
  auditLogId: z.string()
})
export type AdminSafeEditResponse = z.infer<typeof adminSafeEditResponseSchema>

export const adminListOrganizationsRequestSchema = z.object({
  q: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50)
})
export type AdminListOrganizationsRequest = z.infer<typeof adminListOrganizationsRequestSchema>

const adminOrgSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  createdAt: z.any().optional(),
  planId: z.string().optional()
})

export const adminListOrganizationsResponseSchema = z.object({
  organizations: z.array(adminOrgSummarySchema)
})
export type AdminListOrganizationsResponse = z.infer<typeof adminListOrganizationsResponseSchema>

export const adminOrganizationDetailRequestSchema = z.object({
  orgId: z.string().min(1)
})
export type AdminOrganizationDetailRequest = z.infer<typeof adminOrganizationDetailRequestSchema>

export const adminOrganizationDetailResponseSchema = z.object({
  organization: z.record(z.any()),
  organizationSettings: z.record(z.any()).nullable().optional(),
  items: z.array(z.record(z.any())),
  members: z.array(z.record(z.any()))
})
export type AdminOrganizationDetailResponse = z.infer<typeof adminOrganizationDetailResponseSchema>

export const adminStoreDetailRequestSchema = z.object({
  orgId: z.string().min(1),
  storeId: z.string().min(1)
})
export type AdminStoreDetailRequest = z.infer<typeof adminStoreDetailRequestSchema>

export const adminStoreDetailResponseSchema = z.object({
  store: z.record(z.any()),
  storeSettings: z.record(z.any()).nullable().optional(),
  inventoryBatches: z.array(z.record(z.any())),
  wasteRecords: z.array(z.record(z.any())),
  orders: z.array(z.record(z.any())),
  toDo: z.array(z.record(z.any()))
})
export type AdminStoreDetailResponse = z.infer<typeof adminStoreDetailResponseSchema>

export const adminAuditLogsRequestSchema = z.object({
  orgId: z.string().min(1),
  limit: z.number().int().min(1).max(500).default(200)
})
export type AdminAuditLogsRequest = z.infer<typeof adminAuditLogsRequestSchema>

export const adminAuditLogsResponseSchema = z.object({
  logs: z.array(z.record(z.any()))
})
export type AdminAuditLogsResponse = z.infer<typeof adminAuditLogsResponseSchema>

export const claimOrganizationByCompanyCodeRequestSchema = z.object({
  companyCode: z.string().min(1),
  employeeId: z.string().min(1)
})
export type ClaimOrganizationByCompanyCodeRequest = z.infer<
  typeof claimOrganizationByCompanyCodeRequestSchema
>

export const claimOrganizationByCompanyCodeResponseSchema = z.object({
  orgId: z.string(),
  orgName: z.string(),
  role: z.enum(["Owner", "Manager", "Staff"])
})
export type ClaimOrganizationByCompanyCodeResponse = z.infer<
  typeof claimOrganizationByCompanyCodeResponseSchema
>

export const listPublicStripePlansRequestSchema = z.object({}).default({})
export type ListPublicStripePlansRequest = z.infer<typeof listPublicStripePlansRequestSchema>

const publicStripePlanPriceSchema = z.object({
  priceId: z.string(),
  unitAmount: z.number().nonnegative(),
  currency: z.string(),
  interval: z.string(),
  intervalCount: z.number().int().positive(),
  trialPeriodDays: z.number().int().nonnegative().nullable()
})

export const publicStripePlanSchema = z.object({
  productId: z.string(),
  name: z.string(),
  description: z.string().default(""),
  active: z.boolean(),
  prices: z.array(publicStripePlanPriceSchema)
})

export const listPublicStripePlansResponseSchema = z.object({
  plans: z.array(publicStripePlanSchema)
})
export type ListPublicStripePlansResponse = z.infer<typeof listPublicStripePlansResponseSchema>
