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
    if (role === "Owner") {
        return {
            manageUsers: true,
            manageStores: true,
            manageOrgSettings: true,
            manageStoreSettings: true,
            manageInventory: true,
            editOrgInventoryMeta: true,
            editStoreInventory: true,
            adjustStoreQuantity: true,
            manageVendors: true,
            manageJobTitles: true,
            manageSales: true,
            manageOrders: true,
            generateOrders: true,
            viewInsights: true,
            manageTodo: true,
            sendNotifications: true,
            manageCentralCatalog: true,
            managePermissions: true,
            viewOrganizationInventory: true,
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
            editOrgInventoryMeta: true,
            editStoreInventory: true,
            adjustStoreQuantity: true,
            manageVendors: true,
            manageJobTitles: true,
            manageSales: true,
            manageOrders: true,
            generateOrders: true,
            viewInsights: true,
            manageTodo: true,
            sendNotifications: true,
            manageCentralCatalog: false,
            managePermissions: false,
            viewOrganizationInventory: false,
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
        editOrgInventoryMeta: false,
        editStoreInventory: false,
        adjustStoreQuantity: false,
        manageVendors: false,
        manageJobTitles: false,
        manageSales: false,
        manageOrders: true,
        generateOrders: true,
        viewInsights: true,
        manageTodo: true,
        sendNotifications: false,
        manageCentralCatalog: false,
        managePermissions: false,
        viewOrganizationInventory: false,
        requestStoreAccess: true,
        approveStoreAccessRequests: false
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
