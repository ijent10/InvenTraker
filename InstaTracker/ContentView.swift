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
                
                // Custom Liquid Glass Bottom Bar
                if !showingAccountPanel {
                    HStack(spacing: 0) {
                        Button {
                            withAnimation(.easeInOut(duration: 0.22)) {
                                showingAccountPanel = true
                            }
                        } label: {
                            Image(systemName: "person.circle")
                                .font(.system(size: 24))
                                .foregroundStyle(settings.accentColor)
                        }
                        .buttonStyle(.plain)
                        .frame(maxWidth: .infinity)
                        
                        // Configurable primary action button (center)
                        Button(action: performQuickAction) {
                            ZStack {
                                Circle()
                                    .fill(settings.accentColor.gradient)
                                    .frame(width: 56, height: 56)
                                    .shadow(color: settings.accentColor.opacity(0.3), radius: 8, y: 4)
                                
                                Image(systemName: quickAction.iconName)
                                    .font(.system(size: 24, weight: .medium))
                                    .foregroundStyle(.white)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        
                        // Settings
                        NavigationLink(destination: SettingsView()) {
                            Image(systemName: "gearshape.fill")
                                .font(.system(size: 24))
                                .foregroundStyle(settings.accentColor)
                        }
                        .frame(maxWidth: .infinity)
                        .disabled(!canViewSettings)
                        .opacity(canViewSettings ? 1 : 0.5)
                    }
                    .padding(.horizontal, 30)
                    .padding(.vertical, 12)
                    .background(
                        .regularMaterial,
                        in: RoundedRectangle(cornerRadius: 24, style: .continuous)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .strokeBorder(.white.opacity(0.2), lineWidth: 1)
                    )
                    .padding(.horizontal, 20)
                    .padding(.bottom, 20)
                    .shadow(color: .black.opacity(0.1), radius: 20, y: 10)
                }

                if showingAccountPanel {
                    accountPanelOverlay
                        .zIndex(10)
                }
            }
            .animation(.easeInOut(duration: 0.22), value: showingAccountPanel)
            .sheet(item: $quickActionSelection) { section in
                NavigationStack {
                    quickActionDestination(for: section)
                }
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

    private var accountPanelOverlay: some View {
        GeometryReader { geometry in
            ZStack {
                Color(.systemBackground)
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    HStack {
                        Button {
                            withAnimation(.easeInOut(duration: 0.22)) {
                                showingAccountPanel = false
                            }
                        } label: {
                            Label("Back", systemImage: "chevron.left")
                                .font(.headline.weight(.semibold))
                        }
                        .buttonStyle(.plain)

                        Spacer()

                        Text("Account")
                            .font(.headline.weight(.semibold))

                        Spacer()

                        Color.clear
                            .frame(width: 64, height: 1)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 8)

                    NavigationStack {
                        AccountRootView()
                            .toolbar(.hidden, for: .navigationBar)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
                .transition(.move(edge: .leading))
            }
            .ignoresSafeArea(edges: [.leading, .trailing, .bottom])
        }
    }
}
