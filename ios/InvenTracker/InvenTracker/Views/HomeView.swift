import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var session: AppSession
    @Binding var selectedTab: WorkspaceView.Tab
    @State private var showNotifications = false

    private var workspace: WorkspaceBootstrap? { session.workspace }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 18) {
                organizationHeader
                metricGrid
                quickWork
                dueChecks
            }
            .padding(16)
            .padding(.bottom, 20)
        }
        .background(Color(.systemGroupedBackground))
        .refreshable { await session.loadWorkspace(storeId: session.selectedStoreId, quiet: true) }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { storeMenu }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showNotifications = true } label: {
                    Image(systemName: "bell")
                        .overlay(alignment: .topTrailing) {
                            if (workspace?.dashboard.unreadNotifications ?? 0) > 0 {
                                Text("\(workspace?.dashboard.unreadNotifications ?? 0)")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundStyle(.white)
                                    .padding(3)
                                    .background(AppTheme.danger, in: Circle())
                                    .offset(x: 7, y: -7)
                            }
                        }
                }
            }
        }
        .sheet(isPresented: $showNotifications) { NotificationsView() }
        .navigationBarTitleDisplayMode(.inline)
    }

    private var organizationHeader: some View {
        VStack(spacing: 9) {
            if let url = logoURL {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFit()
                } placeholder: {
                    BrandMark(size: 62)
                }
                .frame(maxWidth: 190, maxHeight: 64)
            } else {
                BrandMark(size: 62)
            }
            Text(workspace?.organization.companyName ?? "InvenTracker")
                .font(.title2.bold())
                .multilineTextAlignment(.center)
            if let header = workspace?.organization.headerText, !header.isEmpty {
                Text(header).font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
    }

    private var logoURL: URL? {
        guard let value = workspace?.organization.logoUrl, !value.isEmpty else { return nil }
        return URL(string: value, relativeTo: AppConfig.baseURL)?.absoluteURL
    }

    private var metricGrid: some View {
        let metrics = workspace?.dashboard
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            MetricTile(title: "Active items", value: "\(metrics?.activeItems ?? 0)", detail: "Current store", icon: "shippingbox", tint: AppTheme.accent) { selectedTab = .inventory }
            MetricTile(title: "Low stock", value: "\(metrics?.lowStockItems ?? 0)", detail: "Needs attention", icon: "exclamationmark.triangle", tint: AppTheme.amber) { selectedTab = .inventory }
            MetricTile(title: "Open orders", value: "\(metrics?.openOrders ?? 0)", detail: "Draft or review", icon: "cart", tint: AppTheme.mint) { selectedTab = .orders }
            MetricTile(title: "Checks due", value: "\(metrics?.dueHealthChecks ?? 0)", detail: "Today", icon: "checklist", tint: AppTheme.danger) { selectedTab = .work }
        }
    }

    private var quickWork: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Start work").font(.headline)
            HStack(spacing: 10) {
                QuickAction(label: "Spot check", icon: "viewfinder", color: AppTheme.accent) { selectedTab = .work }
                QuickAction(label: "Restock", icon: "arrow.triangle.2.circlepath", color: AppTheme.mint) { selectedTab = .work }
                QuickAction(label: "Waste", icon: "trash", color: AppTheme.danger) { selectedTab = .work }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .appSurface()
    }

    @ViewBuilder private var dueChecks: some View {
        if let checks = workspace?.healthChecks, !checks.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("Health checks").font(.headline)
                ForEach(checks.prefix(3)) { check in
                    HStack {
                        Image(systemName: check.status == "Current" ? "checkmark.circle.fill" : "clock.badge.exclamationmark")
                            .foregroundStyle(check.status == "Current" ? AppTheme.mint : AppTheme.amber)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(check.name).font(.subheadline.weight(.semibold))
                            Text(check.lastCompleted.isEmpty ? check.schedule : "Last completed \(check.lastCompleted)")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(check.status).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            }
            .padding(16)
            .appSurface()
        }
    }

    private var storeMenu: some View {
        Menu {
            ForEach(workspace?.stores ?? []) { store in
                Button(store.name) { Task { await session.selectStore(store.id) } }
            }
        } label: {
            Label(selectedStoreName, systemImage: "storefront").font(.subheadline.weight(.semibold))
        }
    }

    private var selectedStoreName: String {
        workspace?.stores.first(where: { $0.id == session.selectedStoreId })?.name ?? "Store"
    }
}

private struct MetricTile: View {
    let title: String
    let value: String
    let detail: String
    let icon: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: icon).font(.title3.weight(.semibold)).foregroundStyle(tint)
                Text(value).font(.title.bold()).foregroundStyle(.primary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                    Text(detail).font(.caption).foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 132, alignment: .leading)
            .padding(15)
            .appSurface()
        }
        .buttonStyle(.plain)
    }
}

private struct QuickAction: View {
    let label: String
    let icon: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon).font(.title3.weight(.semibold)).foregroundStyle(.white)
                    .frame(width: 42, height: 42).background(color, in: RoundedRectangle(cornerRadius: 12))
                Text(label).font(.caption.weight(.semibold)).foregroundStyle(.primary).lineLimit(1).minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}
