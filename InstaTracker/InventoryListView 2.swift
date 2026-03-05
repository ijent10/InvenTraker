import Foundation
import SwiftUI
import SwiftData

/// Displays all active inventory items with search
/// Supports searching by name, tags, or UPC
struct InventoryListView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    @Query(filter: #Predicate<InventoryItem> { !$0.isArchived }, sort: \InventoryItem.name)
    private var items: [InventoryItem]
    @StateObject private var settings = AppSettings.shared
    
    @State private var searchText = ""
    @State private var showingArchived = false
    @State private var showingAddItem = false
    @State private var inventoryShareURL: URL?
    @State private var isPreparingShare = false
    @State private var filterSnapshots: [InventoryFilterSnapshot] = []
    @State private var rowMetricsByItemID: [UUID: InventoryRowMetrics] = [:]
    @State private var scopedItemLookup: [UUID: InventoryItem] = [:]
    @State private var filteredItemIDs: [UUID] = []
    @State private var activeFilterRequestKey = ""
    @State private var activeFilterToken = UUID()
    @State private var isFiltering = false

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? "local-default"
    }

    private var scopedItems: [InventoryItem] {
        let storeId = settings.normalizedActiveStoreID
        return items.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(storeId) &&
            session.canAccessInventoryDepartment($0.department)
        }
    }

    private var canAdjustInventory: Bool {
        session.canPerform(.manageCatalog) || session.canPerform(.manageSettings)
    }

    private var normalizedSearchQuery: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private var scopedDataToken: Int {
        var hasher = Hasher()
        hasher.combine(scopedItems.count)
        for item in scopedItems {
            hasher.combine(item.id)
            hasher.combine(item.lastModified.timeIntervalSinceReferenceDate)
            hasher.combine(item.isOnSale)
            hasher.combine(item.salePercentage)
            hasher.combine(item.department ?? "")
            hasher.combine(item.departmentLocation ?? "")
            hasher.combine(item.batches.count)
        }
        return hasher.finalize()
    }

    private var filteredItems: [InventoryItem] {
        guard !normalizedSearchQuery.isEmpty else { return scopedItems }
        return filteredItemIDs.compactMap { scopedItemLookup[$0] }
    }
    
    var body: some View {
        List {
            Section {
                ContextTipCard(context: .inventory, accentColor: settings.accentColor)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)
            }

            ForEach(filteredItems) { item in
                NavigationLink {
                    LazyDestinationView {
                        ItemDetailView(item: item)
                    }
                } label: {
                    InventoryItemRow(item: item, metrics: rowMetricsByItemID[item.id])
                }
            }
        }
        .listStyle(.plain)
        .transaction { transaction in
            transaction.animation = nil
        }
        .searchable(text: $searchText, prompt: "Search by name, tag, or UPC")
        .navigationTitle("Inventory")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let inventoryShareURL {
                    ShareLink(
                        item: inventoryShareURL,
                        subject: Text("Inventory Share"),
                        message: Text("Open in InvenTraker to import inventory items.")
                    ) {
                        Image(systemName: "square.and.arrow.up")
                            .foregroundStyle(settings.accentColor)
                    }
                } else {
                    Button {
                        prepareInventoryShareURL()
                    } label: {
                        if isPreparingShare {
                            ProgressView()
                                .tint(settings.accentColor)
                        } else {
                            Image(systemName: "square.and.arrow.up")
                                .foregroundStyle(settings.accentColor)
                        }
                    }
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                if isFiltering && !normalizedSearchQuery.isEmpty {
                    ProgressView()
                        .controlSize(.small)
                        .tint(settings.accentColor)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                if canAdjustInventory {
                    Menu {
                        Button(action: { showingArchived = true }) {
                            Label("Archives", systemImage: "archivebox")
                        }
                        Button(action: { showingAddItem = true }) {
                            Label("Add Item", systemImage: "plus")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .foregroundStyle(settings.accentColor)
                    }
                }
            }
        }
        .sheet(isPresented: $showingArchived) {
            ArchivedItemsView()
        }
        .sheet(isPresented: $showingAddItem) {
            AddItemView()
        }
        .onAppear {
            inventoryShareURL = nil
            rebuildFilterIndexAndApply()
            refreshScopedInventoryFromRemote()
        }
        .onChange(of: searchText) { _, _ in
            applyFilterAsync(with: filterSnapshots, query: normalizedSearchQuery)
        }
        .onChange(of: scopedDataToken) { _, _ in
            rebuildFilterIndexAndApply()
        }
        .onChange(of: settings.normalizedActiveStoreID) { _, _ in
            rebuildFilterIndexAndApply()
            refreshScopedInventoryFromRemote()
        }
        .onChange(of: activeOrganizationId) { _, _ in
            rebuildFilterIndexAndApply()
            refreshScopedInventoryFromRemote()
        }
        .onChange(of: scopedItems.count) { _, _ in
            inventoryShareURL = nil
        }
    }

    private func rebuildFilterIndexAndApply() {
        let snapshots = scopedItems.enumerated().map { index, item in
            InventoryFilterSnapshot(item: item, orderIndex: index)
        }
        filterSnapshots = snapshots
        scopedItemLookup = Dictionary(uniqueKeysWithValues: scopedItems.map { ($0.id, $0) })
        rowMetricsByItemID = Dictionary(uniqueKeysWithValues: snapshots.map { ($0.id, $0.metrics) })
        applyFilterAsync(with: snapshots, query: normalizedSearchQuery)
    }

    private func applyFilterAsync(with snapshots: [InventoryFilterSnapshot], query: String) {
        let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalized.isEmpty {
            filteredItemIDs = snapshots.map(\.id)
            activeFilterRequestKey = ""
            isFiltering = false
            return
        }

        let datasetKey = InventoryFilterEngine.datasetKey(for: snapshots)
        let requestKey = "\(datasetKey)|\(normalized)"
        if isFiltering && activeFilterRequestKey == requestKey {
            return
        }

        activeFilterRequestKey = requestKey
        let token = UUID()
        activeFilterToken = token
        isFiltering = true

        DispatchQueue.global(qos: .userInitiated).async {
            guard InventoryFilterCoordinator.shared.begin(key: requestKey) else {
                DispatchQueue.main.async {
                    if activeFilterToken == token {
                        isFiltering = false
                    }
                }
                return
            }
            defer { InventoryFilterCoordinator.shared.end(key: requestKey) }

            let ids = InventoryFilterEngine.filterIDs(snapshots: snapshots, query: normalized)
            DispatchQueue.main.async {
                guard activeFilterToken == token else { return }
                filteredItemIDs = ids
                isFiltering = false
                activeFilterRequestKey = ""
            }
        }
    }

    private func prepareInventoryShareURL() {
        guard !isPreparingShare else { return }
        isPreparingShare = true
        let snapshotItems = scopedItems
        Task { @MainActor in
            inventoryShareURL = InventoryShareService.shareURL(for: snapshotItems)
            isPreparingShare = false
        }
    }

    private func refreshScopedInventoryFromRemote() {
        let scopedStoreID = settings.normalizedActiveStoreID
        guard !activeOrganizationId.isEmpty, !scopedStoreID.isEmpty else { return }
        Task {
            _ = await InventoryStateSyncService.shared.refreshStoreScopeFromRemote(
                organizationId: activeOrganizationId,
                storeId: scopedStoreID,
                allowedDepartments: session.inventoryDepartmentScope,
                modelContext: modelContext,
                includeInventory: true,
                includeOperational: false,
                force: false
            )
        }
    }
}

private struct LazyDestinationView<Content: View>: View {
    private let builder: () -> Content

    init(@ViewBuilder _ builder: @escaping () -> Content) {
        self.builder = builder
    }

    var body: some View {
        builder()
    }
}

/// Row displaying an inventory item in the list
struct InventoryItemRow: View {
    let item: InventoryItem
    fileprivate let metrics: InventoryRowMetrics?
    @StateObject private var settings = AppSettings.shared
    
    private static let summaryDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        return formatter
    }()

    private var totalQuantity: Double {
        metrics?.totalQuantity ?? item.batches.reduce(0) { $0 + $1.quantity }
    }

    private var backStockQuantity: Double {
        metrics?.backStockQuantity ?? item.backStockQuantity
    }

    private var frontStockQuantity: Double {
        metrics?.frontStockQuantity ?? item.frontStockQuantity
    }

    private var quickBatchSummary: String? {
        if let metrics {
            return metrics.quickBatchSummary
        }
        guard !item.batches.isEmpty else { return nil }
        let batchCount = item.batches.count
        let nextDate = item.batches.map(\.expirationDate).min()
        if let nextDate {
            return "\(batchCount) batch\(batchCount == 1 ? "" : "es") • Next exp \(Self.summaryDateFormatter.string(from: nextDate))"
        }
        return "\(batchCount) batch\(batchCount == 1 ? "" : "es")"
    }
    
    var body: some View {
        HStack(spacing: 12) {
            CachedThumbnailView(
                imageData: item.pictures.first,
                cacheKey: "inventory-row-\(item.id.uuidString)-\(item.pictures.first?.count ?? 0)",
                width: 48,
                height: 48,
                cornerRadius: 8
            )
            
            // Item details
            VStack(alignment: .leading, spacing: 4) {
                Text(item.name)
                    .font(.headline)
                
                // Stock summary (batches)
                if let quickBatchSummary {
                    Text(quickBatchSummary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                if let placementLabel = placementLabel {
                    Text(placementLabel)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                
                // Total quantity and sale badge
                HStack(spacing: 8) {
                    Text("Total: \(settings.formattedQuantityForDisplay(totalQuantity, item: item))")
                        .font(.subheadline)
                        .foregroundStyle(.blue)
                    
                    if item.isOnSale {
                        Text("ON SALE (\(item.salePercentage)%)")
                            .font(.caption2)
                            .fontWeight(.bold)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.orange.gradient)
                            .clipShape(Capsule())
                    }
                }

                HStack(spacing: 10) {
                    Text("Back: \(settings.formattedQuantityForDisplay(backStockQuantity, item: item))")
                    Text("Front: \(settings.formattedQuantityForDisplay(frontStockQuantity, item: item))")
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
            
            Spacer()
        }
    }

    private var placementLabel: String? {
        if let metrics {
            return metrics.placementLabel
        }
        guard let department = item.department, !department.isEmpty else { return nil }
        let trimmedLocation = item.departmentLocation?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmedLocation.isEmpty ? department : "\(department) • \(trimmedLocation)"
    }
}

private struct InventoryRowMetrics {
    let totalQuantity: Double
    let backStockQuantity: Double
    let frontStockQuantity: Double
    let quickBatchSummary: String?
    let placementLabel: String?
}

private struct InventoryFilterSnapshot: Identifiable {
    static let summaryDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        return formatter
    }()

    let id: UUID
    let orderIndex: Int
    let searchBlob: String
    let metrics: InventoryRowMetrics

    init(item: InventoryItem, orderIndex: Int) {
        self.id = item.id
        self.orderIndex = orderIndex
        let searchTags = item.tags.joined(separator: " ")
        self.searchBlob = [
            item.name.lowercased(),
            searchTags.lowercased(),
            (item.upc ?? "").lowercased()
        ].joined(separator: " ")

        let totalQuantity = item.batches.reduce(0) { $0 + $1.quantity }
        let backStockQuantity = item.batches
            .filter { $0.stockArea == .backOfHouse }
            .reduce(0) { $0 + $1.quantity }
        let frontStockQuantity = item.batches
            .filter { $0.stockArea == .frontOfHouse }
            .reduce(0) { $0 + $1.quantity }
        let quickBatchSummary: String?
        if item.batches.isEmpty {
            quickBatchSummary = nil
        } else {
            let batchCount = item.batches.count
            if let nextDate = item.batches.map(\.expirationDate).min() {
                quickBatchSummary = "\(batchCount) batch\(batchCount == 1 ? "" : "es") • Next exp \(Self.summaryDateFormatter.string(from: nextDate))"
            } else {
                quickBatchSummary = "\(batchCount) batch\(batchCount == 1 ? "" : "es")"
            }
        }

        let trimmedDepartment = item.department?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let trimmedLocation = item.departmentLocation?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let placementLabel: String?
        if trimmedDepartment.isEmpty {
            placementLabel = nil
        } else {
            placementLabel = trimmedLocation.isEmpty ? trimmedDepartment : "\(trimmedDepartment) • \(trimmedLocation)"
        }

        self.metrics = InventoryRowMetrics(
            totalQuantity: totalQuantity,
            backStockQuantity: backStockQuantity,
            frontStockQuantity: frontStockQuantity,
            quickBatchSummary: quickBatchSummary,
            placementLabel: placementLabel
        )
    }
}

private enum InventoryFilterEngine {
    static func datasetKey(for snapshots: [InventoryFilterSnapshot]) -> String {
        var hasher = Hasher()
        hasher.combine(snapshots.count)
        for snapshot in snapshots {
            hasher.combine(snapshot.id)
            hasher.combine(snapshot.orderIndex)
            hasher.combine(snapshot.searchBlob)
        }
        return String(hasher.finalize())
    }

    static func filterIDs(snapshots: [InventoryFilterSnapshot], query: String) -> [UUID] {
        snapshots
            .filter { $0.searchBlob.contains(query) }
            .sorted { $0.orderIndex < $1.orderIndex }
            .map(\.id)
    }
}

private final class InventoryFilterCoordinator {
    static let shared = InventoryFilterCoordinator()

    private var inFlight: Set<String> = []
    private let lock = NSLock()

    private init() {}

    func begin(key: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !inFlight.contains(key) else { return false }
        inFlight.insert(key)
        return true
    }

    func end(key: String) {
        lock.lock()
        inFlight.remove(key)
        lock.unlock()
    }
}
