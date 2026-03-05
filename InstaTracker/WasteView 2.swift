import SwiftUI
import SwiftData

/// Waste tracking with splash screen
/// Scan or manual entry, automatically subtracts from inventory
struct WasteView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    @Query(filter: #Predicate<InventoryItem> { !$0.isArchived }) private var items: [InventoryItem]
    @StateObject private var settings = AppSettings.shared
    @StateObject private var scannerService = BarcodeScannerService()
    private let catalogService = CentralCatalogService.shared
    
    @State private var showingScanner = false
    @State private var showingManualEntry = false
    @State private var wasteSelection: WasteSelection?
    @State private var showingAddAnotherPrompt = false
    
    // Add Item flow when scan not found
    @State private var showingAddItem = false
    @State private var pendingUPC: String = ""
    @State private var catalogImportRecord: CatalogProductRecord?
    @State private var showingCatalogImportPrompt = false
    @State private var catalogLookupMessage = ""
    @State private var showingCatalogLookupMessage = false

    private var canRecordWaste: Bool {
        session.canPerform(.recordWaste)
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
    
    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            
            Image(systemName: "trash.fill")
                .font(.system(size: 100))
                .foregroundStyle(.red.gradient)
                .padding(.bottom, 20)
            
            Text("Waste")
                .font(.largeTitle)
                .fontWeight(.bold)
            
            Text("Track waste and automatically update inventory")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            ContextTipCard(context: .waste, accentColor: .red)
                .padding(.horizontal)
            
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
                    .background(.red.gradient)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(!canRecordWaste)
                
                Button(action: { showingManualEntry = true }) {
                    HStack {
                        Image(systemName: "hand.tap")
                        Text("Manual Entry")
                    }
                    .font(.headline)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.red.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(!canRecordWaste)
            }
            .padding(.horizontal)
            .padding(.bottom, 100)

            if !canRecordWaste {
                Text("You don't have permission to record waste.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Waste")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingScanner) {
            BarcodeScannerSheet(scannerService: scannerService) { code in
                handleScannedCode(code)
            }
        }
        .sheet(isPresented: $showingManualEntry) {
            ManualItemSelector(items: scopedItems) { item in
                wasteSelection = WasteSelection(
                    item: item,
                    prefilledQuantity: nil,
                    preferredBatchID: nil,
                    scannedWrappedBarcode: nil
                )
            }
        }
        .sheet(item: $wasteSelection) { selection in
            WasteEntryView(
                item: selection.item,
                initialQuantity: selection.prefilledQuantity,
                preferredBatchID: selection.preferredBatchID,
                scannedWrappedBarcode: selection.scannedWrappedBarcode
            ) {
                showingAddAnotherPrompt = true
            }
        }
        .sheet(isPresented: $showingAddItem) {
            AddItemView(initialUPC: pendingUPC)
        }
        .alert("Add another waste item?", isPresented: $showingAddAnotherPrompt) {
            Button("Scan Another Item") {
                showingScanner = true
            }
            Button("Manual Entry") {
                showingManualEntry = true
            }
            Button("Done", role: .cancel) { }
        }
        .alert("Add From Central Catalog?", isPresented: $showingCatalogImportPrompt, presenting: catalogImportRecord) { record in
            Button("Cancel", role: .cancel) { }
            Button("Add to Inventory") {
                importCatalogRecordAndContinue(record)
            }
        } message: { record in
            Text("\"\(record.title)\" is in the central catalog. Add it to this store inventory and continue recording waste?")
        }
        .alert("Barcode Not Found", isPresented: $showingCatalogLookupMessage) {
            Button("Add New Item") {
                showingAddItem = true
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text(catalogLookupMessage)
        }
    }

    private func handleScannedCode(_ rawCode: String) {
        let normalized = normalizeScanCode(rawCode)

        if let item = scopedItems.first(where: { ($0.upc ?? "").caseInsensitiveCompare(normalized) == .orderedSame }) {
            wasteSelection = WasteSelection(
                item: item,
                prefilledQuantity: nil,
                preferredBatchID: nil,
                scannedWrappedBarcode: nil
            )
            return
        }

        if let wrappedMatch = findWrappedBatchMatch(scannedCode: normalized) {
            let resolvedQuantity = wrappedMatch.batch.packageWeight ?? wrappedMatch.batch.quantity
            wasteSelection = WasteSelection(
                item: wrappedMatch.item,
                prefilledQuantity: resolvedQuantity > 0 ? resolvedQuantity : nil,
                preferredBatchID: wrappedMatch.batch.id,
                scannedWrappedBarcode: wrappedMatch.batch.packageBarcode
            )
            return
        }

        pendingUPC = normalized
        guard !normalized.isEmpty else {
            showingAddItem = true
            return
        }

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
                    await MainActor.run {
                        catalogLookupMessage = "This UPC is not in your inventory or the central catalog yet."
                        showingCatalogLookupMessage = true
                    }
                }
            } catch {
                await MainActor.run {
                    catalogLookupMessage = "Could not check the central catalog. You can still add the item manually."
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
        wasteSelection = WasteSelection(
            item: imported,
            prefilledQuantity: nil,
            preferredBatchID: nil,
            scannedWrappedBarcode: nil
        )
    }

    private func findWrappedBatchMatch(scannedCode: String) -> (item: InventoryItem, batch: Batch)? {
        guard !scannedCode.isEmpty else { return nil }
        for item in scopedItems {
            if let matchedBatch = item.batches.first(where: { batch in
                let barcode = normalizeScanCode(batch.packageBarcode ?? "")
                return !barcode.isEmpty &&
                    barcode.caseInsensitiveCompare(scannedCode) == .orderedSame &&
                    batch.quantity > 0
            }) {
                return (item: item, batch: matchedBatch)
            }
        }
        return nil
    }

    private func normalizeScanCode(_ raw: String) -> String {
        raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: " ", with: "")
    }
}

struct WasteEntryView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    let item: InventoryItem
    @StateObject private var settings = AppSettings.shared
    
    @State private var quantityText = ""
    @State private var selectedReasonName = ""
    @State private var didApplyInitialQuantity = false
    @FocusState private var isQuantityFocused: Bool
    
    let initialQuantity: Double?
    let preferredBatchID: UUID?
    let scannedWrappedBarcode: String?
    let onSaved: () -> Void

    private var canRecordWaste: Bool {
        session.canPerform(.recordWaste)
    }
    
    private var reasonRules: [WasteReasonRule] {
        settings.wasteReasonRules
    }
    
    private var selectedReasonRule: WasteReasonRule? {
        reasonRules.first(where: { $0.name.caseInsensitiveCompare(selectedReasonName) == .orderedSame })
    }
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                CachedThumbnailView(
                    imageData: item.pictures.first,
                    cacheKey: "waste-item-\(item.id.uuidString)-\(item.pictures.first?.count ?? 0)",
                    width: 80,
                    height: 80,
                    cornerRadius: 12
                )
                
                Text(item.name)
                    .font(.title2)
                    .fontWeight(.bold)
                
                VStack(alignment: .leading, spacing: 8) {
                    Text("Quantity Wasted")
                        .font(.headline)
                    
                    HStack(spacing: 8) {
                        TextField("0", text: $quantityText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .focused($isQuantityFocused)
                            .roundedInputField(tint: .red)
                        
                        Text(item.unit.rawValue)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal)

                if let scannedWrappedBarcode,
                   !scannedWrappedBarcode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Label(
                        "Wrapped barcode \(scannedWrappedBarcode) matched. Quantity prefilled.",
                        systemImage: "barcode.viewfinder"
                    )
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(.horizontal)
                }
                
                VStack(alignment: .leading, spacing: 8) {
                    Text("Reason")
                        .font(.headline)
                    
                    if reasonRules.isEmpty {
                        Text("No waste types configured. Add one in Settings > Waste Types.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        Picker("Waste Type", selection: $selectedReasonName) {
                            ForEach(reasonRules) { rule in
                                Text(rule.name).tag(rule.name)
                            }
                        }
                        .pickerStyle(.menu)
                        
                        if let selectedReasonRule {
                            Label(
                                selectedReasonRule.affectsOrders ? "Affects order recommendations" : "Does not affect order recommendations",
                                systemImage: selectedReasonRule.affectsOrders ? "checkmark.circle.fill" : "minus.circle.fill"
                            )
                            .font(.caption)
                            .foregroundStyle(selectedReasonRule.affectsOrders ? .green : .secondary)
                        }
                    }
                }
                .padding(.horizontal)
                
                Spacer()
                
                Button(action: saveWaste) {
                    Text("Save Waste")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(.red.gradient)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .padding(.horizontal)
                .padding(.bottom)
            }
            .padding()
            .contentShape(Rectangle())
            .onTapGesture {
                isQuantityFocused = false
            }
            .onAppear {
                if selectedReasonName.isEmpty {
                    selectedReasonName = reasonRules.first?.name ?? ""
                }
                applyInitialQuantityIfNeeded()
            }
            .navigationTitle("Record Waste")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
    
    private func saveWaste() {
        guard canRecordWaste else { return }
        guard let qty = Double(quantityText), qty > 0 else { return }
        let reason = selectedReasonName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !reason.isEmpty else { return }
        
        let waste = WasteEntry(
            item: item,
            quantity: qty,
            wasteType: .custom,
            customTypeName: reason,
            notes: reason,
            organizationId: item.organizationId
        )
        modelContext.insert(waste)
        
        // If scan matched a wrapped package barcode, consume that batch first.
        var remaining = qty
        if let preferredBatchID,
           let preferredBatch = item.batches.first(where: { $0.id == preferredBatchID }) {
            if preferredBatch.quantity >= remaining {
                preferredBatch.quantity -= remaining
                remaining = 0
            } else {
                remaining -= preferredBatch.quantity
                preferredBatch.quantity = 0
            }
        }

        // Then subtract any remainder from oldest batches.
        for batch in item.batches.sorted(by: { $0.expirationDate < $1.expirationDate }) {
            if remaining <= 0 { break }
            if preferredBatchID == batch.id { continue }
            
            if batch.quantity >= remaining {
                batch.quantity -= remaining
                remaining = 0
            } else {
                remaining -= batch.quantity
                batch.quantity = 0
            }
        }
        
        item.batches.removeAll { $0.quantity <= 0 }
        item.lastModified = Date()
        item.revision += 1
        item.updatedByUid = session.firebaseUser?.id
        try? modelContext.save()

        if let organizationId = session.activeOrganizationId {
            let payload = ActionPayload.wasteRecorded(
                WasteRecordedPayload(
                    itemId: item.id.uuidString,
                    quantity: qty,
                    reason: reason
                )
            )
            let refs = AuditObjectRefs(
                organizationId: organizationId,
                itemId: item.id.uuidString,
                orderId: nil,
                batchIds: item.batches.map { $0.id.uuidString }
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

        onSaved()
        dismiss()
    }

    private func applyInitialQuantityIfNeeded() {
        guard !didApplyInitialQuantity else { return }
        didApplyInitialQuantity = true
        guard quantityText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard let initialQuantity, initialQuantity > 0 else { return }
        quantityText = initialQuantity.formattedQuantity(maximumFractionDigits: 3)
    }
}

private struct WasteSelection: Identifiable {
    let id = UUID()
    let item: InventoryItem
    let prefilledQuantity: Double?
    let preferredBatchID: UUID?
    let scannedWrappedBarcode: String?
}
