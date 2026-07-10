import Foundation

@MainActor
final class AppSession: ObservableObject {
    enum Phase: Equatable {
        case launching
        case signedOut
        case authenticating
        case loadingWorkspace
        case ready
        case noAccess(String)
        case failed(String)
    }

    @Published private(set) var phase: Phase = .launching
    @Published private(set) var workspace: WorkspaceBootstrap?
    @Published var selectedStoreId = ""
    @Published var toast: String?
    @Published var isWorking = false

    private let api = APIClient()

    var inventory: [InventoryItem] { workspace?.inventory ?? [] }
    var orders: [OrderDraft] { workspace?.orders ?? [] }

    init() {
        Task { await restore() }
    }

    func restore() async {
        guard await api.storedSession() != nil else {
            phase = .signedOut
            return
        }
        await loadWorkspace()
    }

    func signIn(email: String, password: String) async {
        phase = .authenticating
        do {
            _ = try await api.signIn(email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password)
            await loadWorkspace()
        } catch {
            phase = .signedOut
            toast = error.localizedDescription
        }
    }

    func loadWorkspace(storeId: String? = nil, quiet: Bool = false) async {
        if !quiet { phase = .loadingWorkspace }
        do {
            let data = try await api.bootstrap(storeId: storeId)
            workspace = data
            selectedStoreId = data.selectedStoreId
            phase = .ready
        } catch let error as APIClientError where error.code == "membership_required" || error.code == "store_access_denied" {
            phase = .noAccess(error.localizedDescription)
        } catch let error as APIClientError where error.code == "invalid_session" || error.code == "unauthenticated" {
            await api.signOut()
            phase = .signedOut
            toast = error.localizedDescription
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    func selectStore(_ id: String) async {
        selectedStoreId = id
        await loadWorkspace(storeId: id)
    }

    func signOut() async {
        await api.signOut()
        workspace = nil
        selectedStoreId = ""
        phase = .signedOut
    }

    func submitSpotCheck(_ lines: [SpotCheckLine]) async throws {
        try await perform("Spot check saved") {
            try await api.submitSpotCheck(storeId: selectedStoreId, lines: lines)
        }
    }

    func previewRestock(_ lines: [RestockLine]) async throws -> RestockResult {
        try await api.restock(storeId: selectedStoreId, lines: lines, commit: false)
    }

    func commitRestock(_ lines: [RestockLine]) async throws {
        try await perform("Restock completed") {
            _ = try await api.restock(storeId: selectedStoreId, lines: lines, commit: true)
        }
    }

    func recordWaste(_ line: WasteLine) async throws {
        try await perform("Waste recorded") {
            try await api.recordWaste(storeId: selectedStoreId, lines: [line])
        }
    }

    func submitOrder(_ id: String) async throws {
        try await perform("Order submitted") {
            try await api.submitOrder(id: id)
        }
    }

    func readNotifications(_ ids: [String]) async {
        guard !ids.isEmpty else { return }
        try? await api.markNotificationsRead(ids: ids)
        await loadWorkspace(storeId: selectedStoreId, quiet: true)
    }

    private func perform(_ confirmation: String, operation: () async throws -> Void) async throws {
        isWorking = true
        defer { isWorking = false }
        try await operation()
        toast = confirmation
        await loadWorkspace(storeId: selectedStoreId, quiet: true)
    }
}
