import Foundation

private struct GeometryCase: Decodable {
    let device: WorkspaceDevice
    let input: [WorkspaceWidget]
    let active: String
    let packed: [WorkspaceWidget]
    let compacted: [WorkspaceWidget]
    let snap: WorkspaceSize
    let width: Double
    let height: Double
}
private struct Fixture: Decodable { let catalog: WorkspaceCatalogResponse; let cases: [GeometryCase] }
private actor WorkspaceTestAPI: NativeWorkspaceAPI {
    let catalog: WorkspaceCatalogResponse
    var remote: WorkspaceLayout?
    var failSave = false
    var failFacts = false
    var denyFacts = false
    var cursor = 1
    var hideRemote = false
    init(_ catalog: WorkspaceCatalogResponse) { self.catalog = catalog }
    func workspaceCatalog(device: WorkspaceDevice, orgId: String) async throws -> WorkspaceCatalogResponse { catalog }
    func workspaceLayout(device: WorkspaceDevice, orgId: String) async throws -> WorkspaceLayoutResponse { WorkspaceLayoutResponse(layout: hideRemote ? nil : remote) }
    func saveWorkspaceLayout(_ layout: WorkspaceLayout, expectedRevision: Int) async throws -> WorkspaceLayoutCommit {
        if failSave { throw URLError(.notConnectedToInternet) }
        if let remote, remote.revision != expectedRevision { return WorkspaceLayoutCommit(status: "conflict", layout: nil, current: remote) }
        if remote == nil && expectedRevision != 0 { throw APIClientError.invalidResponse }
        var next = layout; next.revision = expectedRevision + 1; remote = next
        return WorkspaceLayoutCommit(status: "saved", layout: next, current: nil)
    }
    func workspaceWidgets(storeId: String, orgId: String, ids: [String]) async throws -> NativeWorkspaceData {
        if denyFacts { throw APIClientError.server("store_access_denied", "Access denied") }
        if failFacts { throw URLError(.notConnectedToInternet) }
        return NativeWorkspaceData(storeId: storeId, generatedAt: ISO8601DateFormatter().string(from: Date()), stockRevision: cursor, widgets: [:])
    }
    func workspaceInvalidation(storeId: String, orgId: String) async throws -> NativeWorkspaceInvalidation { NativeWorkspaceInvalidation(stockRevision: cursor) }
    func setFailure(_ enabled: Bool) { failSave = enabled }
    func setFactsFailure(_ enabled: Bool, denied: Bool = false) { failFacts = enabled; denyFacts = denied }
    func setHideRemote(_ hidden: Bool) { hideRemote = hidden }
    func setRevision(_ value: Int) { var next = catalog.seedLayout; next.revision = value; remote = next }
}
@main struct CheckNativeWorkspace {
    @MainActor static func main() async throws {
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
        for item in fixture.cases {
            let packed = WorkspaceGeometry.pack(item.input, device: item.device, active: item.active)
            precondition(packed == item.packed, "TypeScript/Swift packing drift")
            precondition(WorkspaceGeometry.compact(packed, device: item.device) == item.compacted, "Compaction drift")
            precondition(WorkspaceGeometry.snap(width: item.width, height: item.height, supported: WorkspaceSize.allCases, device: item.device) == item.snap, "Resize snapping drift: \(item.device) \(item.width)×\(item.height), expected \(item.snap)")
            var layout = fixture.catalog.seedLayout; layout.deviceClass = item.device; layout.widgets = packed
            precondition(WorkspaceGeometry.valid(layout))
            layout.widgets.append(layout.widgets[0]); precondition(!WorkspaceGeometry.valid(layout))
        }
        let seed = fixture.catalog.seedLayout
        var bad = seed; bad.widgets[0].gridX = 99; precondition(!WorkspaceGeometry.valid(bad))
        bad = seed; bad.widgets[1].gridX = Int.max; precondition(!WorkspaceGeometry.valid(bad))
        let api = WorkspaceTestAPI(fixture.catalog)
        let make = { NativeWorkspaceStore(api: api, uid: seed.userId, orgId: seed.organizationId, device: .phone) }
        let store = make(); await store.load(); store.discardDraft()
        precondition(store.layout == seed)
        store.setShape(.circle); precondition(store.history.count == 1)
        let recovered = make(); await recovered.load(); precondition(recovered.recovery?.layout.shapePreference == .circle)
        recovered.restoreDraft(); precondition(recovered.layout?.shapePreference == .circle)
        recovered.cancel(); precondition(recovered.layout == seed)
        // Initialization saves revision one; cancelling edits must preserve that saved revision.
        let firstSave = await recovered.save(); precondition(firstSave && recovered.layout?.revision == 2)
        await store.load()
        store.setShape(.square); await api.setFailure(true)
        let offline = await store.save(); precondition(!offline && store.layout?.shapePreference == .square)
        let offlineRecovery = make(); await offlineRecovery.load(); precondition(offlineRecovery.recovery?.layout.shapePreference == .square)
        await api.setFailure(false); await api.setRevision(7)
        let collided = await store.save(); precondition(!collided && store.conflict?.revision == 7 && store.layout?.shapePreference == .square)
        let explicitSave = await store.save(keepingLocal: true); precondition(explicitSave && store.layout?.revision == 8)
        store.setShape(.circle); store.undo(); precondition(store.layout?.shapePreference == .square)
        let beforeDrag = store.layout!
        store.previewGesture(id: beforeDrag.widgets[0].id, dx: 1, dy: 4, resize: false)
        precondition(store.activeGestureId == beforeDrag.widgets[0].id)
        store.finishGesture(); precondition(WorkspaceGeometry.valid(store.layout!) && store.activeGestureId == nil)
        store.undo(); precondition(store.layout == beforeDrag)
        store.previewGesture(id: beforeDrag.widgets[0].id, dx: 10, dy: 10, resize: true)
        store.finishGesture(); precondition(store.layout?.widgets[0].size == .extraLarge)
        store.undo(); precondition(store.layout == beforeDrag)
        await api.setRevision(12)
        let remoteConflict = await store.save(); precondition(!remoteConflict && store.conflict?.revision == 12)
        store.useRemote(); precondition(store.layout?.revision == 12 && store.conflict == nil)
        await api.setHideRemote(true)
        let racingInitialization = make(); await racingInitialization.load()
        precondition(racingInitialization.layout?.revision == 12 && racingInitialization.conflict == nil, "Initialization adopts the concurrent saved home without overwriting it")
        await api.setHideRemote(false)
        await store.refresh(storeId: "store-a", force: true); precondition(store.data?.storeId == "store-a")
        await api.setFactsFailure(true)
        await store.refresh(storeId: "store-b", force: true); precondition(store.data == nil && store.stale)
        await api.setFactsFailure(false)
        await store.refresh(storeId: "store-b", force: true); precondition(store.data?.storeId == "store-b")
        await api.setFactsFailure(false, denied: true)
        await store.refresh(storeId: "store-b", force: true); precondition(store.data == nil)
        let other = NativeWorkspaceStore(api: api, uid: "different-user", orgId: seed.organizationId, device: .phone)
        await other.load(); precondition(other.layout == nil && other.recovery == nil)
        let expired = NativeWidgetCandidate(id: "expired", engineId: "inventory", title: "Expired", summary: "", severity: "critical", expiration: "2000-01-01T00:00:00.000Z", supportedSizes: [.medium], factors: .init(urgency: 1, operationalImpact: 1, userRelevance: 1, actionability: 1, recency: 1))
        var widget = seed.widgets[0]; widget.mode = .automatic
        precondition(WorkspaceGeometry.candidates([expired], widget: widget).isEmpty)
        store.cancel(); recovered.cancel(); offlineRecovery.cancel()
        print("Native workspace passed: 120 shared grid/resize/compaction scenarios, duplicate/bounds validation, scoped draft recovery, initial cancel/save revision, offline retry, explicit revision conflicts, undo, store isolation, permission revocation and candidate expiry.")
    }
}
