import SwiftUI
import SwiftData

/// Home screen with modular sections and quick insights.
/// Users can customize section order.
struct HomeView: View {
    @EnvironmentObject private var session: AccountSessionStore
    @Query private var items: [InventoryItem]
    @Query private var productionProducts: [ProductionProduct]
    @Query private var todos: [ToDoItem]
    @StateObject private var settings = AppSettings.shared
    @StateObject private var notificationFeed = RealtimeNotificationFeedService.shared
    
    @State private var sectionOrder: [HomeSection] = []
    @State private var showingSectionEditor = false
    @State private var showingNotifications = false
    @State private var dismissedNotificationIDs: Set<String> = []

    private var editableVisibleSectionOrder: [HomeSection] {
        sectionOrder.filter { session.canView($0.appModule) }
    }

    private var resolvedPrimaryAction: HomeSection {
        let preferred = settings.primaryQuickAction
        if session.canView(preferred.appModule) {
            return preferred
        }
        if let fallback = editableVisibleSectionOrder.first {
            return fallback
        }
        return .inventory
    }

    private var tileSectionOrder: [HomeSection] {
        editableVisibleSectionOrder.filter { $0 != resolvedPrimaryAction }
    }

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? "local-default"
    }

    private var scopedItems: [InventoryItem] {
        let storeId = settings.normalizedActiveStoreID
        return items.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(storeId)
        }
    }

    private var scopedTodos: [ToDoItem] {
        let storeId = settings.normalizedActiveStoreID
        return todos.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(storeId)
        }
    }

    private var scopedProductionProducts: [ProductionProduct] {
        let storeId = settings.normalizedActiveStoreID
        return productionProducts.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(storeId)
        }
    }

    private var homeNotifications: [HomeNotification] {
        let now = Date()
        let remoteAnnouncements = notificationFeed.notifications.map { entry in
            HomeNotification(
                id: "remote-\(entry.id)",
                title: entry.title,
                subtitle: entry.body,
                icon: "bell.badge.fill",
                tint: settings.accentColor,
                createdAt: entry.createdAt
            )
        }

        let expiringSoon = scopedItems
            .filter { !$0.isArchived }
            .compactMap { item -> HomeNotification? in
                guard let soonestBatch = item.batches
                    .filter({
                        let days = Calendar.current.dateComponents([.day], from: now, to: $0.expirationDate).day ?? 999
                        return days >= 0 && days <= settings.expirationNotificationDays
                    })
                    .sorted(by: { $0.expirationDate < $1.expirationDate })
                    .first
                else { return nil }

                let days = Calendar.current.dateComponents([.day], from: now, to: soonestBatch.expirationDate).day ?? 0
                return HomeNotification(
                    id: "exp-\(item.id.uuidString)-\(soonestBatch.expirationDate.timeIntervalSince1970)",
                    title: "\(item.name) expiring soon",
                    subtitle: "Expires in \(days) day(s) • \(soonestBatch.quantity.formattedQuantity()) \(item.unit.rawValue)",
                    icon: "clock.badge.exclamationmark",
                    tint: .orange,
                    createdAt: now
                )
            }

        let lowStock = scopedItems
            .filter { !$0.isArchived && $0.totalQuantity < $0.minimumQuantity }
            .map { item in
                HomeNotification(
                    id: "low-\(item.id.uuidString)",
                    title: "Low stock: \(item.name)",
                    subtitle: "\(item.totalQuantity.formattedQuantity()) / min \(item.minimumQuantity.formattedQuantity()) \(item.unit.rawValue)",
                    icon: "exclamationmark.triangle.fill",
                    tint: .red,
                    createdAt: now
                )
            }

        let dueTodos = scopedTodos
            .filter { !$0.isCompleted }
            .sorted(by: { $0.date < $1.date })
            .prefix(8)
            .map { task in
                HomeNotification(
                    id: "todo-\(task.id.uuidString)",
                    title: task.title,
                    subtitle: task.date.formatted(date: .abbreviated, time: .shortened),
                    icon: "checklist",
                    tint: settings.accentColor,
                    createdAt: task.date
                )
            }

        return Array((remoteAnnouncements + dueTodos + expiringSoon + lowStock)
            .sorted(by: { $0.createdAt > $1.createdAt })
            .prefix(30))
    }

    private var visibleNotifications: [HomeNotification] {
        homeNotifications.filter { !dismissedNotificationIDs.contains($0.id) }
    }

    private var notificationBadgeCount: Int {
        if notificationFeed.unreadCount > 0 {
            return notificationFeed.unreadCount
        }
        return visibleNotifications.count
    }

    private var activeStoreLabel: String {
        let activeStoreID = settings.normalizedActiveStoreID
        guard !activeStoreID.isEmpty else { return "Select Store" }
        guard let store = session.stores.first(where: {
            $0.id.trimmingCharacters(in: .whitespacesAndNewlines) == activeStoreID
        }) else {
            return "Store"
        }
        let storeNumber = store.storeNumber?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !storeNumber.isEmpty {
            return "\(store.name) (\(storeNumber))"
        }
        return store.name
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    ContextTipCard(context: .home, accentColor: settings.accentColor)
                    ForEach(tileSectionOrder, id: \.self) { section in
                        HomeSectionCard(
                            section: section,
                            items: scopedItems,
                            productionProducts: scopedProductionProducts,
                            todos: scopedTodos,
                            accentColor: settings.accentColor
                        )
                    }
                }
                .padding()
                .padding(.bottom, 100)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("InvenTraker")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if !session.stores.isEmpty {
                        Menu {
                            ForEach(session.stores) { store in
                                let storeNumber = store.storeNumber?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                                let label = storeNumber.isEmpty ? store.name : "\(store.name) (\(storeNumber))"
                                Button {
                                    session.switchStore(store.id)
                                } label: {
                                    if settings.normalizedActiveStoreID == store.id.trimmingCharacters(in: .whitespacesAndNewlines) {
                                        Label(label, systemImage: "checkmark")
                                    } else {
                                        Text(label)
                                    }
                                }
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "mappin.and.ellipse")
                                    .font(.system(size: 14, weight: .semibold))
                                Text(activeStoreLabel)
                                    .font(.subheadline.weight(.semibold))
                                    .lineLimit(1)
                            }
                            .foregroundStyle(settings.accentColor)
                        }
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingNotifications = true
                    } label: {
                        ZStack(alignment: .topTrailing) {
                            Image(systemName: "bell.fill")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(settings.accentColor)
                            if notificationBadgeCount > 0 {
                                Text(notificationBadgeCount > 99 ? "99+" : "\(notificationBadgeCount)")
                                    .font(.system(size: 10, weight: .bold, design: .rounded))
                                    .foregroundStyle(.white)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.7)
                                    .padding(.horizontal, 6.5)
                                    .padding(.vertical, 2.5)
                                    .frame(minWidth: 22)
                                    .background(Color.red, in: Capsule())
                                    .offset(x: 9, y: -8)
                                    .zIndex(1)
                            }
                        }
                        .frame(width: 42, height: 32, alignment: .center)
                    }
                    .accessibilityLabel("Notifications")
                }

                if session.canPerform(.manageSettings) {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(action: { showingSectionEditor = true }) {
                            Image(systemName: "rectangle.3.group.bubble.left.fill")
                                .foregroundStyle(settings.accentColor)
                        }
                        .accessibilityLabel("Rearrange Sections")
                    }
                }
            }
            .sheet(isPresented: $showingSectionEditor) {
                SectionOrderEditorView(
                    order: editableVisibleSectionOrder,
                    primaryAction: settings.primaryQuickAction,
                    accentColor: settings.accentColor
                ) { newOrder, primaryAction in
                    let hidden = HomeSection.allCases.filter { !session.canView($0.appModule) }
                    sectionOrder = newOrder + hidden
                    settings.homeSectionOrder = sectionOrder
                    settings.primaryQuickAction = primaryAction
                    UserPreferenceSyncService.shared.syncAppearancePreference(
                        settings: settings,
                        user: session.firebaseUser
                    )
                }
            }
            .sheet(isPresented: $showingNotifications) {
                NavigationStack {
                    HomeNotificationsView(
                        notifications: visibleNotifications,
                        accentColor: settings.accentColor,
                        onRemove: dismissNotification,
                        onClearAll: clearAllNotifications
                    )
                }
            }
            .onAppear {
                if sectionOrder.isEmpty {
                    sectionOrder = settings.homeSectionOrder
                }
                loadDismissedNotifications()
                notificationFeed.start(
                    organizationId: session.activeOrganizationId,
                    storeId: settings.normalizedActiveStoreID,
                    user: session.firebaseUser,
                    role: session.activeMembership?.role ?? .viewer,
                    roleTitle: session.activeMembership?.jobTitle
                )
            }
            .onChange(of: session.activeOrganizationId) { _, _ in
                loadDismissedNotifications()
                notificationFeed.start(
                    organizationId: session.activeOrganizationId,
                    storeId: settings.normalizedActiveStoreID,
                    user: session.firebaseUser,
                    role: session.activeMembership?.role ?? .viewer,
                    roleTitle: session.activeMembership?.jobTitle
                )
            }
            .onChange(of: settings.normalizedActiveStoreID) { _, _ in
                loadDismissedNotifications()
                notificationFeed.start(
                    organizationId: session.activeOrganizationId,
                    storeId: settings.normalizedActiveStoreID,
                    user: session.firebaseUser,
                    role: session.activeMembership?.role ?? .viewer,
                    roleTitle: session.activeMembership?.jobTitle
                )
            }
            .onChange(of: session.firebaseUser?.id) { _, _ in
                loadDismissedNotifications()
                notificationFeed.start(
                    organizationId: session.activeOrganizationId,
                    storeId: settings.normalizedActiveStoreID,
                    user: session.firebaseUser,
                    role: session.activeMembership?.role ?? .viewer,
                    roleTitle: session.activeMembership?.jobTitle
                )
            }
            .onChange(of: session.activeMembership?.role) { _, _ in
                notificationFeed.start(
                    organizationId: session.activeOrganizationId,
                    storeId: settings.normalizedActiveStoreID,
                    user: session.firebaseUser,
                    role: session.activeMembership?.role ?? .viewer,
                    roleTitle: session.activeMembership?.jobTitle
                )
            }
            .onChange(of: showingNotifications) { _, showing in
                if showing {
                    notificationFeed.markAllRead()
                }
            }
        }
    }

    private var dismissedNotificationStorageKey: String {
        let userID = session.firebaseUser?.id ?? "anonymous"
        let storeID = settings.normalizedActiveStoreID.isEmpty ? "no-store" : settings.normalizedActiveStoreID
        return "home_notifications_hidden_\(activeOrganizationId)_\(storeID)_\(userID)"
    }

    private func loadDismissedNotifications() {
        let stored = UserDefaults.standard.stringArray(forKey: dismissedNotificationStorageKey) ?? []
        dismissedNotificationIDs = Set(stored)
    }

    private func persistDismissedNotifications() {
        UserDefaults.standard.set(Array(dismissedNotificationIDs), forKey: dismissedNotificationStorageKey)
    }

    private func dismissNotification(_ notification: HomeNotification) {
        dismissedNotificationIDs.insert(notification.id)
        persistDismissedNotifications()
        if let remoteID = notification.remoteNotificationID {
            notificationFeed.dismiss(notificationID: remoteID)
        }
    }

    private func clearAllNotifications() {
        guard !visibleNotifications.isEmpty else { return }
        var remoteIDs: [String] = []
        for notification in visibleNotifications {
            dismissedNotificationIDs.insert(notification.id)
            if let remoteID = notification.remoteNotificationID {
                remoteIDs.append(remoteID)
            }
        }
        for remoteID in remoteIDs {
            notificationFeed.dismiss(notificationID: remoteID)
        }
        notificationFeed.markAllRead()
        persistDismissedNotifications()
    }
}

/// Individual section card on home screen
/// Shows icon, title, and quick insight
struct HomeSectionCard: View {
    let section: HomeSection
    let items: [InventoryItem]
    let productionProducts: [ProductionProduct]
    let todos: [ToDoItem]
    let accentColor: Color
    
    var body: some View {
        NavigationLink(destination: destinationView) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: section.iconName)
                        .font(.system(size: 28))
                        .foregroundStyle(accentColor.gradient)
                        .frame(width: 50, height: 50)
                        .background(accentColor.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                    
                    VStack(alignment: .leading, spacing: 4) {
                        Text(section.rawValue)
                            .font(.headline)
                            .foregroundStyle(.primary)
                        
                        Text(insightText)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    
                    Spacer()
                    
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.tertiary)
                }
            }
            .padding()
            .background(
                .regularMaterial,
                in: RoundedRectangle(cornerRadius: 16, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(.white.opacity(0.2), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.05), radius: 10, y: 5)
        }
        .buttonStyle(.plain)
    }
    
    var insightText: String {
        let activeItems = items.filter { !$0.isArchived }
        
        switch section {
        case .inventory:
            return "\(activeItems.count) active items"
        case .production:
            let activeProducts = productionProducts.filter(\.isActive).count
            return activeProducts == 0 ? "Set up production items" : "\(activeProducts) products planned"
        case .chopUp:
            let prepackagedCount = activeItems.filter(\.isPrepackaged).count
            return "\(prepackagedCount) prepackaged items ready"
            
        case .spotCheck:
            return "Quick inventory count + expiry check"

        case .healthChecks:
            return "Assigned quality + safety questionnaires"
            
        case .expiration:
            let expiringSoon = activeItems.filter { item in
                item.batches.contains { batch in
                    let days = Calendar.current.dateComponents([.day], from: Date(), to: batch.expirationDate).day ?? 999
                    return days <= 7 && days >= 0
                }
            }
            return "\(expiringSoon.count) items expiring soon"
            
        case .waste:
            return "Track waste & spoilage"
            
        case .orders:
            let needsOrdering = activeItems.filter { $0.totalQuantity < $0.minimumQuantity }
            return needsOrdering.isEmpty ? "Stock levels good" : "\(needsOrdering.count) items need ordering"
            
        case .toDo:
            let incomplete = todos.filter { !$0.isCompleted }
            return "\(incomplete.count) tasks pending"
            
        case .received:
            return "Log incoming deliveries"

        case .transfers:
            return "Move product between departments"
            
        case .insights:
            return "Analytics, waste trends, and stock health"
        }
    }
    
    @ViewBuilder
    var destinationView: some View {
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
}

struct SectionOrderEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var workingOrder: [HomeSection]
    @State private var primaryAction: HomeSection
    let accentColor: Color
    let onSave: ([HomeSection], HomeSection) -> Void
    
    init(
        order: [HomeSection],
        primaryAction: HomeSection,
        accentColor: Color,
        onSave: @escaping ([HomeSection], HomeSection) -> Void
    ) {
        _workingOrder = State(initialValue: order)
        _primaryAction = State(initialValue: order.contains(primaryAction) ? primaryAction : (order.first ?? .inventory))
        self.accentColor = accentColor
        self.onSave = onSave
    }
    
    var body: some View {
        NavigationStack {
            List {
                ForEach(workingOrder) { section in
                    HStack {
                        Image(systemName: section.iconName)
                            .foregroundStyle(accentColor)
                        Text(section.rawValue)
                        Spacer()
                        Button {
                            primaryAction = section
                        } label: {
                            Image(systemName: primaryAction == section ? "star.fill" : "star")
                                .foregroundStyle(primaryAction == section ? accentColor : .secondary)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Set quick action to \(section.rawValue)")
                    }
                }
                .onMove(perform: move)
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("Rearrange Sections")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        let resolvedPrimary = workingOrder.contains(primaryAction)
                            ? primaryAction
                            : (workingOrder.first ?? .inventory)
                        onSave(workingOrder, resolvedPrimary)
                        dismiss()
                    }
                    .foregroundStyle(accentColor)
                }
            }
        }
    }
    
    private func move(from source: IndexSet, to destination: Int) {
        workingOrder.move(fromOffsets: source, toOffset: destination)
    }
}

private struct HomeNotification: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let icon: String
    let tint: Color
    let createdAt: Date

    var remoteNotificationID: String? {
        guard id.hasPrefix("remote-") else { return nil }
        return String(id.dropFirst("remote-".count))
    }
}

private struct HomeNotificationsView: View {
    @Environment(\.dismiss) private var dismiss
    let notifications: [HomeNotification]
    let accentColor: Color
    let onRemove: (HomeNotification) -> Void
    let onClearAll: () -> Void

    var body: some View {
        List {
            if notifications.isEmpty {
                Text("No new notifications.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(notifications) { notification in
                    HStack(spacing: 12) {
                        Image(systemName: notification.icon)
                            .foregroundStyle(notification.tint)
                            .frame(width: 26)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(notification.title)
                                .font(.subheadline.weight(.semibold))
                            Text(notification.subtitle)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            onRemove(notification)
                        } label: {
                            Label("Remove", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !notifications.isEmpty {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Clear All") {
                        onClearAll()
                    }
                    .foregroundStyle(.red)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { dismiss() }
                    .foregroundStyle(accentColor)
            }
        }
    }
}
