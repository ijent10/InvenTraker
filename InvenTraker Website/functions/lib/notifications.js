import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb, adminMessaging } from "./lib/firebase.js";
import { requireAuth, requirePermission, requirePlatformAdmin, requireStoreAccess } from "./lib/auth.js";
const dispatchModeSchema = z.enum(["immediate", "scheduled"]);
const sendOrgNotificationRequestSchema = z.object({
    orgId: z.string().min(1),
    storeId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1),
    content: z.string().trim().min(1),
    attachmentAssetId: z.string().trim().optional(),
    attachmentName: z.string().trim().optional(),
    attachmentUrl: z.string().trim().optional(),
    attachmentContentType: z.string().trim().optional(),
    attachmentSizeBytes: z.number().int().nonnegative().optional(),
    roleTargets: z.array(z.string().trim().min(1)).min(1),
    dispatchMode: dispatchModeSchema,
    scheduledFor: z.union([z.string(), z.number(), z.date()]).optional(),
    senderName: z.string().trim().optional(),
    senderEmployeeId: z.string().trim().optional()
});
const removeOrgNotificationRequestSchema = z.object({
    orgId: z.string().min(1),
    notificationId: z.string().min(1)
});
const sendPlatformNotificationRequestSchema = z.object({
    orgId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1),
    content: z.string().trim().min(1),
    includeEmployees: z.boolean().default(false)
});
function parseDate(value) {
    if (!value)
        return null;
    if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === "number") {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value === "string") {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}
function normalizeText(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function roleAliases(role, jobTitle) {
    const aliases = new Set();
    const normalizedRole = normalizeText(role);
    if (normalizedRole)
        aliases.add(normalizedRole);
    switch (normalizedRole) {
        case "owner":
            aliases.add("admin");
            break;
        case "manager":
            aliases.add("lead");
            break;
        case "staff":
        case "employee":
        case "viewer":
            aliases.add("team");
            aliases.add("staff");
            aliases.add("employee");
            break;
        default:
            break;
    }
    const normalizedTitle = normalizeText(jobTitle);
    if (normalizedTitle) {
        aliases.add(normalizedTitle);
        aliases.add(normalizedTitle.replace(/\s+/g, ""));
    }
    return aliases;
}
function memberMatchesRoleTargets(normalizedTargets, role, jobTitle) {
    if (normalizedTargets.has("all") ||
        normalizedTargets.has("everyone") ||
        normalizedTargets.has("team")) {
        return true;
    }
    const aliases = roleAliases(role, jobTitle);
    for (const alias of aliases) {
        if (normalizedTargets.has(alias))
            return true;
    }
    return false;
}
async function resolveRecipientUserIds(input) {
    const orgRef = adminDb.collection("organizations").doc(input.orgId);
    const membersSnap = await orgRef.collection("members").get();
    const orgSnap = await orgRef.get();
    const orgData = orgSnap.data() ?? {};
    const orgOwnerIds = new Set([
        ...(Array.isArray(orgData.ownerUserIds) ? orgData.ownerUserIds : []),
        ...(typeof orgData.ownerUid === "string" && orgData.ownerUid.trim().length > 0 ? [orgData.ownerUid.trim()] : [])
    ]);
    const normalizedTargets = new Set(input.roleTargets.map((entry) => normalizeText(entry)).filter(Boolean));
    const resolved = new Set();
    for (const doc of membersSnap.docs) {
        const data = doc.data();
        const uid = typeof data.userId === "string" && data.userId.trim().length > 0 ? data.userId.trim() : doc.id;
        const role = normalizeText(data.role || "");
        const isOwner = role === "owner" || orgOwnerIds.has(uid);
        if (input.storeId && input.storeId.trim().length > 0 && !isOwner) {
            const storeIds = Array.isArray(data.storeIds)
                ? data.storeIds.filter((entry) => typeof entry === "string")
                : [];
            if (!storeIds.includes(input.storeId)) {
                continue;
            }
        }
        if (!memberMatchesRoleTargets(normalizedTargets, role, data.jobTitle)) {
            continue;
        }
        resolved.add(uid);
    }
    for (const ownerUid of orgOwnerIds) {
        if (!ownerUid)
            continue;
        if (memberMatchesRoleTargets(normalizedTargets, "owner", "owner")
            || normalizedTargets.has("all")
            || normalizedTargets.has("everyone")
            || normalizedTargets.has("team")) {
            resolved.add(ownerUid);
        }
    }
    return [...resolved];
}
async function loadRecipientDeviceTokens(userIds) {
    const tokenToDocPath = new Map();
    for (const uid of userIds) {
        const devicesSnap = await adminDb.collection("users").doc(uid).collection("devices").get();
        for (const deviceDoc of devicesSnap.docs) {
            const data = deviceDoc.data();
            if (data.disabled === true)
                continue;
            const token = typeof data.fcmToken === "string" ? data.fcmToken.trim() : "";
            if (!token)
                continue;
            tokenToDocPath.set(token, deviceDoc.ref.path);
        }
    }
    return tokenToDocPath;
}
async function sendPushForNotification(input) {
    const userIds = await resolveRecipientUserIds({
        orgId: input.orgId,
        roleTargets: input.roleTargets,
        storeId: input.storeId ?? null
    });
    if (userIds.length === 0) {
        return { recipientUsers: 0, recipientDevices: 0, sent: 0, failed: 0 };
    }
    const tokenToDocPath = await loadRecipientDeviceTokens(userIds);
    const tokens = [...tokenToDocPath.keys()];
    if (tokens.length === 0) {
        return { recipientUsers: userIds.length, recipientDevices: 0, sent: 0, failed: 0 };
    }
    const staleDocPaths = new Set();
    let sent = 0;
    let failed = 0;
    const chunkSize = 500;
    for (let offset = 0; offset < tokens.length; offset += chunkSize) {
        const chunk = tokens.slice(offset, offset + chunkSize);
        const response = await adminMessaging().sendEachForMulticast({
            tokens: chunk,
            notification: {
                title: input.title,
                body: input.body
            },
            data: {
                type: "org_notification",
                orgId: input.orgId,
                storeId: input.storeId ?? "",
                notificationId: input.notificationId
            },
            android: {
                priority: "high",
                notification: {
                    channelId: "org_notifications",
                    priority: "high",
                    sound: "default"
                }
            },
            apns: {
                headers: {
                    "apns-priority": "10",
                    "apns-push-type": "alert"
                },
                payload: {
                    aps: {
                        alert: {
                            title: input.title,
                            body: input.body
                        },
                        sound: "default"
                    }
                }
            }
        });
        sent += response.successCount;
        failed += response.failureCount;
        response.responses.forEach((entry, index) => {
            if (entry.success)
                return;
            const code = entry.error?.code ?? "";
            if (code.includes("registration-token-not-registered")
                || code.includes("invalid-registration-token")
                || code.includes("invalid-argument")) {
                const token = chunk[index];
                if (!token)
                    return;
                const docPath = tokenToDocPath.get(token);
                if (docPath)
                    staleDocPaths.add(docPath);
            }
        });
    }
    if (staleDocPaths.size > 0) {
        const batch = adminDb.batch();
        for (const path of staleDocPaths) {
            batch.delete(adminDb.doc(path));
        }
        await batch.commit();
    }
    return {
        recipientUsers: userIds.length,
        recipientDevices: tokens.length,
        sent,
        failed
    };
}
async function writeNotificationAudit(input) {
    await adminDb.collection("auditLogs").doc().set({
        actorUserId: input.actorUserId,
        actorRoleSnapshot: input.actorRole,
        organizationId: input.orgId,
        storeId: input.storeId ?? null,
        targetPath: input.targetPath,
        action: input.action,
        before: input.before ?? null,
        after: input.after ?? null,
        createdAt: FieldValue.serverTimestamp()
    });
}
export const sendOrgNotification = onCall(async (request) => {
    const uid = requireAuth(request);
    const input = sendOrgNotificationRequestSchema.parse(request.data ?? {});
    const member = await requirePermission(input.orgId, uid, "sendNotifications");
    if (input.storeId) {
        await requireStoreAccess(input.orgId, uid, input.storeId);
    }
    const scheduledFor = parseDate(input.scheduledFor);
    if (input.dispatchMode === "scheduled") {
        if (!scheduledFor) {
            throw new HttpsError("invalid-argument", "Scheduled notifications require a valid scheduledFor.");
        }
        if (scheduledFor.getTime() <= Date.now()) {
            throw new HttpsError("invalid-argument", "scheduledFor must be in the future.");
        }
    }
    const ref = adminDb.collection("organizations").doc(input.orgId).collection("notifications").doc();
    const normalizedRoleTargets = [...new Set(input.roleTargets.map((entry) => entry.trim().toLowerCase()))];
    const payload = {
        organizationId: input.orgId,
        storeId: input.storeId ?? null,
        name: input.name.trim(),
        content: input.content.trim(),
        attachmentAssetId: input.attachmentAssetId ?? null,
        attachmentName: input.attachmentName ?? null,
        attachmentUrl: input.attachmentUrl ?? null,
        attachmentContentType: input.attachmentContentType ?? null,
        attachmentSizeBytes: input.attachmentSizeBytes ?? null,
        roleTargets: normalizedRoleTargets,
        dispatchMode: input.dispatchMode,
        status: input.dispatchMode === "scheduled" ? "queued" : "sent",
        scheduledFor: input.dispatchMode === "scheduled" && scheduledFor ? Timestamp.fromDate(scheduledFor) : null,
        senderName: input.senderName ?? null,
        senderEmployeeId: input.senderEmployeeId ?? null,
        createdBy: uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    };
    await ref.set(payload);
    let pushSummary = null;
    let pushError = null;
    if (payload.dispatchMode === "immediate") {
        try {
            pushSummary = await sendPushForNotification({
                orgId: input.orgId,
                storeId: input.storeId ?? null,
                notificationId: ref.id,
                title: payload.name,
                body: payload.content,
                roleTargets: normalizedRoleTargets
            });
        }
        catch (error) {
            pushError = error instanceof Error ? error.message : "push-dispatch-failed";
        }
        await ref.set({
            push: {
                ...(pushSummary ?? {
                    recipientUsers: 0,
                    recipientDevices: 0,
                    sent: 0,
                    failed: 0
                }),
                error: pushError,
                attemptedAt: FieldValue.serverTimestamp()
            }
        }, { merge: true });
    }
    await writeNotificationAudit({
        actorUserId: uid,
        actorRole: member.role,
        orgId: input.orgId,
        storeId: input.storeId ?? null,
        targetPath: ref.path,
        action: "create",
        after: payload
    });
    return { ok: true, id: ref.id, pushSummary, pushError };
});
export const removeOrgNotification = onCall(async (request) => {
    const uid = requireAuth(request);
    const input = removeOrgNotificationRequestSchema.parse(request.data ?? {});
    const member = await requirePermission(input.orgId, uid, "sendNotifications");
    const ref = adminDb.collection("organizations").doc(input.orgId).collection("notifications").doc(input.notificationId);
    const snap = await ref.get();
    if (!snap.exists)
        return { ok: true };
    const data = snap.data();
    if (data?.storeId) {
        await requireStoreAccess(input.orgId, uid, data.storeId);
    }
    // Only allow canceling queued scheduled notifications.
    if (data?.dispatchMode !== "scheduled" || data?.status !== "queued") {
        throw new HttpsError("failed-precondition", "Only queued scheduled notifications can be removed.");
    }
    await ref.delete();
    await writeNotificationAudit({
        actorUserId: uid,
        actorRole: member.role,
        orgId: input.orgId,
        storeId: data?.storeId ?? null,
        targetPath: ref.path,
        action: "delete",
        before: snap.data()
    });
    return { ok: true };
});
export const sendPlatformNotification = onCall(async (request) => {
    const uid = requireAuth(request);
    requirePlatformAdmin(request);
    const input = sendPlatformNotificationRequestSchema.parse(request.data ?? {});
    const orgIds = [];
    if (input.orgId?.trim()) {
        orgIds.push(input.orgId.trim());
    }
    else {
        const organizations = await adminDb.collection("organizations").limit(1000).get();
        for (const org of organizations.docs) {
            orgIds.push(org.id);
        }
    }
    const roleTargets = input.includeEmployees ? ["owner", "manager", "staff", "employee"] : ["owner"];
    let created = 0;
    let sent = 0;
    let failed = 0;
    for (const orgId of orgIds) {
        const ref = adminDb.collection("organizations").doc(orgId).collection("notifications").doc();
        const payload = {
            organizationId: orgId,
            storeId: null,
            name: input.name.trim(),
            content: input.content.trim(),
            attachmentAssetId: null,
            attachmentName: null,
            attachmentUrl: null,
            attachmentContentType: null,
            attachmentSizeBytes: null,
            roleTargets,
            dispatchMode: "immediate",
            status: "sent",
            scheduledFor: null,
            senderName: "InvenTraker Admin",
            senderEmployeeId: null,
            createdBy: uid,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        };
        await ref.set(payload);
        created += 1;
        try {
            const summary = await sendPushForNotification({
                orgId,
                notificationId: ref.id,
                title: payload.name,
                body: payload.content,
                roleTargets
            });
            sent += summary.sent;
            failed += summary.failed;
            await ref.set({
                push: {
                    ...summary,
                    attemptedAt: FieldValue.serverTimestamp(),
                    error: null
                }
            }, { merge: true });
        }
        catch (error) {
            failed += 1;
            await ref.set({
                push: {
                    recipientUsers: 0,
                    recipientDevices: 0,
                    sent: 0,
                    failed: 1,
                    attemptedAt: FieldValue.serverTimestamp(),
                    error: error instanceof Error ? error.message : String(error)
                }
            }, { merge: true });
        }
        await writeNotificationAudit({
            actorUserId: uid,
            actorRole: "PlatformAdmin",
            orgId,
            targetPath: ref.path,
            action: "create",
            after: payload
        });
    }
    return {
        ok: true,
        organizationsNotified: created,
        pushSent: sent,
        pushFailed: failed
    };
});
