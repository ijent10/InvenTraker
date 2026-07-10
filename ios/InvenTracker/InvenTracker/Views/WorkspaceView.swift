import SwiftUI

struct WorkspaceView: View {
    enum Tab: Hashable { case home, inventory, work, orders, account }
    @EnvironmentObject private var session: AppSession
    @State private var tab: Tab = .home

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack { HomeView(selectedTab: $tab) }
                .tag(Tab.home)
                .tabItem { Label("Home", systemImage: "house.fill") }
            NavigationStack { InventoryView() }
                .tag(Tab.inventory)
                .tabItem { Label("Inventory", systemImage: "shippingbox.fill") }
            NavigationStack { OperationsView() }
                .tag(Tab.work)
                .tabItem { Label("Work", systemImage: "viewfinder") }
            NavigationStack { OrdersView() }
                .tag(Tab.orders)
                .tabItem { Label("Orders", systemImage: "cart.fill") }
            NavigationStack { AccountView() }
                .tag(Tab.account)
                .tabItem { Label("Account", systemImage: "person.crop.circle.fill") }
        }
        .task { await session.loadWorkspace(storeId: session.selectedStoreId, quiet: true) }
    }
}
