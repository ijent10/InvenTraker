import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuditLogsRequestSchema, adminOrganizationDetailRequestSchema, adminListOrganizationsRequestSchema, adminStoreDetailRequestSchema, adminSafeEditRequestSchema, claimOrganizationByCompanyCodeRequestSchema, computeFinancialHealthRequestSchema, ensurePlatformPreferenceProfileRequestSchema, generateOrderSuggestionsRequestSchema, listMyOrganizationsRequestSchema, pdfToHowtoDraftRequestSchema } from "@inventracker/shared";
import { adminAuth, adminDb, adminStorage } from "./lib/firebase.js";
import { requireAuth, requireOrgMembership, requirePlatformAdmin, requireStoreAccess } from "./lib/auth.js";
import { filterSafePatch } from "./utils/admin-safe-edit.js";
import { extractHowToDraftFromPdf } from "./utils/pdf.js";
import { resolvePreferenceProfile } from "./utils/preferences.js";
import { findStorePath } from "./utils/store-path.js";
export { sendOrgNotification, removeOrgNotification, sendPlatformNotification } from "./notifications.js";
export { requestStoreAccess, reviewStoreAccessRequest } from "./store-access.js";
export { createStripeCheckoutSession, createStripePortalSession, listPublicStripePlans, syncOrgBillingFromStripeSubscription } from "./stripe.js";
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
function daysUntilNextOrder(orderingDays, now) {
    if (!orderingDays || orderingDays.length === 0)
        return 0;
    const today = now.getDay();
    const sorted = [...orderingDays].sort((a, b) => a - b);
    const next = sorted.find((day) => day >= today);
    if (next !== undefined)
        return next - today;
    const first = sorted[0];
    return first === undefined ? 0 : 7 - today + first;
}
function permissionDefaultsForRole(role) {
    if (role === "Owner") {
        return {
            manageUsers: true,
            manageStores: true,
            manageOrgSettings: true,
            manageStoreSettings: true,
            manageInventory: true,
            manageSales: true,
            sendNotifications: true,
            requestStoreAccess: true,
            approveStoreAccessRequests: true
        };
    }
    if (role === "Manager") {
        return {
            manageUsers: true,
            manageStores: true,
            manageOrgSettings: false,
            manageStoreSettings: true,
            manageInventory: true,
            manageSales: true,
            sendNotifications: true,
            requestStoreAccess: true,
            approveStoreAccessRequests: true
        };
    }
    return {
        manageUsers: false,
        manageStores: false,
        manageOrgSettings: false,
        manageStoreSettings: false,
        manageInventory: true,
        manageSales: false,
        sendNotifications: false,
        requestStoreAccess: true,
        approveStoreAccessRequests: false
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
        const permissionFlags = typeof memberData.permissionFlags === "object" && memberData.permissionFlags
            ? memberData.permissionFlags
            : permissionDefaultsForRole(role);
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
        return {
            ok: true,
            fallback: false,
            suggestedTitle: draft.title,
            steps: draft.steps
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
            steps: []
        };
    }
});
export const generateOrderSuggestions = onCall(async (request) => {
    const uid = requireAuth(request);
    const input = generateOrderSuggestionsRequestSchema.parse(request.data);
    await requireStoreAccess(input.orgId, uid, input.storeId);
    const storePath = await findStorePath(input.orgId, input.storeId);
    if (!storePath)
        throw new HttpsError("not-found", "Store not found");
    const itemsSnap = await adminDb.collection(`organizations/${input.orgId}/items`).get();
    const vendorsSnap = await adminDb.collection(`organizations/${input.orgId}/vendors`).get();
    const vendorMap = new Map(vendorsSnap.docs.map((vendor) => [vendor.id, vendor.data()]));
    const batchesSnap = await adminDb
        .collectionGroup("inventoryBatches")
        .where("organizationId", "==", input.orgId)
        .where("storeId", "==", input.storeId)
        .get();
    const onHandByItem = new Map();
    batchesSnap.docs.forEach((batch) => {
        const data = batch.data();
        if (!data.itemId)
            return;
        onHandByItem.set(data.itemId, (onHandByItem.get(data.itemId) ?? 0) + (data.quantity ?? 0));
    });
    const suggestions = [];
    const now = new Date();
    itemsSnap.docs.forEach((itemDoc) => {
        const item = itemDoc.data();
        if (item.archived)
            return;
        if (input.vendorId && item.vendorId !== input.vendorId)
            return;
        const vendor = item.vendorId ? vendorMap.get(item.vendorId) : null;
        const onHand = onHandByItem.get(itemDoc.id) ?? 0;
        const min = item.minQuantity ?? 0;
        const weeklyUsage = item.weeklyUsage ?? 0;
        const deficit = Math.max(0, min - onHand);
        const leadDays = Math.max(0, vendor?.leadDays ?? 0);
        const nextOrderIn = daysUntilNextOrder(vendor?.orderingDays, now);
        const urgencyAdd = Math.max(0, leadDays + Math.max(0, 2 - nextOrderIn));
        const rawSuggested = deficit + Math.max(0, weeklyUsage * 0.25) + urgencyAdd;
        if (rawSuggested <= 0)
            return;
        const isLbsDirect = item.unit === "lbs" && (item.caseSize ?? 0) === 1;
        if (isLbsDirect) {
            suggestions.push({
                itemId: itemDoc.id,
                suggestedQty: Number(rawSuggested.toFixed(3)),
                unit: "lbs",
                rationale: `${item.name ?? itemDoc.id}: below min, vendor window in ${nextOrderIn} day(s), weight-based caseSize=1 so ordering lbs directly.`,
                caseRounded: false,
                onHand,
                minQuantity: min
            });
            return;
        }
        const qtyPerCase = Math.max(1, item.qtyPerCase ?? 1);
        const cases = Math.ceil(rawSuggested / qtyPerCase);
        suggestions.push({
            itemId: itemDoc.id,
            suggestedQty: cases * qtyPerCase,
            unit: item.unit ?? "each",
            rationale: `${item.name ?? itemDoc.id}: below min, vendor window in ${nextOrderIn} day(s), rounded to full cases (${cases} x ${qtyPerCase}).`,
            caseRounded: true,
            onHand,
            minQuantity: min
        });
    });
    const orderRef = adminDb
        .collection(`organizations/${input.orgId}/regions/${storePath.regionId}/districts/${storePath.districtId}/stores/${storePath.storeId}/orders`)
        .doc();
    await orderRef.set({
        organizationId: input.orgId,
        storeId: input.storeId,
        vendorId: input.vendorId ?? "mixed",
        status: "suggested",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: uid,
        vendorCutoffAt: null
    });
    const batch = adminDb.batch();
    suggestions.forEach((line) => {
        batch.set(orderRef.collection("lines").doc(), line);
    });
    const todos = [
        {
            organizationId: input.orgId,
            storeId: input.storeId,
            type: "auto",
            title: `Place order ${input.vendorId ? `for ${input.vendorId}` : "for suggested items"}`,
            dueAt: FieldValue.serverTimestamp(),
            status: "open",
            createdAt: FieldValue.serverTimestamp(),
            createdBy: uid
        },
        {
            organizationId: input.orgId,
            storeId: input.storeId,
            type: "auto",
            title: "Spot check before order in 1 day",
            dueAt: FieldValue.serverTimestamp(),
            status: "open",
            createdAt: FieldValue.serverTimestamp(),
            createdBy: uid
        }
    ];
    const todoCollection = adminDb.collection(`organizations/${input.orgId}/regions/${storePath.regionId}/districts/${storePath.districtId}/stores/${storePath.storeId}/toDo`);
    todos.forEach((todo) => batch.set(todoCollection.doc(), todo));
    await batch.commit();
    await writeAuditLog({
        actorUserId: uid,
        actorRoleSnapshot: "Manager",
        organizationId: input.orgId,
        storeId: input.storeId,
        targetPath: orderRef.path,
        action: "create",
        after: { lines: suggestions.length }
    });
    return {
        orderId: orderRef.id,
        lines: suggestions,
        todosCreated: todos.length
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
    return {
        inventoryValue,
        wasteCostWeek,
        wasteCostMonth,
        expiringSoonValue,
        overstocked
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
    await requirePlatformAdmin(request);
    const uid = String(request.data?.uid ?? "");
    const enabled = Boolean(request.data?.enabled);
    if (!uid)
        throw new HttpsError("invalid-argument", "uid required");
    await adminAuth.setCustomUserClaims(uid, { platform_admin: enabled });
    return { ok: true };
});
