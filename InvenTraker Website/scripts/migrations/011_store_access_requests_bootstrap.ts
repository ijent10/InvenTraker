import { FieldValue } from "firebase-admin/firestore"
import type { MigrationResult } from "../lib/firebase-admin"
import { db } from "../lib/firebase-admin"

function normalizeRole(raw: unknown): "owner" | "manager" | "staff" {
  const normalized = String(raw ?? "staff").trim().toLowerCase()
  if (normalized === "owner") return "owner"
  if (normalized === "manager") return "manager"
  return "staff"
}

function defaultPermissionFlags(role: "owner" | "manager" | "staff"): Record<string, boolean> {
  if (role === "owner") {
    return {
      requestStoreAccess: true,
      approveStoreAccessRequests: true,
      sendNotifications: true,
      viewOrganizationInventory: true
    }
  }
  if (role === "manager") {
    return {
      requestStoreAccess: true,
      approveStoreAccessRequests: true,
      sendNotifications: true,
      viewOrganizationInventory: false
    }
  }
  return {
    requestStoreAccess: true,
    approveStoreAccessRequests: false,
    sendNotifications: false,
    viewOrganizationInventory: false
  }
}

export async function run(): Promise<MigrationResult> {
  const result: MigrationResult = {
    id: "011_store_access_requests_bootstrap",
    scanned: 0,
    updated: 0,
    skipped: 0,
    notes: []
  }

  const orgs = await db.collection("organizations").get()

  for (const org of orgs.docs) {
    const members = await org.ref.collection("members").get()
    for (const member of members.docs) {
      result.scanned += 1
      const data = member.data() as Record<string, unknown>
      const role = normalizeRole(data.role)
      const defaults = defaultPermissionFlags(role)
      const existingFlags =
        data.permissionFlags && typeof data.permissionFlags === "object"
          ? { ...(data.permissionFlags as Record<string, boolean>) }
          : {}

      let changed = false
      const mergedFlags: Record<string, boolean> = { ...existingFlags }
      for (const [key, value] of Object.entries(defaults)) {
        if (typeof mergedFlags[key] === "boolean") continue
        mergedFlags[key] = value
        changed = true
      }

      const hasStoreIds = Array.isArray(data.storeIds)
      const payload: Record<string, unknown> = {}
      if (!hasStoreIds) {
        payload.storeIds = role === "owner" ? [] : []
        changed = true
      }
      if (changed) {
        payload.permissionFlags = mergedFlags
        payload.updatedAt = FieldValue.serverTimestamp()
        await member.ref.set(payload, { merge: true })
        result.updated += 1
      } else {
        result.skipped += 1
      }
    }
  }

  result.notes.push("Backfilled store access request permission flags on organization members.")
  result.notes.push("Ensured member documents contain storeIds arrays for role-aware access checks.")
  return result
}

