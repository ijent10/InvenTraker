import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var session: AppSession
    @Binding var selectedTab: WorkspaceView.Tab
    let openWorkModule: (WorkShortcut) -> Void
    @State private var showNotifications = false

    private var workspace: WorkspaceBootstrap? { session.workspace }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 18) {
                organizationHeader
                todayIssues
                metricGrid
                quickWork
                dueChecks
            }
            .padding(16)
            .padding(.bottom, 20)
        }
        .background(session.theme.backgroundColor)
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

    @ViewBuilder private var todayIssues: some View {
        if let today = workspace?.today {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Needs attention").font(.headline)
                        Text("Updated \(String(today.generatedAt.prefix(16)).replacingOccurrences(of: "T", with: " "))")
                            .font(.caption).foregroundStyle(session.theme.mutedColor)
                    }
                    Spacer()
                    Text("\(today.issues.count) open").font(.caption.weight(.semibold)).foregroundStyle(session.theme.mutedColor)
                }
                if today.issues.isEmpty {
                    Label("No calculated inventory or order issues need action.", systemImage: "checkmark.circle.fill")
                        .font(.subheadline).foregroundStyle(session.theme.secondaryColor)
                } else {
                    ForEach(today.issues.prefix(5)) { issue in
                        Button { open(issue) } label: {
                            HStack(alignment: .top, spacing: 11) {
                                Image(systemName: issue.severity == "critical" ? "exclamationmark.octagon.fill" : "exclamationmark.triangle.fill")
                                    .foregroundStyle(issue.severity == "critical" ? AppTheme.danger : AppTheme.amber)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(issue.title).font(.subheadline.weight(.semibold)).foregroundStyle(session.theme.textColor)
                                    Text(issue.detail).font(.caption).foregroundStyle(session.theme.mutedColor).multilineTextAlignment(.leading)
                                    Text(issue.suggestedAction).font(.caption.weight(.semibold)).foregroundStyle(session.theme.textColor).multilineTextAlignment(.leading)
                                    Text("Evidence: \(issue.evidence.prefix(2).map { "\($0.label) \($0.value)" }.joined(separator: " • ")) • \(issue.freshness.state)")
                                        .font(.caption2).foregroundStyle(session.theme.subtleColor).multilineTextAlignment(.leading)
                                    Text("Deadline: \(issue.deadline.map { String($0.prefix(16)).replacingOccurrences(of: "T", with: " ") } ?? "Not established")")
                                        .font(.caption2).foregroundStyle(session.theme.subtleColor)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(session.theme.subtleColor)
                            }
                            .padding(12)
                            .background(session.theme.controlBackgroundColor, in: RoundedRectangle(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
            .appSurface()
        }
    }

    private func open(_ issue: MobileTodayIssue) {
        switch issue.action.kind {
        case "orders": openWorkModule(.orders)
        case "spot_check": openWorkModule(.spotCheck)
        case "waste": openWorkModule(.waste)
        default: selectedTab = .inventory
        }
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
                Text(header).font(.subheadline).foregroundStyle(session.theme.mutedColor)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(session.theme.backgroundSoftColor, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(session.theme.controlBorderColor, lineWidth: 1)
        }
    }

    private var logoURL: URL? {
        guard let value = workspace?.organization.logoUrl, !value.isEmpty else { return nil }
        return URL(string: value, relativeTo: AppConfig.baseURL)?.absoluteURL
    }

    private var metricGrid: some View {
        let metrics = workspace?.dashboard
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            if session.canViewInventory {
                MetricTile(title: "Active items", value: "\(metrics?.activeItems ?? 0)", detail: "Current store", icon: "shippingbox", tint: session.theme.accentColor) { selectedTab = .inventory }
                MetricTile(title: "Low stock", value: "\(metrics?.lowStockItems ?? 0)", detail: "Needs attention", icon: "exclamationmark.triangle", tint: AppTheme.amber) { selectedTab = .inventory }
            }
            if session.canViewOrders {
                MetricTile(title: "Open orders", value: "\(metrics?.openOrders ?? 0)", detail: "Draft or review", icon: "cart", tint: session.theme.secondaryColor) { openWorkModule(.orders) }
            }
            if session.canViewHealthChecks {
                MetricTile(title: "Checks due", value: "\(metrics?.dueHealthChecks ?? 0)", detail: "Today", icon: "checklist", tint: AppTheme.danger) { openWorkModule(.healthChecks) }
            }
        }
    }

    @ViewBuilder private var quickWork: some View {
        if session.hasWorkAccess {
            VStack(alignment: .leading, spacing: 12) {
                Text("Start work").font(.headline)
                HStack(spacing: 10) {
                    QuickAction(label: "Quick work", icon: session.workShortcut.icon, color: session.theme.accentColor) { selectedTab = .shortcut }
                    QuickAction(label: "All work", icon: "square.grid.2x2.fill", color: session.theme.secondaryColor) { selectedTab = .work }
                    if session.canUpdateInventory {
                        QuickAction(label: "Discards", icon: "trash", color: AppTheme.danger) { openWorkModule(.waste) }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .appSurface()
        }
    }

    @ViewBuilder private var dueChecks: some View {
        if session.canViewHealthChecks, let checks = workspace?.healthChecks, !checks.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("Health checks").font(.headline)
                ForEach(checks.prefix(3)) { check in
                    HStack {
                        Image(systemName: check.status == "Current" ? "checkmark.circle.fill" : "clock.badge.exclamationmark")
                            .foregroundStyle(check.status == "Current" ? session.theme.secondaryColor : AppTheme.amber)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(check.name).font(.subheadline.weight(.semibold))
                            Text(check.lastCompleted.isEmpty ? check.schedule : "Last completed \(check.lastCompleted)")
                            .font(.caption).foregroundStyle(session.theme.mutedColor)
                        }
                        Spacer()
                        Text(check.status).font(.caption.weight(.semibold)).foregroundStyle(session.theme.mutedColor)
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
        workspace?.stores.first(where: { $0.id == session.selectedStoreId })?.name ?? "Organization"
    }
}

private struct MetricTile: View {
    @EnvironmentObject private var session: AppSession
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
                Text(value).font(.title.bold()).foregroundStyle(session.theme.textColor)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(session.theme.textColor)
                    Text(detail).font(.caption).foregroundStyle(session.theme.mutedColor)
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
    @EnvironmentObject private var session: AppSession
    let label: String
    let icon: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon).font(.title3.weight(.semibold)).foregroundStyle(session.theme.buttonTextColor)
                    .frame(width: 42, height: 42).background(color, in: RoundedRectangle(cornerRadius: 12))
                Text(label).font(.caption.weight(.semibold)).foregroundStyle(session.theme.textColor).lineLimit(1).minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(session.theme.controlBackgroundColor, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(session.theme.controlBorderColor, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }
}
