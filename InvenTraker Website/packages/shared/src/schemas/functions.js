import { z } from "zod";
import { platformPreferenceProfileSchema } from "./domain";
import { platforms } from "../enums";
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
export const pdfToHowtoDraftRequestSchema = z.object({
    orgId: z.string().min(1),
    storeId: z.string().optional(),
    pdfAssetId: z.string().min(1)
});
export const howtoDraftStepSchema = z.object({
    stepNumber: z.number().int().min(1),
    title: z.string().optional(),
    blocks: z.array(z.object({
        type: z.enum(["text", "photo", "video"]),
        text: z.string().optional(),
        mediaAssetId: z.string().optional(),
        orderIndex: z.number().int().min(0)
    }))
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
export const generateOrderSuggestionLineSchema = z.object({
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
    todosCreated: z.number().int().min(0)
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
export const adminListOrganizationsResponseSchema = z.object({
    organizations: z.array(z.object({
        id: z.string(),
        name: z.string(),
        status: z.string(),
        createdAt: z.any(),
        planId: z.string().optional()
    }))
});
