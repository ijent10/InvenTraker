import Foundation
import SwiftData
#if canImport(Network)
import Network
#endif

@MainActor
final class ActionSyncService {
    static let shared = ActionSyncService()

    private let logger: AuditLogging
    private let stateSyncer: InventoryStateSyncing
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private var autoSyncContext: ModelContext?
    private var autoSyncOrganizationId: String?
    private var networkAvailable = true
    private var lastSnapshotSyncByOrg: [String: Date] = [:]
    private let snapshotSyncInterval: TimeInterval = 600

#if canImport(Network)
    private var monitor: NWPathMonitor?
    private let monitorQueue = DispatchQueue(label: "inven.sync.network.monitor")
#endif
    private var monitorStarted = false

    private init(
        logger: AuditLogging? = nil,
        stateSyncer: InventoryStateSyncing? = nil
    ) {
        self.logger = logger ?? AuditLogger.shared
        self.stateSyncer = stateSyncer ?? InventoryStateSyncService.shared
    }

    func configureAutoSync(organizationId: String?, modelContext: ModelContext) {
        autoSyncContext = modelContext
        autoSyncOrganizationId = organizationId
        startNetworkMonitorIfNeeded()

        Task {
            await flushAllPendingActions(modelContext: modelContext)
        }
    }

    func appDidBecomeActive(
        organizationId: String?,
        modelContext: ModelContext,
        allowSnapshot: Bool = true
    ) async {
        autoSyncContext = modelContext
        autoSyncOrganizationId = organizationId
        await flushAllPendingActions(modelContext: modelContext)
        guard allowSnapshot else { return }
        await syncSnapshotIfNeeded(
            organizationId: organizationId,
            modelContext: modelContext,
            force: false
        )
    }

    func logAndApply(
        action: ActionPayload,
        refs: AuditObjectRefs,
        baseRevision: Int?,
        session: AccountSessionStore,
        modelContext: ModelContext
    ) async {
        let actorUid = session.firebaseUser?.id ?? "unknown"
        let actorRole = session.activeMembership?.role ?? .viewer
        await logAndApply(
            action: action,
            refs: refs,
            baseRevision: baseRevision,
            actorUid: actorUid,
            actorRole: actorRole,
            modelContext: modelContext
        )
    }

    func logAndApply(
        action: ActionPayload,
        refs: AuditObjectRefs,
        baseRevision: Int?,
        actorUid: String,
        actorRole: UserRole,
        modelContext: ModelContext
    ) async {
        guard let payloadData = try? encoder.encode(action) else { return }
        guard let refsData = try? encoder.encode(refs) else { return }

        let pending = PendingSyncAction(
            organizationId: refs.organizationId,
            actionType: action.actionType,
            payloadData: payloadData,
            refsData: refsData,
            actorUid: actorUid,
            actorRole: actorRole,
            baseRevision: baseRevision
        )
        modelContext.insert(pending)
        try? modelContext.save()

        if stateSyncer.remoteSyncAvailable && !networkAvailable {
            return
        }
        await flushPendingActions(organizationId: refs.organizationId, modelContext: modelContext)
    }

    func flushAllPendingActions(modelContext: ModelContext) async {
        let descriptor = FetchDescriptor<PendingSyncAction>()
        let actions = (try? modelContext.fetch(descriptor)) ?? []
        let pendingOrFailed = actions.filter { $0.status == .pending || $0.status == .failed }
        let organizationIDs = Set(pendingOrFailed.map(\.organizationId))
        for organizationId in organizationIDs {
            await flushPendingActions(organizationId: organizationId, modelContext: modelContext)
        }
    }

    func flushPendingActions(
        organizationId: String,
        modelContext: ModelContext
    ) async {
        if stateSyncer.remoteSyncAvailable && !networkAvailable {
            return
        }

        var descriptor = FetchDescriptor<PendingSyncAction>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        descriptor.sortBy = [SortDescriptor(\.createdAt, order: .forward)]

        let pendingActions = (try? modelContext.fetch(descriptor)) ?? []
        let actionable = pendingActions.filter {
            $0.status == .pending || $0.status == .failed
        }

        guard !actionable.isEmpty else {
            return
        }

        for pending in actionable {
            do {
                let action = try decoder.decode(ActionPayload.self, from: pending.payloadData)
                let refs = try decoder.decode(AuditObjectRefs.self, from: pending.refsData)
                let record = AuditActionRecord(
                    id: pending.id.uuidString,
                    type: action.actionType,
                    actorUid: pending.actorUid,
                    actorRole: pending.actorRole,
                    deviceId: Self.deviceID,
                    createdAt: pending.createdAt,
                    objectRefs: refs,
                    payload: action,
                    baseRevision: pending.baseRevision,
                    resultStatus: "ok"
                )

                // Push materialized inventory state first so retries are idempotent.
                try await stateSyncer.syncState(for: action, refs: refs, modelContext: modelContext)
                try await logger.log(record)

                pending.status = .synced
                pending.lastError = nil
            } catch {
                pending.retryCount += 1
                let message = error.localizedDescription
                pending.lastError = message
                pending.status = message.lowercased().contains("conflict") ? .conflict : .failed
            }
        }

        try? modelContext.save()
        await syncSnapshotIfNeeded(
            organizationId: organizationId,
            modelContext: modelContext,
            force: false
        )
    }

    private func syncSnapshotIfNeeded(
        organizationId: String?,
        modelContext: ModelContext,
        force: Bool
    ) async {
        guard let organizationId, !organizationId.isEmpty else { return }
        if stateSyncer.remoteSyncAvailable && !networkAvailable {
            return
        }
        if !force && !hasPendingActions(organizationId: organizationId, modelContext: modelContext) {
            return
        }
        let now = Date()
        if
            !force,
            let last = lastSnapshotSyncByOrg[organizationId],
            now.timeIntervalSince(last) < snapshotSyncInterval
        {
            return
        }

        do {
            try await stateSyncer.syncFullSnapshot(
                organizationId: organizationId,
                modelContext: modelContext
            )
            lastSnapshotSyncByOrg[organizationId] = now
        } catch {
            // Keep outbox actions pending; snapshot sync will retry on next cycle.
        }
    }

    private func startNetworkMonitorIfNeeded() {
        guard !monitorStarted else { return }
        monitorStarted = true
#if canImport(Network)
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                guard let self else { return }
                self.networkAvailable = (path.status == .satisfied)
                guard self.networkAvailable else { return }
                guard let context = self.autoSyncContext else { return }
                await self.flushAllPendingActions(modelContext: context)
            }
        }
        monitor.start(queue: monitorQueue)
        self.monitor = monitor
#endif
    }

    private func hasPendingActions(organizationId: String, modelContext: ModelContext) -> Bool {
        let descriptor = FetchDescriptor<PendingSyncAction>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        guard let actions = try? modelContext.fetch(descriptor) else { return false }
        return actions.contains(where: { $0.status == .pending || $0.status == .failed })
    }

    private static var deviceID: String {
        if let existing = UserDefaults.standard.string(forKey: "sync_device_id") {
            return existing
        }
        let generated = UUID().uuidString
        UserDefaults.standard.set(generated, forKey: "sync_device_id")
        return generated
    }
}
