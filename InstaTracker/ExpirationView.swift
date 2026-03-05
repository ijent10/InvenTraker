import SwiftUI
import SwiftData

/// Expiration tracking with swipe actions
/// Swipe right = waste as expired
/// Swipe left = delete without affecting inventory
struct ExpirationView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    @Query private var allItems: [InventoryItem]
    @StateObject private var settings = AppSettings.shared
    @StateObject private var scannerService = BarcodeScannerService()
    
    @State private var showingScanner = false
    @State private var showingManualEntry = false
    @State private var scannedTarget: ExpirationScanTarget?
    @State private var showingAddAnotherPrompt = false
    @State private var catalogImportRecord: CatalogProductRecord?
    @State private var showingCatalogImportPrompt = false
    @State private var catalogLookupMessage = ""
    @State private var showingCatalogLookupMessage = false
    private let catalogService = CentralCatalogService.shared

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? "local-default"
    }

    private var scopedItems: [InventoryItem] {
        let storeId = settings.normalizedActiveStoreID
        return allItems.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(storeId)
        }
    }
    
    var expiringItems: [(item: InventoryItem, batch: Batch, daysUntil: Int)] {
        var results: [(item: InventoryItem, batch: Batch, daysUntil: Int)] = []
        
        for item in scopedItems where !item.isArchived {
            for batch in item.batches {
                let days = batch.daysUntilExpiration
                if days <= 7 && days >= 0 {
                    results.append((item: item, batch: batch, daysUntil: days))
                }
            }
        }
        
        return results.sorted { $0.daysUntil < $1.daysUntil }
    }
    
    var body: some View {
        List {
            Section {
                ContextTipCard(context: .expiration, accentColor: settings.accentColor)
                    .padding(.vertical, 2)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)
            }

            if expiringItems.isEmpty {
                ContentUnavailableView(
                    "No Items Expiring Soon",
                    systemImage: "checkmark.circle",
                    description: Text("All items are fresh!")
                )
            } else {
                ForEach(expiringItems, id: \.batch.id) { entry in
                    ExpirationSaleRow(
                        item: entry.item,
                        batch: entry.batch,
                        daysUntil: entry.daysUntil
                    )
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            wasteAsExpired(entry.item, batch: entry.batch)
                        } label: {
                            Label("Waste", systemImage: "trash")
                        }
                    }
                    .swipeActions(edge: .leading) {
                        Button {
                            deleteWithoutWaste(entry.item, batch: entry.batch)
                        } label: {
                            Label("Delete", systemImage: "xmark")
                        }
                        .tint(.gray)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Expiration")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: { showingScanner = true }) {
                    Image(systemName: "barcode.viewfinder")
                        .foregroundStyle(settings.accentColor)
                }
            }
        }
        .sheet(isPresented: $showingScanner) {
            BarcodeScannerSheet(scannerService: scannerService) { code in
                handleScannedCode(code)
            }
        }
        .sheet(isPresented: $showingManualEntry) {
            ManualItemSelector(items: scopedItems.filter { !$0.isArchived }) { item in
                setScannedTarget(for: item)
            }
        }
        .sheet(item: $scannedTarget) { target in
            ExpirationQuickCheckView(item: target.item, batch: target.batch) { completed in
                if completed {
                    showingAddAnotherPrompt = true
                }
            }
        }
        .alert("Add another expiration item?", isPresented: $showingAddAnotherPrompt) {
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
                importCatalogRecord(record)
            }
        } message: { record in
            Text("\"\(record.title)\" is in the central catalog. Add it to this store inventory?")
        }
        .alert("Barcode Not Found", isPresented: $showingCatalogLookupMessage) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(catalogLookupMessage)
        }
    }
    
    private func wasteAsExpired(_ item: InventoryItem, batch: Batch) {
        let waste = WasteEntry(
            item: item,
            quantity: batch.quantity,
            wasteType: .expired,
            organizationId: item.organizationId
        )
        modelContext.insert(waste)
        
        if let index = item.batches.firstIndex(where: { $0.id == batch.id }) {
            item.batches.remove(at: index)
        }
        item.lastModified = Date()
        item.revision += 1
        item.updatedByUid = session.firebaseUser?.id
        try? modelContext.save()

        if let organizationId = session.activeOrganizationId {
            let payload = ActionPayload.wasteRecorded(
                WasteRecordedPayload(
                    itemId: item.id.uuidString,
                    quantity: batch.quantity,
                    reason: WasteType.expired.rawValue
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
    }
    
    private func deleteWithoutWaste(_ item: InventoryItem, batch: Batch) {
        if let index = item.batches.firstIndex(where: { $0.id == batch.id }) {
            item.batches.remove(at: index)
        }
    }
    
    private func handleScannedCode(_ code: String) {
        let normalized = catalogService.normalizeUPC(code)
        if let item = scopedItems.first(where: { !$0.isArchived && ($0.upc ?? "").caseInsensitiveCompare(normalized) == .orderedSame }) {
            setScannedTarget(for: item)
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
                    await MainActor.run {
                        catalogLookupMessage = "This UPC is not in your inventory or the central catalog yet."
                        showingCatalogLookupMessage = true
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
    
    private func setScannedTarget(for item: InventoryItem) {
        guard let batch = item.batches.sorted(by: { $0.expirationDate < $1.expirationDate }).first else { return }
        let daysUntil = Calendar.current.dateComponents([.day], from: Date(), to: batch.expirationDate).day ?? 999
        scannedTarget = ExpirationScanTarget(item: item, batch: batch, daysUntil: daysUntil)
    }

    private func importCatalogRecord(_ record: CatalogProductRecord) {
        let imported = CatalogInventoryImporter.importOrGetLocalItem(
            from: record,
            organizationId: activeOrganizationId,
            storeId: settings.normalizedActiveStoreID,
            modelContext: modelContext,
            existingItems: scopedItems
        )
        if imported.batches.isEmpty {
            catalogLookupMessage = "Added to inventory with catalog photo. No batches yet, so there is nothing to check in Expiration until stock is received."
            showingCatalogLookupMessage = true
        } else {
            setScannedTarget(for: imported)
        }
    }
}

private struct ExpirationScanTarget: Identifiable {
    let id = UUID()
    let item: InventoryItem
    let batch: Batch
    let daysUntil: Int
}

private struct ExpirationQuickCheckView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    @Bindable var item: InventoryItem
    let batch: Batch
    let onComplete: (Bool) -> Void
    
    @StateObject private var settings = AppSettings.shared
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text(item.name)
                    .font(.title2.weight(.bold))
                
                Text("\(batch.quantity.formattedQuantity()) \(item.unit.rawValue)")
                    .font(.headline)
                Text(batch.expirationDate.formatted(date: .abbreviated, time: .omitted))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                
                Stepper("Sale: \(item.salePercentage)%",
                        value: $item.salePercentage,
                        in: 5...90,
                        step: 5)
                    .padding()
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))

                HStack {
                    Text("Manual Price")
                    Spacer()
                    TextField(
                        "0.00",
                        value: $item.price,
                        format: .number.precision(.fractionLength(2))
                    )
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 120)
                    .roundedInputField(tint: .orange)
                }
                
                Toggle("Mark as On Sale", isOn: $item.isOnSale)
                    .tint(.orange)
                    .padding()
                    .background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                
                Button(role: .destructive) {
                    wasteBatch()
                } label: {
                    Text("Waste Batch")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                
                Button {
                    finish()
                } label: {
                    Text("Done")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(settings.accentColor.gradient)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                
                Spacer()
            }
            .padding()
            .navigationTitle("Expiration Check")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        onComplete(false)
                        dismiss()
                    }
                }
            }
        }
    }
    
    private func wasteBatch() {
        let waste = WasteEntry(
            item: item,
            quantity: batch.quantity,
            wasteType: .expired,
            organizationId: item.organizationId
        )
        modelContext.insert(waste)
        if let index = item.batches.firstIndex(where: { $0.id == batch.id }) {
            item.batches.remove(at: index)
        }
        item.lastModified = Date()
        item.revision += 1
        item.updatedByUid = session.firebaseUser?.id
        try? modelContext.save()

        if let organizationId = session.activeOrganizationId {
            let payload = ActionPayload.wasteRecorded(
                WasteRecordedPayload(
                    itemId: item.id.uuidString,
                    quantity: batch.quantity,
                    reason: WasteType.expired.rawValue
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

        onComplete(true)
        dismiss()
    }
    
    private func finish() {
        onComplete(true)
        dismiss()
    }
}

struct ExpirationSaleRow: View {
    @Bindable var item: InventoryItem
    let batch: Batch
    let daysUntil: Int
    @StateObject private var settings = AppSettings.shared
    
    var urgencyColor: Color {
        switch daysUntil {
        case 0...2: return .red
        case 3...5: return .orange
        default: return .yellow
        }
    }
    
    var suggestedSale: Int {
        switch daysUntil {
        case 0...1: return 50
        case 2...3: return 30
        case 4...5: return 20
        default: return 10
        }
    }
    
    var effectiveSalePercentage: Int {
        item.salePercentage == 0 ? suggestedSale : item.salePercentage
    }
    
    var suggestedSalePrice: Double {
        max(0, item.price * (1 - Double(effectiveSalePercentage) / 100))
    }

    private var reworkRecommendation: String? {
        guard item.canBeReworked else { return nil }
        guard daysUntil <= 1 else { return nil }
        if batch.reworkCount >= item.effectiveMaxReworkCount {
            return "Max reworks reached (\(item.effectiveMaxReworkCount)). Discard instead of reworking."
        }
        return "Rework recommended before waste. Next shelf life: \(item.effectiveReworkShelfLifeDays) day(s)."
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                CachedThumbnailView(
                    imageData: item.pictures.first,
                    cacheKey: "expiration-row-\(item.id.uuidString)-\(item.pictures.first?.count ?? 0)",
                    width: 60,
                    height: 60,
                    cornerRadius: 10
                )
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.name)
                        .font(.headline)
                    
                    HStack(spacing: 4) {
                        Image(systemName: "clock.fill")
                            .font(.caption)
                        
                        Text(daysUntil == 0 ? "Expires today" :
                             daysUntil == 1 ? "Expires tomorrow" :
                             "Expires in \(daysUntil) days")
                    }
                    .font(.subheadline)
                    .foregroundStyle(urgencyColor)
                    
                    Text("\(batch.quantity.formattedQuantity()) \(item.unit.rawValue)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                
                Spacer()
            }

            if let reworkRecommendation {
                Label(reworkRecommendation, systemImage: "arrow.triangle.2.circlepath")
                    .font(.caption)
                    .foregroundStyle(settings.accentColor)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(settings.accentColor.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            
            VStack(alignment: .leading, spacing: 12) {
                // Stepper row
                HStack {
                    Image(systemName: "sparkles")
                        .foregroundStyle(.orange)
                    Text("Suggested Sale:")
                        .font(.subheadline)
                        .fontWeight(.medium)
                    Spacer()
                    Text("\(effectiveSalePercentage)%")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.orange)
                    Stepper("\(effectiveSalePercentage)%",
                            value: $item.salePercentage,
                            in: 5...90, step: 5)
                        .labelsHidden()
                }
                
                if item.price > 0 {
                    HStack {
                        Text("Sale Price")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text("$\(suggestedSalePrice, specifier: "%.2f")")
                            .font(.subheadline.weight(.semibold))
                        Text("(was $\(item.price, specifier: "%.2f"))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                HStack {
                    Text("Manual Price")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    TextField(
                        "0.00",
                        value: $item.price,
                        format: .number.precision(.fractionLength(2))
                    )
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 110)
                    .roundedInputField(tint: .orange)
                }
                
                // Toggle row, with a bit more top padding to avoid crowding +/- controls
                Toggle("Mark as On Sale", isOn: $item.isOnSale)
                    .tint(.orange)
                    .padding(.top, 6)
                    .alignmentGuide(.firstTextBaseline) { d in d[.firstTextBaseline] }
            }
            .padding()
            .background(.orange.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .padding(.vertical, 8)
    }
}
