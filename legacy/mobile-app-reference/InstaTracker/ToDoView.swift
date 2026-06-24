import SwiftUI
import SwiftData
import Combine

struct ToDoView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject private var session: AccountSessionStore
    @Query(sort: \ToDoItem.date, order: .forward) private var allTodos: [ToDoItem]
    @Query(filter: #Predicate<InventoryItem> { !$0.isArchived }) private var items: [InventoryItem]
    @Query private var productionProducts: [ProductionProduct]
    @Query private var vendors: [Vendor]
    @StateObject private var settings = AppSettings.shared
    private let cleanupTimer = Timer.publish(every: 300, on: .main, in: .common).autoconnect()
    
    @State private var showingAddTask = false
    @State private var navigationDestination: HomeSection?
    @State private var pendingNavigationCompletionTaskID: UUID?

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? "local-default"
    }

    private var scopedTodos: [ToDoItem] {
        let storeId = settings.normalizedActiveStoreID
        return allTodos.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(storeId)
        }
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

    private var scopedProductionProducts: [ProductionProduct] {
        let storeId = settings.normalizedActiveStoreID
        return productionProducts.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(storeId)
        }
    }
    
    private var dueTodos: [ToDoItem] {
        scopedTodos
            .filter { !$0.isCompleted && $0.date <= Date() }
            .sorted { $0.date < $1.date }
    }
    
    private var upcomingRecurring: [ToDoItem] {
        scopedTodos
            .filter { !$0.isCompleted && $0.isRecurring && $0.date > Date() }
            .sorted { $0.date < $1.date }
    }

    private var completedTodos: [ToDoItem] {
        let cutoff = Date().addingTimeInterval(-24 * 60 * 60)
        return scopedTodos
            .filter { $0.isCompleted }
            .filter { completionDate(for: $0) >= cutoff }
            .sorted { completionDate(for: $0) > completionDate(for: $1) }
    }
    
    var body: some View {
        List {
            Section {
                ContextTipCard(context: .toDo, accentColor: settings.accentColor)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)
            }

            Section("Due") {
                if dueTodos.isEmpty {
                    ContentUnavailableView(
                        "No Tasks Due",
                        systemImage: "checkmark.circle",
                        description: Text("You’re all caught up.")
                    )
                } else {
                    ForEach(dueTodos) { todo in
                        todoRow(todo, isDone: false)
                            .swipeActions(edge: .trailing) {
                                Button {
                                    toggleCompletion(todo)
                                } label: {
                                    Label("Complete", systemImage: "checkmark")
                                }
                                .tint(.green)
                            }
                    }
                }
            }
            
            if !upcomingRecurring.isEmpty {
                Section("Upcoming Recurring") {
                    ForEach(upcomingRecurring) { todo in
                        todoRow(todo, isDone: false)
                            .overlay(alignment: .trailing) {
                                Text(todo.date.formatted(date: .abbreviated, time: .shortened))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                    }
                }
            }

            if !completedTodos.isEmpty {
                Section {
                    ForEach(completedTodos) { todo in
                        todoRow(todo, isDone: true)
                    }
                } header: {
                    Text("Done")
                } footer: {
                    Text("Completed tasks clear automatically after 24 hours.")
                }
            }
        }
        .navigationTitle("To-Do")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: { showingAddTask = true }) {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingAddTask) {
            AddToDoView()
        }
        .navigationDestination(item: $navigationDestination) { section in
            destinationView(for: section)
        }
        .onAppear {
            refreshTasks()
            completePendingNavigatedTaskIfNeeded()
        }
        .onChange(of: navigationDestination) { _, destination in
            if destination == nil {
                completePendingNavigatedTaskIfNeeded()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                refreshTasks()
                completePendingNavigatedTaskIfNeeded()
            }
        }
        .onReceive(cleanupTimer) { _ in
            guard scenePhase == .active else { return }
            refreshTasks()
        }
    }
    
    @ViewBuilder
    private func todoRow(_ todo: ToDoItem, isDone: Bool) -> some View {
        Button(action: { handleTaskTap(todo, isDone: isDone) }) {
            HStack(spacing: 12) {
                Image(systemName: iconName(for: todo, isDone: isDone))
                    .foregroundStyle(iconColor(for: todo, isDone: isDone))

                VStack(alignment: .leading, spacing: 3) {
                    Text(todo.title)
                        .strikethrough(isDone, color: .secondary)
                        .foregroundStyle(isDone ? .secondary : .primary)

                    HStack(spacing: 8) {
                        if todo.isAutoGenerated {
                            Text("Auto-generated")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        if todo.isRecurring {
                            Text(todo.recurrenceRule.rawValue)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        if isDone {
                            Text(completionDate(for: todo).formatted(date: .abbreviated, time: .shortened))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Spacer()
            }
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
    }

    private func handleTaskTap(_ todo: ToDoItem, isDone: Bool) {
        if isDone {
            undo(todo)
            return
        }

        if let taskType = todo.taskType, let destination = destination(for: taskType) {
            pendingNavigationCompletionTaskID = todo.id
            navigationDestination = nil
            DispatchQueue.main.async {
                navigationDestination = destination
            }
            return
        }

        complete(todo)
    }
    
    private func complete(_ todo: ToDoItem) {
        if todo.isRecurring {
            if let next = nextOccurrence(for: todo, from: max(Date(), todo.date)) {
                todo.date = next
            }
            todo.isCompleted = false
            todo.completedAt = nil
        } else {
            todo.isCompleted = true
            todo.completedAt = Date()
        }
        try? modelContext.save()
    }

    private func undo(_ todo: ToDoItem) {
        todo.isCompleted = false
        todo.completedAt = nil
        try? modelContext.save()
    }

    private func toggleCompletion(_ todo: ToDoItem) {
        if todo.isCompleted {
            undo(todo)
        } else {
            complete(todo)
        }
    }

    private func completionDate(for todo: ToDoItem) -> Date {
        todo.completedAt ?? todo.date
    }

    private func completePendingNavigatedTaskIfNeeded() {
        guard let pendingID = pendingNavigationCompletionTaskID else { return }
        defer { pendingNavigationCompletionTaskID = nil }
        guard let task = scopedTodos.first(where: { $0.id == pendingID }), !task.isCompleted else { return }
        complete(task)
    }

    private func iconName(for todo: ToDoItem, isDone: Bool) -> String {
        if isDone { return "checkmark.circle.fill" }
        if todo.isAutoGenerated { return "sparkles" }
        if todo.isRecurring { return "repeat" }
        return "circle"
    }

    private func iconColor(for todo: ToDoItem, isDone: Bool) -> Color {
        if isDone { return .gray }
        if todo.isAutoGenerated { return .orange }
        return .secondary
    }
    
    private func refreshTasks() {
        clearExpiredCompletedTasks()
        refreshRecurringTasks()
        syncAutoGeneratedTasks()
    }

    private func clearExpiredCompletedTasks() {
        let cutoff = Date().addingTimeInterval(-24 * 60 * 60)
        var didDelete = false
        for todo in scopedTodos where todo.isCompleted {
            if completionDate(for: todo) < cutoff {
                modelContext.delete(todo)
                didDelete = true
            }
        }
        if didDelete {
            try? modelContext.save()
        }
    }
    
    private func refreshRecurringTasks() {
        for todo in scopedTodos where todo.isRecurring {
            if todo.date > Date() {
                todo.isCompleted = false
            }
        }
    }
    
    private func syncAutoGeneratedTasks() {
        var activeKeys = Set<String>()
        let calendar = Calendar.current
        let now = Date()
        let todayToken = dayToken(for: now)
        let expirationThreshold = settings.expirationNotificationDays
        let spotCheckLeadDays = min(max(settings.spotCheckDaysBeforeOrder, 0), 6)
        
        for item in scopedItems {
            let soonestDays = item.batches
                .map { calendar.dateComponents([.day], from: now, to: $0.expirationDate).day ?? 999 }
                .filter { $0 >= 0 }
                .min() ?? 999
            
            if soonestDays <= expirationThreshold {
                let key = "expiring-\(item.id.uuidString)"
                activeKeys.insert(key)
                upsertAutoTask(
                    key: key,
                    title: "Check expiration for \(item.name)",
                    taskType: .checkExpirations,
                    relatedItem: item,
                    relatedVendor: nil
                )
            }
            
            if item.totalQuantity < item.minimumQuantity {
                let key = "low-stock-\(item.id.uuidString)"
                activeKeys.insert(key)
                upsertAutoTask(
                    key: key,
                    title: "Low stock: \(item.name)",
                    taskType: .reviewOrders,
                    relatedItem: item,
                    relatedVendor: item.vendor
                )
            }
        }
        
        if settings.orderDayReminders {
            for vendor in scopedVendors where vendor.isActive && vendor.canOrderToday {
                let key = "order-day-\(vendor.id.uuidString)-\(todayToken)"
                activeKeys.insert(key)
                upsertAutoTask(
                    key: key,
                    title: "Place order with \(vendor.name)",
                    taskType: .reviewOrders,
                    relatedItem: nil,
                    relatedVendor: vendor
                )
            }
        }
        
        let todayIndex = calendar.component(.weekday, from: now) - 1
        for vendor in scopedVendors where vendor.isActive && !vendor.orderDays.isEmpty {
            let isSpotCheckLeadDay = vendor.orderDays.contains { orderDay in
                let distance = (orderDay - todayIndex + 7) % 7
                return distance == spotCheckLeadDays
            }
            
            if isSpotCheckLeadDay {
                let key = "spot-check-before-order-\(vendor.id.uuidString)-\(todayToken)"
                activeKeys.insert(key)
                let dayLabel = spotCheckLeadDays == 1 ? "day" : "days"
                upsertAutoTask(
                    key: key,
                    title: "Spot check for \(vendor.name) order (\(spotCheckLeadDays) \(dayLabel) out)",
                    taskType: .spotCheck,
                    relatedItem: nil,
                    relatedVendor: vendor
                )
            }
        }

        if !scopedProductionProducts.filter(\.isActive).isEmpty {
            let key = "production-spot-check-\(todayToken)"
            activeKeys.insert(key)
            upsertAutoTask(
                key: key,
                title: "Morning production spot check",
                taskType: .productionSpotCheck,
                relatedItem: nil,
                relatedVendor: nil
            )
        }
        
        for todo in scopedTodos where todo.isAutoGenerated {
            guard let key = todo.autoTaskKey else { continue }
            if !activeKeys.contains(key) {
                modelContext.delete(todo)
            }
        }
    }
    
    private func upsertAutoTask(
        key: String,
        title: String,
        taskType: TaskType,
        relatedItem: InventoryItem?,
        relatedVendor: Vendor?
    ) {
        let now = Date()
        if let existing = scopedTodos.first(where: { $0.autoTaskKey == key }) {
            existing.title = title
            existing.taskType = taskType
            existing.relatedItem = relatedItem
            existing.relatedVendor = relatedVendor
            
            if existing.isCompleted {
                let completedToday = Calendar.current.isDate(completionDate(for: existing), inSameDayAs: now)
                if !completedToday {
                    existing.isCompleted = false
                    existing.completedAt = nil
                }
            }
            if !existing.isCompleted {
                existing.date = now
            }
        } else {
            let task = ToDoItem(
                title: title,
                taskType: taskType,
                isAutoGenerated: true,
                isRecurring: false,
                isPersistent: false,
                recurrenceRule: .none,
                recurrenceWeekday: nil,
                autoTaskKey: key,
                date: now,
                relatedItem: relatedItem,
                relatedVendor: relatedVendor,
                organizationId: activeOrganizationId
            )
            modelContext.insert(task)
        }
    }
    
    private func dayToken(for date: Date) -> String {
        let components = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return "\(components.year ?? 0)-\(components.month ?? 0)-\(components.day ?? 0)"
    }
    
    private func nextOccurrence(for todo: ToDoItem, from base: Date) -> Date? {
        switch todo.recurrenceRule {
        case .none:
            return nil
        case .daily:
            return Calendar.current.date(byAdding: .day, value: 1, to: base)
        case .weekly:
            let calendar = Calendar.current
            let weekday = todo.recurrenceWeekday ?? calendar.component(.weekday, from: base)
            var components = calendar.dateComponents([.hour, .minute], from: todo.date)
            components.weekday = weekday
            return calendar.nextDate(after: base, matching: components, matchingPolicy: .nextTimePreservingSmallerComponents)
        }
    }
    
    func navigateToTask(_ taskType: TaskType) {
        let destination = destination(for: taskType)
        guard let destination else { return }
        navigationDestination = nil
        DispatchQueue.main.async {
            navigationDestination = destination
        }
    }

    private func destination(for taskType: TaskType) -> HomeSection? {
        switch taskType {
        case .checkExpirations:
            return .expiration
        case .reviewOrders:
            return .orders
        case .spotCheck:
            return .spotCheck
        case .productionSpotCheck:
            return .production
        case .received:
            return .received
        default:
            return nil
        }
    }
    
    @ViewBuilder
    func destinationView(for section: HomeSection) -> some View {
        switch section {
        case .expiration: ExpirationView()
        case .orders: OrdersView()
        case .spotCheck: SpotCheckView()
        case .production: ProductionView()
        case .received: ReceivedView()
        default: EmptyView()
        }
    }
}

struct AddToDoView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    
    @State private var title = ""
    @State private var recurrenceRule: ToDoRecurrence = .none
    @State private var recurrenceWeekday = Calendar.current.component(.weekday, from: Date())
    @State private var startDate = Date()
    
    private var weekdayNames: [String] {
        Calendar.current.weekdaySymbols
    }
    
    var body: some View {
        NavigationStack {
            Form {
                Section("Task") {
                    TextField("Task", text: $title)
                    DatePicker("Starts", selection: $startDate)
                }
                
                Section("Repeat") {
                    Picker("Frequency", selection: $recurrenceRule) {
                        ForEach(ToDoRecurrence.allCases) { recurrence in
                            Text(recurrence.rawValue).tag(recurrence)
                        }
                    }
                    
                    if recurrenceRule == .weekly {
                        Picker("Day", selection: $recurrenceWeekday) {
                            ForEach(1...7, id: \.self) { day in
                                Text(weekdayNames[day - 1]).tag(day)
                            }
                        }
                    }
                }
            }
            .navigationTitle("New Task")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        let isRecurring = recurrenceRule != .none
                        let organizationId = session.activeOrganizationId ?? "local-default"
                        let task = ToDoItem(
                            title: title,
                            taskType: nil,
                            isAutoGenerated: false,
                            isRecurring: isRecurring,
                            isPersistent: false,
                            recurrenceRule: recurrenceRule,
                            recurrenceWeekday: recurrenceRule == .weekly ? recurrenceWeekday : nil,
                            autoTaskKey: nil,
                            date: startDate,
                            organizationId: organizationId
                        )
                        modelContext.insert(task)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
