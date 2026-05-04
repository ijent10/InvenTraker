import { HttpsError } from "firebase-functions/v2/https";
import { adminDb } from "./firebase.js";
const PLATFORM_ADMIN_EMAIL_ALLOWLIST = new Set([
    "ianjjent@icloud.com",
    "ianjent@icloud.com"
]);
function normalizeRole(rawRole, ownerByArray) {
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
function permissionDefaultsForRole(role) {
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
export function requireAuth(request) {
    const uid = request.auth?.uid;
    if (!uid)
        throw new HttpsError("unauthenticated", "Authentication required");
    return uid;
}
export async function requirePlatformAdmin(request) {
    const uid = requireAuth(request);
    const isPlatformAdmin = request.auth?.token?.platform_admin === true;
    if (isPlatformAdmin)
        return uid;
    const tokenEmail = typeof request.auth?.token?.email === "string"
        ? request.auth.token.email.trim().toLowerCase()
        : null;
    if (tokenEmail && PLATFORM_ADMIN_EMAIL_ALLOWLIST.has(tokenEmail)) {
        await adminDb.doc(`users/${uid}`).set({
            email: tokenEmail,
            platformRoles: { platformAdmin: true }
        }, { merge: true });
        return uid;
    }
    const userSnap = await adminDb.doc(`users/${uid}`).get();
    const userData = userSnap.data() ?? {};
    const userEmail = typeof userData.email === "string" ? userData.email.trim().toLowerCase() : null;
    if (userEmail && PLATFORM_ADMIN_EMAIL_ALLOWLIST.has(userEmail)) {
        await adminDb.doc(`users/${uid}`).set({
            platformRoles: { platformAdmin: true }
        }, { merge: true });
        return uid;
    }
    if (userData.platformRoles?.platformAdmin !== true) {
        throw new HttpsError("permission-denied", "Platform admin required");
    }
    return uid;
}
export async function getMembership(orgId, uid) {
    const snap = await adminDb.doc(`organizations/${orgId}/members/${uid}`).get();
    const member = snap.exists
        ? snap.data()
        : null;
    const orgSnap = await adminDb.doc(`organizations/${orgId}`).get();
    const orgData = orgSnap.data() ?? {};
    const ownerUserIds = orgData.ownerUserIds ?? [];
    const ownerByArray = ownerUserIds.includes(uid) || orgData.ownerUid === uid;
    const userSnap = await adminDb.doc(`users/${uid}`).get();
    const userData = userSnap.data() ?? {};
    const isPlatformAdmin = userData.platformRoles?.platformAdmin === true;
    if (isPlatformAdmin) {
        return {
            role: "Owner",
            storeIds: [],
            permissionFlags: permissionDefaultsForRole("Owner"),
            ownerByArray: true
        };
    }
    if (!member && !ownerByArray)
        return null;
    return {
        role: normalizeRole(member?.role, ownerByArray),
        storeIds: Array.isArray(member?.storeIds) ? member.storeIds : [],
        permissionFlags: member?.permissionFlags && typeof member.permissionFlags === "object"
            ? { ...permissionDefaultsForRole(normalizeRole(member?.role, ownerByArray)), ...member.permissionFlags }
            : permissionDefaultsForRole(normalizeRole(member?.role, ownerByArray)),
        ownerByArray
    };
}
export async function requireOrgMembership(orgId, uid) {
    const member = await getMembership(orgId, uid);
    if (!member)
        throw new HttpsError("permission-denied", "Not a member of this organization");
    return member;
}
export async function requireStoreAccess(orgId, uid, storeId) {
    const member = await requireOrgMembership(orgId, uid);
    if (member.role === "Owner")
        return member;
    if (member.role === "Manager" || member.role === "Staff") {
        const storeIds = member.storeIds ?? [];
        const allowed = storeIds.includes(storeId);
        if (!allowed)
            throw new HttpsError("permission-denied", "No store access");
    }
    return member;
}
export async function requirePermission(orgId, uid, permissionKey) {
    const member = await requireOrgMembership(orgId, uid);
    if (member.role === "Owner")
        return member;
    if (member.permissionFlags?.[permissionKey] === true)
        return member;
    throw new HttpsError("permission-denied", `Missing required permission: ${permissionKey}`);
}
