import { adminFieldValue } from "@/lib/firebase-admin"
import { firestoreCollections, userPreferencesPath } from "@/lib/firestore-schema"
import {
  assertStoreAccess,
  canAccessMobileStore,
  mobileAssignedStores,
  MOBILE_WORK_SHORTCUTS,
  mobileCapabilities,
  mobileEnvelope,
  mobileError,
  mobileRecord,
  mobileRecordMatchesStore,
  orgCollection,
  requireMobilePrincipal,
  requireMobileStoreId
} from "@/lib/mobile-api"
import { generateTodayIssues, operationalObservability } from "@/lib/today-issues"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    const capabilities = mobileCapabilities(principal)
    const url = new URL(request.url)
    const requestedStoreId = url.searchParams.get("storeId")?.trim() || undefined
    if (requestedStoreId) await assertStoreAccess(principal, requestedStoreId)

    const orgRef = principal.db.collection(firestoreCollections.orgs).doc(principal.orgId)
    const FieldValue = await adminFieldValue()
    const [organization, stores, inventory, batches, orders, healthChecks, notifications, preferences, stockOperations, issueSnapshot] = await Promise.all([
      orgRef.get(),
      orgCollection(principal, firestoreCollections.stores).get(),
      capabilities.canViewInventory ? orgCollection(principal, firestoreCollections.inventory).get() : null,
      capabilities.canViewInventory ? orgCollection(principal, firestoreCollections.inventoryBatches).get() : null,
      capabilities.canViewOrders ? orgCollection(principal, firestoreCollections.orders).get() : null,
      capabilities.canViewHealthChecks ? orgCollection(principal, firestoreCollections.healthChecks).get() : null,
      orgCollection(principal, firestoreCollections.notifications).get(),
      principal.db.doc(userPreferencesPath(principal.uid)).get(),
      orgCollection(principal, firestoreCollections.stockOperations).get(),
      orgCollection(principal, firestoreCollections.operationalIssues).get()
    ])

    let storeRecords = stores.docs
      .map((document) => mobileRecord(document.id, document.data()))
      .filter((store) => canAccessMobileStore(
        principal,
        String(store.id),
        store.name,
        store.code,
        store.address,
        store.location
      ))
    // Existing accounts can still keep their store directory under the
    // original organizations/{id}/stores path. Resolve that directory for an
    // owner before falling back to a store named directly on the member.
    if (storeRecords.length === 0) {
      const organizationData = organization.data() ?? {}
      const legacyOwnerUid = String(organizationData.ownerId ?? organizationData.ownerUid ?? principal.uid).trim()
      const legacyOrganizations = await principal.db
        .collection("organizations")
        .where("ownerUid", "==", legacyOwnerUid)
        .get()
      const legacyDirectories = await Promise.all(legacyOrganizations.docs.map(async (legacyOrganization) => ({
        organization: legacyOrganization,
        stores: await legacyOrganization.ref.collection(firestoreCollections.stores).get()
      })))
      const legacyStoreDocuments = legacyDirectories.flatMap(({ organization: legacyOrganization, stores: legacyStores }) =>
        legacyStores.docs.map((document) => ({ document, legacyOrganizationId: legacyOrganization.id }))
      )
      const uniqueLegacyStores = Array.from(
        new Map(legacyStoreDocuments.map((entry) => [entry.document.id, entry])).values()
      )
      storeRecords = uniqueLegacyStores
        .map(({ document }) => mobileRecord(document.id, document.data()))
        .filter((store) => canAccessMobileStore(
          principal,
          String(store.id),
          store.name,
          store.code,
          store.address,
          store.location
        ))
      if (storeRecords.length === 0) {
        storeRecords = legacyOrganizations.docs.flatMap((legacyOrganization) => {
          const legacyData = legacyOrganization.data()
          const migrationFlags = legacyData.migrationFlags && typeof legacyData.migrationFlags === "object"
            ? legacyData.migrationFlags as Record<string, unknown>
            : {}
          const id = String(
            migrationFlags.orgItemQuantityMovedStoreId ??
            legacyData.defaultStoreId ??
            legacyData.storeId ??
            ""
          ).trim()
          if (!id) return []
          const store = {
            id,
            name: String(legacyData.name ?? organizationData.companyName ?? "Store"),
            legacyOrganizationId: legacyOrganization.id,
            schemaVersion: 1
          }
          return canAccessMobileStore(principal, store.id, store.name) ? [store] : []
        })
      }
      if (uniqueLegacyStores.length > 0) {
        for (let index = 0; index < uniqueLegacyStores.length; index += 400) {
          const migration = principal.db.batch()
          uniqueLegacyStores.slice(index, index + 400).forEach(({ document, legacyOrganizationId }) => {
            migration.set(orgRef.collection(firestoreCollections.stores).doc(document.id), {
              ...document.data(),
              id: document.id,
              legacyOrganizationId,
              schemaVersion: Number(document.data().schemaVersion ?? 1)
            }, { merge: true })
          })
          migration.set(orgRef, {
            legacyOrganizationIds: legacyOrganizations.docs.map((document) => document.id),
            storeDirectoryMigratedAt: FieldValue.serverTimestamp()
          }, { merge: true })
          await migration.commit()
        }
      } else if (storeRecords.length > 0) {
        const migration = principal.db.batch()
        storeRecords.forEach((store) => migration.set(
          orgRef.collection(firestoreCollections.stores).doc(String(store.id)),
          store,
          { merge: true }
        ))
        migration.set(orgRef, {
          legacyOrganizationIds: legacyOrganizations.docs.map((document) => document.id),
          storeDirectoryMigratedAt: FieldValue.serverTimestamp()
        }, { merge: true })
        await migration.commit()
      }
    }
    // Some organizations predate the stores directory and keep a concrete
    // assignment only on the member. Preserve the store requirement while
    // allowing those assigned members to enter their scoped workspace.
    if (storeRecords.length === 0) {
      storeRecords = mobileAssignedStores(principal.member).map((store) => ({
        ...store,
        assignmentSource: "member"
      }))
    }
    const memberStoreId = String(principal.member.storeId ?? "").trim()
    const accessibleMemberStore = storeRecords.find((store) => String(store.id) === memberStoreId)
    const selectedStoreId = requireMobileStoreId(
      requestedStoreId || String(accessibleMemberStore?.id ?? storeRecords[0]?.id ?? "")
    )
    await assertStoreAccess(principal, selectedStoreId)
    const matchesStore = (record: Record<string, unknown>) => mobileRecordMatchesStore(record, selectedStoreId)
    const inventoryRecords = (inventory?.docs ?? []).map((document) => mobileRecord(document.id, document.data())).filter(matchesStore)
    const batchRecords = (batches?.docs ?? []).map((document) => mobileRecord(document.id, document.data())).filter(matchesStore)
    const orderRecords = (orders?.docs ?? []).map((document) => mobileRecord(document.id, document.data())).filter(matchesStore)
    const healthRecords = (healthChecks?.docs ?? []).map((document) => mobileRecord(document.id, document.data())).filter(matchesStore)
    const notificationRecords = notifications.docs.map((document) => mobileRecord(document.id, document.data()))
    const stockOperationRecords = stockOperations.docs.map((document) => mobileRecord(document.id, document.data())).filter(matchesStore)
    const generatedAt = new Date()
    const todayIssues = generateTodayIssues({ storeId: selectedStoreId, inventory: inventoryRecords as never, batches: batchRecords as never, orders: orderRecords as never, stockOperations: stockOperationRecords as never, now: generatedAt })
    const issueWrites: Array<(batch: FirebaseFirestore.WriteBatch) => void> = []
    const activeIssueIds = new Set(todayIssues.map((issue) => issue.id))
    todayIssues.forEach((issue) => issueWrites.push((batch) => batch.set(orgCollection(principal, firestoreCollections.operationalIssues).doc(issue.id), {
      ...issue, generatedAt: generatedAt.toISOString(), lastSeenAt: FieldValue.serverTimestamp(), resolvedAt: null
    }, { merge: true })))
    issueSnapshot.docs.forEach((document) => {
      const issue = document.data()
      if (issue.status === "open" && issue.storeId === selectedStoreId && !activeIssueIds.has(document.id)) {
        issueWrites.push((batch) => batch.update(document.ref, { status: "resolved", resolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }))
      }
    })
    for (let index = 0; index < issueWrites.length; index += 400) {
      const batch = principal.db.batch()
      issueWrites.slice(index, index + 400).forEach((write) => write(batch))
      await batch.commit()
    }
    const preferenceData = preferences.data()
    const savedWorkShortcut = String(preferenceData?.mobileWorkShortcut)
    const workShortcut = MOBILE_WORK_SHORTCUTS.some((shortcut) => shortcut === savedWorkShortcut)
      ? savedWorkShortcut
      : "work"
    const savedTheme = preferenceData?.theme
    const savedThemes = Array.isArray(preferenceData?.savedThemes) ? preferenceData.savedThemes : []

    return Response.json(
      mobileEnvelope({
        session: {
          uid: principal.uid,
          email: principal.email,
          orgId: principal.orgId,
          member: principal.member,
          permissions: principal.permissions
        },
        capabilities,
        organization: mobileRecord(organization.id, organization.data()),
        stores: storeRecords,
        selectedStoreId,
        dashboard: {
          activeItems: inventoryRecords.filter((item) => item.status !== "Archived").length,
          lowStockItems: inventoryRecords.filter((item) => item.status === "Low" || Number(item.onHand ?? 0) <= Number(item.reorderPoint ?? 0)).length,
          openOrders: orderRecords.filter((order) => !["Reconciled", "Cancelled"].includes(String(order.status))).length,
          dueHealthChecks: healthRecords.filter((check) => ["Due today", "Overdue"].includes(String(check.status))).length,
          unreadNotifications: notificationRecords.filter((notification) => !notification.read).length
        },
        inventory: inventoryRecords,
        batches: batchRecords,
        orders: orderRecords,
        healthChecks: healthRecords,
        notifications: notificationRecords,
        today: {
          generatedAt: generatedAt.toISOString(),
          engineVersion: todayIssues[0]?.engineVersion ?? "2026-10-01.1",
          issues: todayIssues,
          observability: {
            ...operationalObservability({ inventory: inventoryRecords as never, batches: batchRecords as never, orders: orderRecords as never, stockOperations: stockOperationRecords as never }),
            unresolvedVariances: todayIssues.filter((issue) => issue.type === "count_variance").length
          }
        },
        preferences: {
          workShortcut,
          ...(savedTheme && typeof savedTheme === "object" ? { theme: savedTheme } : {}),
          savedThemes
        }
      })
    )
  } catch (error) {
    return mobileError(error)
  }
}
