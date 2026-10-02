import SwiftUI

struct WorkspaceView: View {
    enum Tab: Hashable { case home, inventory, shortcut, work, account }
    @EnvironmentObject private var session: AppSession
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab: Tab = .home
    @State private var workPath = NavigationPath()

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack { HomeView(selectedTab: $tab, openWorkModule: openWorkModule) }
                .tag(Tab.home)
                .tabItem { Label("Home", systemImage: "house.fill") }
            if session.canViewInventory {
                NavigationStack { InventoryView() }
                    .tag(Tab.inventory)
                    .tabItem { Label("Inventory", systemImage: "shippingbox.fill") }
            }
            if session.hasWorkAccess {
                NavigationStack { WorkShortcutHostView(shortcut: session.workShortcut) }
                    .tag(Tab.shortcut)
                    .tabItem { Label("Quick work", systemImage: session.workShortcut.icon) }
                NavigationStack(path: $workPath) {
                    OperationsView()
                        .navigationDestination(for: WorkShortcut.self) { shortcut in
                            WorkShortcutHostView(shortcut: shortcut)
                        }
                }
                    .tag(Tab.work)
                    .tabItem { Label("Work", systemImage: "square.grid.2x2.fill") }
            }
            NavigationStack { AccountView() }
                .tag(Tab.account)
                .tabItem { Label("Account", systemImage: "person.crop.circle.fill") }
        }
        .toolbarBackground(session.theme.panelStrongColor, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
        .task { await session.loadWorkspace(storeId: session.selectedStoreId, quiet: true) }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await session.loadWorkspace(storeId: session.selectedStoreId, quiet: true) }
        }
        .onChange(of: session.canViewInventory) { _, allowed in
            if !allowed && tab == .inventory { tab = .home }
        }
        .onChange(of: session.hasWorkAccess) { _, allowed in
            if !allowed && (tab == .shortcut || tab == .work) { tab = .home }
        }
    }

    private func openWorkModule(_ module: WorkShortcut) {
        guard session.availableWorkShortcuts.contains(module) else { return }
        workPath = NavigationPath()
        tab = .work
        Task { @MainActor in
            await Task.yield()
            workPath.append(module)
        }
    }
}
