import SwiftUI
import SwiftData

struct OrdersView: View {
    @EnvironmentObject private var session: AccountSessionStore
    @Query(sort: \OrderItem.orderDate, order: .reverse) private var orderItems: [OrderItem]
    @StateObject private var settings = AppSettings.shared
    
    @State private var showingGenerateOrder = false

    private var canGenerateOrders: Bool {
        session.canPerform(.generateOrder)
    }

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? "local-default"
    }

    private var scopedOrderItems: [OrderItem] {
        let storeId = settings.normalizedActiveStoreID
        return orderItems.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(storeId)
        }
    }
    
    private var allGroups: [TruckOrderGroup] {
        buildTruckOrderGroups()
    }
    
    private var activeGroups: [TruckOrderGroup] {
        allGroups
            .filter { $0.bucket == .active }
            .sorted { lhs, rhs in lhs.orderDate > rhs.orderDate }
    }
    
    private var upcomingGroups: [TruckOrderGroup] {
        allGroups
            .filter { $0.bucket == .upcoming }
            .sorted { lhs, rhs in lhs.orderDate < rhs.orderDate }
    }
    
    private var pastGroups: [TruckOrderGroup] {
        allGroups
            .filter { $0.bucket == .past }
            .sorted { lhs, rhs in lhs.orderDate > rhs.orderDate }
    }
    
    var body: some View {
        List {
            Section {
                ContextTipCard(context: .orders, accentColor: settings.accentColor)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)
            }

            if allGroups.isEmpty {
                ContentUnavailableView(
                    "No Orders Yet",
                    systemImage: "cart",
                    description: Text("Generate a smart order based on your inventory")
                )
            } else {
                sectionBlock(title: "Active Orders", groups: activeGroups, emptyText: "No active truck orders.")
                sectionBlock(title: "Upcoming Orders", groups: upcomingGroups, emptyText: "No upcoming truck orders.")
                sectionBlock(title: "Past Orders", groups: pastGroups, emptyText: "No past truck orders.")
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Orders")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: { showingGenerateOrder = true }) {
                    Label("Generate Order", systemImage: "sparkles")
                }
                .disabled(!canGenerateOrders)
            }
        }
        .sheet(isPresented: $showingGenerateOrder) {
            GenerateOrderView()
        }
    }
    
    @ViewBuilder
    private func sectionBlock(title: String, groups: [TruckOrderGroup], emptyText: String) -> some View {
        Section(title) {
            if groups.isEmpty {
                Text(emptyText)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(groups) { group in
                    NavigationLink(destination: TruckOrderDetailView(group: group)) {
                        TruckOrderGroupRow(group: group)
                    }
                }
            }
        }
    }
    
    private func buildTruckOrderGroups() -> [TruckOrderGroup] {
        let calendar = Calendar.current
        let now = Date()
        let todayStart = calendar.startOfDay(for: now)
        let tomorrowStart = calendar.date(byAdding: .day, value: 1, to: todayStart) ?? now
        let yesterdayStart = calendar.date(byAdding: .day, value: -1, to: todayStart) ?? now
        
        let grouped = Dictionary(grouping: scopedOrderItems) { order in
            let vendorKey = order.vendorIDSnapshot?.uuidString ?? "unknown-vendor"
            let day = calendar.startOfDay(for: order.orderDate)
            return "\(vendorKey)|\(Int(day.timeIntervalSince1970))"
        }
        
        return grouped.values.compactMap { orders in
            guard let first = orders.first else { return nil }
            let normalizedOrderDate = calendar.startOfDay(for: first.orderDate)
            
            let vendorNameFromSnapshot = first.vendorNameSnapshot?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let fallbackVendorName = first.item?.vendor?.name ?? "Unknown Truck"
            let vendorName = vendorNameFromSnapshot.isEmpty ? fallbackVendorName : vendorNameFromSnapshot
            
            let expectedDeliveryDate = orders
                .compactMap { $0.expectedDeliveryDate }
                .min()
            
            let lines = orders
                .map { order in
                    TruckOrderLine(
                        id: order.id,
                        itemName: order.itemNameSnapshot ?? "Unknown Item",
                        recommendedQuantity: order.recommendedQuantity,
                        orderedQuantity: order.orderedQuantity,
                        unit: order.itemUnitSnapshot ?? "",
                        quantityPerBox: max(order.itemQuantityPerBoxSnapshot ?? 1, 1),
                        isChecked: order.isChecked
                    )
                }
                .sorted { lhs, rhs in lhs.itemName < rhs.itemName }
            
            let bucket: OrderBucket
            let scheduleDate = expectedDeliveryDate ?? normalizedOrderDate
            let normalizedScheduleDate = calendar.startOfDay(for: scheduleDate)
            let isFullyReceived = orders.allSatisfy(\.wasReceived)
            if isFullyReceived {
                bucket = .past
            } else if normalizedScheduleDate >= tomorrowStart {
                bucket = .upcoming
            } else if normalizedOrderDate >= yesterdayStart && normalizedOrderDate < tomorrowStart {
                bucket = .active
            } else {
                bucket = .past
            }
            
            return TruckOrderGroup(
                id: "\(first.vendorIDSnapshot?.uuidString ?? "unknown-vendor")|\(Int(normalizedOrderDate.timeIntervalSince1970))",
                vendorID: first.vendorIDSnapshot,
                vendorName: vendorName,
                orderDate: normalizedOrderDate,
                expectedDeliveryDate: expectedDeliveryDate,
                orderIDs: orders.map(\.id),
                lines: lines,
                bucket: bucket
            )
        }
    }
    
}

private enum OrderBucket {
    case active
    case upcoming
    case past
}

private struct TruckOrderLine: Identifiable {
    let id: UUID
    let itemName: String
    let recommendedQuantity: Int
    let orderedQuantity: Int?
    let unit: String
    let quantityPerBox: Int
    let isChecked: Bool
}

private struct TruckOrderGroup: Identifiable {
    let id: String
    let vendorID: UUID?
    let vendorName: String
    let orderDate: Date
    let expectedDeliveryDate: Date?
    let orderIDs: [UUID]
    let lines: [TruckOrderLine]
    let bucket: OrderBucket
    
    var itemCount: Int { lines.count }
    
    var totalOrdered: Int {
        lines.reduce(0) { partial, line in
            partial + (line.orderedQuantity ?? line.recommendedQuantity)
        }
    }
}

private struct TruckOrderGroupRow: View {
    let group: TruckOrderGroup
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(group.vendorName)
                    .font(.headline)
                Spacer()
                Text("\(group.itemCount) item\(group.itemCount == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            
            HStack(spacing: 12) {
                Label(group.orderDate.formatted(date: .abbreviated, time: .omitted), systemImage: "calendar")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                
                if let expected = group.expectedDeliveryDate {
                    Label(expected.formatted(date: .abbreviated, time: .omitted), systemImage: "truck.box")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            
            Text("Total ordered: \(group.totalOrdered)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

private struct TruckOrderDetailView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    @Query private var allOrders: [OrderItem]
    
    let group: TruckOrderGroup
    @State private var showingCompleteConfirmation = false
    
    private var isActiveOrder: Bool {
        group.bucket == .active
    }

    private var canCompleteOrder: Bool {
        session.canPerform(.completeOrder)
    }

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? "local-default"
    }

    private var scopedOrders: [OrderItem] {
        allOrders.filter { $0.organizationId == activeOrganizationId }
    }
    
    var body: some View {
        List {
            Section("Order Summary") {
                HStack {
                    Text("Truck")
                    Spacer()
                    Text(group.vendorName)
                        .foregroundStyle(.secondary)
                }
                HStack {
                    Text("Ordered")
                    Spacer()
                    Text(group.orderDate.formatted(date: .abbreviated, time: .omitted))
                        .foregroundStyle(.secondary)
                }
                HStack {
                    Text("Expected Delivery")
                    Spacer()
                    if let expected = group.expectedDeliveryDate {
                        Text(expected.formatted(date: .abbreviated, time: .omitted))
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Not set")
                            .foregroundStyle(.secondary)
                    }
                }
                HStack {
                    Text("Items")
                    Spacer()
                    Text("\(group.itemCount)")
                        .foregroundStyle(.secondary)
                }
            }
            
            Section("Ordered Items") {
                ForEach(group.lines) { line in
                    HStack(spacing: 12) {
                        Image(systemName: line.isChecked ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(line.isChecked ? .green : .gray)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(line.itemName)
                                .font(.headline)
                            Text("Recommended: \(line.recommendedQuantity)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("\(line.orderedQuantity ?? line.recommendedQuantity) \(line.quantityPerBox > 1 ? "boxes" : line.unit)")
                            .font(.title3.weight(.semibold))
                            .monospacedDigit()
                    }
                }
            }
        }
        .navigationTitle(group.vendorName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if isActiveOrder {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Complete") {
                        showingCompleteConfirmation = true
                    }
                    .foregroundStyle(.green)
                    .disabled(!canCompleteOrder)
                }
            }
        }
        .confirmationDialog(
            "Complete this order?",
            isPresented: $showingCompleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("Complete") {
                completeOrder()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will mark this truck order as complete and save missing quantities.")
        }
    }
    
    private func completeOrder() {
        guard canCompleteOrder else { return }

        for orderID in group.orderIDs {
            guard let order = scopedOrders.first(where: { $0.id == orderID }) else { continue }
            if order.orderedQuantity == nil {
                order.orderedQuantity = order.recommendedQuantity
            }
            order.isChecked = true
        }
        try? modelContext.save()

        guard let organizationId = session.activeOrganizationId else { return }
        let payload = ActionPayload.completeOrder(
            CompleteOrderPayload(orderIds: group.orderIDs.map(\.uuidString))
        )
        let refs = AuditObjectRefs(
            organizationId: organizationId,
            itemId: nil,
            orderId: group.id,
            batchIds: []
        )
        Task {
            await ActionSyncService.shared.logAndApply(
                action: payload,
                refs: refs,
                baseRevision: nil,
                session: session,
                modelContext: modelContext
            )
        }
    }
}

// MARK: - Generate Order Flow (snapshot-based, safe re-fetch on save)

struct GenerateOrderView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    @Query private var items: [InventoryItem]
    @Query private var wasteEntries: [WasteEntry]
    @Query private var existingOrders: [OrderItem]
    @Query private var vendors: [Vendor]
    @Query private var productionProducts: [ProductionProduct]
    @Query private var productionIngredients: [ProductionIngredient]
    @Query(sort: \ProductionSpotCheckRecord.checkedAt, order: .reverse) private var productionSpotChecks: [ProductionSpotCheckRecord]
    @Query(sort: \ProductionRun.madeAt, order: .reverse) private var productionRuns: [ProductionRun]
    @StateObject private var settings = AppSettings.shared
    
    @State private var generatedOrders: [OrderDraft] = []
    @State private var backendRunID: String?
    @State private var backendEngineVersion: String?
    @State private var backendFallbackReason: String?
    @State private var backendDegraded = false
    @State private var usingLocalRecommendationFallback = false
    @State private var phase: Phase = .splash
    @State private var analysisProgress: Double = 0.0
    @State private var timer: Timer?
    @State private var selectedVendorID: UUID?
    @State private var activeFingerprint: String?
    @State private var activeOrganizationCacheKey: String?
    
    // Snapshots captured at analysis start
    @State private var itemSnapshots: [ItemSnapshot] = []
    @State private var wasteSnapshots: [WasteSnapshot] = []
    @State private var incomingOrderSnapshots: [IncomingOrderSnapshot] = []
    
    enum Phase {
        case splash
        case analyzing
        case results
    }

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? "local-default"
    }

    private var activeStoreId: String {
        settings.normalizedActiveStoreID
    }

    private var scopedItems: [InventoryItem] {
        items.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId)
        }
    }

    private var scopedWasteEntries: [WasteEntry] {
        wasteEntries.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId)
        }
    }

    private var scopedExistingOrders: [OrderItem] {
        existingOrders.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId)
        }
    }

    private var scopedVendors: [Vendor] {
        vendors.filter { $0.organizationId == activeOrganizationId }
    }

    private var scopedProductionProducts: [ProductionProduct] {
        productionProducts.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId) &&
            $0.isActive
        }
    }

    private var scopedProductionIngredients: [ProductionIngredient] {
        productionIngredients.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId)
        }
    }

    private var scopedProductionSpotChecks: [ProductionSpotCheckRecord] {
        productionSpotChecks.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId)
        }
    }

    private var scopedProductionRuns: [ProductionRun] {
        productionRuns.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId)
        }
    }

    private var canGenerateOrders: Bool {
        session.canPerform(.generateOrder)
    }
    
    private var activeVendors: [Vendor] {
        scopedVendors.filter(\.isActive).sorted { $0.name < $1.name }
    }
    
    private var selectedTruckName: String {
        activeVendors.first(where: { $0.id == selectedVendorID })?.name ?? "Selected Truck"
    }
    
    private var selectedTruckItems: [InventoryItem] {
        guard let selectedVendorID else { return [] }
        return scopedItems.filter { !$0.isArchived && $0.vendor?.id == selectedVendorID }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                switch phase {
                case .splash:
                    splashView
                case .analyzing:
                    analyzingView
                case .results:
                    resultsView
                }
            }
            .navigationTitle("Generate Order")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
                if phase == .results && !generatedOrders.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Complete Order") { saveOrders() }
                    }
                }
            }
        }
        .onDisappear {
            timer?.invalidate()
            timer = nil
        }
        .onAppear {
            if selectedVendorID == nil {
                selectedVendorID = activeVendors.first?.id
            }
        }
    }
    
    private var splashView: some View {
        VStack(spacing: 24) {
            Spacer()
            ZStack {
                Circle()
                    .fill(Color.blue.opacity(0.12))
                    .frame(width: 160, height: 160)
                Image(systemName: "sparkles")
                    .font(.system(size: 72, weight: .semibold))
                    .foregroundStyle(.blue.gradient)
            }
            Text("Generate Smart Order")
                .font(.title2)
                .fontWeight(.bold)
            Text("Let AI analyze your inventory, waste, and expirations to suggest the perfect order. You can tweak recommendations before saving.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            if activeVendors.isEmpty {
                Text("Add at least one active vendor/truck to generate an order.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Truck")
                        .font(.headline)
                    Picker("Truck", selection: $selectedVendorID) {
                        ForEach(activeVendors) { vendor in
                            Text(vendor.name).tag(Optional(vendor.id))
                        }
                    }
                    .pickerStyle(.menu)
                    Text("\(selectedTruckItems.count) items linked to this truck")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    
                    if selectedTruckItems.isEmpty {
                        Text("Assign items to this truck before generating an order.")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }
                .padding()
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)
            }
            Spacer()
            Button(action: startAnalyzing) {
                Text("Generate")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.blue.gradient)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(!canGenerateOrders || activeVendors.isEmpty || selectedVendorID == nil || selectedTruckItems.isEmpty)
            .padding(.horizontal)
            .padding(.bottom)
        }
    }
    
    private var analyzingView: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "sparkles.rectangle.stack.fill")
                .font(.system(size: 64))
                .foregroundStyle(.blue.gradient)
            Text("Analyzing \(selectedTruckName)…")
                .font(.headline)
                .foregroundStyle(.secondary)
            ProgressView(value: analysisProgress)
                .progressViewStyle(.linear)
                .padding(.horizontal)
            Spacer()
        }
        .onAppear {
            guard phase == .analyzing else { return }
            analysisProgress = 0
            timer?.invalidate()
            timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { t in
                analysisProgress = min(1.0, analysisProgress + 0.15)
                if analysisProgress >= 1.0 {
                    t.invalidate()
                    generate()
                }
            }
        }
    }
    
    private var resultsView: some View {
        Group {
            if generatedOrders.isEmpty {
                VStack(spacing: 16) {
                    Image(systemName: "checkmark.seal")
                        .font(.system(size: 56))
                        .foregroundStyle(.secondary)
                    Text("Nothing to order right now")
                        .font(.headline)
                    Text("Everything looks sufficiently stocked based on your thresholds.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                .padding()
            } else {
                List {
                    Section {
                        Text("Every item for \(selectedTruckName) is listed below. Recommendations are server-generated and can be edited before completion.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        if let backendEngineVersion {
                            Text("Engine: \(backendEngineVersion)\(usingLocalRecommendationFallback ? \" (degraded fallback)\" : \"\")")
                                .font(.caption2)
                                .foregroundStyle((usingLocalRecommendationFallback || backendDegraded) ? .orange : .secondary)
                        }
                        if let backendFallbackReason, !backendFallbackReason.isEmpty {
                            Text(backendFallbackReason)
                                .font(.caption2)
                                .foregroundStyle(.orange)
                        }
                    }
                    ForEach($generatedOrders) { $draft in
                        DraftOrderRow(draft: $draft)
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
    }
    
    // MARK: - Actions
    
    private func startAnalyzing() {
        guard canGenerateOrders else { return }
        guard let selectedVendorID else { return }
        backendRunID = nil
        backendEngineVersion = nil
        backendFallbackReason = nil
        backendDegraded = false
        usingLocalRecommendationFallback = false

        itemSnapshots = selectedTruckItems.map { ItemSnapshot(from: $0) }
        wasteSnapshots = scopedWasteEntries.map { WasteSnapshot(from: $0) }
        incomingOrderSnapshots = scopedExistingOrders.map { IncomingOrderSnapshot(from: $0) }

        let fingerprint = OrderRecommendationCacheStore.fingerprint(
            items: itemSnapshots,
            wastes: wasteSnapshots,
            incomingOrders: incomingOrderSnapshots
        )
        activeFingerprint = fingerprint
        activeOrganizationCacheKey = activeOrganizationId

        phase = .analyzing
    }
    
    private func generate() {
        let snapshots = itemSnapshots
        let wastes = wasteSnapshots
        let incomingOrders = incomingOrderSnapshots
        let vendorID = selectedVendorID
        let fingerprint = activeFingerprint
        let organizationCacheKey = activeOrganizationCacheKey

        Task {
            guard
                let selectedVendorID,
                let organizationId = session.activeOrganizationId,
                !activeStoreId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            else {
                usingLocalRecommendationFallback = false
                backendDegraded = true
                backendEngineVersion = "rules_v1"
                backendFallbackReason = "No active store selected."
                generatedOrders = []
                phase = .results
                return
            }

            let vendorBackendID = activeVendors.first(where: { $0.id == selectedVendorID })?.backendId
            do {
                let response = try await RecommendationService.shared.fetchStoreRecommendations(
                    orgId: organizationId,
                    storeId: activeStoreId,
                    vendorId: vendorBackendID,
                    domains: [.orders],
                    forceRefresh: true
                )
                let mapped = mapBackendRecommendations(response.orderRecommendations)
                backendRunID = response.meta.runId
                backendEngineVersion = response.meta.engineVersion
                backendFallbackReason = response.meta.fallbackReason
                backendDegraded = response.meta.degraded || response.meta.fallbackUsed
                usingLocalRecommendationFallback = false
                generatedOrders = mapped
                if
                    let vendorID,
                    let fingerprint,
                    let organizationCacheKey
                {
                    OrderRecommendationCacheStore.shared.save(
                        mapped,
                        organizationId: organizationCacheKey,
                        vendorID: vendorID,
                        fingerprint: fingerprint
                    )
                }
                phase = .results
                return
            } catch {
                backendFallbackReason = error.localizedDescription
            }

            usingLocalRecommendationFallback = true
            backendDegraded = true
            if
                let vendorID,
                let fingerprint,
                let organizationCacheKey,
                let cached = OrderRecommendationCacheStore.shared.load(
                    organizationId: organizationCacheKey,
                    vendorID: vendorID,
                    fingerprint: fingerprint
                )
            {
                backendEngineVersion = "cached_backend_preview"
                backendFallbackReason = backendFallbackReason ?? "Backend unavailable. Showing the latest server recommendation cache."
                generatedOrders = cached
                phase = .results
                return
            }

            let fallbackProductionDemand = RecommendationFallbackService.productionDemandByItem(
                products: scopedProductionProducts,
                spotChecks: scopedProductionSpotChecks,
                runs: scopedProductionRuns,
                ingredients: scopedProductionIngredients,
                inventoryItems: scopedItems
            )
            let calculated = RecommendationFallbackService.calculateOrderRecommendations(
                items: snapshots,
                wastes: wastes,
                incomingOrders: incomingOrders,
                productionDemandByItem: fallbackProductionDemand
            )

            if
                let vendorID,
                let fingerprint,
                let organizationCacheKey
            {
                OrderRecommendationCacheStore.shared.save(
                    calculated,
                    organizationId: organizationCacheKey,
                    vendorID: vendorID,
                    fingerprint: fingerprint
                )
            }

            backendEngineVersion = backendEngineVersion ?? "local_fallback_rules_v1"
            backendFallbackReason = backendFallbackReason ?? "Backend unavailable. Using emergency local fallback."
            generatedOrders = calculated
            phase = .results
        }
    }
    
    private func saveOrders() {
        guard canGenerateOrders else { return }
        if let runID = backendRunID, !usingLocalRecommendationFallback {
            Task {
                do {
                    guard let organizationId = session.activeOrganizationId else {
                        await MainActor.run { saveOrdersLocally() }
                        return
                    }
                    let selectedVendorBackendID = selectedVendorID.flatMap { vendorID in
                        activeVendors.first(where: { $0.id == vendorID })?.backendId
                    }
                    let selectedLines = generatedOrders.compactMap { draft -> CommitSelectedOrderLineDTO? in
                        let finalQuantity = draft.normalizedFinalQuantity
                        guard finalQuantity > 0 else { return nil }
                        let itemID = draft.backendItemID ?? draft.itemID.uuidString
                        return CommitSelectedOrderLineDTO(
                            itemId: itemID,
                            finalQuantity: finalQuantity,
                            unit: draft.unit,
                            rationaleSummary: "Applied from backend recommendation preview."
                        )
                    }
                    let committed = try await RecommendationService.shared.commitOrderRecommendations(
                        orgId: organizationId,
                        storeId: activeStoreId,
                        vendorId: selectedVendorBackendID,
                        runId: runID,
                        selectedLines: selectedLines
                    )
                    await recordGeneratedOrderSync(
                        organizationId: organizationId,
                        vendorID: selectedVendorID,
                        lineCount: committed.lineCount,
                        orderIDs: [committed.orderId]
                    )
                    await MainActor.run {
                        dismiss()
                    }
                } catch {
                    await MainActor.run {
                        saveOrdersLocally()
                    }
                }
            }
            return
        }

        saveOrdersLocally()
    }

    private func saveOrdersLocally() {
        var insertedOrderIDs: [String] = []
        var earliestExpectedDate: Date?

        for draft in generatedOrders {
            let finalBoxes = max(0, Int(draft.normalizedFinalQuantity.rounded()))
            guard finalBoxes > 0 else { continue }

            // Fresh fetch by id from the model context
            if let item = fetchInventoryItem(by: draft.itemID) {
                let order = OrderItem(
                    item: item,
                    recommendedQuantity: max(0, Int(draft.normalizedRecommendedQuantity.rounded())),
                    orderDate: Date(),
                    expectedDeliveryDate: Calendar.current.date(
                        byAdding: .day,
                        value: item.vendor?.daysFromOrderToDelivery ?? 3,
                        to: Date()
                    ),
                    organizationId: session.activeOrganizationId ?? item.organizationId
                )
                order.orderedQuantity = finalBoxes
                order.isChecked = true
                order.updatedByUid = session.firebaseUser?.id
                modelContext.insert(order)
                insertedOrderIDs.append(order.id.uuidString)
                if let expected = order.expectedDeliveryDate {
                    if let current = earliestExpectedDate {
                        earliestExpectedDate = min(current, expected)
                    } else {
                        earliestExpectedDate = expected
                    }
                }
            } else {
                continue
            }
        }
        try? modelContext.save()

        if let organizationId = session.activeOrganizationId, !insertedOrderIDs.isEmpty {
            Task {
                await recordGeneratedOrderSync(
                    organizationId: organizationId,
                    vendorID: selectedVendorID,
                    lineCount: insertedOrderIDs.count,
                    orderIDs: insertedOrderIDs,
                    expectedDeliveryDate: earliestExpectedDate
                )
            }
        }

        dismiss()
    }

    private func recordGeneratedOrderSync(
        organizationId: String,
        vendorID: UUID?,
        lineCount: Int,
        orderIDs: [String],
        expectedDeliveryDate: Date? = nil
    ) async {
        let payload = ActionPayload.generateOrder(
            GenerateOrderPayload(
                vendorId: vendorID?.uuidString,
                lineCount: lineCount,
                orderIds: orderIDs,
                expectedDeliveryDate: expectedDeliveryDate
            )
        )
        let refs = AuditObjectRefs(
            organizationId: organizationId,
            itemId: nil,
            orderId: orderIDs.first,
            batchIds: []
        )
        await ActionSyncService.shared.logAndApply(
            action: payload,
            refs: refs,
            baseRevision: nil,
            session: session,
            modelContext: modelContext
        )
    }

    private func fetchInventoryItem(by id: UUID) -> InventoryItem? {
        // Try to find in current @Query first
        if let found = scopedItems.first(where: { $0.id == id }) {
            return found
        }
        // As a fallback, perform a lightweight fetch
        // Note: For iOS 17+/macOS 14+, you can use a FetchDescriptor with a predicate.
        var descriptor = FetchDescriptor<InventoryItem>(
            predicate: #Predicate { $0.id == id }
        )
        descriptor.fetchLimit = 1
        return try? modelContext.fetch(descriptor).first(where: { $0.organizationId == activeOrganizationId })
    }

    private func mapBackendRecommendations(_ rows: [OrderRecommendationDTO]) -> [OrderDraft] {
        let itemByBackendID = Dictionary(
            uniqueKeysWithValues: scopedItems.map { item in
                ((item.backendId?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? item.backendId! : item.id.uuidString), item)
            }
        )

        return rows.map { row in
            let resolved = itemByBackendID[row.itemId]
            let parsedUUID = UUID(uuidString: row.itemId)
            let localID = resolved?.id ?? parsedUUID ?? UUID()
            let quantityPerBox = max(Int(row.qtyPerCase.rounded()), 1)
            let recommendedQuantity = normalizedDraftQuantity(row.recommendedQuantity, unit: row.unit)
            return OrderDraft(
                itemID: localID,
                backendItemID: row.itemId,
                name: row.itemName ?? row.itemId,
                unit: row.unit,
                quantityPerBox: quantityPerBox,
                caseInterpretation: row.caseInterpretation,
                recommendedQuantity: recommendedQuantity,
                isChecked: false,
                orderedQuantity: recommendedQuantity
            )
        }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
    
}

// Value-type draft used in generator UI
struct OrderDraft: Identifiable {
    var id: UUID { itemID }
    let itemID: UUID
    let backendItemID: String?
    let name: String
    let unit: String
    let quantityPerBox: Int
    let caseInterpretation: String
    let recommendedQuantity: Double
    var isChecked: Bool
    var orderedQuantity: Double?

    var usesDecimalEditor: Bool {
        unit.lowercased() == "lbs"
    }

    var normalizedRecommendedQuantity: Double {
        normalizedDraftQuantity(recommendedQuantity, unit: unit)
    }

    var normalizedFinalQuantity: Double {
        normalizedDraftQuantity(orderedQuantity ?? recommendedQuantity, unit: unit)
    }

    func displayQuantity(_ quantity: Double) -> String {
        formatDraftQuantity(quantity, unit: unit)
    }
}

// Stateless row for drafts (generator results)
private struct DraftOrderRow: View {
    @Binding var draft: OrderDraft
    @State private var orderedQuantityText: String = ""
    
    var body: some View {
        HStack {
            Button(action: { draft.isChecked.toggle() }) {
                Image(systemName: draft.isChecked ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(draft.isChecked ? .green : .gray)
            }
            .buttonStyle(.plain)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(draft.name)
                    .font(.headline)
                    .strikethrough(draft.isChecked)
                
                HStack(spacing: 12) {
                    Label("\(draft.displayQuantity(draft.normalizedRecommendedQuantity)) \(draft.quantityPerBox > 1 ? "boxes" : draft.unit)",
                          systemImage: "sparkles")
                        .font(.subheadline)
                        .foregroundStyle(.blue)
                    
                    if let ordered = draft.orderedQuantity {
                        Label("Ordered: \(draft.displayQuantity(ordered))", systemImage: "checkmark")
                            .font(.subheadline)
                            .foregroundStyle(.green)
                    }
                }
            }
            
            Spacer()

            TextField("Qty", text: Binding(
                get: {
                    if orderedQuantityText.isEmpty {
                        return draft.displayQuantity(draft.normalizedFinalQuantity)
                    }
                    return orderedQuantityText
                },
                set: { newText in
                    orderedQuantityText = newText
                    if draft.usesDecimalEditor {
                        let normalized = newText.replacingOccurrences(of: ",", with: ".")
                        if let parsed = Double(normalized) {
                            draft.orderedQuantity = max(0, parsed)
                        }
                    } else if let parsed = Int(newText) {
                        draft.orderedQuantity = Double(max(0, parsed))
                    }
                }
            ))
            .keyboardType(draft.usesDecimalEditor ? .decimalPad : .numberPad)
            .multilineTextAlignment(.trailing)
            .frame(width: 60)
            .textFieldStyle(.roundedBorder)
        }
        .padding(.vertical, 4)
        .onAppear {
            orderedQuantityText = draft.displayQuantity(draft.normalizedFinalQuantity)
        }
    }
}

private func normalizedDraftQuantity(_ quantity: Double, unit: String) -> Double {
    let safe = max(0, quantity)
    if unit.lowercased() == "lbs" {
        return (safe * 1000).rounded() / 1000
    }
    return Double(Int(safe.rounded()))
}

private func formatDraftQuantity(_ quantity: Double, unit: String) -> String {
    let normalized = normalizedDraftQuantity(quantity, unit: unit)
    if unit.lowercased() == "lbs" {
        return String(format: "%.3f", normalized)
    }
    return String(Int(normalized))
}

// MARK: - Snapshot types used during generation (internal)

struct ItemSnapshot: Identifiable {
    struct BatchSnapshot {
        let quantity: Double
        let expirationDate: Date
    }
    
    let id: UUID
    let name: String
    let unitRaw: String
    let quantityPerBox: Int
    let minimumQuantity: Double
    let vendorLeadTimeDays: Int
    let isArchived: Bool
    let batches: [BatchSnapshot]
    
    var totalQuantity: Double {
        batches.reduce(0.0) { $0 + $1.quantity }
    }
    
    init(from item: InventoryItem) {
        self.id = item.id
        self.name = item.name
        self.unitRaw = item.unit.rawValue
        self.quantityPerBox = item.quantityPerBox
        self.minimumQuantity = item.minimumQuantity
        self.vendorLeadTimeDays = item.vendor?.daysFromOrderToDelivery ?? 3
        self.isArchived = item.isArchived
        // Copy batches as value snapshots
        self.batches = item.batches.map { BatchSnapshot(quantity: $0.quantity, expirationDate: $0.expirationDate) }
    }
}

struct WasteSnapshot {
    let itemID: UUID?
    let quantity: Double
    let affectsOrders: Bool
    
    init(from entry: WasteEntry) {
        self.itemID = entry.itemIDSnapshot
        self.quantity = entry.quantity
        self.affectsOrders = entry.wasteTypeAffectsOrders
    }
}

struct IncomingOrderSnapshot {
    let itemID: UUID?
    let expectedDeliveryDate: Date?
    let wasReceived: Bool
    let unitsOrdered: Double
    
    init(from order: OrderItem) {
        self.itemID = order.itemIDSnapshot
        self.expectedDeliveryDate = order.expectedDeliveryDate
        self.wasReceived = order.wasReceived
        let boxes = order.orderedQuantity ?? order.recommendedQuantity
        let quantityPerBox = max(order.itemQuantityPerBoxSnapshot ?? 1, 1)
        self.unitsOrdered = Double(max(boxes, 0) * quantityPerBox)
    }
}

private struct OrderRecommendationCacheStore {
    static let shared = OrderRecommendationCacheStore()

    private let keyPrefix = "order_recommendations_cache_v1"

    private struct CachedPayload: Codable {
        struct CachedDraft: Codable {
            let itemID: UUID
            let backendItemID: String?
            let name: String
            let unit: String
            let quantityPerBox: Int
            let caseInterpretation: String?
            let recommendedQuantity: Double?
            let orderedQuantity: Double?
        }

        let fingerprint: String
        let generatedAt: Date
        let drafts: [CachedDraft]
    }

    func load(organizationId: String, vendorID: UUID, fingerprint: String) -> [OrderDraft]? {
        let key = storageKey(organizationId: organizationId, vendorID: vendorID)
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        guard let decoded = try? JSONDecoder().decode(CachedPayload.self, from: data) else { return nil }
        guard decoded.fingerprint == fingerprint else { return nil }
        return decoded.drafts.map { draft in
            OrderDraft(
                itemID: draft.itemID,
                backendItemID: draft.backendItemID,
                name: draft.name,
                unit: draft.unit,
                quantityPerBox: max(draft.quantityPerBox, 1),
                caseInterpretation: draft.caseInterpretation ?? "case_rounded",
                recommendedQuantity: max(0, draft.recommendedQuantity ?? 0),
                isChecked: false,
                orderedQuantity: max(0, draft.orderedQuantity ?? draft.recommendedQuantity ?? 0)
            )
        }
    }

    func save(_ drafts: [OrderDraft], organizationId: String, vendorID: UUID, fingerprint: String) {
        let payload = CachedPayload(
            fingerprint: fingerprint,
            generatedAt: Date(),
            drafts: drafts.map { draft in
                CachedPayload.CachedDraft(
                    itemID: draft.itemID,
                    backendItemID: draft.backendItemID,
                    name: draft.name,
                    unit: draft.unit,
                    quantityPerBox: max(draft.quantityPerBox, 1),
                    caseInterpretation: draft.caseInterpretation,
                    recommendedQuantity: max(0, draft.normalizedRecommendedQuantity),
                    orderedQuantity: draft.orderedQuantity
                )
            }
        )
        guard let encoded = try? JSONEncoder().encode(payload) else { return }
        UserDefaults.standard.set(encoded, forKey: storageKey(organizationId: organizationId, vendorID: vendorID))
    }

    static func fingerprint(
        items: [ItemSnapshot],
        wastes: [WasteSnapshot],
        incomingOrders: [IncomingOrderSnapshot]
    ) -> String {
        let itemPart = items
            .map { item in
                let batchPart = item.batches
                    .map {
                        "\(quantized($0.quantity))@\(Int($0.expirationDate.timeIntervalSince1970))"
                    }
                    .sorted()
                    .joined(separator: ",")
                return "\(item.id.uuidString)|\(item.isArchived ? 1 : 0)|\(quantized(item.minimumQuantity))|\(item.quantityPerBox)|\(item.vendorLeadTimeDays)|\(batchPart)"
            }
            .sorted()
            .joined(separator: ";")

        let wastePart = wastes
            .map {
                "\($0.itemID?.uuidString ?? "nil")|\($0.affectsOrders ? 1 : 0)|\(quantized($0.quantity))"
            }
            .sorted()
            .joined(separator: ";")

        let incomingPart = incomingOrders
            .map {
                "\($0.itemID?.uuidString ?? "nil")|\($0.wasReceived ? 1 : 0)|\(Int($0.expectedDeliveryDate?.timeIntervalSince1970 ?? 0))|\(quantized($0.unitsOrdered))"
            }
            .sorted()
            .joined(separator: ";")

        return [itemPart, wastePart, incomingPart].joined(separator: "#")
    }

    private func storageKey(organizationId: String, vendorID: UUID) -> String {
        "\(keyPrefix)_\(organizationId)_\(vendorID.uuidString)"
    }

    private static func quantized(_ value: Double) -> String {
        String(format: "%.3f", value)
    }
}
