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
    @Published private(set) var mobilePreferences = MobilePreferences()
    @Published var selectedStoreId = ""
    @Published var toast: String?
    @Published var isWorking = false

    private let api = APIClient()
    private let localPreferencesKey = "inventraker.mobile-preferences.v2"

    var inventory: [InventoryItem] { workspace?.inventory ?? [] }
    var batches: [InventoryBatch] { workspace?.batches ?? [] }
    var orders: [OrderDraft] { workspace?.orders ?? [] }
    var capabilities: MobileCapabilities {
        guard let workspace else { return .none }
        return workspace.capabilities ?? .legacy(member: workspace.session.member, permissions: workspace.session.permissions)
    }
    var canViewInventory: Bool { capabilities.canViewInventory }
    var canUpdateInventory: Bool { capabilities.canUpdateInventory }
    var canViewOrders: Bool { capabilities.canViewOrders }
    var canSubmitOrders: Bool { capabilities.canSubmitOrders }
    var canViewHealthChecks: Bool { capabilities.canViewHealthChecks }
    var canViewInsights: Bool { capabilities.canViewInsights }
    var hasWorkAccess: Bool { canViewInventory || canUpdateInventory || canViewOrders || canViewHealthChecks || canViewInsights }
    var workShortcut: WorkShortcut {
        mobilePreferences.workShortcut != .work && canUseWorkShortcut(mobilePreferences.workShortcut)
            ? mobilePreferences.workShortcut
            : defaultWorkShortcut
    }
    var theme: MobileTheme { mobilePreferences.theme ?? .standard }
    var availableThemes: [MobileTheme] {
        var themes: [MobileTheme] = []
        for candidate in MobileTheme.websitePresets + mobilePreferences.savedThemes + [theme] {
            let name = candidate.name?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
            if let index = themes.firstIndex(where: {
                ($0.name?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? "") == name
            }) {
                themes[index] = candidate
            } else {
                themes.append(candidate)
            }
        }
        return themes
    }

    var availableWorkShortcuts: [WorkShortcut] {
        WorkShortcut.allCases.filter { $0 != .work && canUseWorkShortcut($0) }
    }

    private var defaultWorkShortcut: WorkShortcut {
        if canUpdateInventory { return .spotCheck }
        if canViewOrders { return .orders }
        if canViewHealthChecks { return .healthChecks }
        if canViewInsights { return .insights }
        return .inventory
    }

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
            mobilePreferences = loadLocalPreferences() ?? data.preferences ?? MobilePreferences()
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

    func transitionOrder(_ order: OrderDraft, action: String, reason: String? = nil, sentMethod: String? = nil) async throws {
        try await perform("Order updated") {
            try await api.transitionOrder(id: order.id, storeId: order.storeId, action: action, reason: reason, sentMethod: sentMethod)
        }
    }

    func recommendOrder(_ order: OrderDraft) async throws -> MobileOrderRecommendation {
        try await api.recommendOrder(storeId: order.storeId, vendorId: order.vendorId)
    }

    func readNotifications(_ ids: [String]) async {
        guard !ids.isEmpty else { return }
        try? await api.markNotificationsRead(ids: ids)
        await loadWorkspace(storeId: selectedStoreId, quiet: true)
    }

    func updateWorkShortcut(_ shortcut: WorkShortcut) async {
        guard shortcut != .work, canUseWorkShortcut(shortcut), shortcut != mobilePreferences.workShortcut else { return }
        mobilePreferences = MobilePreferences(workShortcut: shortcut, theme: mobilePreferences.theme, savedThemes: mobilePreferences.savedThemes)
        saveLocalPreferences()
        isWorking = true
        defer { isWorking = false }
        do {
            mobilePreferences = try await api.updatePreferences(workShortcut: shortcut)
            saveLocalPreferences()
            toast = "Quick work now opens \(shortcut.title)"
        } catch let error as APIClientError where error.code == "mobile_preferences_unavailable" || error.code == "http_404" {
            toast = "Shortcut saved on this iPhone"
        } catch {
            toast = "Shortcut saved on this iPhone; account sync is unavailable"
        }
    }

    private func canUseWorkShortcut(_ shortcut: WorkShortcut) -> Bool {
        switch shortcut {
        case .work:
            hasWorkAccess
        case .inventory:
            canViewInventory
        case .spotCheck, .restock, .receiving, .waste, .transfer:
            canUpdateInventory
        case .orders:
            canViewOrders
        case .healthChecks:
            canViewHealthChecks
        case .insights:
            canViewInsights
        }
    }

    func updateTheme(_ theme: MobileTheme) async {
        mobilePreferences = MobilePreferences(workShortcut: workShortcut, theme: theme, savedThemes: mobilePreferences.savedThemes)
        saveLocalPreferences()
        isWorking = true
        defer { isWorking = false }
        do {
            mobilePreferences = try await api.updatePreferences(theme: theme)
            saveLocalPreferences()
            toast = "Theme applied across InvenTracker"
        } catch let error as APIClientError where error.code == "mobile_preferences_unavailable" || error.code == "http_404" {
            toast = "Theme applied on this iPhone"
        } catch {
            toast = "Theme applied on this iPhone; account sync is unavailable"
        }
    }

    func createTheme(_ theme: MobileTheme) async -> Bool {
        let name = theme.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !name.isEmpty else {
            toast = "Give the new theme a name first."
            return false
        }

        var nextSavedThemes = mobilePreferences.savedThemes.filter {
            $0.name?.trimmingCharacters(in: .whitespacesAndNewlines).caseInsensitiveCompare(name) != .orderedSame
        }
        nextSavedThemes.append(theme)

        mobilePreferences = MobilePreferences(workShortcut: workShortcut, theme: theme, savedThemes: nextSavedThemes)
        saveLocalPreferences()

        isWorking = true
        defer { isWorking = false }
        do {
            mobilePreferences = try await api.updatePreferences(theme: theme, savedThemes: nextSavedThemes)
            saveLocalPreferences()
            toast = "\(name) saved across InvenTracker"
            return true
        } catch let error as APIClientError where error.code == "mobile_preferences_unavailable" || error.code == "http_404" {
            toast = "\(name) saved on this iPhone"
            return true
        } catch {
            toast = "\(name) saved on this iPhone; account sync is unavailable"
            return true
        }
    }

    func receive(_ line: ReceivingLine) async throws {
        try await perform("Receiving saved") {
            try await api.receive(storeId: selectedStoreId, lines: [line])
        }
    }

    func transfer(_ line: TransferLine) async throws {
        try await perform("Transfer saved") {
            _ = try await api.transfer(storeId: selectedStoreId, line: line)
        }
    }

    func loadInsights() async throws -> MobileInsights {
        try await api.insights(storeId: selectedStoreId)
    }

    private func perform(_ confirmation: String, operation: () async throws -> Void) async throws {
        isWorking = true
        defer { isWorking = false }
        try await operation()
        toast = confirmation
        await loadWorkspace(storeId: selectedStoreId, quiet: true)
    }

    private func loadLocalPreferences() -> MobilePreferences? {
        guard let data = UserDefaults.standard.data(forKey: localPreferencesKey) else { return nil }
        return try? JSONDecoder().decode(MobilePreferences.self, from: data)
    }

    private func saveLocalPreferences() {
        guard let data = try? JSONEncoder().encode(mobilePreferences) else { return }
        UserDefaults.standard.set(data, forKey: localPreferencesKey)
    }
}
