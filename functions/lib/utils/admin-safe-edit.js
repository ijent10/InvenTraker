const safeItemFields = new Set(["upc", "archived", "price", "tags", "departmentId", "locationId", "vendorId"]);
const safeMediaFields = new Set(["originalName", "contentType", "type", "organizationId", "storeId"]);
const safeMemberFields = new Set([
    "storeIds",
    "role",
    "permissionFlags",
    "departmentIds",
    "locationIds",
    "employeeId",
    "firstName",
    "lastName",
    "jobTitle",
    "assignmentType",
    "canManageStoreUsersOnly",
    "status"
]);
export function filterSafePatch(target, patch) {
    const allowed = target === "item" ? safeItemFields : target === "mediaAsset" ? safeMediaFields : safeMemberFields;
    const next = {};
    Object.entries(patch).forEach(([key, value]) => {
        if (allowed.has(key))
            next[key] = value;
    });
    return next;
}
