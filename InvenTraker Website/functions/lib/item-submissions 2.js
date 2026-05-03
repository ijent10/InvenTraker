import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "./lib/firebase.js";
import { requireAuth, requireOrgMembership, requireStoreAccess } from "./lib/auth.js";
const draftSchema = z.object({
    backendItemId: z.string().trim().min(1).max(160).optional(),
    name: z.string().trim().min(1).max(180),
    upc: z.string().trim().max(64).optional(),
    unit: z.enum(["each", "lbs"]).optional(),
    price: z.number().min(0).max(1_000_000).optional(),
    hasExpiration: z.boolean().optional(),
    defaultExpirationDays: z.number().int().min(0).max(730).optional(),
    defaultPackedExpiration: z.number().int().min(0).max(730).optional(),
    minQuantity: z.number().min(0).max(1_000_000).optional(),
    qtyPerCase: z.number().int().min(1).max(100_000).optional(),
    caseSize: z.number().min(1).max(100_000).optional(),
    vendorId: z.string().trim().max(160).optional(),
    vendorName: z.string().trim().max(180).optional(),
    departmentId: z.string().trim().max(160).optional(),
    department: z.string().trim().max(180).optional(),
    locationId: z.string().trim().max(160).optional(),
    departmentLocation: z.string().trim().max(180).optional(),
    tags: z.array(z.string().trim().max(64)).max(40).optional(),
    photoUrl: z.string().trim().url().max(2000).optional(),
    photoAssetId: z.string().trim().max(220).optional(),
    isPrepackaged: z.boolean().optional(),
    rewrapsWithUniqueBarcode: z.boolean().optional(),
    reworkItemCode: z.string().trim().max(64).optional(),
    canBeReworked: z.boolean().optional(),
    reworkShelfLifeDays: z.number().int().min(1).max(730).optional(),
    maxReworkCount: z.number().int().min(1).max(20).optional()
});
const submitSchema = z.object({
    orgId: z.string().trim().min(1),
    storeId: z.string().trim().min(1),
    scannedUpc: z.string().trim().max(64).optional(),
    note: z.string().trim().max(500).optional(),
    itemDraft: draftSchema
});
const reviewSchema = z.object({
    orgId: z.string().trim().min(1),
    submissionId: z.string().trim().min(1),
    decision: z.enum(["approved", "rejected", "promoted"]),
    reviewNote: z.string().trim().max(600).optional(),
    centralOverride: z
        .object({
        name: z.string().trim().min(1).max(180).optional(),
        upc: z.string().trim().max(64).optional(),
        defaultExpirationDays: z.number().int().min(0).max(730).optional(),
        photoUrl: z.string().trim().url().max(2000).optional(),
        photoAssetId: z.string().trim().max(220).optional()
    })
        .optional()
});
function normalizeTags(raw) {
    return Array.from(new Set((raw ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0))).slice(0, 40);
}
function normalizeUpc(raw) {
    if (!raw)
        return null;
    const compact = raw.trim().replace(/\s+/g, "");
    if (!compact)
        return null;
    const digitsOnly = compact.replace(/[^0-9]/g, "");
    if (!digitsOnly)
        return compact;
    return digitsOnly.startsWith("0") ? digitsOnly : `0${digitsOnly}`;
}
function normalizeItemDraft(input, fallbackUpc) {
    const normalizedUpc = normalizeUpc(input.upc) ?? normalizeUpc(fallbackUpc);
    return {
        backendItemId: input.backendItemId?.trim() || null,
        name: input.name.trim(),
        upc: normalizedUpc,
        unit: input.unit === "lbs" ? "lbs" : "each",
        price: typeof input.price === "number" ? Math.max(0, input.price) : 0,
        hasExpiration: input.hasExpiration !== false,
        defaultExpirationDays: input.hasExpiration === false ? 0 : Math.max(1, input.defaultExpirationDays ?? 7),
        defaultPackedExpiration: input.hasExpiration === false ? 0 : Math.max(1, input.defaultPackedExpiration ?? input.defaultExpirationDays ?? 7),
        minQuantity: Math.max(0, input.minQuantity ?? 0),
        qtyPerCase: Math.max(1, Math.round(input.qtyPerCase ?? 1)),
        caseSize: Math.max(1, input.caseSize ?? input.qtyPerCase ?? 1),
        vendorId: input.vendorId?.trim() || null,
        vendorName: input.vendorName?.trim() || null,
        departmentId: input.departmentId?.trim() || null,
        department: input.department?.trim() || null,
        locationId: input.locationId?.trim() || null,
        departmentLocation: input.departmentLocation?.trim() || null,
        tags: normalizeTags(input.tags),
        photoUrl: input.photoUrl?.trim() || null,
        photoAssetId: input.photoAssetId?.trim() || null,
        isPrepackaged: input.isPrepackaged === true,
        rewrapsWithUniqueBarcode: input.rewrapsWithUniqueBarcode === true,
        reworkItemCode: input.reworkItemCode?.trim() || null,
        canBeReworked: input.canBeReworked === true,
        reworkShelfLifeDays: Math.max(1, input.reworkShelfLifeDays ?? 1),
        maxReworkCount: Math.max(1, input.maxReworkCount ?? 1)
    };
}
function resolveItemDocId(draft) {
    const explicit = typeof draft.backendItemId === "string" ? draft.backendItemId.trim() : "";
    if (explicit)
        return explicit;
    const upc = typeof draft.upc === "string" ? draft.upc.trim() : "";
    if (upc)
        return `upc_${upc}`;
    return `item_${crypto.randomUUID()}`;
}
async function writeAuditLog(input) {
    await adminDb.collection("auditLogs").doc().set({
        actorUserId: input.actorUserId,
        actorRoleSnapshot: input.actorRoleSnapshot,
        organizationId: input.organizationId,
        storeId: null,
        targetPath: input.targetPath,
        action: input.action,
        before: input.before ?? null,
        after: input.after ?? null,
        createdAt: FieldValue.serverTimestamp()
    });
}
export const submitItemForVerification = onCall(async (request) => {
    const uid = requireAuth(request);
    const input = submitSchema.parse(request.data ?? {});
    const member = await requireStoreAccess(input.orgId, uid, input.storeId);
    const canSubmit = member.role === "Owner" ||
        member.permissionFlags?.manageInventory === true ||
        member.permissionFlags?.appSpotCheck === true ||
        member.permissionFlags?.appReceive === true ||
        member.permissionFlags?.editStoreInventory === true;
    if (!canSubmit) {
        throw new HttpsError("permission-denied", "Missing permission to submit inventory item drafts.");
    }
    const normalizedDraft = normalizeItemDraft(input.itemDraft, input.scannedUpc);
    const submissionRef = adminDb.collection("organizations").doc(input.orgId).collection("itemSubmissions").doc();
    const payload = {
        organizationId: input.orgId,
        storeId: input.storeId,
        submittedByUid: uid,
        status: "pending",
        scannedUpc: normalizeUpc(input.scannedUpc) ?? null,
        note: input.note?.trim() || null,
        itemDraft: normalizedDraft,
        reviewedByUid: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    };
    await submissionRef.set(payload);
    await writeAuditLog({
        actorUserId: uid,
        actorRoleSnapshot: member.role,
        organizationId: input.orgId,
        targetPath: submissionRef.path,
        action: "create",
        after: {
            status: "pending",
            storeId: input.storeId,
            scannedUpc: payload.scannedUpc
        }
    });
    return {
        ok: true,
        submissionId: submissionRef.id,
        status: "pending"
    };
});
export const reviewItemSubmission = onCall(async (request) => {
    const uid = requireAuth(request);
    const input = reviewSchema.parse(request.data ?? {});
    const member = await requireOrgMembership(input.orgId, uid);
    const canReview = member.role === "Owner" ||
        member.permissionFlags?.editOrgInventoryMeta === true ||
        member.permissionFlags?.manageInventory === true ||
        member.permissionFlags?.manageCentralCatalog === true;
    if (!canReview) {
        throw new HttpsError("permission-denied", "Missing permission to review item submissions.");
    }
    const submissionRef = adminDb
        .collection("organizations")
        .doc(input.orgId)
        .collection("itemSubmissions")
        .doc(input.submissionId);
    const submissionSnap = await submissionRef.get();
    if (!submissionSnap.exists) {
        throw new HttpsError("not-found", "Item submission not found.");
    }
    const submission = submissionSnap.data();
    const beforeState = {
        status: submission.status,
        reviewedByUid: submission.reviewedByUid,
        reviewNote: submission.reviewNote
    };
    const currentStatus = String(submission.status ?? "").trim().toLowerCase();
    if (currentStatus !== "pending") {
        throw new HttpsError("failed-precondition", "Only pending submissions can be reviewed.");
    }
    const rawDraft = submission.itemDraft ?? null;
    if (!rawDraft || typeof rawDraft !== "object") {
        throw new HttpsError("failed-precondition", "Submission is missing item draft data.");
    }
    const normalizedDraft = normalizeItemDraft(rawDraft);
    const itemDocId = resolveItemDocId(normalizedDraft);
    const storeId = typeof submission.storeId === "string" ? submission.storeId.trim() : "";
    if (input.decision === "approved" || input.decision === "promoted") {
        const itemRef = adminDb.collection("organizations").doc(input.orgId).collection("items").doc(itemDocId);
        const existingItem = await itemRef.get();
        await itemRef.set({
            organizationId: input.orgId,
            name: normalizedDraft.name,
            upc: normalizedDraft.upc,
            unit: normalizedDraft.unit,
            hasExpiration: normalizedDraft.hasExpiration,
            defaultExpirationDays: normalizedDraft.defaultExpirationDays,
            defaultPackedExpiration: normalizedDraft.defaultPackedExpiration,
            minQuantity: normalizedDraft.minQuantity,
            qtyPerCase: normalizedDraft.qtyPerCase,
            caseSize: normalizedDraft.caseSize,
            price: normalizedDraft.price,
            vendorId: normalizedDraft.vendorId,
            vendorName: normalizedDraft.vendorName,
            departmentId: normalizedDraft.departmentId,
            department: normalizedDraft.department,
            locationId: normalizedDraft.locationId,
            departmentLocation: normalizedDraft.departmentLocation,
            tags: normalizedDraft.tags,
            reworkItemCode: normalizedDraft.reworkItemCode,
            canBeReworked: normalizedDraft.canBeReworked,
            reworkShelfLifeDays: normalizedDraft.reworkShelfLifeDays,
            maxReworkCount: normalizedDraft.maxReworkCount,
            archived: false,
            isDraft: false,
            draftSubmissionId: input.submissionId,
            photoUrl: normalizedDraft.photoUrl,
            photoAssetId: normalizedDraft.photoAssetId,
            isPrepackaged: normalizedDraft.isPrepackaged === true,
            rewrapsWithUniqueBarcode: normalizedDraft.rewrapsWithUniqueBarcode === true,
            createdAt: existingItem.exists ? existingItem.get("createdAt") ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            updatedByUid: uid
        }, { merge: true });
        const shouldExcludeFromCentral = normalizedDraft.rewrapsWithUniqueBarcode === true || normalizedDraft.canBeReworked === true;
        if (!shouldExcludeFromCentral && (input.decision === "approved" || input.decision === "promoted")) {
            const promotedUpc = normalizeUpc(input.centralOverride?.upc) ?? normalizedDraft.upc ?? null;
            if (promotedUpc) {
                const centralRef = adminDb
                    .collection("centralCatalog")
                    .doc("global")
                    .collection("items")
                    .doc(promotedUpc);
                const centralSnap = await centralRef.get();
                const shouldWriteCentral = input.decision === "promoted" || !centralSnap.exists;
                if (shouldWriteCentral) {
                    await centralRef.set({
                        upc: promotedUpc,
                        name: input.centralOverride?.name?.trim() || normalizedDraft.name,
                        hasExpiration: normalizedDraft.hasExpiration,
                        defaultExpirationDays: input.centralOverride?.defaultExpirationDays ?? normalizedDraft.defaultExpirationDays,
                        photoUrl: input.centralOverride?.photoUrl?.trim() || normalizedDraft.photoUrl || null,
                        photoAssetId: input.centralOverride?.photoAssetId?.trim() || normalizedDraft.photoAssetId || null,
                        editorOrganizationId: input.orgId,
                        updatedByUid: uid,
                        updatedAt: FieldValue.serverTimestamp(),
                        createdAt: centralSnap.exists ? centralSnap.get("createdAt") ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp()
                    }, { merge: true });
                }
            }
        }
    }
    else if (input.decision === "rejected") {
        const itemRef = adminDb.collection("organizations").doc(input.orgId).collection("items").doc(itemDocId);
        const existingItem = await itemRef.get();
        if (existingItem.exists) {
            const draftSubmissionId = String(existingItem.get("draftSubmissionId") ?? "");
            const isDraft = Boolean(existingItem.get("isDraft"));
            if (draftSubmissionId === input.submissionId || isDraft) {
                await itemRef.delete();
            }
        }
        if (storeId) {
            const batchesSnap = await adminDb
                .collectionGroup("inventoryBatches")
                .where("organizationId", "==", input.orgId)
                .where("storeId", "==", storeId)
                .where("itemId", "==", itemDocId)
                .limit(500)
                .get();
            if (!batchesSnap.empty) {
                const batch = adminDb.batch();
                for (const docSnap of batchesSnap.docs) {
                    batch.delete(docSnap.ref);
                }
                await batch.commit();
            }
        }
    }
    await submissionRef.set({
        status: input.decision,
        reviewedByUid: uid,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewNote: input.reviewNote?.trim() || null,
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await writeAuditLog({
        actorUserId: uid,
        actorRoleSnapshot: member.role,
        organizationId: input.orgId,
        targetPath: submissionRef.path,
        action: "update",
        before: beforeState,
        after: {
            status: input.decision,
            reviewNote: input.reviewNote?.trim() || null,
            reviewedByUid: uid
        }
    });
    return {
        ok: true,
        submissionId: input.submissionId,
        status: input.decision
    };
});
