import SwiftUI
import SwiftData

/// Main container view with custom bottom navigation bar
/// Features Liquid Glass UI with user-customizable accent colors
struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var accountSession: AccountSessionStore
    @Query(filter: #Predicate<InventoryItem> { !$0.isArchived }) private var items: [InventoryItem]
    @Query private var vendors: [Vendor]
    @StateObject private var settings = AppSettings.shared
    
    @State private var selectedTab = 0
    @State private var quickActionSelection: HomeSection?
    @State private var showingAccountPanel = false
    @State private var showingSettingsPanel = false
    @State private var pendingImportPayload: InventorySharePayload?
    @State private var showingImportPrompt = false
    @State private var importResultMessage = ""
    @State private var showingImportResult = false
    
    private var activeOrganizationId: String {
        accountSession.activeOrganizationId ?? "local-default"
    }

    private var scopedItems: [InventoryItem] {
        let storeId = settings.normalizedActiveStoreID
        return items.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(storeId)
        }
    }

    private var scopedVendors: [Vendor] {
        vendors.filter { $0.organizationId == activeOrganizationId }
    }

    private var canViewSettings: Bool {
        accountSession.canView(.settings)
    }

    private var quickAction: HomeSection {
        let action = settings.primaryQuickAction
        if accountSession.canView(action.appModule) {
            return action
        }
        if let firstVisible = settings.homeSectionOrder.first(where: { accountSession.canView($0.appModule) }) {
            return firstVisible
        }
        return .inventory
    }
    
    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                // Main content
                TabView(selection: $selectedTab) {
                    HomeView()
                        .tag(0)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                
                LiquidGlassBottomBar(
                    accentColor: settings.accentColor,
                    quickAction: quickAction,
                    canViewSettings: canViewSettings,
                    accountAction: { showingAccountPanel = true },
                    quickActionTrigger: performQuickAction,
                    settingsAction: { showingSettingsPanel = true }
                )
                .padding(.horizontal, 18)
                .padding(.bottom, 18)
            }
            .sheet(item: $quickActionSelection) { section in
                NavigationStack {
                    quickActionDestination(for: section)
                }
            }
            .sheet(isPresented: $showingAccountPanel) {
                NavigationStack {
                    AccountRootView()
                }
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showingSettingsPanel) {
                NavigationStack {
                    SettingsView()
                }
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
            }
            .onOpenURL(perform: handleIncomingURL)
            .alert(
                "Import Items?",
                isPresented: $showingImportPrompt,
                presenting: pendingImportPayload
            ) { payload in
                Button("Import") {
                    importPayload(payload)
                }
                Button("Cancel", role: .cancel) {
                    pendingImportPayload = nil
                }
            } message: { payload in
                Text("Would you like to import \(payload.items.count) item(s) from this share?")
            }
            .alert("Import Complete", isPresented: $showingImportResult) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(importResultMessage)
            }
            // Apply user's preferred color scheme
            .preferredColorScheme(preferredColorScheme)
            .onAppear(perform: syncNotifications)
            .onChange(of: items.count) { _, _ in syncNotifications() }
            .onChange(of: vendors.count) { _, _ in syncNotifications() }
            .onChange(of: settings.normalizedActiveStoreID) { _, _ in
                syncNotifications()
            }
        }
    }
    
    /// Convert string preference to ColorScheme
    private var preferredColorScheme: ColorScheme? {
        switch settings.preferredColorScheme {
        case "light": return .light
        case "dark": return .dark
        default: return nil // System
        }
    }
    
    private func syncNotifications() {
        NotificationManager.shared.syncNotifications(settings: settings, items: scopedItems, vendors: scopedVendors)
    }
    
    private func handleIncomingURL(_ url: URL) {
        guard let payload = InventoryShareService.decode(url: url) else { return }
        pendingImportPayload = payload
        showingImportPrompt = true
    }

    private func performQuickAction() {
        quickActionSelection = quickAction
    }

    @ViewBuilder
    private func quickActionDestination(for section: HomeSection) -> some View {
        switch section {
        case .inventory:
            InventoryListView()
        case .production:
            ProductionView()
        case .chopUp:
            ChopUpView()
        case .spotCheck:
            SpotCheckView()
        case .healthChecks:
            HealthChecksView()
        case .expiration:
            ExpirationView()
        case .waste:
            WasteView()
        case .orders:
            OrdersView()
        case .toDo:
            ToDoView()
        case .received:
            ReceivedView()
        case .transfers:
            TransfersView()
        case .insights:
            InsightsView()
        }
    }
    
    private func importPayload(_ payload: InventorySharePayload) {
        let result = InventoryShareService.importPayload(
            payload,
            into: modelContext,
            existingItems: scopedItems,
            existingVendors: scopedVendors,
            organizationId: accountSession.activeOrganizationId
        )
        pendingImportPayload = nil
        importResultMessage = "Imported \(result.importedCount) new item(s), updated \(result.updatedCount), created \(result.createdVendorCount) vendor(s)."
        showingImportResult = true
    }

}

private struct LiquidGlassBottomBar: View {
    let accentColor: Color
    let quickAction: HomeSection
    let canViewSettings: Bool
    let accountAction: () -> Void
    let quickActionTrigger: () -> Void
    let settingsAction: () -> Void

    var body: some View {
        HStack(spacing: 18) {
            barButton(systemImage: "person.crop.circle.fill", label: "Account", action: accountAction)

            Button(action: quickActionTrigger) {
                VStack(spacing: 4) {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [accentColor.opacity(0.92), accentColor.opacity(0.62)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 54, height: 54)
                            .overlay(
                                Circle()
                                    .stroke(.white.opacity(0.55), lineWidth: 1)
                            )
                            .shadow(color: accentColor.opacity(0.28), radius: 16, y: 8)

                        Image(systemName: quickAction.iconName)
                            .font(.system(size: 24, weight: .bold))
                            .foregroundStyle(.white)
                    }
                    Text(quickAction.rawValue)
                        .font(.caption2.weight(.semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .foregroundStyle(.primary)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Quick action: \(quickAction.rawValue)")

            barButton(
                systemImage: "gearshape.fill",
                label: "Settings",
                disabled: !canViewSettings,
                action: settingsAction
            )
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(
                    LinearGradient(
                        colors: [.white.opacity(0.62), accentColor.opacity(0.18), .white.opacity(0.16)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        }
        .shadow(color: .black.opacity(0.16), radius: 22, y: 12)
        .shadow(color: accentColor.opacity(0.12), radius: 24, y: 4)
    }

    private func barButton(
        systemImage: String,
        label: String,
        disabled: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 5) {
                Image(systemName: systemImage)
                    .font(.system(size: 22, weight: .semibold))
                    .symbolRenderingMode(.hierarchical)
                Text(label)
                    .font(.caption2.weight(.semibold))
            }
            .foregroundStyle(disabled ? .secondary : accentColor)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.48 : 1)
        .accessibilityLabel(label)
    }
}
