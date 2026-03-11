// ReceivedView
import SwiftUI
import SwiftData

struct ReceivedView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    @Query(filter: #Predicate<InventoryItem> { !$0.isArchived }) private var items: [InventoryItem]
    @Query(sort: \OrderItem.orderDate, order: .forward) private var orderItems: [OrderItem]
    @Query private var todos: [ToDoItem]
    @StateObject private var settings = AppSettings.shared
    @StateObject private var scannerService = BarcodeScannerService()
    private let catalogService = CentralCatalogService.shared
    
    @State private var showingScanner = false
    @State private var showingManualEntry = false
    @State private var scannedItem: InventoryItem?
    @State private var showingAddAnotherPrompt = false
    @State private var showingTruckPicker = false
    @State private var hasPromptedTruckPicker = false
    @State private var selectedTruckOrderID: String?
    @State private var showingOutstandingPrompt = false
    @State private var outstandingSummary = ""
    @State private var catalogImportRecord: CatalogProductRecord?
    @State private var showingCatalogImportPrompt = false
    @State private var catalogLookupMessage = ""
    @State private var showingCatalogLookupMessage = false

    private var canReceiveInventory: Bool {
        session.canPerform(.receiveInventory)
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

    private var scopedOrderItems: [OrderItem] {
        let storeId = settings.normalizedActiveStoreID
        return orderItems.filter {
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
    
    private var pendingTruckOrders: [PendingTruckOrder] {
        buildPendingTruckOrders()
    }
    
    private var selectedTruckOrder: PendingTruckOrder? {
        guard let selectedTruckOrderID else { return nil }
        return pendingTruckOrders.first(where: { $0.id == selectedTruckOrderID })
    }
    
    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "arrow.down.circle.fill")
                .font(.system(size: 100))
                .foregroundStyle(.green.gradient)
            Text("Received")
                .font(.largeTitle)
                .fontWeight(.bold)
            Text("Log incoming deliveries")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            
            ContextTipCard(context: .received, accentColor: .green)
                .padding(.horizontal)
            
            if let selectedTruckOrder {
                VStack(spacing: 4) {
                    Text("Receiving: \(selectedTruckOrder.vendorName)")
                        .font(.headline)
                    Text("Order \(selectedTruckOrder.orderDate.formatted(date: .abbreviated, time: .omitted)) • \(selectedTruckOrder.pendingItemCount) pending")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal)
            } else {
                Text("No truck selected (you can continue without selecting).")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
            }
            Spacer()
            
            VStack(spacing: 16) {
                Button(action: { showingScanner = true }) {
                    HStack {
                        Image(systemName: "barcode.viewfinder")
                        Text("Scan Barcode")
                    }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.green.gradient)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(!canReceiveInventory)
                
                Button(action: { showingManualEntry = true }) {
                    HStack {
                        Image(systemName: "hand.tap")
                        Text("Manual Entry")
                    }
                    .font(.headline)
                    .foregroundStyle(.green)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.green.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(!canReceiveInventory)
            }
            .padding(.horizontal)
            .padding(.bottom, 100)
        }
        .navigationTitle("Received")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Truck") {
                    showingTruckPicker = true
                }
                .disabled(!canReceiveInventory)
            }
        }
        .sheet(isPresented: $showingScanner) {
            BarcodeScannerSheet(scannerService: scannerService) { code in
                handleScannedCode(code)
            }
        }
        .sheet(isPresented: $showingManualEntry) {
            ManualItemSelector(items: scopedItems) { item in
                scannedItem = item
            }
        }
        .sheet(item: $scannedItem) { item in
            ReceivedQuantityView(item: item) { receivedItem in
                markMatchedOrderReceived(for: receivedItem)
                createFrontOfHouseSpotCheckTaskIfNeeded(for: receivedItem)
                showingAddAnotherPrompt = true
            }
        }
        .sheet(isPresented: $showingTruckPicker) {
            ReceivedTruckPickerView(
                pendingTruckOrders: pendingTruckOrders,
                selectedTruckOrderID: $selectedTruckOrderID
            )
        }
        .alert("Add another received item?", isPresented: $showingAddAnotherPrompt) {
            Button("Scan Another Item") {
                showingScanner = true
            }
            Button("Manual Entry") {
                showingManualEntry = true
            }
            Button("Done") {
                reviewOutstandingItemsBeforeFinish()
            }
            Button("Cancel", role: .cancel) { }
        }
        .alert("Double-check Before Finishing", isPresented: $showingOutstandingPrompt) {
            Button("Scan Missing Items") {
                showingScanner = true
            }
            Button("Manual Entry") {
                showingManualEntry = true
            }
            Button("Finish Anyway") {
                completeSelectedTruckOrder(markOutstandingAsReceived: true)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(outstandingSummary)
        }
        .alert("Add From Central Catalog?", isPresented: $showingCatalogImportPrompt, presenting: catalogImportRecord) { record in
            Button("Cancel", role: .cancel) { }
            Button("Add to Inventory") {
                importCatalogRecordAndContinue(record)
            }
        } message: { record in
            Text("\"\(record.title)\" is in the central catalog. Add it to this store inventory and continue receiving?")
        }
        .alert("Barcode Not Found", isPresented: $showingCatalogLookupMessage) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(catalogLookupMessage)
        }
        .onAppear {
            guard !hasPromptedTruckPicker else { return }
            hasPromptedTruckPicker = true
            showingTruckPicker = true
        }
    }
    
    private func buildPendingTruckOrders() -> [PendingTruckOrder] {
        let calendar = Calendar.current
        
        let pending = scopedOrderItems.filter { !$0.wasReceived }
        let grouped = Dictionary(grouping: pending) { order in
            let vendorKey = order.vendorIDSnapshot?.uuidString ?? "unknown-vendor"
            let day = calendar.startOfDay(for: order.orderDate)
            return "\(vendorKey)|\(Int(day.timeIntervalSince1970))"
        }
        
        return grouped.values.compactMap { orders in
            guard let first = orders.first else { return nil }
            let vendorName = (first.vendorNameSnapshot?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false)
                ? (first.vendorNameSnapshot ?? "Unknown Truck")
                : (first.item?.vendor?.name ?? "Unknown Truck")
            let expectedDate = orders.compactMap(\.expectedDeliveryDate).min()
            return PendingTruckOrder(
                id: "\(first.vendorIDSnapshot?.uuidString ?? "unknown-vendor")|\(Int(calendar.startOfDay(for: first.orderDate).timeIntervalSince1970))",
                vendorID: first.vendorIDSnapshot,
                vendorName: vendorName,
                orderDate: calendar.startOfDay(for: first.orderDate),
                expectedDeliveryDate: expectedDate,
                orderIDs: orders.map(\.id),
                pendingItemCount: orders.count
            )
        }
        .sorted { lhs, rhs in lhs.orderDate < rhs.orderDate }
    }
    
    private func markMatchedOrderReceived(for item: InventoryItem) {
        guard canReceiveInventory else { return }
        guard let selectedTruckOrder else { return }
        
        let matchingOrder = selectedTruckOrder.orderIDs
            .compactMap { id in scopedOrderItems.first(where: { $0.id == id }) }
            .filter { !$0.wasReceived }
            .filter { order in
                if let snapshotID = order.itemIDSnapshot {
                    return snapshotID == item.id
                }
                return order.item?.id == item.id
            }
            .sorted { lhs, rhs in lhs.orderDate < rhs.orderDate }
            .first
        
        guard let matchingOrder else { return }
        if matchingOrder.orderedQuantity == nil {
            matchingOrder.orderedQuantity = matchingOrder.recommendedQuantity
        }
        matchingOrder.isChecked = true
        matchingOrder.wasReceived = true
        matchingOrder.receivedDate = Date()
        matchingOrder.revision += 1
        matchingOrder.updatedByUid = session.firebaseUser?.id
        try? modelContext.save()

        guard let organizationId = session.activeOrganizationId else { return }
        let qty = matchingOrder.orderedQuantity ?? matchingOrder.recommendedQuantity
        let payload = ActionPayload.receiveOrderLine(
            ReceiveOrderLinePayload(
                orderId: matchingOrder.id.uuidString,
                lineId: matchingOrder.id.uuidString,
                quantity: qty
            )
        )
        let refs = AuditObjectRefs(
            organizationId: organizationId,
            itemId: item.id.uuidString,
            orderId: matchingOrder.id.uuidString,
            batchIds: []
        )
        Task {
            await ActionSyncService.shared.logAndApply(
                action: payload,
                refs: refs,
                baseRevision: max(matchingOrder.revision - 1, 0),
                session: session,
                modelContext: modelContext
            )
        }
    }
    
    private func reviewOutstandingItemsBeforeFinish() {
        guard let selectedTruckOrder else { return }
        
        let outstanding = selectedTruckOrder.orderIDs
            .compactMap { id in scopedOrderItems.first(where: { $0.id == id }) }
            .filter { !$0.wasReceived }
            .sorted { lhs, rhs in lhs.orderDate < rhs.orderDate }
        
        guard !outstanding.isEmpty else {
            completeSelectedTruckOrder(markOutstandingAsReceived: false)
            return
        }
        
        let lines = outstanding.map { order in
            let name = order.itemNameSnapshot ?? "Unknown Item"
            let qty = order.orderedQuantity ?? order.recommendedQuantity
            let unitLabel = max(order.itemQuantityPerBoxSnapshot ?? 1, 1) > 1 ? "boxes" : (order.itemUnitSnapshot ?? "units")
            return "• \(name): \(qty) \(unitLabel)"
        }
        
        outstandingSummary = "You still have \(outstanding.count) item(s) not entered for \(selectedTruckOrder.vendorName):\n\n\(lines.joined(separator: "\n"))"
        showingOutstandingPrompt = true
    }

    private func completeSelectedTruckOrder(markOutstandingAsReceived: Bool) {
        guard canReceiveInventory else { return }
        guard let selectedTruckOrder else { return }

        let now = Date()
        guard let organizationId = session.activeOrganizationId else {
            try? modelContext.save()
            selectedTruckOrderID = nil
            return
        }

        for orderID in selectedTruckOrder.orderIDs {
            guard let order = scopedOrderItems.first(where: { $0.id == orderID }) else { continue }
            let wasAlreadyReceived = order.wasReceived
            guard markOutstandingAsReceived || wasAlreadyReceived else { continue }
            if order.orderedQuantity == nil {
                order.orderedQuantity = order.recommendedQuantity
            }
            order.isChecked = true
            order.wasReceived = true
            order.receivedDate = order.receivedDate ?? now
            order.revision += 1
            order.updatedByUid = session.firebaseUser?.id

            if !wasAlreadyReceived {
                let qty = order.orderedQuantity ?? order.recommendedQuantity
                let payload = ActionPayload.receiveOrderLine(
                    ReceiveOrderLinePayload(
                        orderId: order.id.uuidString,
                        lineId: order.id.uuidString,
                        quantity: qty
                    )
                )
                let refs = AuditObjectRefs(
                    organizationId: organizationId,
                    itemId: order.itemIDSnapshot?.uuidString,
                    orderId: order.id.uuidString,
                    batchIds: []
                )
                Task {
                    await ActionSyncService.shared.logAndApply(
                        action: payload,
                        refs: refs,
                        baseRevision: max(order.revision - 1, 0),
                        session: session,
                        modelContext: modelContext
                    )
                }
            }
        }

        try? modelContext.save()
        selectedTruckOrderID = nil
    }

    private func handleScannedCode(_ rawCode: String) {
        let normalized = catalogService.normalizeUPC(rawCode)

        if let item = scopedItems.first(where: { ($0.upc ?? "").caseInsensitiveCompare(normalized) == .orderedSame }) {
            scannedItem = item
            return
        }

        guard !normalized.isEmpty else { return }

        Task {
            do {
                if let record = try await catalogService.product(
                    forUPC: normalized,
                    organizationId: activeOrganizationId,
                    storeId: settings.normalizedActiveStoreID
                ) {
                    await MainActor.run {
                        catalogImportRecord = record
                        showingCatalogImportPrompt = true
                    }
                } else {
                    let draftItem = await MainActor.run {
                        CatalogInventoryImporter.createStoreDraftForUnknownUPC(
                            scannedUPC: normalized,
                            organizationId: activeOrganizationId,
                            storeId: settings.normalizedActiveStoreID,
                            modelContext: modelContext,
                            existingItems: scopedItems
                        )
                    }
                    let submissionId = await catalogService.submitItemDraftForVerification(
                        organizationId: activeOrganizationId,
                        storeId: settings.normalizedActiveStoreID,
                        submittedByUid: session.firebaseUser?.id ?? "",
                        scannedUPC: normalized,
                        draftItem: draftItem,
                        note: "Created from Receiving unknown scan."
                    )
                    await MainActor.run {
                        catalogLookupMessage = submissionId == nil
                            ? "Created a store draft item. Review submission could not be sent right now."
                            : "Created a store draft and sent it for organization review."
                        showingCatalogLookupMessage = true
                        scannedItem = draftItem
                    }
                }
            } catch {
                await MainActor.run {
                    catalogLookupMessage = "Could not check the central catalog right now."
                    showingCatalogLookupMessage = true
                }
            }
        }
    }

    private func importCatalogRecordAndContinue(_ record: CatalogProductRecord) {
        let imported = CatalogInventoryImporter.importOrGetLocalItem(
            from: record,
            organizationId: activeOrganizationId,
            storeId: settings.normalizedActiveStoreID,
            modelContext: modelContext,
            existingItems: scopedItems
        )
        scannedItem = imported
    }

    private func createFrontOfHouseSpotCheckTaskIfNeeded(for item: InventoryItem) {
        guard let organizationId = session.activeOrganizationId else { return }
        let dueDate = Date()
        let key = "foh-spotcheck-\(item.id.uuidString)-\(dayToken(for: dueDate))"
        var descriptor = FetchDescriptor<ToDoItem>(
            predicate: #Predicate {
                $0.organizationId == organizationId &&
                $0.autoTaskKey == key &&
                !$0.isCompleted
            }
        )
        descriptor.fetchLimit = 1
        let fetched = (try? modelContext.fetch(descriptor)) ?? []
        let hasExisting = !fetched.isEmpty || scopedTodos.contains { todo in
            todo.autoTaskKey == key && !todo.isCompleted
        }
        guard !hasExisting else { return }

        let task = ToDoItem(
            title: "FOH spot check: \(item.name)",
            taskType: .spotCheck,
            isAutoGenerated: false,
            isRecurring: false,
            isPersistent: false,
            recurrenceRule: .none,
            recurrenceWeekday: nil,
            autoTaskKey: key,
            date: dueDate,
            relatedItem: item,
            relatedVendor: nil,
            organizationId: organizationId
        )
        modelContext.insert(task)
        try? modelContext.save()
    }

    private func dayToken(for date: Date) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return "\(parts.year ?? 0)-\(parts.month ?? 0)-\(parts.day ?? 0)"
    }
}

private struct PendingTruckOrder: Identifiable, Equatable {
    let id: String
    let vendorID: UUID?
    let vendorName: String
    let orderDate: Date
    let expectedDeliveryDate: Date?
    let orderIDs: [UUID]
    let pendingItemCount: Int
}

private struct ReceivedTruckPickerView: View {
    @Environment(\.dismiss) private var dismiss
    let pendingTruckOrders: [PendingTruckOrder]
    @Binding var selectedTruckOrderID: String?
    
    var body: some View {
        NavigationStack {
            List {
                Section("Select Truck (Oldest to Newest)") {
                    if pendingTruckOrders.isEmpty {
                        Text("No pending truck orders right now.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(pendingTruckOrders) { truckOrder in
                            Button {
                                selectedTruckOrderID = truckOrder.id
                                dismiss()
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(truckOrder.vendorName)
                                        .font(.headline)
                                        .foregroundStyle(.primary)
                                    HStack(spacing: 10) {
                                        Text("Order: \(truckOrder.orderDate.formatted(date: .abbreviated, time: .omitted))")
                                        if let expected = truckOrder.expectedDeliveryDate {
                                            Text("Expected: \(expected.formatted(date: .abbreviated, time: .omitted))")
                                        }
                                    }
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    Text("\(truckOrder.pendingItemCount) pending")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                
                Section {
                    Button("Continue Without Selecting Truck") {
                        selectedTruckOrderID = nil
                        dismiss()
                    }
                }
            }
            .navigationTitle("Receiving Truck")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
        }
    }
}

struct ReceivedQuantityView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    let item: InventoryItem
    let onSaved: (InventoryItem) -> Void
    @State private var quantityText = ""
    @State private var expirationDate = Date()
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Text(item.name).font(.title2).fontWeight(.bold)
                HStack {
                    TextField("Quantity", text: $quantityText)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .roundedInputField(tint: .green)
                    Text(item.unit.rawValue)
                        .foregroundStyle(.secondary)
                }
                Text("Current on hand: \(item.totalQuantity.formattedQuantity()) \(item.unit.rawValue)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                DatePicker("Expiration", selection: $expirationDate, displayedComponents: .date)
                Button("Add to Stock") {
                    guard session.canPerform(.receiveInventory) else { return }
                    guard let qty = Double(quantityText), qty > 0 else { return }

                    let batch = Batch(
                        quantity: qty,
                        expirationDate: expirationDate,
                        stockArea: .backOfHouse,
                        organizationId: item.organizationId,
                        storeId: item.storeId
                    )
                    batch.item = item
                    item.batches.append(batch)
                    item.lastModified = Date()
                    item.revision += 1
                    item.updatedByUid = session.firebaseUser?.id
                    try? modelContext.save()

                    if let organizationId = session.activeOrganizationId {
                        let payload = ActionPayload.receiveInventory(
                            ReceiveInventoryPayload(
                                itemId: item.id.uuidString,
                                quantity: qty,
                                batchIds: [batch.id.uuidString],
                                fromOrderLineId: nil
                            )
                        )
                        let refs = AuditObjectRefs(
                            organizationId: organizationId,
                            itemId: item.id.uuidString,
                            orderId: nil,
                            batchIds: [batch.id.uuidString]
                        )
                        Task {
                            await ActionSyncService.shared.logAndApply(
                                action: payload,
                                refs: refs,
                                baseRevision: max(item.revision - 1, 0),
                                session: session,
                                modelContext: modelContext
                            )
                        }
                    }

                    onSaved(item)
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
            .navigationTitle("Received")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear {
                if quantityText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    quantityText = "\(max(1, item.quantityPerBox))"
                }
                let days = item.effectiveDefaultExpiration
                if let suggested = Calendar.current.date(byAdding: .day, value: days, to: Date()) {
                    expirationDate = suggested
                }
            }
        }
    }
}
