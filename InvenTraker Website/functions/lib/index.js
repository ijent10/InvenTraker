import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuditLogsRequestSchema, adminOrganizationDetailRequestSchema, adminListOrganizationsRequestSchema, adminStoreDetailRequestSchema, adminSafeEditRequestSchema, claimOrganizationByCompanyCodeRequestSchema, commitOrderRecommendationsRequestSchema, computeFinancialHealthRequestSchema, ensurePlatformPreferenceProfileRequestSchema, generateOrderSuggestionsRequestSchema, getStoreRecommendationsRequestSchema, listMyOrganizationsRequestSchema, pdfToHowtoDraftRequestSchema } from "@inventracker/shared";
import { adminAuth, adminDb, adminStorage } from "./lib/firebase.js";
import { requireAuth, requireOrgMembership, requirePlatformAdmin, requireStoreAccess } from "./lib/auth.js";
import { filterSafePatch } from "./utils/admin-safe-edit.js";
import { extractHowToDraftFromPdf } from "./utils/pdf.js";
import { resolvePreferenceProfile } from "./utils/preferences.js";
import { findStorePath } from "./utils/store-path.js";
import { enhanceFinancialHealth, enhanceHowToDraft } from "./ai/custom-engine.js";
import { buildStoreRecommendations } from "./recommendation/engine.js";
import { readRecommendationRun } from "./recommendation/persistence.js";
export { sendOrgNotification, removeOrgNotification, sendPlatformNotification } from "./notifications.js";
export { requestStoreAccess, reviewStoreAccessRequest } from "./store-access.js";
export { saveOrganizationWebsiteConfig } from "./website.js";
export { submitItemForVerification, reviewItemSubmission } from "./item-submissions.js";
export { createStripeCheckoutSession, createStripeEmbeddedCheckoutSession, createStripePortalSession, getStripeCheckoutSessionStatus, reconcileOrganizationBilling, listPublicStripePlans, syncOrgBillingFromStripeSubscription } from "./stripe.js";
function profileId(userId, orgId, platform) {
    return `${userId}_${orgId}_${platform}`;
}
function normalizeMemberRole(rawRole, ownerByArray) {
    if (typeof rawRole === "string") {
        const role = rawRole.trim().toLowerCase();
        if (role === "owner")
            return "Owner";
        if (role === "manager")
            return "Manager";
        if (role === "staff" || role === "employee" || role === "viewer")
            return "Staff";
    }
    return ownerByArray ? "Owner" : "Staff";
}
const permissionKeys = [
    "viewDashboard",
    "viewInventory",
    "viewExpiration",
    "viewWaste",
    "viewOrders",
    "viewTodo",
    "viewInsights",
    "viewProduction",
    "viewHowTos",
    "viewHealthChecks",
    "viewNotifications",
    "viewStores",
    "viewUsers",
    "manageInventory",
    "manageSales",
    "manageOrders",
    "generateOrders",
    "manageTodo",
    "sendNotifications",
    "exportData",
    "requestStoreAccess",
    "approveStoreAccessRequests",
    "adjustStoreQuantity",
    "appSpotCheck",
    "appReceive",
    "appWaste",
    "appExpiration",
    "appTransfers",
    "appRework",
    "appProductionRuns",
    "appChop",
    "appHealthChecks",
    "appNotificationsFeed",
    "appManualEntry",
    "appOfflineSync",
    "manageUsers",
    "inviteUsers",
    "editUserRoles",
    "resetUserCredentials",
    "deactivateUsers",
    "manageStores",
    "createStores",
    "editStores",
    "archiveStores",
    "manageOrgSettings",
    "manageStoreSettings",
    "manageHealthChecks",
    "viewOrganizationInventory",
    "editOrgInventoryMeta",
    "editStoreInventory",
    "manageVendors",
    "manageJobTitles",
    "manageCentralCatalog",
    "managePermissions",
    "viewBilling",
    "manageBilling",
    "viewAuditLogs",
    "exportAuditLogs",
    "manageFeatureRequests",
    "manageContactInbox",
    "managePublicContent",
    "managePrivacyContent",
    "manageTermsContent",
    "manageFaqContent",
    "manageIntegrations",
    "manageSecuritySettings",
    "manageWebsite"
];
function permissionDefaultsForRole(role) {
    const none = Object.fromEntries(permissionKeys.map((key) => [key, false]));
    if (role === "Owner") {
        return Object.fromEntries(permissionKeys.map((key) => [key, true]));
    }
    if (role === "Manager") {
        return {
            ...none,
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
            manageWebsite: true,
            manageInventory: true,
            manageSales: true,
            manageOrders: true,
            generateOrders: true,
            manageTodo: true,
            sendNotifications: true,
            exportData: true,
            requestStoreAccess: true,
            approveStoreAccessRequests: true,
            adjustStoreQuantity: true,
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
            manageUsers: true,
            inviteUsers: true,
            editUserRoles: true,
            resetUserCredentials: true,
            deactivateUsers: true,
            manageStores: true,
            createStores: false,
            editStores: true,
            archiveStores: false,
            manageOrgSettings: false,
            manageStoreSettings: true,
            manageHealthChecks: true,
            viewOrganizationInventory: false,
            editOrgInventoryMeta: false,
            editStoreInventory: true,
            manageVendors: true,
            manageJobTitles: true,
            manageCentralCatalog: false,
            managePermissions: false,
            viewBilling: true,
            manageBilling: false,
            viewAuditLogs: true,
            exportAuditLogs: true,
            manageIntegrations: true
        };
    }
    return {
        ...none,
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
        manageInventory: true,
        manageOrders: true,
        generateOrders: true,
        manageTodo: true,
        requestStoreAccess: true,
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
        appOfflineSync: true
    };
}
function parseProjectId() {
    if (process.env.GCLOUD_PROJECT?.trim()) {
        return process.env.GCLOUD_PROJECT.trim();
    }
    const raw = process.env.FIREBASE_CONFIG;
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed.projectId?.trim() || null;
    }
    catch {
        return null;
    }
}
function normalizeBucketName(input) {
    if (!input)
        return null;
    const trimmed = input.trim();
    if (!trimmed)
        return null;
    if (trimmed.startsWith("gs://"))
        return trimmed.replace(/^gs:\/\//, "").replace(/\/+$/, "");
    return trimmed.replace(/\/+$/, "");
}
function storageBucketCandidates(hint) {
    const candidates = new Set();
    const hinted = normalizeBucketName(hint);
    if (hinted)
        candidates.add(hinted);
    try {
        const defaultName = normalizeBucketName(adminStorage.bucket().name);
        if (defaultName)
            candidates.add(defaultName);
    }
    catch {
        // no-op
    }
    const projectId = parseProjectId();
    if (projectId) {
        candidates.add(`${projectId}.firebasestorage.app`);
        candidates.add(`${projectId}.appspot.com`);
    }
    return [...candidates];
}
async function downloadFromStoragePath(storagePath, bucketHint) {
    const normalizedPath = storagePath.trim().replace(/^\/+/, "");
    if (!normalizedPath)
        throw new Error("Missing storage path.");
    let lastError = null;
    for (const bucketName of storageBucketCandidates(bucketHint)) {
        try {
            const file = adminStorage.bucket(bucketName).file(normalizedPath);
            const [exists] = await file.exists();
            if (!exists)
                continue;
            const [buffer] = await file.download();
            return buffer;
        }
        catch (error) {
            lastError = error;
        }
    }
    if (lastError instanceof Error)
        throw lastError;
    throw new Error("PDF file not found in configured storage buckets.");
}
async function writeAuditLog(input) {
    const ref = adminDb.collection("auditLogs").doc();
    await ref.set({
        actorUserId: input.actorUserId,
        actorRoleSnapshot: input.actorRoleSnapshot,
        organizationId: input.organizationId,
        storeId: input.storeId ?? null,
        targetPath: input.targetPath,
        action: input.action,
        before: input.before ?? null,
        after: input.after ?? null,
        createdAt: FieldValue.serverTimestamp()
    });
    return ref.id;
}
export const listMyOrganizations = onCall(async (request) => {
    const uid = requireAuth(request);
    listMyOrganizationsRequestSchema.parse(request.data ?? {});
    const authUser = await adminAuth.getUser(uid);
    const userRef = adminDb.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const isPlatformAdmin = request.auth?.token.platform_admin === true ||
        (userData.platformRoles?.platformAdmin ?? false);
    const orgsSnap = await adminDb.collection("organizations").limit(1000).get();
    const contexts = [];
    for (const orgDoc of orgsSnap.docs) {
        const orgData = orgDoc.data();
        const ownerByArray = (Array.isArray(orgData.ownerUserIds) && orgData.ownerUserIds.includes(uid)) || orgData.ownerUid === uid;
        const memberRef = adminDb.doc(`organizations/${orgDoc.id}/members/${uid}`);
        const memberSnap = await memberRef.get();
        if (!memberSnap.exists && !ownerByArray && !isPlatformAdmin) {
            continue;
        }
        const memberData = memberSnap.exists ? memberSnap.data() : {};
        const role = isPlatformAdmin ? "Owner" : normalizeMemberRole(memberData.role, ownerByArray);
        const storeIds = Array.isArray(memberData.storeIds)
            ? memberData.storeIds.filter((storeId) => typeof storeId === "string")
            : [];
        const departmentIds = Array.isArray(memberData.departmentIds)
            ? memberData.departmentIds.filter((departmentId) => typeof departmentId === "string")
            : [];
        const locationIds = Array.isArray(memberData.locationIds)
            ? memberData.locationIds.filter((locationId) => typeof locationId === "string")
            : [];
        const permissionFlags = {
            ...permissionDefaultsForRole(role),
            ...(typeof memberData.permissionFlags === "object" && memberData.permissionFlags
                ? memberData.permissionFlags
                : {})
        };
        if (!memberSnap.exists && !isPlatformAdmin) {
            await memberRef.set({
                organizationId: orgDoc.id,
                userId: uid,
                role,
                storeIds,
                departmentIds,
                locationIds,
                permissionFlags,
                createdAt: FieldValue.serverTimestamp()
            });
        }
        else if (memberSnap.exists) {
            const needsNormalization = memberData.organizationId !== orgDoc.id ||
                memberData.userId !== uid ||
                memberData.role !== role ||
                !Array.isArray(memberData.storeIds) ||
                !Array.isArray(memberData.departmentIds) ||
                !Array.isArray(memberData.locationIds);
            if (needsNormalization) {
                await memberRef.set({
                    organizationId: orgDoc.id,
                    userId: uid,
                    role,
                    storeIds,
                    departmentIds,
                    locationIds,
                    permissionFlags,
                    createdAt: memberData.createdAt ?? FieldValue.serverTimestamp()
                }, { merge: true });
            }
        }
        contexts.push({
            organizationId: orgDoc.id,
            organizationName: orgData.name ?? "Organization",
            role,
            storeIds,
            departmentIds,
            locationIds,
            permissionFlags
        });
    }
    const defaultOrganizationId = typeof userData.defaultOrganizationId === "string" && contexts.some((context) => context.organizationId === userData.defaultOrganizationId)
        ? userData.defaultOrganizationId
        : contexts[0]?.organizationId;
    await userRef.set({
        email: authUser.email ?? "",
        displayName: authUser.displayName ?? authUser.email ?? "InvenTracker User",
        lastLoginAt: FieldValue.serverTimestamp(),
        defaultOrganizationId: defaultOrganizationId ?? null,
        platformRoles: {
            platformAdmin: isPlatformAdmin
        },
        createdAt: userData.createdAt ?? FieldValue.serverTimestamp()
    }, { merge: true });
    contexts.sort((a, b) => a.organizationName.localeCompare(b.organizationName));
    return { organizations: contexts, isPlatformAdmin };
});
function normalizeOptionalString(input) {
    if (typeof input !== "string")
        return null;
    const value = input.trim();
    return value.length ? value : null;
}
function normalizeFaqEntries(input) {
    if (!Array.isArray(input))
        return [];
    return input
        .slice(0, 100)
        .map((entry, index) => {
        if (!entry || typeof entry !== "object")
            return null;
        const raw = entry;
        const question = typeof raw.question === "string" ? raw.question.trim() : "";
        const answer = typeof raw.answer === "string" ? raw.answer.trim() : "";
        if (!question && !answer)
            return null;
        const id = typeof raw.id === "string" && raw.id.trim().length ? raw.id.trim() : `faq_${index + 1}`;
        return {
            id,
            question,
            answer
        };
    })
        .filter((entry) => Boolean(entry));
}
export const savePublicSiteContent = onCall(async (request) => {
    const uid = await requirePlatformAdmin(request);
    const raw = (request.data ?? {});
    const ref = adminDb.doc("siteContent/public");
    const beforeSnap = await ref.get();
    const patch = {
        privacyContent: normalizeOptionalString(raw.privacyContent),
        termsContent: normalizeOptionalString(raw.termsContent),
        contactEmail: normalizeOptionalString(raw.contactEmail),
        contactPhone: normalizeOptionalString(raw.contactPhone),
        faq: normalizeFaqEntries(raw.faq),
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp()
    };
    await ref.set(patch, { merge: true });
    await writeAuditLog({
        actorUserId: uid,
        actorRoleSnapshot: "Platform Admin",
        organizationId: null,
        targetPath: ref.path,
        action: beforeSnap.exists ? "update" : "create",
        before: beforeSnap.exists ? beforeSnap.data() : null,
        after: {
            privacyContent: patch.privacyContent,
            termsContent: patch.termsContent,
            contactEmail: patch.contactEmail,
            contactPhone: patch.contactPhone,
            faq: patch.faq,
            updatedBy: uid
        }
    });
    return { ok: true };
});
export const ensurePlatformPreferenceProfile = onCall(async (request) => {
    const uid = requireAuth(request);
    const input = ensurePlatformPreferenceProfileRequestSchema.parse(request.data);
    const actingAsOtherUser = uid !== input.userId;
    if (actingAsOtherUser) {
        await requirePlatformAdmin(request);
    }
    else {
        await requireOrgMembership(input.orgId, uid);
    }
    const thisId = profileId(input.userId, input.orgId, input.platform);
    const thisRef = adminDb.doc(`platformPreferenceProfiles/${thisId}`);
    const existing = await thisRef.get();
    if (existing.exists) {
        const current = resolvePreferenceProfile(existing.data());
        if (existing.data()?.showTips === undefined) {
            await thisRef.set({
                showTips: current.showTips,
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
        }
        return {
            profileId: thisId,
            profile: {
                ...existing.data(),
                theme: current.theme,
                accentColor: current.accentColor,
                boldText: current.boldText,
                showTips: current.showTips
            },
            source: "existing"
        };
    }
    const otherPlatform = input.platform === "WEB" ? "IOS" : "WEB";
    const otherRef = adminDb.doc(`platformPreferenceProfiles/${profileId(input.userId, input.orgId, otherPlatform)}`);
    const other = await otherRef.get();
    const resolved = resolvePreferenceProfile(other.exists ? other.data() : null);
    const profile = {
        userId: input.userId,
        organizationId: input.orgId,
        platform: input.platform,
        theme: resolved.theme,
        accentColor: resolved.accentColor,
        boldText: resolved.boldText,
        showTips: resolved.showTips,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    };
    await thisRef.set(profile);
    return {
        profileId: thisId,
        profile,
        source: other.exists ? "cloned" : "default"
    };
});
export const claimOrganizationByCompanyCode = onCall(async (request) => {
    const uid = requireAuth(request);
    const input = claimOrganizationByCompanyCodeRequestSchema.parse(request.data);
    const companyCode = input.companyCode.trim().toUpperCase();
    const employeeId = input.employeeId.trim();
    if (!companyCode || !employeeId) {
        throw new HttpsError("invalid-argument", "Company code and employee ID are required");
    }
    const user = await adminAuth.getUser(uid);
    const userEmail = String(user.email ?? "").trim().toLowerCase();
    const orgByTopLevel = await adminDb
        .collection("organizations")
        .where("companyCodeUpper", "==", companyCode)
        .limit(1)
        .get();
    let orgDoc = orgByTopLevel.docs[0]?.ref ?? null;
    if (!orgDoc) {
        const settingsHit = await adminDb
            .collectionGroup("settings")
            .where("companyCode", "==", companyCode)
            .limit(1)
            .get();
        orgDoc = settingsHit.docs[0]?.ref.parent.parent ?? null;
    }
    if (!orgDoc) {
        throw new HttpsError("not-found", "Company code not found. Contact your company IT department to be added.");
    }
    const orgSnap = await orgDoc.get();
    const orgId = orgSnap.id;
    const existingMemberRef = adminDb.doc(`organizations/${orgId}/members/${uid}`);
    const existingMember = await existingMemberRef.get();
    if (existingMember.exists) {
        const role = normalizeMemberRole(existingMember.data()?.role, false);
        return {
            orgId,
            orgName: String(orgSnap.data()?.name ?? "Organization"),
            role
        };
    }
    const pendingSnap = await adminDb
        .collection(`organizations/${orgId}/pendingUsers`)
        .where("employeeId", "==", employeeId)
        .where("status", "==", "pending")
        .limit(25)
        .get();
    const pendingDoc = pendingSnap.docs.find((entry) => {
        const data = entry.data();
        return !data.email || String(data.email).trim().toLowerCase() === userEmail;
    }) ?? null;
    if (!pendingDoc) {
        throw new HttpsError("permission-denied", "Employee ID not recognized for this company code. Contact your company IT department to be added.");
    }
    const pending = pendingDoc.data();
    const role = normalizeMemberRole(pending.role, false);
    if (role === "Owner") {
        const ownerMembers = await adminDb
            .collection(`organizations/${orgId}/members`)
            .where("role", "in", ["Owner", "owner"])
            .limit(1)
            .get();
        if (!ownerMembers.empty) {
            throw new HttpsError("failed-precondition", "This organization already has an Owner.");
        }
    }
    await existingMemberRef.set({
        organizationId: orgId,
        userId: uid,
        role,
        storeIds: Array.isArray(pending.storeIds)
            ? pending.storeIds.filter((value) => typeof value === "string")
            : [],
        departmentIds: Array.isArray(pending.departmentIds)
            ? pending.departmentIds.filter((value) => typeof value === "string")
            : [],
        locationIds: Array.isArray(pending.locationIds)
            ? pending.locationIds.filter((value) => typeof value === "string")
            : [],
        email: user.email ?? pending.email ?? null,
        firstName: typeof pending.firstName === "string" ? pending.firstName : null,
        lastName: typeof pending.lastName === "string" ? pending.lastName : null,
        employeeId,
        jobTitle: typeof pending.jobTitle === "string" ? pending.jobTitle : null,
        assignmentType: pending.assignmentType === "corporate" || pending.assignmentType === "store"
            ? pending.assignmentType
            : "store",
        permissionFlags: pending.permissionFlags && typeof pending.permissionFlags === "object"
            ? pending.permissionFlags
            : permissionDefaultsForRole(role),
        canManageStoreUsersOnly: Boolean(pending.canManageStoreUsersOnly),
        status: "active",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    if (role === "Owner") {
        await adminDb.doc(`organizations/${orgId}`).set({
            ownerUserIds: [uid],
            ownerUid: uid,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
    }
    await pendingDoc.ref.set({
        status: "claimed",
        claimedAt: FieldValue.serverTimestamp(),
        claimedBy: uid,
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await adminDb.doc(`users/${uid}`).set({
        email: user.email ?? null,
        displayName: user.displayName ?? user.email ?? "InvenTracker User",
        defaultOrganizationId: orgId,
        lastLoginAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await writeAuditLog({
        actorUserId: uid,
        actorRoleSnapshot: role,
        organizationId: orgId,
        storeId: null,
        targetPath: `organizations/${orgId}/members/${uid}`,
        action: "create",
        after: { role, employeeId, source: "company_code_claim" }
    });
    return {
        orgId,
        orgName: String(orgSnap.data()?.name ?? "Organization"),
        role
    };
});
export const pdfToHowtoDraft = onCall(async (request) => {
    const uid = requireAuth(request);
    const input = pdfToHowtoDraftRequestSchema.parse(request.data);
    await requireOrgMembership(input.orgId, uid);
    const mediaSnap = await adminDb.doc(`mediaAssets/${input.pdfAssetId}`).get();
    if (!mediaSnap.exists) {
        throw new HttpsError("not-found", "PDF asset not found");
    }
    const media = mediaSnap.data();
    if (media.organizationId !== input.orgId) {
        throw new HttpsError("permission-denied", "Asset organization mismatch");
    }
    try {
        const buffer = await downloadFromStoragePath(media.storagePath ?? "", media.storageBucket);
        const draft = await extractHowToDraftFromPdf(buffer);
        const enhanced = await enhanceHowToDraft({
            orgId: input.orgId,
            storeId: input.storeId,
            title: draft.title,
            steps: draft.steps
        });
        return {
            ok: true,
            fallback: false,
            suggestedTitle: enhanced.title,
            steps: enhanced.steps,
            ai: enhanced.ai
        };
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : "Couldn't parse PDF—create manually.";
        console.error("pdfToHowtoDraft failed", {
            orgId: input.orgId,
            assetId: input.pdfAssetId,
            storagePath: media.storagePath ?? null,
            storageBucket: media.storageBucket ?? null,
            reason
        });
        return {
            ok: false,
            fallback: true,
            reason,
            steps: [],
            ai: {
                intent: "pdf_howto_draft",
                provider: "custom-rules",
                model: "rules-v1",
                usedModel: false,
                fallbackReason: reason
            }
        };
    }
});
async function resolveStoreCollections(orgId, storeId) {
    const nestedStorePath = await findStorePath(orgId, storeId);
    if (nestedStorePath) {
        const basePath = `organizations/${orgId}/regions/${nestedStorePath.regionId}/districts/${nestedStorePath.districtId}/stores/${nestedStorePath.storeId}`;
        return {
            basePath,
            ordersPath: `${basePath}/orders`,
            todoPath: `${basePath}/toDo`,
            runPath: `${basePath}/recommendationRuns`,
            regionId: nestedStorePath.regionId,
            districtId: nestedStorePath.districtId
        };
    }
    const basePath = `organizations/${orgId}/stores/${storeId}`;
    return {
        basePath,
        ordersPath: `${basePath}/orders`,
        todoPath: `${basePath}/toDo`,
        runPath: `${basePath}/recommendationRuns`,
        regionId: null,
        districtId: null
    };
}
async function commitRecommendationLines(params) {
    const collections = await resolveStoreCollections(params.orgId, params.storeId);
    const orderRef = adminDb.collection(collections.ordersPath).doc();
    await orderRef.set({
        organizationId: params.orgId,
        storeId: params.storeId,
        vendorId: params.vendorId ?? "mixed",
        status: "suggested",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: params.uid,
        vendorCutoffAt: null,
        recommendationRunId: params.runId,
        recommendationEngineVersion: params.engineVersion
    });
    const batch = adminDb.batch();
    for (const line of params.lines) {
        batch.set(orderRef.collection("lines").doc(), {
            itemId: line.itemId,
            suggestedQty: line.finalQuantity,
            finalQty: line.finalQuantity,
            unit: line.unit,
            rationale: line.rationaleSummary,
            caseRounded: line.unit !== "lbs"
        });
    }
    const todos = [
        {
            organizationId: params.orgId,
            storeId: params.storeId,
            type: "auto",
            title: `Place order ${params.vendorId ? `for ${params.vendorId}` : "for suggested items"}`,
            dueAt: FieldValue.serverTimestamp(),
            status: "open",
            createdAt: FieldValue.serverTimestamp(),
            createdBy: params.uid
        },
        {
            organizationId: params.orgId,
            storeId: params.storeId,
            type: "auto",
            title: "Spot check before order in 1 day",
            dueAt: FieldValue.serverTimestamp(),
            status: "open",
            createdAt: FieldValue.serverTimestamp(),
            createdBy: params.uid
        }
    ];
    const todoCollection = adminDb.collection(collections.todoPath);
    for (const todo of todos) {
        batch.set(todoCollection.doc(), todo);
    }
    batch.set(adminDb.doc(`${collections.runPath}/${params.runId}`), {
        committedAt: FieldValue.serverTimestamp(),
        committedBy: params.uid,
        committedOrderId: orderRef.id,
        committedLineCount: params.lines.length,
        committedTodosCreated: todos.length
    }, { merge: true });
    await batch.commit();
    await writeAuditLog({
        actorUserId: params.uid,
        actorRoleSnapshot: "Manager",
        organizationId: params.orgId,
        storeId: params.storeId,
        targetPath: orderRef.path,
        action: "create",
        after: {
            recommendationRunId: params.runId,
            recommendationEngineVersion: params.engineVersion,
            lines: params.lines.length
        }
    });
    return {
        orderId: orderRef.id,
        todosCreated: todos.length,
        lineCount: params.lines.length
    };
}
export const getStoreRecommendations = onCall(async (request) => {
    const uid = requireAuth(request);
    const input = getStoreRecommendationsRequestSchema.parse(request.data);
    await requireStoreAccess(input.orgId, uid, input.storeId);
    const { response } = await buildStoreRecommendations({
        orgId: input.orgId,
        storeId: input.storeId,
        vendorId: input.vendorId,
        domains: input.domains,
        productionPlanOptions: input.productionPlanOptions,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        actorUid: uid,
        forceRefresh: input.forceRefresh
    });
    const collections = await resolveStoreCollections(input.orgId, input.storeId);
    await writeAuditLog({
        actorUserId: uid,
        actorRoleSnapshot: "Manager",
        organizationId: input.orgId,
        storeId: input.storeId,
        targetPath: `${collections.runPath}/${response.meta.runId}`,
        action: "create",
        after: {
            engineVersion: response.meta.engineVersion,
            schemaVersion: response.meta.schemaVersion,
            rulePathUsed: response.meta.rulePathUsed,
            sourceRefs: response.meta.sourceRefs,
            inputHash: response.meta.inputHash,
            degraded: response.meta.degraded,
            fallbackUsed: response.meta.fallbackUsed,
            fallbackReason: response.meta.fallbackReason ?? null,
            fallbackSource: response.meta.fallbackSource ?? null,
            fallbackTrigger: response.meta.fallbackTrigger ?? null,
            domains: response.meta.domains,
            orderRecommendations: response.orderRecommendations.length,
            productionRecommendations: response.productionRecommendations.length,
            productionPlanRows: response.productionPlan.ingredientDemandRows.length + response.productionPlan.frozenPullForecastRows.length,
            questions: response.questions.length
        }
    });
    return response;
});
export const commitOrderRecommendations = onCall(async (request) => {
    const uid = requireAuth(request);
    const input = commitOrderRecommendationsRequestSchema.parse(request.data);
    await requireStoreAccess(input.orgId, uid, input.storeId);
    const collections = await resolveStoreCollections(input.orgId, input.storeId);
    const runData = await readRecommendationRun({
        storePath: collections.basePath,
        runId: input.runId
    });
    if (!runData) {
        throw new HttpsError("not-found", "Recommendation run not found for this store.");
    }
    if (runData.organizationId !== input.orgId || runData.storeId !== input.storeId) {
        throw new HttpsError("permission-denied", "Recommendation run does not belong to this organization/store.");
    }
    const recommendationRows = Array.isArray(runData.orderRecommendations)
        ? runData.orderRecommendations
        : [];
    const recommendationByItem = new Map(recommendationRows
        .map((row) => [String(row.itemId ?? ""), row])
        .filter(([itemId]) => itemId.length > 0));
    const selectedLines = input.selectedLines
        .map((line) => {
        const rec = recommendationByItem.get(line.itemId);
        const fallbackUnit = rec?.unit === "lbs" ? "lbs" : "each";
        const quantity = Math.max(0, Number(line.finalQuantity ?? 0));
        return {
            itemId: line.itemId,
            finalQuantity: quantity,
            unit: line.unit ?? fallbackUnit,
            rationaleSummary: line.rationaleSummary ??
                (typeof rec?.rationaleSummary === "string" ? rec.rationaleSummary : "Applied from recommendation preview.")
        };
    })
        .filter((line) => line.itemId.trim().length > 0);
    const result = await commitRecommendationLines({
        uid,
        orgId: input.orgId,
        storeId: input.storeId,
        vendorId: input.vendorId,
        runId: input.runId,
        engineVersion: typeof runData.engineVersion === "string" ? runData.engineVersion : "rules_v1",
        lines: selectedLines
    });
    return {
        orderId: result.orderId,
        lineCount: result.lineCount,
        todosCreated: result.todosCreated,
        runId: input.runId,
        engineVersion: typeof runData.engineVersion === "string" ? runData.engineVersion : "rules_v1",
        appliedFromRun: true
    };
});
export const generateOrderSuggestions = onCall(async (request) => {
    // Deprecated compatibility callable.
    // Use getStoreRecommendations (preview) + commitOrderRecommendations (apply) on all clients.
    const uid = requireAuth(request);
    const input = generateOrderSuggestionsRequestSchema.parse(request.data);
    await requireStoreAccess(input.orgId, uid, input.storeId);
    const { response } = await buildStoreRecommendations({
        orgId: input.orgId,
        storeId: input.storeId,
        vendorId: input.vendorId,
        domains: ["orders"],
        actorUid: uid,
        forceRefresh: true
    });
    const selectedLines = response.orderRecommendations
        .filter((row) => row.recommendedQuantity > 0)
        .map((row) => ({
        itemId: row.itemId,
        finalQuantity: row.recommendedQuantity,
        unit: row.unit,
        rationaleSummary: row.rationaleSummary
    }));
    const committed = await commitRecommendationLines({
        uid,
        orgId: input.orgId,
        storeId: input.storeId,
        vendorId: input.vendorId,
        runId: response.meta.runId,
        engineVersion: response.meta.engineVersion,
        lines: selectedLines
    });
    return {
        orderId: committed.orderId,
        lines: response.orderRecommendations.map((row) => ({
            itemId: row.itemId,
            suggestedQty: row.recommendedQuantity,
            unit: row.unit,
            rationale: row.rationaleSummary,
            caseRounded: row.caseInterpretation === "case_rounded",
            onHand: row.onHand,
            minQuantity: row.minQuantity
        })),
        todosCreated: committed.todosCreated,
        summary: `Generated ${response.orderRecommendations.length} recommendation line(s).`,
        riskAlerts: response.orderRecommendations
            .filter((row) => row.predictedWasteRisk.probability >= 0.5)
            .slice(0, 5)
            .map((row) => `${row.itemName ?? row.itemId} has elevated waste risk.`),
        questionsForManager: response.questions,
        recommendationMeta: response.meta
    };
});
export const computeFinancialHealth = onCall(async (request) => {
    const uid = requireAuth(request);
    const input = computeFinancialHealthRequestSchema.parse(request.data);
    if (input.storeId) {
        await requireStoreAccess(input.orgId, uid, input.storeId);
    }
    else {
        await requireOrgMembership(input.orgId, uid);
    }
    const itemsSnap = await adminDb.collection(`organizations/${input.orgId}/items`).get();
    const itemPriceMap = new Map(itemsSnap.docs.map((item) => [item.id, Number(item.data().price ?? 0)]));
    const itemMinMap = new Map(itemsSnap.docs.map((item) => [item.id, Number(item.data().minQuantity ?? 0)]));
    const itemNameMap = new Map(itemsSnap.docs.map((item) => [item.id, String(item.data().name ?? item.id)]));
    const onHandByItem = new Map();
    let inventoryValue = 0;
    let expiringSoonValue = 0;
    let wasteCostWeek = 0;
    let wasteCostMonth = 0;
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    const monthAgo = new Date(now);
    monthAgo.setDate(now.getDate() - 30);
    const expiringCutoff = new Date(now);
    expiringCutoff.setDate(now.getDate() + (input.expiringDays ?? 7));
    const batchesQuery = input.storeId
        ? adminDb
            .collectionGroup("inventoryBatches")
            .where("organizationId", "==", input.orgId)
            .where("storeId", "==", input.storeId)
        : adminDb.collectionGroup("inventoryBatches").where("organizationId", "==", input.orgId);
    const wasteQuery = input.storeId
        ? adminDb
            .collectionGroup("wasteRecords")
            .where("organizationId", "==", input.orgId)
            .where("storeId", "==", input.storeId)
        : adminDb.collectionGroup("wasteRecords").where("organizationId", "==", input.orgId);
    const [batchesSnap, wasteSnap] = await Promise.all([batchesQuery.get(), wasteQuery.get()]);
    batchesSnap.docs.forEach((batch) => {
        const data = batch.data();
        if (!data.itemId)
            return;
        const qty = Number(data.quantity ?? 0);
        const price = itemPriceMap.get(data.itemId) ?? 0;
        onHandByItem.set(data.itemId, (onHandByItem.get(data.itemId) ?? 0) + qty);
        inventoryValue += qty * price;
        const expDate = data.expiresAt instanceof Date ? data.expiresAt : data.expiresAt?.toDate?.();
        if (expDate && expDate <= expiringCutoff) {
            expiringSoonValue += qty * price;
        }
    });
    wasteSnap.docs.forEach((waste) => {
        const data = waste.data();
        if (!data.itemId)
            return;
        const qty = Number(data.quantity ?? 0);
        const price = itemPriceMap.get(data.itemId) ?? 0;
        const at = data.createdAt instanceof Date ? data.createdAt : data.createdAt?.toDate?.();
        if (!at)
            return;
        if (at >= weekAgo)
            wasteCostWeek += qty * price;
        if (at >= monthAgo)
            wasteCostMonth += qty * price;
    });
    const overstocked = Array.from(onHandByItem.entries())
        .filter(([itemId, onHand]) => onHand > (itemMinMap.get(itemId) ?? 0) * 2)
        .map(([itemId, onHand]) => ({
        itemId,
        itemName: itemNameMap.get(itemId) ?? itemId,
        onHand,
        minQuantity: itemMinMap.get(itemId) ?? 0
    }))
        .sort((a, b) => b.onHand - a.onHand)
        .slice(0, 25);
    const aiEnhanced = await enhanceFinancialHealth({
        inventoryValue,
        wasteCostWeek,
        wasteCostMonth,
        expiringSoonValue,
        overstocked
    });
    return {
        inventoryValue,
        wasteCostWeek,
        wasteCostMonth,
        expiringSoonValue,
        overstocked,
        summary: aiEnhanced.summary,
        riskAlerts: aiEnhanced.riskAlerts,
        recommendedActions: aiEnhanced.recommendedActions,
        questionsForManager: aiEnhanced.questionsForManager,
        ai: aiEnhanced.ai
    };
});
export const adminSafeEdit = onCall(async (request) => {
    const uid = await requirePlatformAdmin(request);
    const input = adminSafeEditRequestSchema.parse(request.data);
    const targetPath = input.targetType === "item"
        ? `organizations/${input.orgId}/items/${input.targetId}`
        : input.targetType === "mediaAsset"
            ? `mediaAssets/${input.targetId}`
            : `organizations/${input.orgId}/members/${input.targetId}`;
    const ref = adminDb.doc(targetPath);
    const beforeSnap = await ref.get();
    const before = beforeSnap.exists ? beforeSnap.data() : null;
    const patch = filterSafePatch(input.targetType, input.patch);
    if (Object.keys(patch).length === 0) {
        throw new HttpsError("invalid-argument", "No allowed fields in patch");
    }
    patch.updatedAt = FieldValue.serverTimestamp();
    await ref.set(patch, { merge: true });
    const afterSnap = await ref.get();
    const auditLogId = await writeAuditLog({
        actorUserId: uid,
        actorRoleSnapshot: "PlatformAdmin",
        organizationId: input.orgId,
        storeId: input.storeId ?? null,
        targetPath,
        action: "admin_edit",
        before,
        after: afterSnap.data()
    });
    return { ok: true, targetPath, auditLogId };
});
export const adminListOrganizations = onCall(async (request) => {
    await requirePlatformAdmin(request);
    const input = adminListOrganizationsRequestSchema.parse(request.data);
    const q = String(input.q ?? "").toLowerCase();
    const limitCount = input.limit;
    const snap = await adminDb.collection("organizations").limit(Math.min(200, Math.max(1, limitCount))).get();
    const organizations = snap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((row) => !q || String(row.name ?? "").toLowerCase().includes(q));
    return { organizations };
});
export const adminGetOrganizationDetail = onCall(async (request) => {
    await requirePlatformAdmin(request);
    const input = adminOrganizationDetailRequestSchema.parse(request.data);
    const orgId = input.orgId;
    const [orgSnap, orgSettingsSnap, itemsSnap, membersSnap, regionsSnap] = await Promise.all([
        adminDb.doc(`organizations/${orgId}`).get(),
        adminDb.doc(`organizations/${orgId}/settings/default`).get(),
        adminDb.collection(`organizations/${orgId}/items`).limit(500).get(),
        adminDb.collection(`organizations/${orgId}/members`).limit(500).get(),
        adminDb.collection(`organizations/${orgId}/regions`).get()
    ]);
    const stores = [];
    for (const region of regionsSnap.docs) {
        const districtsSnap = await adminDb.collection(`organizations/${orgId}/regions/${region.id}/districts`).get();
        for (const district of districtsSnap.docs) {
            const storesSnap = await adminDb
                .collection(`organizations/${orgId}/regions/${region.id}/districts/${district.id}/stores`)
                .get();
            for (const store of storesSnap.docs) {
                stores.push({
                    id: store.id,
                    regionId: region.id,
                    districtId: district.id,
                    ...store.data()
                });
            }
        }
    }
    return {
        organization: { id: orgSnap.id, stores, ...orgSnap.data() },
        organizationSettings: orgSettingsSnap.exists
            ? orgSettingsSnap.data()
            : null,
        items: itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        members: membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    };
});
export const adminGetStoreDetail = onCall(async (request) => {
    await requirePlatformAdmin(request);
    const input = adminStoreDetailRequestSchema.parse(request.data);
    const orgId = input.orgId;
    const storeId = input.storeId;
    const storePath = await findStorePath(orgId, storeId);
    if (!storePath)
        throw new HttpsError("not-found", "Store not found");
    const basePath = `organizations/${orgId}/regions/${storePath.regionId}/districts/${storePath.districtId}/stores/${storeId}`;
    const [storeSnap, storeSettingsSnap, batchesSnap, wasteSnap, ordersSnap, todoSnap] = await Promise.all([
        adminDb.doc(basePath).get(),
        adminDb.doc(`${basePath}/settings/default`).get(),
        adminDb
            .collectionGroup("inventoryBatches")
            .where("organizationId", "==", orgId)
            .where("storeId", "==", storeId)
            .limit(500)
            .get(),
        adminDb
            .collectionGroup("wasteRecords")
            .where("organizationId", "==", orgId)
            .where("storeId", "==", storeId)
            .limit(500)
            .get(),
        adminDb
            .collectionGroup("orders")
            .where("organizationId", "==", orgId)
            .where("storeId", "==", storeId)
            .limit(500)
            .get(),
        adminDb
            .collectionGroup("toDo")
            .where("organizationId", "==", orgId)
            .where("storeId", "==", storeId)
            .limit(500)
            .get()
    ]);
    return {
        store: { id: storeSnap.id, ...storeSnap.data() },
        storeSettings: storeSettingsSnap.exists ? storeSettingsSnap.data() : null,
        inventoryBatches: batchesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        wasteRecords: wasteSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        orders: ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        toDo: todoSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    };
});
export const adminListAuditLogs = onCall(async (request) => {
    await requirePlatformAdmin(request);
    const input = adminAuditLogsRequestSchema.parse(request.data);
    const orgId = input.orgId;
    const limitCount = input.limit ?? 200;
    const snap = await adminDb
        .collection("auditLogs")
        .where("organizationId", "==", orgId)
        .orderBy("createdAt", "desc")
        .limit(limitCount)
        .get();
    return {
        logs: snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    };
});
export const setPlatformAdminClaim = onCall(async (request) => {
    const actorUid = await requirePlatformAdmin(request);
    const actorEmailFromToken = typeof request.auth?.token?.email === "string" ? request.auth.token.email.trim().toLowerCase() : "";
    let actorEmail = actorEmailFromToken;
    if (!actorEmail) {
        const actorUserSnap = await adminDb.doc(`users/${actorUid}`).get();
        const actorUserData = actorUserSnap.data() ?? {};
        actorEmail = typeof actorUserData.email === "string" ? actorUserData.email.trim().toLowerCase() : "";
    }
    const allowedGrantors = new Set(["ianjjent@icloud.com"]);
    if (!allowedGrantors.has(actorEmail)) {
        throw new HttpsError("permission-denied", "Only the primary platform admin account can grant or revoke platform admin claims.");
    }
    const uid = String(request.data?.uid ?? "");
    const enabled = Boolean(request.data?.enabled);
    if (!uid)
        throw new HttpsError("invalid-argument", "uid required");
    await adminAuth.setCustomUserClaims(uid, { platform_admin: enabled });
    return { ok: true };
});
const simpliPantriSharedKey = String(process.env.SIMPLIPANTRI_SYNC_SHARED_KEY ?? "").trim();
function setSimpliPantriCors(response) {
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Headers", "Content-Type,Authorization,x-simplipantri-key");
    response.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}
function normalizeSimpliPantriBarcode(raw) {
    const compact = String(raw ?? "")
        .trim()
        .replace(/\s+/g, "");
    if (!compact)
        return "";
    const digitsOnly = compact.replace(/[^0-9]/g, "");
    if (!digitsOnly)
        return compact;
    return digitsOnly.startsWith("0") ? digitsOnly : `0${digitsOnly}`;
}
function asStringOrNull(raw) {
    if (typeof raw !== "string")
        return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function asNumberOrNull(raw) {
    if (typeof raw === "number" && Number.isFinite(raw))
        return raw;
    if (typeof raw === "string") {
        const parsed = Number(raw);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return null;
}
function chooseCategory(raw) {
    const direct = asStringOrNull(raw.generalizedCategoryKey) ??
        asStringOrNull(raw.categoryKey) ??
        asStringOrNull(raw.generalCategory) ??
        asStringOrNull(raw.department);
    if (direct)
        return direct;
    const tags = raw.tags;
    if (Array.isArray(tags)) {
        const first = tags.find((value) => typeof value === "string" && value.trim().length > 0);
        return typeof first === "string" ? first.trim() : null;
    }
    return null;
}
function mapCatalogResponse(barcode, raw) {
    const canonicalName = asStringOrNull(raw.canonicalName) ??
        asStringOrNull(raw.productName) ??
        asStringOrNull(raw.title) ??
        asStringOrNull(raw.name) ??
        barcode;
    return {
        barcode,
        canonicalName,
        standardSize: asNumberOrNull(raw.standardSize) ??
            asNumberOrNull(raw.size) ??
            asNumberOrNull(raw.caseSize) ??
            null,
        standardUnit: asStringOrNull(raw.standardUnit) ??
            asStringOrNull(raw.unit) ??
            asStringOrNull(raw.unitRaw),
        generalizedCategoryKey: chooseCategory(raw),
        imageURL: asStringOrNull(raw.imageURL) ??
            asStringOrNull(raw.canonicalImageURL) ??
            asStringOrNull(raw.photoUrl) ??
            null,
        brand: asStringOrNull(raw.brand) ??
            asStringOrNull(raw.vendorName),
        variantFamily: asStringOrNull(raw.variantFamily) ??
            asStringOrNull(raw.department)
    };
}
function requestAuthorized(rawHeaderValue) {
    if (!simpliPantriSharedKey)
        return true;
    if (typeof rawHeaderValue !== "string")
        return false;
    const provided = rawHeaderValue.trim();
    if (!provided)
        return false;
    if (provided === simpliPantriSharedKey)
        return true;
    const bearerPrefix = "Bearer ";
    if (provided.startsWith(bearerPrefix) && provided.slice(bearerPrefix.length).trim() === simpliPantriSharedKey) {
        return true;
    }
    return false;
}
export const simpliPantriCatalogLookup = onRequest(async (request, response) => {
    setSimpliPantriCors(response);
    if (request.method === "OPTIONS") {
        response.status(204).send("");
        return;
    }
    if (request.method !== "GET" && request.method !== "POST") {
        response.status(405).json({ error: "Method not allowed." });
        return;
    }
    const keyedHeader = request.get("x-simplipantri-key");
    const authHeader = request.get("Authorization");
    const authorized = requestAuthorized(keyedHeader) || requestAuthorized(authHeader);
    if (!authorized) {
        response.status(403).json({ error: "Unauthorized." });
        return;
    }
    const barcodeInput = request.query.barcode ??
        (request.body && typeof request.body === "object" ? request.body.barcode : null);
    const barcode = normalizeSimpliPantriBarcode(barcodeInput);
    if (!barcode) {
        response.status(400).json({ error: "barcode is required." });
        return;
    }
    const candidates = Array.from(new Set([barcode, barcode.replace(/^0+/, "")]
        .map((value) => value.trim())
        .filter((value) => value.length > 0)));
    for (const candidate of candidates) {
        const globalRef = adminDb.collection("centralCatalog").doc("global").collection("items").doc(candidate);
        const globalSnap = await globalRef.get().catch(() => null);
        if (globalSnap?.exists) {
            const raw = globalSnap.data() ?? {};
            response.status(200).json({
                found: true,
                source: "centralCatalog",
                product: mapCatalogResponse(barcode, raw)
            });
            return;
        }
        const legacyRef = adminDb.collection("centralCatalogItems").doc(candidate);
        const legacySnap = await legacyRef.get().catch(() => null);
        if (legacySnap?.exists) {
            const raw = legacySnap.data() ?? {};
            response.status(200).json({
                found: true,
                source: "centralCatalogItems",
                product: mapCatalogResponse(barcode, raw)
            });
            return;
        }
        const intakeRef = adminDb.collection("catalogIntake").doc("simpliPantri").collection("items").doc(candidate);
        const intakeSnap = await intakeRef.get().catch(() => null);
        if (intakeSnap?.exists) {
            const raw = intakeSnap.data() ?? {};
            response.status(200).json({
                found: true,
                source: "simpliPantriIntake",
                product: mapCatalogResponse(barcode, raw)
            });
            return;
        }
    }
    response.status(404).json({
        found: false,
        barcode
    });
});
export const simpliPantriCatalogEnrich = onRequest(async (request, response) => {
    setSimpliPantriCors(response);
    if (request.method === "OPTIONS") {
        response.status(204).send("");
        return;
    }
    if (request.method !== "POST") {
        response.status(405).json({ error: "Method not allowed." });
        return;
    }
    const keyedHeader = request.get("x-simplipantri-key");
    const authHeader = request.get("Authorization");
    const authorized = requestAuthorized(keyedHeader) || requestAuthorized(authHeader);
    if (!authorized) {
        response.status(403).json({ error: "Unauthorized." });
        return;
    }
    const rawBody = request.body;
    const entries = Array.isArray(rawBody)
        ? rawBody
        : Array.isArray(rawBody?.products)
            ? (rawBody.products ?? [])
            : [];
    if (entries.length === 0) {
        response.status(200).json({ received: 0, stored: 0, skipped: 0 });
        return;
    }
    const dedupedByBarcode = new Map();
    for (const entry of entries) {
        const normalizedBarcode = normalizeSimpliPantriBarcode(entry.barcode);
        if (!normalizedBarcode)
            continue;
        dedupedByBarcode.set(normalizedBarcode, entry);
    }
    if (dedupedByBarcode.size === 0) {
        response.status(200).json({ received: entries.length, stored: 0, skipped: entries.length });
        return;
    }
    const batch = adminDb.batch();
    let stored = 0;
    for (const [barcode, entry] of dedupedByBarcode.entries()) {
        const canonicalName = asStringOrNull(entry.canonicalName) ??
            asStringOrNull(entry.productName) ??
            null;
        if (!canonicalName)
            continue;
        const intakeRef = adminDb.collection("catalogIntake").doc("simpliPantri").collection("items").doc(barcode);
        batch.set(intakeRef, {
            barcode,
            canonicalName,
            productName: canonicalName,
            generalizedCategoryKey: asStringOrNull(entry.generalizedCategoryKey),
            imageURL: asStringOrNull(entry.imageURL),
            source: "simpliPantri",
            lastSeenAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            seenCount: FieldValue.increment(1)
        }, { merge: true });
        stored += 1;
    }
    if (stored > 0) {
        await batch.commit();
    }
    response.status(200).json({
        received: entries.length,
        stored,
        skipped: entries.length - stored
    });
});
