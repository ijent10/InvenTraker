import Foundation
import Combine

protocol NativeWorkspaceAPI: Sendable {
    func workspaceCatalog(device: WorkspaceDevice, orgId: String) async throws -> WorkspaceCatalogResponse
    func workspaceLayout(device: WorkspaceDevice, orgId: String) async throws -> WorkspaceLayoutResponse
    func saveWorkspaceLayout(_ layout: WorkspaceLayout, expectedRevision: Int) async throws -> WorkspaceLayoutCommit
    func workspaceWidgets(storeId: String, orgId: String, ids: [String]) async throws -> NativeWorkspaceData
    func workspaceInvalidation(storeId: String, orgId: String) async throws -> NativeWorkspaceInvalidation
}
extension APIClient: NativeWorkspaceAPI {}

@MainActor
final class NativeWorkspaceStore: ObservableObject {
    @Published private(set) var layout: WorkspaceLayout?
    @Published private(set) var definitions: [NativeWidgetDefinition] = []
    @Published private(set) var data: NativeWorkspaceData?
    @Published private(set) var recovery: NativeWorkspaceDraft?
    @Published private(set) var conflict: WorkspaceLayout?
    @Published private(set) var history: [WorkspaceLayout] = []
    @Published private(set) var saving = false
    @Published private(set) var loading = false
    @Published private(set) var activeGestureId: String?
    @Published private(set) var stale = false
    @Published private(set) var message = ""
    private let api: any NativeWorkspaceAPI
    private let uid: String
    private let orgId: String
    let device: WorkspaceDevice
    private let cacheKey: String
    private var base: WorkspaceLayout?
    private var seed: WorkspaceLayout?
    private var revision = 0
    private var baseRevision = 0
    private var gestureBase: WorkspaceLayout?
    var gestureOrigin: WorkspaceWidget? { gestureBase?.widgets.first { $0.id == activeGestureId } }
    private var storeId = ""
    private var refreshGeneration = UUID()
    private var loadedAt: Date?

    init(api: any NativeWorkspaceAPI, uid: String, orgId: String, device: WorkspaceDevice) {
        self.api = api; self.uid = uid; self.orgId = orgId; self.device = device
        // JSON encoding avoids ambiguous identities when IDs contain separators.
        let identity = (try? JSONEncoder().encode([uid, orgId, device.rawValue])) ?? Data()
        cacheKey = "inventraker.workspace-native-draft." + identity.base64EncodedString()
    }
    private func scoped(_ value: WorkspaceLayout) -> Bool {
        WorkspaceGeometry.valid(value) && value.userId == uid && value.organizationId == orgId && value.deviceClass == device
    }
    func load() async {
        guard !loading else { return }
        loading = true; message = ""
        defer { loading = false }
        do {
            async let catalogCall = api.workspaceCatalog(device: device, orgId: orgId)
            async let layoutCall = api.workspaceLayout(device: device, orgId: orgId)
            let (catalog, remote) = try await (catalogCall, layoutCall)
            guard !Task.isCancelled, catalog.schemaVersion == "1", scoped(catalog.seedLayout), remote.layout.map(scoped) ?? true else { return }
            definitions = catalog.definitions; seed = catalog.defaultLayout
            layout = remote.layout ?? catalog.seedLayout; base = layout; revision = remote.layout?.revision ?? 0; baseRevision = revision
            if let bytes = UserDefaults.standard.data(forKey: cacheKey), let draft = try? JSONDecoder().decode(NativeWorkspaceDraft.self, from: bytes), scoped(draft.layout), draft.expectedRevision >= 0 { recovery = draft }
            if remote.layout == nil && recovery == nil, let initial = layout {
                do {
                    let initialized = try await api.saveWorkspaceLayout(initial, expectedRevision: 0)
                    guard !Task.isCancelled else { return }
                    if let saved = initialized.layout ?? initialized.current, scoped(saved) {
                        layout = saved; base = saved; revision = saved.revision; baseRevision = revision
                    }
                } catch { message = "Your home is ready on this device. Customize and choose Done to sync it when connected." }
            }
            if !catalog.unresolvedIds.isEmpty { message = "Some older widgets are no longer available. Your original preferences are preserved." }
        } catch { if !Task.isCancelled { message = "Your home could not load. Check your connection and retry." } }
    }
    func update(_ next: WorkspaceLayout) {
        guard !saving, !loading, scoped(next), let previous = layout, next != previous else { return }
        history = Array((history + [previous]).suffix(30)); layout = next; message = ""
        cacheDraft()
    }
    private func cacheDraft() {
        guard let layout, let bytes = try? JSONEncoder().encode(NativeWorkspaceDraft(layout: layout, expectedRevision: revision)) else { return }
        UserDefaults.standard.set(bytes, forKey: cacheKey)
    }
    func restoreDraft() {
        guard let recovery else { return }
        revision = recovery.expectedRevision; layout = recovery.layout; self.recovery = nil; message = "Unfinished edits restored."
    }
    func discardDraft() { recovery = nil; UserDefaults.standard.removeObject(forKey: cacheKey) }
    func undo() { guard !saving, !loading, let previous = history.popLast() else { return }; layout = previous; cacheDraft() }
    func cancel() { guard !saving, !loading else { return }; gestureBase = nil; activeGestureId = nil; layout = base; revision = baseRevision; history = []; conflict = nil; message = ""; discardDraft() }
    func reset() {
        guard var next = seed, let current = layout else { return }
        next.id = current.id; next.revision = current.revision
        update(next)
    }
    func add(_ definition: NativeWidgetDefinition) {
        guard var next = layout, next.widgets.count < 60 else { return }
        next.widgets.append(WorkspaceWidget(id: UUID().uuidString.lowercased(), engineId: definition.engineId, widgetDefinitionId: definition.id, gridX: 0, gridY: 0, gridWidth: 1, gridHeight: 1, size: definition.supportedSizes.contains(.medium) ? .medium : definition.supportedSizes[0], mode: .automatic, preferences: [:]))
        next.widgets = WorkspaceGeometry.pack(next.widgets, device: device); update(next)
    }
    func remove(_ id: String) {
        guard var next = layout else { return }
        next.widgets.removeAll { $0.id == id }; next.widgets = WorkspaceGeometry.compact(next.widgets, device: device); update(next)
    }
    func configure(_ widget: WorkspaceWidget) {
        guard var next = layout, let index = next.widgets.firstIndex(where: { $0.id == widget.id }) else { return }
        next.widgets[index] = widget; next.widgets = WorkspaceGeometry.pack(next.widgets, device: device, active: widget.id); update(next)
    }
    func setShape(_ shape: WorkspaceShape) { guard var next = layout else { return }; next.shapePreference = shape; update(next) }
    func move(_ item: WorkspaceWidget, x: Int, y: Int) {
        var next = item; next.gridX += x; next.gridY = min(500, max(0, next.gridY + y)); configure(next)
    }
    func resize(_ item: WorkspaceWidget, larger: Bool) {
        let supported = definitions.first { $0.id == item.widgetDefinitionId }?.supportedSizes ?? WorkspaceSize.allCases
        let sizes = WorkspaceSize.allCases.filter { supported.contains($0) }
        guard let index = sizes.firstIndex(of: item.size) else { return }
        var next = item; next.size = sizes[max(0, min(sizes.count - 1, index + (larger ? 1 : -1)))]; configure(next)
    }
    func previewGesture(id: String, dx: Double, dy: Double, resize: Bool) {
        guard !saving, !loading else { return }
        if gestureBase == nil { gestureBase = layout; activeGestureId = id }
        guard var next = gestureBase, let index = next.widgets.firstIndex(where: { $0.id == id }) else { return }
        let item = next.widgets[index]
        if resize {
            let supported = definitions.first { $0.id == item.widgetDefinitionId }?.supportedSizes ?? WorkspaceSize.allCases
            next.widgets[index].size = WorkspaceGeometry.snap(width: Double(item.gridWidth) + dx, height: Double(item.gridHeight) + dy, supported: supported, device: device)
        } else {
            next.widgets[index].gridX += Int(dx.rounded()); next.widgets[index].gridY = min(500, max(0, next.widgets[index].gridY + Int(dy.rounded())))
        }
        next.widgets = WorkspaceGeometry.pack(next.widgets, device: device, active: id)
        if scoped(next) { layout = next }
    }
    func finishGesture() {
        guard let previous = gestureBase, var next = layout else { return }
        gestureBase = nil; activeGestureId = nil; layout = previous
        next.widgets = WorkspaceGeometry.compact(next.widgets, device: device); update(next)
    }
    func save(keepingLocal: Bool = false) async -> Bool {
        guard !saving, !loading, let proposed = layout else { return false }
        saving = true; message = ""
        defer { saving = false }
        do {
            let result = try await api.saveWorkspaceLayout(proposed, expectedRevision: keepingLocal ? conflict?.revision ?? revision : revision)
            guard !Task.isCancelled else { return false }
            if result.status == "conflict", let current = result.current, scoped(current) {
                conflict = current; message = "Another device changed this home. Choose which version to keep."; return false
            }
            guard result.status == "saved", let saved = result.layout, scoped(saved) else { throw APIClientError.invalidResponse }
            layout = saved; base = saved; revision = saved.revision; baseRevision = revision; history = []; conflict = nil; discardDraft(); message = "Home saved."
            return true
        } catch { if !Task.isCancelled { message = "Saving failed. Your edits remain on this device. Reconnect and try Done again." }; return false }
    }
    func useRemote() {
        guard let conflict else { return }
        layout = conflict; base = conflict; revision = conflict.revision; baseRevision = revision; history = []; self.conflict = nil; discardDraft(); message = "Saved home loaded."
    }
    func refresh(storeId newStore: String, force: Bool = false) async {
        if storeId != newStore { storeId = newStore; data = nil; loadedAt = nil; stale = false; refreshGeneration = UUID() }
        guard !newStore.isEmpty, let layout else { return }
        let generation = UUID(); refreshGeneration = generation
        let ids = layout.widgets.compactMap { item in definitions.first { $0.id == item.widgetDefinitionId && $0.dataSource.hasPrefix("store-summary:") }?.id }
        do {
            if !force, let loadedAt, Date().timeIntervalSince(loadedAt) < 60 {
                let cursor = try? await api.workspaceInvalidation(storeId: newStore, orgId: orgId)
                if let cursor, cursor.stockRevision == data?.stockRevision { return }
            }
            guard !Task.isCancelled, refreshGeneration == generation else { return }
            let facts = try await api.workspaceWidgets(storeId: newStore, orgId: orgId, ids: ids)
            guard !Task.isCancelled, refreshGeneration == generation, facts.storeId == storeId else { return }
            data = facts; loadedAt = Date(); stale = false
        } catch {
            guard !Task.isCancelled, refreshGeneration == generation else { return }
            if let apiError = error as? APIClientError, ["membership_required", "account_inactive", "account_suspended", "store_access_denied", "permission_denied", "unauthenticated", "invalid_session"].contains(apiError.code) { data = nil }
            stale = true
        }
    }
    func invalidateVisibleData() { refreshGeneration = UUID(); data = nil; loadedAt = nil }
    var factsAreStale: Bool { stale || (data.flatMap { workspaceDate($0.generatedAt) }.map { Date().timeIntervalSince($0) > 120 } ?? true) }
}
