import Foundation
import SwiftUI
import SwiftData

struct InsightsView: View {
    @EnvironmentObject private var session: AccountSessionStore
    @Query private var items: [InventoryItem]
    @Query(sort: [SortDescriptor(\WasteEntry.date, order: .reverse)]) private var wasteEntries: [WasteEntry]
    @Query(sort: [SortDescriptor(\SpotCheckInsightAction.date, order: .reverse)]) private var spotCheckActions: [SpotCheckInsightAction]
    @Query(sort: [SortDescriptor(\OrderItem.orderDate, order: .reverse)]) private var orders: [OrderItem]
    @StateObject private var settings = AppSettings.shared

    @State private var showingLayoutEditor = false
    @State private var showingDataScopeEditor = false

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? "local-default"
    }

    private var activeStoreId: String {
        settings.normalizedActiveStoreID
    }
    
    private var scopedAllItems: [InventoryItem] {
        items.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId)
        }
    }

    private var activeItems: [InventoryItem] {
        scopedAllItems.filter { !$0.isArchived }
    }

    private var orgWasteEntries: [WasteEntry] {
        wasteEntries.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId)
        }
    }

    private var orgSpotCheckActions: [SpotCheckInsightAction] {
        spotCheckActions.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId)
        }
    }

    private var scopedWasteEntries: [WasteEntry] {
        orgWasteEntries.filter(\.isIncludedInInsights)
    }

    private var scopedSpotCheckActions: [SpotCheckInsightAction] {
        orgSpotCheckActions.filter(\.includeInInsights)
    }

    private var scopedOrders: [OrderItem] {
        orders.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId)
        }
    }

    private var itemNameByID: [UUID: String] {
        Dictionary(uniqueKeysWithValues: scopedAllItems.map { ($0.id, $0.name) })
    }

    private var itemPriceByID: [UUID: Double] {
        Dictionary(uniqueKeysWithValues: scopedAllItems.map { ($0.id, max(0, $0.price)) })
    }
    
    private var expiringSoonCount: Int {
        activeItems.filter { item in
            item.batches.contains { batch in
                let days = Calendar.current.dateComponents([.day], from: Date(), to: batch.expirationDate).day ?? 999
                return days >= 0 && days <= 7
            }
        }.count
    }
    
    private var lowStockCount: Int {
        activeItems.filter { $0.totalQuantity < $0.minimumQuantity }.count
    }
    
    private var onSaleCount: Int {
        activeItems.filter { $0.isOnSale }.count
    }

    private var visibleCards: [InsightCardKind] {
        settings.insightCardOrder.filter { settings.isInsightCardEnabled($0) }
    }

    private var weeklyFinancialSnapshot: WeeklyFinancialSnapshot {
        let calendar = Calendar.current
        let now = Date()
        let weekInterval = calendar.dateInterval(of: .weekOfYear, for: now)
            ?? DateInterval(
                start: calendar.startOfDay(for: now),
                end: calendar.date(byAdding: .day, value: 7, to: calendar.startOfDay(for: now)) ?? now
            )
        let weekStart = weekInterval.start
        let weekEnd = weekInterval.end

        var revenueByItem: [String: Double] = [:]
        var lossByItem: [String: Double] = [:]

        for action in scopedSpotCheckActions {
            guard action.date >= weekStart && action.date < weekEnd else { continue }
            let soldQuantity = action.soldQuantityEstimate
            guard soldQuantity > 0 else { continue }
            let itemName = resolvedItemName(for: action.itemIDSnapshot, fallback: action.itemNameSnapshot)
            let fallbackPrice = resolvedItemPrice(for: action.itemIDSnapshot)
            let pricePerUnit = max(0, action.itemPriceSnapshot > 0 ? action.itemPriceSnapshot : fallbackPrice)
            revenueByItem[itemName, default: 0] += soldQuantity * pricePerUnit
        }

        for entry in scopedWasteEntries {
            guard entry.date >= weekStart && entry.date < weekEnd else { continue }

            let itemName = resolvedItemName(for: entry.itemIDSnapshot, fallback: entry.itemNameSnapshot)
            let fallbackPrice = resolvedItemPrice(for: entry.itemIDSnapshot)
            let pricePerUnit = max(0, entry.itemPriceSnapshot ?? fallbackPrice)
            let quantity = max(0, entry.quantity)

            lossByItem[itemName, default: 0] += quantity * pricePerUnit
        }

        let projectedRevenue = revenueByItem.values.reduce(0, +)
        let loss = lossByItem.values.reduce(0, +)
        let topRevenue = revenueByItem.max { lhs, rhs in lhs.value < rhs.value }
        let topLoss = lossByItem.max { lhs, rhs in lhs.value < rhs.value }

        let dateFormatter = DateIntervalFormatter()
        dateFormatter.dateStyle = .medium
        dateFormatter.timeStyle = .none
        let weekLabel = dateFormatter.string(from: weekStart, to: weekEnd.addingTimeInterval(-86_400))

        return WeeklyFinancialSnapshot(
            weekLabel: weekLabel,
            projectedRevenue: projectedRevenue,
            weeklyLoss: loss,
            topRevenueItem: topRevenue.map { (name: $0.key, value: $0.value) },
            topLossItem: topLoss.map { (name: $0.key, value: $0.value) }
        )
    }
    
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                ContextTipCard(context: .insights, accentColor: settings.accentColor)

                if visibleCards.isEmpty {
                    ContentUnavailableView(
                        "No Insight Cards Enabled",
                        systemImage: "slider.horizontal.3",
                        description: Text("Tap Customize to turn cards back on.")
                    )
                } else {
                    ForEach(visibleCards) { card in
                        cardView(for: card)
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Insights")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Data Scope") {
                    showingDataScopeEditor = true
                }
                .foregroundStyle(settings.accentColor)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Customize") {
                    showingLayoutEditor = true
                }
                .foregroundStyle(settings.accentColor)
            }
        }
        .sheet(isPresented: $showingLayoutEditor) {
            InsightLayoutEditorView(
                order: settings.insightCardOrder,
                enabledCards: settings.enabledInsightCards,
                accentColor: settings.accentColor
            ) { updatedOrder, updatedEnabled in
                settings.insightCardOrder = updatedOrder
                settings.enabledInsightCards = updatedEnabled
            }
        }
        .sheet(isPresented: $showingDataScopeEditor) {
            InsightsActionScopeEditorView(
                wasteEntries: orgWasteEntries,
                spotCheckActions: orgSpotCheckActions,
                accentColor: settings.accentColor
            )
        }
    }

    @ViewBuilder
    private func cardView(for card: InsightCardKind) -> some View {
        switch card {
        case .inventoryHealth:
            InsightCard(title: card.title, icon: card.iconName, color: settings.accentColor) {
                InventoryHealthSummary(
                    totalItems: activeItems.count,
                    lowStock: lowStockCount,
                    expiringSoon: expiringSoonCount,
                    onSale: onSaleCount
                )
            }
        case .weeklyFinancial:
            InsightCard(title: card.title, icon: card.iconName, color: .green) {
                WeeklyFinancialView(snapshot: weeklyFinancialSnapshot)
            }
        case .topMoneyMovers:
            InsightCard(title: card.title, icon: card.iconName, color: .mint) {
                TopMoneyMoversView(snapshot: weeklyFinancialSnapshot)
            }
        case .lowStock:
            InsightCard(title: card.title, icon: card.iconName, color: .orange) {
                LowStockView(items: activeItems)
            }
        case .expiringSoon:
            InsightCard(title: card.title, icon: card.iconName, color: .red) {
                ExpiringSoonInsights(items: activeItems)
            }
        case .mostWasted:
            InsightCard(title: card.title, icon: card.iconName, color: .red) {
                MostWastedView(wasteEntries: scopedWasteEntries)
            }
        case .wasteByType:
            InsightCard(title: card.title, icon: card.iconName, color: .pink) {
                WasteByTypeView(wasteEntries: scopedWasteEntries)
            }
        case .mostOrdered:
            InsightCard(title: card.title, icon: card.iconName, color: .blue) {
                MostOrderedItemsView(orders: scopedOrders)
            }
        case .inventoryValue:
            InsightCard(title: card.title, icon: card.iconName, color: .green) {
                InventoryValueView(items: activeItems)
            }
        case .overstocked:
            InsightCard(title: card.title, icon: card.iconName, color: .indigo) {
                OverstockedView(items: activeItems)
            }
        case .saleCoverage:
            InsightCard(title: card.title, icon: card.iconName, color: .orange) {
                SaleCoverageView(items: activeItems)
            }
        }
    }

    private func resolvedItemName(for id: UUID?, fallback: String?) -> String {
        if let id, let mapped = itemNameByID[id], !mapped.isEmpty {
            return mapped
        }
        let trimmed = fallback?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? "Unknown Item" : trimmed
    }

    private func resolvedItemPrice(for id: UUID?) -> Double {
        guard let id else { return 0 }
        return max(0, itemPriceByID[id] ?? 0)
    }
}

private struct InsightsActionScopeEditorView: View {
    @Environment(\.dismiss) private var dismiss
    let wasteEntries: [WasteEntry]
    let spotCheckActions: [SpotCheckInsightAction]
    let accentColor: Color

    private var totalIncludedCount: Int {
        wasteEntries.filter(\.isIncludedInInsights).count +
        spotCheckActions.filter(\.includeInInsights).count
    }

    private var totalActionCount: Int {
        wasteEntries.count + spotCheckActions.count
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Actions Included In Insights") {
                    Text("\(totalIncludedCount) of \(totalActionCount) action(s) currently included.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Recent Waste Actions") {
                    if wasteEntries.isEmpty {
                        Text("No waste actions yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(wasteEntries.prefix(150)) { entry in
                            Toggle(isOn: Binding(
                                get: { entry.isIncludedInInsights },
                                set: { entry.includeInInsights = $0 }
                            )) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(entry.displayItemName) • \(entry.quantity.formattedQuantity())")
                                    Text("\(entry.displayWasteType) • \(entry.date.formatted(date: .abbreviated, time: .shortened))")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .tint(accentColor)
                        }
                    }
                }

                Section("Recent Spot Check Actions") {
                    if spotCheckActions.isEmpty {
                        Text("No spot check actions yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(spotCheckActions.prefix(150)) { action in
                            Toggle(isOn: Binding(
                                get: { action.includeInInsights },
                                set: { action.includeInInsights = $0 }
                            )) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(action.itemNameSnapshot)
                                    Text(
                                        "Before \(action.previousQuantity.formattedQuantity()) → Counted \(action.countedQuantity.formattedQuantity()) • \(action.date.formatted(date: .abbreviated, time: .shortened))"
                                    )
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                }
                            }
                            .tint(accentColor)
                        }
                    }
                }
            }
            .navigationTitle("Insights Data Scope")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button("Include All") {
                        for entry in wasteEntries { entry.includeInInsights = true }
                        for action in spotCheckActions { action.includeInInsights = true }
                    }
                    .foregroundStyle(accentColor)

                    Button("Exclude All") {
                        for entry in wasteEntries { entry.includeInInsights = false }
                        for action in spotCheckActions { action.includeInInsights = false }
                    }
                    .foregroundStyle(.red)
                }
            }
        }
    }
}

private struct WeeklyFinancialSnapshot {
    let weekLabel: String
    let projectedRevenue: Double
    let weeklyLoss: Double
    let topRevenueItem: (name: String, value: Double)?
    let topLossItem: (name: String, value: Double)?

    var projectedNet: Double {
        projectedRevenue - weeklyLoss
    }
}

private struct InsightLayoutEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var workingOrder: [InsightCardKind]
    @State private var enabledCards: Set<InsightCardKind>

    let accentColor: Color
    let onSave: ([InsightCardKind], Set<InsightCardKind>) -> Void

    init(
        order: [InsightCardKind],
        enabledCards: Set<InsightCardKind>,
        accentColor: Color,
        onSave: @escaping ([InsightCardKind], Set<InsightCardKind>) -> Void
    ) {
        _workingOrder = State(initialValue: order)
        _enabledCards = State(initialValue: enabledCards)
        self.accentColor = accentColor
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Cards") {
                    ForEach(workingOrder) { card in
                        HStack(spacing: 12) {
                            Toggle(isOn: binding(for: card)) {
                                Label(card.title, systemImage: card.iconName)
                            }
                            .tint(accentColor)

                            Image(systemName: "line.3.horizontal")
                                .foregroundStyle(.secondary)
                        }
                    }
                    .onMove(perform: move)
                }

                Section("How It Works") {
                    Text("Turn cards on or off, then drag to reorder the Insights screen.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Customize Insights")
            .navigationBarTitleDisplayMode(.inline)
            .environment(\.editMode, .constant(.active))
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        onSave(workingOrder, enabledCards)
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

    private func binding(for card: InsightCardKind) -> Binding<Bool> {
        Binding(
            get: { enabledCards.contains(card) },
            set: { isEnabled in
                if isEnabled {
                    enabledCards.insert(card)
                } else {
                    enabledCards.remove(card)
                }
            }
        )
    }
}

struct InsightCard<Content: View>: View {
    let title: String
    let icon: String
    let color: Color
    @ViewBuilder let content: Content
    
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Image(systemName: icon)
                    .foregroundStyle(color)
                Text(title)
                    .font(.headline)
                Spacer()
            }
            content
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

struct InventoryHealthSummary: View {
    let totalItems: Int
    let lowStock: Int
    let expiringSoon: Int
    let onSale: Int
    
    var body: some View {
        HStack(spacing: 8) {
            statPill(title: "Items", value: "\(totalItems)", color: .blue)
            statPill(title: "Low", value: "\(lowStock)", color: .orange)
            statPill(title: "Expiring", value: "\(expiringSoon)", color: .red)
            statPill(title: "On Sale", value: "\(onSale)", color: .green)
        }
    }
    
    private func statPill(title: String, value: String, color: Color) -> some View {
        VStack(spacing: 3) {
            Text(value)
                .font(.headline)
            Text(title)
                .font(.caption2)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(color.opacity(0.14), in: RoundedRectangle(cornerRadius: 10))
    }
}

private struct WeeklyFinancialView: View {
    let snapshot: WeeklyFinancialSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(snapshot.weekLabel)
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                moneyPill(title: "Earned", value: snapshot.projectedRevenue, color: .green)
                moneyPill(title: "Lost", value: snapshot.weeklyLoss, color: .red)
            }

            HStack {
                Text("Projected Net")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(currency(snapshot.projectedNet))
                    .font(.headline)
                    .foregroundStyle(snapshot.projectedNet >= 0 ? .green : .red)
            }

            Text("Earned is estimated from spot-check decreases. Loss is calculated only from waste actions.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private func moneyPill(title: String, value: Double, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(currency(value))
                .font(.headline)
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
    }

    private func currency(_ amount: Double) -> String {
        amount.formatted(.currency(code: Locale.current.currency?.identifier ?? "USD"))
    }
}

private struct TopMoneyMoversView: View {
    let snapshot: WeeklyFinancialSnapshot

    var body: some View {
        if snapshot.topRevenueItem == nil && snapshot.topLossItem == nil {
            Text("No money movement yet this week. Receive orders and record waste to populate this card.")
                .foregroundStyle(.secondary)
        } else {
            VStack(spacing: 10) {
                if let topRevenue = snapshot.topRevenueItem {
                    row(
                        title: "Makes the Most Money",
                        itemName: topRevenue.name,
                        value: topRevenue.value,
                        color: .green
                    )
                }

                if let topLoss = snapshot.topLossItem {
                    row(
                        title: "Costs the Most Money",
                        itemName: topLoss.name,
                        value: topLoss.value,
                        color: .red
                    )
                }
            }
        }
    }

    private func row(title: String, itemName: String, value: Double, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack {
                Text(itemName)
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text(value.formatted(.currency(code: Locale.current.currency?.identifier ?? "USD")))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(color)
            }
        }
    }
}

struct LowStockView: View {
    let items: [InventoryItem]
    
    private var lowStockItems: [InventoryItem] {
        items.filter { $0.totalQuantity < $0.minimumQuantity }
            .sorted { lhs, rhs in
                (lhs.minimumQuantity - lhs.totalQuantity) > (rhs.minimumQuantity - rhs.totalQuantity)
            }
    }
    
    var body: some View {
        if lowStockItems.isEmpty {
            Text("All items are above minimum stock.")
                .foregroundStyle(.secondary)
        } else {
            ForEach(lowStockItems.prefix(5)) { item in
                HStack {
                    Text(item.name)
                    Spacer()
                    Text("\(item.totalQuantity.formattedQuantity()) / \(item.minimumQuantity.formattedQuantity())")
                        .foregroundStyle(.orange)
                }
            }
        }
    }
}

struct ExpiringSoonInsights: View {
    let items: [InventoryItem]
    
    private var expiring: [(name: String, days: Int, quantity: Double)] {
        var results: [(name: String, days: Int, quantity: Double)] = []
        for item in items {
            for batch in item.batches {
                let days = Calendar.current.dateComponents([.day], from: Date(), to: batch.expirationDate).day ?? 999
                if days >= 0 && days <= 7 {
                    results.append((name: item.name, days: days, quantity: batch.quantity))
                }
            }
        }
        return results.sorted { lhs, rhs in lhs.days < rhs.days }
    }
    
    var body: some View {
        if expiring.isEmpty {
            Text("No batches expiring in the next 7 days.")
                .foregroundStyle(.secondary)
        } else {
            ForEach(Array(expiring.prefix(6).enumerated()), id: \.offset) { _, row in
                HStack {
                    Text(row.name)
                    Spacer()
                    Text("\(row.quantity.formattedQuantity()) • \(row.days)d")
                        .foregroundStyle(row.days <= 2 ? .red : .orange)
                }
            }
        }
    }
}

struct MostWastedView: View {
    let wasteEntries: [WasteEntry]
    
    var body: some View {
        let grouped = Dictionary(grouping: wasteEntries) { $0.displayItemName }
        let rows: [(name: String, total: Double)] = grouped.map { key, value in
            let total = value.reduce(0.0) { partial, entry in partial + entry.quantity }
            return (name: key, total: total)
        }
        let sorted = rows
            .sorted { lhs, rhs in lhs.total > rhs.total }
            .prefix(5)
        
        if sorted.isEmpty {
            Text("No waste entries recorded yet.")
                .foregroundStyle(.secondary)
        } else {
            ForEach(Array(sorted), id: \.name) { entry in
                HStack {
                    Text(entry.name)
                    Spacer()
                    Text(entry.total.formattedQuantity())
                        .foregroundStyle(.red)
                }
            }
        }
    }
}

struct WasteByTypeView: View {
    let wasteEntries: [WasteEntry]
    
    var body: some View {
        let grouped = Dictionary(grouping: wasteEntries) { $0.displayWasteType }
        let rows: [(type: String, total: Double)] = grouped.map { key, value in
            let total = value.reduce(0.0) { partial, entry in partial + entry.quantity }
            return (type: key, total: total)
        }
        let sorted = rows.sorted { lhs, rhs in lhs.total > rhs.total }
        
        if sorted.isEmpty {
            Text("No waste type data yet.")
                .foregroundStyle(.secondary)
        } else {
            ForEach(sorted, id: \.type) { row in
                HStack {
                    Text(row.type)
                    Spacer()
                    Text(row.total.formattedQuantity())
                        .foregroundStyle(.pink)
                }
            }
        }
    }
}

struct MostOrderedItemsView: View {
    let orders: [OrderItem]
    
    var body: some View {
        let grouped = Dictionary(grouping: orders) { $0.itemNameSnapshot ?? "Unknown" }
        let rows: [(name: String, count: Int)] = grouped.map { key, value in
            (name: key, count: value.count)
        }
        let sorted = rows
            .sorted { lhs, rhs in lhs.count > rhs.count }
            .prefix(5)
        
        if sorted.isEmpty {
            Text("No order history yet.")
                .foregroundStyle(.secondary)
        } else {
            ForEach(Array(sorted), id: \.name) { row in
                HStack {
                    Text(row.name)
                    Spacer()
                    Text("\(row.count)")
                        .foregroundStyle(.blue)
                }
            }
        }
    }
}

struct InventoryValueView: View {
    let items: [InventoryItem]
    
    private var totalValue: Double {
        items.reduce(0) { $0 + ($1.totalQuantity * $1.price) }
    }
    
    private var topValueItems: [(name: String, value: Double)] {
        let rows: [(String, Double)] = items.map { item in
            (item.name, item.totalQuantity * item.price)
        }
        return rows
            .sorted { lhs, rhs in lhs.1 > rhs.1 }
            .prefix(5)
            .map { (name: $0.0, value: $0.1) }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("$\(totalValue, specifier: "%.2f")")
                .font(.largeTitle)
                .fontWeight(.bold)
            
            ForEach(topValueItems, id: \.name) { row in
                HStack {
                    Text(row.name)
                    Spacer()
                    Text("$\(row.value, specifier: "%.2f")")
                        .foregroundStyle(.green)
                }
            }
        }
    }
}

struct OverstockedView: View {
    let items: [InventoryItem]
    
    private var overstocked: [InventoryItem] {
        items
            .filter { $0.minimumQuantity > 0 && $0.totalQuantity > ($0.minimumQuantity * 1.6) }
            .sorted { lhs, rhs in lhs.totalQuantity > rhs.totalQuantity }
    }
    
    var body: some View {
        if overstocked.isEmpty {
            Text("No overstocked items right now.")
                .foregroundStyle(.secondary)
        } else {
            ForEach(overstocked.prefix(5)) { item in
                HStack {
                    Text(item.name)
                    Spacer()
                    Text("\(item.totalQuantity.formattedQuantity())")
                        .foregroundStyle(.indigo)
                }
            }
        }
    }
}

struct SaleCoverageView: View {
    let items: [InventoryItem]
    
    private var onSaleItems: [InventoryItem] {
        items.filter { $0.isOnSale }
    }
    
    var body: some View {
        if onSaleItems.isEmpty {
            Text("No active sale items.")
                .foregroundStyle(.secondary)
        } else {
            ForEach(onSaleItems.prefix(5)) { item in
                HStack {
                    Text(item.name)
                    Spacer()
                    Text("\(item.salePercentage)%")
                        .foregroundStyle(.orange)
                }
            }
        }
    }
}
