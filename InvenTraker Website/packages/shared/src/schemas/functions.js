import { z } from "zod";
import { platforms, recommendationDomains } from "../enums.js";
import { platformPreferenceProfileSchema } from "./domain.js";
import { orderRecommendationSchema, productionRecommendationSchema, productionPlanSchema, recommendationResponseMetaSchema } from "./recommendations.js";
export const listMyOrganizationsRequestSchema = z.object({}).default({});
export const listMyOrganizationsResponseSchema = z.object({
    organizations: z.array(z.object({
        organizationId: z.string(),
        organizationName: z.string(),
        role: z.enum(["Owner", "Manager", "Staff"]),
        storeIds: z.array(z.string()).default([]),
        departmentIds: z.array(z.string()).default([]).optional(),
        locationIds: z.array(z.string()).default([]).optional(),
        permissionFlags: z.record(z.boolean()).optional()
    })),
    isPlatformAdmin: z.boolean().default(false)
});
export const ensurePlatformPreferenceProfileRequestSchema = z.object({
    userId: z.string().min(1),
    orgId: z.string().min(1),
    platform: z.enum(platforms)
});
export const ensurePlatformPreferenceProfileResponseSchema = z.object({
    profileId: z.string(),
    profile: platformPreferenceProfileSchema,
    source: z.enum(["existing", "cloned", "default"])
});
const howtoDraftBlockSchema = z.object({
    type: z.enum(["text", "photo", "video"]),
    text: z.string().optional(),
    mediaAssetId: z.string().optional(),
    orderIndex: z.number().int().min(0)
});
export const howtoDraftStepSchema = z.object({
    stepNumber: z.number().int().min(1),
    title: z.string().optional(),
    blocks: z.array(howtoDraftBlockSchema)
});
export const pdfToHowtoDraftRequestSchema = z.object({
    orgId: z.string().min(1),
    storeId: z.string().optional(),
    pdfAssetId: z.string().min(1)
});
export const pdfToHowtoDraftResponseSchema = z.object({
    ok: z.boolean(),
    fallback: z.boolean().default(false),
    reason: z.string().optional(),
    suggestedTitle: z.string().optional(),
    steps: z.array(howtoDraftStepSchema)
});
export const generateOrderSuggestionsRequestSchema = z.object({
    orgId: z.string().min(1),
    storeId: z.string().min(1),
    vendorId: z.string().optional()
});
const generateOrderSuggestionLineSchema = z.object({
    itemId: z.string(),
    suggestedQty: z.number(),
    unit: z.enum(["each", "lbs"]),
    rationale: z.string(),
    caseRounded: z.boolean(),
    onHand: z.number(),
    minQuantity: z.number()
});
export const generateOrderSuggestionsResponseSchema = z.object({
    orderId: z.string(),
    lines: z.array(generateOrderSuggestionLineSchema),
    todosCreated: z.number().int().min(0),
    summary: z.string().optional(),
    riskAlerts: z.array(z.string()).optional(),
    questionsForManager: z.array(z.string()).optional(),
    recommendationMeta: recommendationResponseMetaSchema.optional()
});
export const getStoreRecommendationsRequestSchema = z.object({
    orgId: z.string().min(1),
    storeId: z.string().min(1),
    vendorId: z.string().optional(),
    windowStart: z.string().datetime().optional(),
    windowEnd: z.string().datetime().optional(),
    domains: z.array(z.enum(recommendationDomains)).min(1).default(["orders", "production"]),
    productionPlanOptions: z
        .object({
        businessFactor: z.number().min(0.6).max(1.6).optional(),
        includeNonFrozen: z.boolean().optional()
    })
        .optional(),
    forceRefresh: z.boolean().default(false)
});
export const getStoreRecommendationsResponseSchema = z.object({
    meta: recommendationResponseMetaSchema,
    orderRecommendations: z.array(orderRecommendationSchema).default([]),
    productionRecommendations: z.array(productionRecommendationSchema).default([]),
    productionPlan: productionPlanSchema.default({
        ingredientDemandRows: [],
        frozenPullForecastRows: [],
        factors: {
            businessFactor: 1,
            weatherFactor: 1,
            holidayFactor: 1,
            trendFactor: 1
        }
    }),
    questions: z.array(z.string()).default([])
});
export const commitOrderRecommendationsRequestSchema = z.object({
    orgId: z.string().min(1),
    storeId: z.string().min(1),
    runId: z.string().min(1),
    vendorId: z.string().optional(),
    selectedLines: z
        .array(z.object({
        itemId: z.string().min(1),
        finalQuantity: z.number().min(0),
        unit: z.enum(["each", "lbs"]).optional(),
        rationaleSummary: z.string().optional()
    }))
        .default([])
});
export const commitOrderRecommendationsResponseSchema = z.object({
    orderId: z.string(),
    lineCount: z.number().int().min(0),
    todosCreated: z.number().int().min(0),
    runId: z.string(),
    engineVersion: recommendationResponseMetaSchema.shape.engineVersion,
    appliedFromRun: z.boolean().default(true)
});
export const computeFinancialHealthRequestSchema = z.object({
    orgId: z.string().min(1),
    storeId: z.string().optional(),
    expiringDays: z.number().int().positive().max(30).default(7)
});
export const computeFinancialHealthResponseSchema = z.object({
    inventoryValue: z.number(),
    wasteCostWeek: z.number(),
    wasteCostMonth: z.number(),
    expiringSoonValue: z.number(),
    overstocked: z.array(z.object({
        itemId: z.string(),
        itemName: z.string(),
        onHand: z.number(),
        minQuantity: z.number()
    }))
});
export const adminSafeEditRequestSchema = z.object({
    orgId: z.string().min(1),
    targetType: z.enum(["item", "mediaAsset", "member"]),
    targetId: z.string().min(1),
    patch: z.record(z.any()),
    storeId: z.string().optional()
});
export const adminSafeEditResponseSchema = z.object({
    ok: z.boolean(),
    targetPath: z.string(),
    auditLogId: z.string()
});
export const adminListOrganizationsRequestSchema = z.object({
    q: z.string().optional(),
    limit: z.number().int().min(1).max(200).default(50)
});
const adminOrgSummarySchema = z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    createdAt: z.any().optional(),
    planId: z.string().optional()
});
export const adminListOrganizationsResponseSchema = z.object({
    organizations: z.array(adminOrgSummarySchema)
});
export const adminOrganizationDetailRequestSchema = z.object({
    orgId: z.string().min(1)
});
export const adminOrganizationDetailResponseSchema = z.object({
    organization: z.record(z.any()),
    organizationSettings: z.record(z.any()).nullable().optional(),
    items: z.array(z.record(z.any())),
    members: z.array(z.record(z.any()))
});
export const adminStoreDetailRequestSchema = z.object({
    orgId: z.string().min(1),
    storeId: z.string().min(1)
});
export const adminStoreDetailResponseSchema = z.object({
    store: z.record(z.any()),
    storeSettings: z.record(z.any()).nullable().optional(),
    inventoryBatches: z.array(z.record(z.any())),
    wasteRecords: z.array(z.record(z.any())),
    orders: z.array(z.record(z.any())),
    toDo: z.array(z.record(z.any()))
});
export const adminAuditLogsRequestSchema = z.object({
    orgId: z.string().min(1),
    limit: z.number().int().min(1).max(500).default(200)
});
export const adminAuditLogsResponseSchema = z.object({
    logs: z.array(z.record(z.any()))
});
export const claimOrganizationByCompanyCodeRequestSchema = z.object({
    companyCode: z.string().min(1),
    employeeId: z.string().min(1)
});
export const claimOrganizationByCompanyCodeResponseSchema = z.object({
    orgId: z.string(),
    orgName: z.string(),
    role: z.enum(["Owner", "Manager", "Staff"])
});
export const listPublicStripePlansRequestSchema = z.object({}).default({});
const publicStripePlanPriceSchema = z.object({
    priceId: z.string(),
    unitAmount: z.number().nonnegative(),
    currency: z.string(),
    interval: z.string(),
    intervalCount: z.number().int().positive(),
    trialPeriodDays: z.number().int().nonnegative().nullable()
});
export const publicStripePlanSchema = z.object({
    productId: z.string(),
    name: z.string(),
    description: z.string().default(""),
    active: z.boolean(),
    prices: z.array(publicStripePlanPriceSchema)
});
export const listPublicStripePlansResponseSchema = z.object({
    plans: z.array(publicStripePlanSchema)
});
