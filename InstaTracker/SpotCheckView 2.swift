import SwiftUI
import SwiftData
import UIKit

/// Spot check updates inventory counts based on an actual count session.
/// Final inventory quantity becomes exactly what the user counted.
struct SpotCheckView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    @Query(filter: #Predicate<InventoryItem> { !$0.isArchived }) private var items: [InventoryItem]
    @Query private var vendors: [Vendor]
    @StateObject private var settings = AppSettings.shared
    @StateObject private var scannerService = BarcodeScannerService()
    private let catalogService = CentralCatalogService.shared
    
    @State private var showingScanner = false
    @State private var showingManualEntry = false
    @State private var spotCheckSelection: SpotCheckSelection?
    @State private var showingAddAnotherPrompt = false
    @State private var catalogImportRecord: CatalogProductRecord?
    @State private var showingCatalogImportPrompt = false
    @State private var catalogLookupMessage = ""
    @State private var showingCatalogLookupMessage = false
    @State private var pendingSelectionItem: InventoryItem?
    @State private var pendingSelectionBatches: [CountedBatchDraft] = []
    @State private var showingStockAreaPrompt = false
    @State private var wrappedScanSession: WrappedScanSession?
    @State private var wrappedScanToast: WrappedScanToast?
    @State private var wrappedStockArea: StockArea = .backOfHouse
    @State private var showingWrappedDonePrompt = false
    @State private var pendingWrappedDonePromptAfterDismiss = false
    @State private var showingExportTruckPrompt = false
    @State private var exportPreviewRows: [SpotCheckExportRow] = []
    @State private var exportPreviewTruckName = ""
    @State private var showingExportPreview = false
    @State private var exportErrorMessage = ""
    @State private var showingExportError = false
    @State private var showingReworkReminder = false
    @State private var reworkReminderMessage = ""
    @State private var wrappedDuplicateExpirationPrompt: WrappedDuplicateExpirationPrompt?

    private var canSpotCheck: Bool {
        session.canPerform(.spotCheck)
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

    private var scopedVendors: [Vendor] {
        vendors
            .filter { $0.organizationId == activeOrganizationId }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
    
    var body: some View {
        applyPresentations(
            to: mainContent
                .navigationTitle("Spot Check")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { exportToolbarContent }
        )
    }

    @ViewBuilder
    private var mainContent: some View {
        VStack(spacing: 20) {
            Spacer()
            
            Image(systemName: "barcode.viewfinder")
                .font(.system(size: 100))
                .foregroundStyle(settings.accentColor.gradient)
                .padding(.bottom, 20)
            
            Text("Spot Check")
                .font(.largeTitle)
                .fontWeight(.bold)
            
            Text("Count inventory and update expirations")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            ContextTipCard(context: .spotCheck, accentColor: settings.accentColor)
                .padding(.horizontal)

            if scopedItems.isEmpty {
                Text("No store inventory found yet. Run Receiving or import inventory metadata, then start Spot Check.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
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
                    .background(settings.accentColor.gradient)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(!canSpotCheck)
                
                Button(action: { showingManualEntry = true }) {
                    HStack {
                        Image(systemName: "hand.tap")
                        Text("Manual Entry")
                    }
                    .font(.headline)
                    .foregroundStyle(settings.accentColor)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(settings.accentColor.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(!canSpotCheck)
            }
            .padding(.horizontal)
            .padding(.bottom, 100)

            if !canSpotCheck {
                Text("You don't have permission to perform spot checks.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ToolbarContentBuilder
    private var exportToolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button("Export") {
                showingExportTruckPrompt = true
            }
        }
    }

    private func applyPresentations<Content: View>(to content: Content) -> some View {
        applyAlertsAndDialogs(
            to: applyPrimarySheets(to: content)
        )
    }

    private func applyPrimarySheets<Content: View>(to content: Content) -> some View {
        content
            .sheet(isPresented: $showingScanner) {
            SpotCheckScannerSheet(
                scannerService: scannerService,
                accentColor: settings.accentColor,
                wrappedSession: wrappedScanSession,
                wrappedToast: wrappedScanToast,
                wrappedStockArea: $wrappedStockArea
            ) { code in
                handleScannedCode(code)
            } onDoneWrappedSession: {
                scannerService.stopScanning()
                showingScanner = false
                pendingWrappedDonePromptAfterDismiss = true
            } onClose: {
                wrappedScanSession = nil
                wrappedScanToast = nil
                scannerService.stopScanning()
                showingScanner = false
            }
        }
        .onChange(of: showingScanner) { _, isPresented in
            guard !isPresented, pendingWrappedDonePromptAfterDismiss else { return }
            pendingWrappedDonePromptAfterDismiss = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                showingWrappedDonePrompt = true
            }
        }
        .sheet(isPresented: $showingManualEntry) {
            ManualItemSelector(items: scopedItems) { item in
                presentSpotCheck(item: item, prefilledBatches: [])
            }
        }
        .sheet(item: $spotCheckSelection) { selection in
            SpotCheckCountView(
                item: selection.item,
                initialBatches: selection.prefilledBatches,
                initialStockArea: selection.stockArea
            ) {
                showingAddAnotherPrompt = true
            }
        }
        .sheet(isPresented: $showingExportPreview) {
            SpotCheckExportPreviewView(
                truckName: exportPreviewTruckName,
                rows: exportPreviewRows
            )
        }
    }

    private func applyAlertsAndDialogs<Content: View>(to content: Content) -> some View {
        content
            .alert("Add another spot check item?", isPresented: $showingAddAnotherPrompt) {
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
            Text("\"\(record.title)\" is in the central catalog. Add it to this store inventory and continue spot check?")
        }
        .alert("Barcode Not Found", isPresented: $showingCatalogLookupMessage) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(catalogLookupMessage)
        }
        .confirmationDialog("Spot Check Area", isPresented: $showingStockAreaPrompt, titleVisibility: .visible) {
            Button(StockArea.backOfHouse.title) {
                applyPendingSpotCheckSelection(.backOfHouse)
            }
            Button(StockArea.frontOfHouse.title) {
                applyPendingSpotCheckSelection(.frontOfHouse)
            }
            Button("Cancel", role: .cancel) {
                pendingSelectionItem = nil
                pendingSelectionBatches = []
            }
        } message: {
            Text("Choose where this count is happening.")
        }
        .confirmationDialog("Done scanning this rewrapped item?", isPresented: $showingWrappedDonePrompt, titleVisibility: .visible) {
            Button("Yes, add more details") {
                openWrappedSessionInDefaultSpotCheck()
            }
            Button("No, save this count now") {
                commitWrappedSession()
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("Do you want to add more quantities/expirations for this item before saving?")
        }
        .confirmationDialog("Export Spot Check", isPresented: $showingExportTruckPrompt, titleVisibility: .visible) {
            Button("All Items") {
                exportSpotCheck(for: nil)
            }
            if !scopedVendors.isEmpty {
                ForEach(scopedVendors) { vendor in
                    Button(vendor.name) {
                        exportSpotCheck(for: vendor)
                    }
                }
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("Choose a truck to filter items, or export all items in this store.")
        }
        .alert("Export Unavailable", isPresented: $showingExportError) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(exportErrorMessage)
        }
        .alert("Rework Needed", isPresented: $showingReworkReminder) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(reworkReminderMessage)
        }
        .confirmationDialog(
            "Which expiration is this package?",
            isPresented: Binding(
                get: { wrappedDuplicateExpirationPrompt != nil },
                set: { isPresented in
                    if !isPresented {
                        wrappedDuplicateExpirationPrompt = nil
                    }
                }
            ),
            titleVisibility: .visible
        ) {
            if let prompt = wrappedDuplicateExpirationPrompt {
                ForEach(prompt.options) { option in
                    Button(option.buttonTitle) {
                        applyWrappedDuplicateExpirationSelection(option)
                    }
                }
            }
            Button("Cancel", role: .cancel) {
                cancelWrappedDuplicateExpirationSelection()
            }
        } message: {
            if let prompt = wrappedDuplicateExpirationPrompt {
                Text("Same barcode scanned again for \(prompt.itemName). Select the matching expiration.")
            } else {
                Text("Select the matching expiration.")
            }
        }
    }

    private func handleScannedCode(_ rawCode: String) {
        let normalized = normalizeScanCode(rawCode)
        guard !normalized.isEmpty else { return }

        if wrappedScanSession != nil {
            handleWrappedSessionScan(normalized)
            return
        }

        if let item = scopedItems.first(where: { ($0.upc ?? "").caseInsensitiveCompare(normalized) == .orderedSame }) {
            scannerService.stopScanning()
            showingScanner = false
            presentSpotCheck(item: item, prefilledBatches: [])
            return
        }

        if let wrappedMatch = findWrappedBatchMatch(scannedCode: normalized) {
            if wrappedMatch.item.rewrapsWithUniqueBarcode {
                beginWrappedScanSession(match: wrappedMatch, scannedCode: normalized)
            } else {
                scannerService.stopScanning()
                showingScanner = false
                let prefilled = CountedBatchDraft(
                    quantity: wrappedMatch.batch.quantity,
                    expirationDate: wrappedMatch.batch.expirationDate,
                    packageBarcode: wrappedMatch.batch.packageBarcode,
                    packageWeight: wrappedMatch.batch.packageWeight ?? wrappedMatch.batch.quantity,
                    packagePrice: wrappedMatch.batch.packagePrice,
                    reworkCount: wrappedMatch.batch.reworkCount,
                    stockArea: wrappedMatch.batch.stockArea
                )
                presentSpotCheck(item: wrappedMatch.item, prefilledBatches: [prefilled])
            }
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
                        note: "Created from Spot Check unknown scan."
                    )
                    await MainActor.run {
                        scannerService.stopScanning()
                        showingScanner = false
                        catalogLookupMessage = submissionId == nil
                            ? "Created a store draft item. Review submission could not be sent right now."
                            : "Created a store draft and sent it for organization review."
                        showingCatalogLookupMessage = true
                        presentSpotCheck(item: draftItem, prefilledBatches: [])
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
        scannerService.stopScanning()
        showingScanner = false
        presentSpotCheck(item: imported, prefilledBatches: [])
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

    private func presentSpotCheck(item: InventoryItem, prefilledBatches: [CountedBatchDraft]) {
        pendingSelectionItem = item
        pendingSelectionBatches = prefilledBatches
        showingStockAreaPrompt = true
    }

    private func applyPendingSpotCheckSelection(_ area: StockArea) {
        guard let item = pendingSelectionItem else { return }
        wrappedStockArea = area
        spotCheckSelection = SpotCheckSelection(
            item: item,
            prefilledBatches: pendingSelectionBatches,
            stockArea: area
        )
        pendingSelectionItem = nil
        pendingSelectionBatches = []
    }

    private func beginWrappedScanSession(
        match: (item: InventoryItem, batch: Batch),
        scannedCode: String
    ) {
        let normalizedCode = normalizeScanCode(scannedCode)
        let batchDraft = makeCountedBatchDraft(from: match.batch)
        let entry = WrappedScannedEntry(code: normalizedCode, draft: batchDraft)
        wrappedScanSession = WrappedScanSession(
            item: match.item,
            entries: [entry],
            scannedCodes: Set([normalizedCode])
        )
        wrappedStockArea = match.batch.stockArea
        maybeShowReworkReminder(for: match.item, batch: match.batch)
        showWrappedToast(for: match.item, batch: match.batch, duplicate: false)
        scannerService.allowNextScan(after: 1.0)
    }

    private func handleWrappedSessionScan(_ normalizedCode: String) {
        guard var session = wrappedScanSession else { return }
        guard let matched = findWrappedBatchMatch(scannedCode: normalizedCode) else {
            scannerService.allowNextScan(after: 1.0)
            return
        }
        guard matched.item.id == session.item.id else {
            showWrappedToast(message: "Different item detected. Tap Done to finish \(session.item.name) first.")
            scannerService.allowNextScan(after: 1.0)
            return
        }

        if session.scannedCodes.contains(normalizedCode) {
            presentWrappedDuplicateExpirationPrompt(
                scannedCode: normalizedCode,
                item: session.item,
                fallbackBatch: matched.batch
            )
            return
        }

        session.scannedCodes.insert(normalizedCode)
        session.entries.append(
            WrappedScannedEntry(
                code: normalizedCode,
                draft: makeCountedBatchDraft(from: matched.batch)
            )
        )
        wrappedScanSession = session
        maybeShowReworkReminder(for: matched.item, batch: matched.batch)
        showWrappedToast(for: matched.item, batch: matched.batch, duplicate: false)
        scannerService.allowNextScan(after: 1.0)
    }

    private func showWrappedToast(message: String) {
        let toast = WrappedScanToast(message: message)
        wrappedScanToast = toast
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            if wrappedScanToast?.id == toast.id {
                wrappedScanToast = nil
            }
        }
    }

    private func showWrappedToast(for item: InventoryItem, batch: Batch, duplicate: Bool) {
        let priceValue = batch.packagePrice ?? batch.packageWeight.map { item.price * $0 } ?? item.price
        let priceText = priceValue.formatted(.currency(code: Locale.current.currency?.identifier ?? "USD"))
        let expirationText = batch.expirationDate.formatted(date: .abbreviated, time: .omitted)
        let text = duplicate
            ? "Already counted • \(priceText) • \(expirationText)"
            : "\(priceText) • Expires \(expirationText)"
        showWrappedToast(message: text)
    }

    private func makeCountedBatchDraft(from batch: Batch) -> CountedBatchDraft {
        CountedBatchDraft(
            quantity: batch.quantity,
            expirationDate: batch.expirationDate,
            packageBarcode: batch.packageBarcode,
            packageWeight: batch.packageWeight,
            packagePrice: batch.packagePrice,
            reworkCount: batch.reworkCount,
            stockArea: batch.stockArea
        )
    }

    private func presentWrappedDuplicateExpirationPrompt(
        scannedCode: String,
        item: InventoryItem,
        fallbackBatch: Batch
    ) {
        let normalizedCode = normalizeScanCode(scannedCode)
        let candidateBatches = item.batches.filter { batch in
            normalizeScanCode(batch.packageBarcode ?? "").caseInsensitiveCompare(normalizedCode) == .orderedSame
        }

        let uniqueByDay = Dictionary(grouping: candidateBatches, by: { batch in
            Calendar.current.startOfDay(for: batch.expirationDate)
        })

        var options = uniqueByDay
            .map { (_, batchesOnDay) -> WrappedDuplicateExpirationOption? in
                guard let batch = batchesOnDay.first else { return nil }
                return WrappedDuplicateExpirationOption(
                    scannedCode: normalizedCode,
                    draft: makeCountedBatchDraft(from: batch)
                )
            }
            .compactMap { $0 }
            .sorted { $0.draft.expirationDate < $1.draft.expirationDate }

        if options.isEmpty {
            options = [
                WrappedDuplicateExpirationOption(
                    scannedCode: normalizedCode,
                    draft: makeCountedBatchDraft(from: fallbackBatch)
                )
            ]
        }

        scannerService.stopScanning()
        showingScanner = false
        wrappedDuplicateExpirationPrompt = WrappedDuplicateExpirationPrompt(
            itemName: item.name,
            options: options
        )
    }

    private func applyWrappedDuplicateExpirationSelection(_ option: WrappedDuplicateExpirationOption) {
        guard var session = wrappedScanSession else {
            wrappedDuplicateExpirationPrompt = nil
            return
        }
        session.entries.append(
            WrappedScannedEntry(
                code: option.scannedCode,
                draft: option.draft
            )
        )
        wrappedScanSession = session
        wrappedDuplicateExpirationPrompt = nil
        let expirationText = option.draft.expirationDate.formatted(date: .abbreviated, time: .omitted)
        showWrappedToast(message: "Added duplicate • Expires \(expirationText)")
        showingScanner = true
        scannerService.allowNextScan(after: 0.8)
    }

    private func cancelWrappedDuplicateExpirationSelection() {
        wrappedDuplicateExpirationPrompt = nil
        guard wrappedScanSession != nil else { return }
        showingScanner = true
        scannerService.allowNextScan(after: 0.8)
    }

    private func maybeShowReworkReminder(for item: InventoryItem, batch: Batch) {
        guard item.canBeReworked else { return }
        guard batch.daysUntilExpiration == 1 else { return }
        if batch.reworkCount >= item.effectiveMaxReworkCount {
            reworkReminderMessage = "\(item.name) expires tomorrow and has already reached the max rework count (\(item.effectiveMaxReworkCount)). Discard instead of reworking."
        } else {
            reworkReminderMessage = "\(item.name) expires tomorrow and should be reworked. Reworked shelf life: \(item.effectiveReworkShelfLifeDays) day(s)."
        }
        showingReworkReminder = true
    }

    private func openWrappedSessionInDefaultSpotCheck() {
        guard let session = wrappedScanSession else { return }
        scannerService.stopScanning()
        showingScanner = false
        wrappedScanToast = nil
        wrappedScanSession = nil
        presentSpotCheck(
            item: session.item,
            prefilledBatches: session.entries.map(\.draft)
        )
    }

    private func commitWrappedSession() {
        guard let session = wrappedScanSession else { return }
        guard !session.entries.isEmpty else { return }
        let area = wrappedStockArea
        applySpotCheckBatches(
            item: session.item,
            drafts: session.entries.map(\.draft),
            stockArea: area
        )
        wrappedScanSession = nil
        wrappedScanToast = nil
        scannerService.stopScanning()
        showingScanner = false
        showingAddAnotherPrompt = true
    }

    private func applySpotCheckBatches(
        item: InventoryItem,
        drafts: [CountedBatchDraft],
        stockArea: StockArea
    ) {
        let previousTotal = item.totalQuantity
        let validDrafts = drafts.filter { $0.quantity > 0 }
        let calendar = Calendar.current

        if stockArea == .backOfHouse {
            let existingFront = item.batches.filter { $0.stockArea == .frontOfHouse }
            item.batches = existingFront
            for draft in validDrafts {
                let batch = Batch(
                    quantity: draft.quantity,
                    expirationDate: draft.expirationDate,
                    packageBarcode: draft.packageBarcode,
                    packageWeight: draft.packageWeight,
                    packagePrice: draft.packagePrice,
                    reworkCount: draft.reworkCount,
                    stockArea: .backOfHouse,
                    organizationId: item.organizationId,
                    storeId: item.storeId
                )
                batch.item = item
                item.batches.append(batch)
            }
        } else {
            // Replace FOH batches and decrement BOH batches with matching expirations first.
            item.batches.removeAll { $0.stockArea == .frontOfHouse }
            for draft in validDrafts {
                var remainingToMove = draft.quantity
                let sameDateBack = item.batches
                    .filter { $0.stockArea == .backOfHouse && calendar.isDate($0.expirationDate, inSameDayAs: draft.expirationDate) }
                    .sorted { $0.expirationDate < $1.expirationDate }
                for batch in sameDateBack where remainingToMove > 0 {
                    let moved = min(remainingToMove, batch.quantity)
                    batch.quantity = max(0, batch.quantity - moved)
                    remainingToMove -= moved
                }

                if remainingToMove > 0 {
                    let remainingBack = item.batches
                        .filter { $0.stockArea == .backOfHouse }
                        .sorted { $0.expirationDate < $1.expirationDate }
                    for batch in remainingBack where remainingToMove > 0 {
                        let moved = min(remainingToMove, batch.quantity)
                        batch.quantity = max(0, batch.quantity - moved)
                        remainingToMove -= moved
                    }
                }

                let frontBatch = Batch(
                    quantity: draft.quantity,
                    expirationDate: draft.expirationDate,
                    packageBarcode: draft.packageBarcode,
                    packageWeight: draft.packageWeight,
                    packagePrice: draft.packagePrice,
                    reworkCount: draft.reworkCount,
                    stockArea: .frontOfHouse,
                    organizationId: item.organizationId,
                    storeId: item.storeId
                )
                frontBatch.item = item
                item.batches.append(frontBatch)
            }
            item.batches.removeAll { $0.quantity <= 0 }
        }

        item.lastModified = Date()
        item.revision += 1
        item.updatedByUid = session.firebaseUser?.id
        let countedTotal = item.totalQuantity
        modelContext.insert(
            SpotCheckInsightAction(
                organizationId: item.organizationId,
                storeId: item.storeId,
                itemIDSnapshot: item.id,
                itemNameSnapshot: item.name,
                itemPriceSnapshot: item.price,
                previousQuantity: previousTotal,
                countedQuantity: countedTotal
            )
        )
        try? modelContext.save()

        if let organizationId = session.activeOrganizationId {
            let payload = ActionPayload.spotCheckSetCount(
                SpotCheckSetCountPayload(
                    itemId: item.id.uuidString,
                    newTotal: countedTotal,
                    batchCount: item.batches.count
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
    }

    private func exportSpotCheck(for vendor: Vendor?) {
        let exportItems = scopedItems
            .filter { item in
                guard let vendor else { return true }
                return item.vendor?.id == vendor.id
            }
            .filter { !normalizedUPC($0.upc).isEmpty }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

        guard !exportItems.isEmpty else {
            if let vendor {
                exportErrorMessage = "No UPC-coded items found for \(vendor.name)."
            } else {
                exportErrorMessage = "No UPC-coded items found in this store."
            }
            showingExportError = true
            return
        }

        exportPreviewRows = exportItems.map { item in
            let barcode = normalizedUPC(item.upc)
            return SpotCheckExportRow(
                title: item.name,
                barcode: barcode,
                barcodeImage: BarcodeRenderService.makeCode128(from: barcode),
                quantity: settings.formattedQuantityForDisplay(item.totalQuantity, item: item)
            )
        }
        exportPreviewTruckName = vendor?.name ?? "All Items"
        showingExportPreview = true
    }

    private func normalizedUPC(_ raw: String?) -> String {
        let cleaned = (raw ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: " ", with: "")
        guard !cleaned.isEmpty else { return "" }
        return catalogService.normalizeUPC(cleaned)
    }

}

struct SpotCheckCountView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    @Bindable var item: InventoryItem
    @StateObject private var settings = AppSettings.shared
    
    @State private var quantityText = ""
    @State private var expirationDate = Date()
    @State private var selectedStockArea: StockArea = .backOfHouse
    @State private var countedBatches: [CountedBatchDraft] = []
    @State private var didApplyInitialBatch = false
    @State private var isSaving = false
    @FocusState private var isQuantityFocused: Bool
    
    let initialBatches: [CountedBatchDraft]
    let initialStockArea: StockArea
    let onSaved: () -> Void

    private var canSpotCheck: Bool {
        session.canPerform(.spotCheck)
    }
    
    private var countedTotal: Double {
        countedBatches.reduce(0) { $0 + $1.quantity }
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    CachedThumbnailView(
                        imageData: item.pictures.first,
                        cacheKey: "spotcheck-item-\(item.id.uuidString)-\(item.pictures.first?.count ?? 0)",
                        width: 84,
                        height: 84,
                        cornerRadius: 12
                    )
                    
                    Text(item.name)
                        .font(.title2.weight(.bold))
                    
                    VStack(spacing: 8) {
                        Text("System quantity: \(settings.formattedQuantityForDisplay(item.totalQuantity, item: item))")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text("Back stock: \(settings.formattedQuantityForDisplay(item.backStockQuantity, item: item))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("Front stock: \(settings.formattedQuantityForDisplay(item.frontStockQuantity, item: item))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("Counted quantity: \(settings.formattedQuantityForDisplay(countedTotal, item: item))")
                            .font(.headline)
                            .foregroundStyle(settings.accentColor)
                    }

                    if let wrappedBarcode = initialBatches.first?.packageBarcode,
                       !wrappedBarcode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Label(
                            "Wrapped barcode \(wrappedBarcode) matched. Quantity and expiration were prefilled.",
                            systemImage: "barcode.viewfinder"
                        )
                        .font(.caption)
                        .foregroundStyle(settings.accentColor)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Spot Check Area")
                            .font(.headline)
                        Picker("Area", selection: $selectedStockArea) {
                            ForEach(StockArea.allCases) { area in
                                Text(area.title).tag(area)
                            }
                        }
                        .pickerStyle(.segmented)
                    }
                    .padding()
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Add Counted Batch")
                            .font(.headline)
                        
                        HStack(spacing: 8) {
                            TextField("0", text: $quantityText)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .focused($isQuantityFocused)
                                .roundedInputField(tint: settings.accentColor)
                            Text(item.unit.rawValue)
                                .foregroundStyle(.secondary)
                        }
                        
                        DatePicker("Expiration", selection: $expirationDate, displayedComponents: .date)
                        
                        Button(action: addCurrentBatch) {
                            Text("Add Batch")
                                .font(.headline)
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(settings.accentColor.gradient)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                    }
                    .padding()
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    
                    if countedBatches.isEmpty {
                        Text("No counted batches added yet.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        VStack(spacing: 10) {
                            ForEach(countedBatches) { draft in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("\(draft.quantity.formattedQuantity()) \(item.unit.rawValue)")
                                        Text(draft.expirationDate.formatted(date: .abbreviated, time: .omitted))
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Button("Edit") {
                                        quantityText = draft.quantity.formattedQuantity()
                                        expirationDate = draft.expirationDate
                                        countedBatches.removeAll { $0.id == draft.id }
                                        isQuantityFocused = true
                                    }
                                    .buttonStyle(.bordered)
                                    Button(role: .destructive) {
                                        countedBatches.removeAll { $0.id == draft.id }
                                    } label: {
                                        Image(systemName: "trash")
                                    }
                                    .buttonStyle(.plain)
                                }
                                .padding()
                                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
                            }
                        }
                    }
                    
                    VStack(spacing: 12) {
                        Button(action: finalizeSpotCheck) {
                            Text(isSaving ? "Saving..." : "Finish Spot Check")
                                .font(.headline)
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(.green.gradient)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .disabled(isSaving)
                        
                        Button(role: .destructive, action: setInventoryToZero) {
                            Text("Set Item Quantity to 0")
                                .font(.subheadline.weight(.semibold))
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .disabled(isSaving)
                    }
                }
                .padding()
                .contentShape(Rectangle())
                .onTapGesture {
                    isQuantityFocused = false
                }
            }
            .navigationTitle("Spot Check")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear {
                applyInitialBatchIfNeeded()
            }
        }
    }

    private func applyInitialBatchIfNeeded() {
        guard !didApplyInitialBatch else { return }
        didApplyInitialBatch = true
        selectedStockArea = initialStockArea

        if !initialBatches.isEmpty {
            countedBatches = initialBatches
            quantityText = ""
            expirationDate = initialBatches.first?.expirationDate ?? Date()
            return
        }

        // Default to current batches from selected stock area so users can adjust quickly.
        let existing = item.batches
            .filter { $0.stockArea == selectedStockArea }
            .sorted { $0.expirationDate < $1.expirationDate }
            .map {
                CountedBatchDraft(
                    quantity: $0.quantity,
                    expirationDate: $0.expirationDate,
                    packageBarcode: $0.packageBarcode,
                    packageWeight: $0.packageWeight,
                    packagePrice: $0.packagePrice,
                    reworkCount: $0.reworkCount,
                    stockArea: $0.stockArea
                )
            }
        countedBatches = existing
        expirationDate = existing.first?.expirationDate ?? Date()
    }
    
    private func addCurrentBatch() {
        guard let quantity = Double(quantityText), quantity > 0 else { return }
        countedBatches.append(
            CountedBatchDraft(
                quantity: quantity,
                expirationDate: expirationDate,
                stockArea: selectedStockArea
            )
        )
        quantityText = ""
        expirationDate = Date()
        isQuantityFocused = false
    }
    
    private func finalizeSpotCheck() {
        guard !isSaving else { return }
        guard canSpotCheck else { return }
        isSaving = true
        let previousTotal = item.totalQuantity

        let pendingQuantity = Double(quantityText) ?? 0
        guard !countedBatches.isEmpty || pendingQuantity > 0 else {
            isSaving = false
            return
        }
        
        if let quantity = Double(quantityText), quantity > 0 {
            countedBatches.append(
                CountedBatchDraft(
                    quantity: quantity,
                    expirationDate: expirationDate,
                    stockArea: selectedStockArea
                )
            )
            quantityText = ""
        }

        let validDrafts = countedBatches.filter { $0.quantity > 0 }
        let calendar = Calendar.current
        if selectedStockArea == .backOfHouse {
            let frontBatches = item.batches.filter { $0.stockArea == .frontOfHouse }
            item.batches = frontBatches
            for draft in validDrafts {
                let batch = Batch(
                    quantity: draft.quantity,
                    expirationDate: draft.expirationDate,
                    packageBarcode: draft.packageBarcode,
                    packageWeight: draft.packageWeight,
                    packagePrice: draft.packagePrice,
                    reworkCount: draft.reworkCount,
                    stockArea: .backOfHouse,
                    organizationId: item.organizationId,
                    storeId: item.storeId
                )
                batch.item = item
                item.batches.append(batch)
            }
        } else {
            item.batches.removeAll { $0.stockArea == .frontOfHouse }
            for draft in validDrafts {
                var remainingToMove = draft.quantity
                let sameDateBack = item.batches
                    .filter { $0.stockArea == .backOfHouse && calendar.isDate($0.expirationDate, inSameDayAs: draft.expirationDate) }
                    .sorted { $0.expirationDate < $1.expirationDate }
                for batch in sameDateBack where remainingToMove > 0 {
                    let moved = min(remainingToMove, batch.quantity)
                    batch.quantity = max(0, batch.quantity - moved)
                    remainingToMove -= moved
                }

                if remainingToMove > 0 {
                    let remainingBack = item.batches
                        .filter { $0.stockArea == .backOfHouse }
                        .sorted { $0.expirationDate < $1.expirationDate }
                    for batch in remainingBack where remainingToMove > 0 {
                        let moved = min(remainingToMove, batch.quantity)
                        batch.quantity = max(0, batch.quantity - moved)
                        remainingToMove -= moved
                    }
                }

                let batch = Batch(
                    quantity: draft.quantity,
                    expirationDate: draft.expirationDate,
                    packageBarcode: draft.packageBarcode,
                    packageWeight: draft.packageWeight,
                    packagePrice: draft.packagePrice,
                    reworkCount: draft.reworkCount,
                    stockArea: .frontOfHouse,
                    organizationId: item.organizationId,
                    storeId: item.storeId
                )
                batch.item = item
                item.batches.append(batch)
            }
            item.batches.removeAll { $0.quantity <= 0 }
        }

        item.lastModified = Date()
        item.revision += 1
        item.updatedByUid = session.firebaseUser?.id
        let countedTotal = item.totalQuantity
        modelContext.insert(
            SpotCheckInsightAction(
                organizationId: item.organizationId,
                storeId: item.storeId,
                itemIDSnapshot: item.id,
                itemNameSnapshot: item.name,
                itemPriceSnapshot: item.price,
                previousQuantity: previousTotal,
                countedQuantity: countedTotal
            )
        )
        try? modelContext.save()

        if let organizationId = session.activeOrganizationId {
            let payload = ActionPayload.spotCheckSetCount(
                SpotCheckSetCountPayload(
                    itemId: item.id.uuidString,
                    newTotal: countedTotal,
                    batchCount: item.batches.count
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
    
    private func setInventoryToZero() {
        guard !isSaving else { return }
        guard canSpotCheck else { return }
        isSaving = true
        let previousTotal = item.totalQuantity

        countedBatches.removeAll()
        quantityText = ""
        item.batches.removeAll { $0.stockArea == selectedStockArea }
        item.lastModified = Date()
        item.revision += 1
        item.updatedByUid = session.firebaseUser?.id
        modelContext.insert(
            SpotCheckInsightAction(
                organizationId: item.organizationId,
                storeId: item.storeId,
                itemIDSnapshot: item.id,
                itemNameSnapshot: item.name,
                itemPriceSnapshot: item.price,
                previousQuantity: previousTotal,
                countedQuantity: 0
            )
        )
        try? modelContext.save()

        if let organizationId = session.activeOrganizationId {
            let payload = ActionPayload.spotCheckSetCount(
                SpotCheckSetCountPayload(
                    itemId: item.id.uuidString,
                    newTotal: 0,
                    batchCount: 0
                )
            )
            let refs = AuditObjectRefs(
                organizationId: organizationId,
                itemId: item.id.uuidString,
                orderId: nil,
                batchIds: []
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
}

struct CountedBatchDraft: Identifiable {
    let id: UUID
    let quantity: Double
    let expirationDate: Date
    let packageBarcode: String?
    let packageWeight: Double?
    let packagePrice: Double?
    let reworkCount: Int
    let stockArea: StockArea

    init(
        id: UUID = UUID(),
        quantity: Double,
        expirationDate: Date,
        packageBarcode: String? = nil,
        packageWeight: Double? = nil,
        packagePrice: Double? = nil
        ,
        reworkCount: Int = 0
        ,
        stockArea: StockArea = .backOfHouse
    ) {
        self.id = id
        self.quantity = quantity
        self.expirationDate = expirationDate
        self.packageBarcode = packageBarcode
        self.packageWeight = packageWeight
        self.packagePrice = packagePrice
        self.reworkCount = max(0, reworkCount)
        self.stockArea = stockArea
    }
}

private struct SpotCheckSelection: Identifiable {
    let id = UUID()
    let item: InventoryItem
    let prefilledBatches: [CountedBatchDraft]
    let stockArea: StockArea
}

private struct WrappedScannedEntry: Identifiable {
    let id = UUID()
    let code: String
    let draft: CountedBatchDraft
}

private struct WrappedScanSession {
    let item: InventoryItem
    var entries: [WrappedScannedEntry]
    var scannedCodes: Set<String>
}

private struct WrappedScanToast: Identifiable {
    let id = UUID()
    let message: String
}

private struct WrappedDuplicateExpirationPrompt {
    let id = UUID()
    let itemName: String
    let options: [WrappedDuplicateExpirationOption]
}

private struct WrappedDuplicateExpirationOption: Identifiable {
    let id = UUID()
    let scannedCode: String
    let draft: CountedBatchDraft

    var buttonTitle: String {
        let expiration = draft.expirationDate.formatted(date: .abbreviated, time: .omitted)
        return "\(expiration)"
    }
}

private struct SpotCheckExportRow: Identifiable {
    let id = UUID()
    let title: String
    let barcode: String
    let barcodeImage: UIImage?
    let quantity: String
}

private struct SpotCheckScannerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var scannerService: BarcodeScannerService
    let accentColor: Color
    let wrappedSession: WrappedScanSession?
    let wrappedToast: WrappedScanToast?
    @Binding var wrappedStockArea: StockArea
    let onScanned: (String) -> Void
    let onDoneWrappedSession: () -> Void
    let onClose: () -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                if scannerService.isAuthorized {
                    CameraPreviewView(scanner: scannerService)
                        .ignoresSafeArea()
                } else {
                    VStack(spacing: 12) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(.secondary)
                        Text("Camera Access Needed")
                            .font(.title3)
                            .fontWeight(.semibold)
                        Text(scannerService.errorMessage ?? "Enable camera access in Settings to scan barcodes.")
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal)
                    }
                    .padding()
                }

                VStack(spacing: 10) {
                    if let scannerError = scannerService.errorMessage, !scannerError.isEmpty {
                        Text(scannerError)
                            .font(.caption.weight(.semibold))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(.ultraThinMaterial, in: Capsule())
                            .padding(.top, 8)
                            .padding(.horizontal)
                    }
                    if let wrappedToast {
                        Text(wrappedToast.message)
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(.ultraThinMaterial, in: Capsule())
                            .padding(.top, 12)
                    }
                    Spacer()
                }

                VStack(spacing: 12) {
                    Spacer()
                    if let wrappedSession {
                        VStack(spacing: 10) {
                            Text("Wrapped Scan: \(wrappedSession.item.name)")
                                .font(.headline)
                            Text("\(wrappedSession.entries.count) unique barcode(s) counted")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Picker("Area", selection: $wrappedStockArea) {
                                ForEach(StockArea.allCases) { area in
                                    Text(area.title).tag(area)
                                }
                            }
                            .pickerStyle(.segmented)
                            Button("Done") {
                                onDoneWrappedSession()
                            }
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(accentColor.gradient)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .padding(14)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .padding(.horizontal)
                    }

                    Text("Align the barcode within the frame")
                        .font(.headline)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(.ultraThinMaterial, in: Capsule())
                }
                .padding(.bottom, 24)
            }
            .navigationTitle("Scan Barcode")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") {
                        scannerService.stopScanning()
                        scannerService.onCodeScanned = nil
                        onClose()
                        dismiss()
                    }
                }
            }
            .onAppear {
                scannerService.onCodeScanned = { code in
                    onScanned(code)
                }
                scannerService.checkAuthorization()
                if scannerService.isAuthorized {
                    scannerService.startScanning()
                }
            }
            .onChange(of: scannerService.isAuthorized) { _, authorized in
                if authorized {
                    scannerService.startScanning()
                }
            }
            .onDisappear {
                scannerService.stopScanning()
                scannerService.onCodeScanned = nil
            }
        }
    }
}

private struct SpotCheckExportPreviewView: View {
    @Environment(\.dismiss) private var dismiss
    let truckName: String
    let rows: [SpotCheckExportRow]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(rows) { row in
                        let renderedBarcode = row.barcodeImage ?? BarcodeRenderService.makeCode128(from: row.barcode)
                        VStack(alignment: .leading, spacing: 6) {
                            Text(row.title)
                                .font(.headline)
                            Text("Barcode: \(row.barcode)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            if let barcodeImage = renderedBarcode {
                                Image(uiImage: barcodeImage)
                                    .resizable()
                                    .interpolation(.none)
                                    .scaledToFit()
                                    .frame(maxWidth: 220, maxHeight: 64, alignment: .leading)
                                    .padding(.top, 2)
                            }
                            Text("Quantity: \(row.quantity)")
                                .font(.subheadline.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                }
                .padding()
            }
            .navigationTitle("Export • \(truckName)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

/// Manual item selector for spot check
struct ManualItemSelector: View {
    @Environment(\.dismiss) private var dismiss
    let items: [InventoryItem]
    let onSelect: (InventoryItem) -> Void
    
    @State private var searchText = ""
    
    var filteredItems: [InventoryItem] {
        if searchText.isEmpty {
            return items
        }
        return items.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }
    
    var body: some View {
        NavigationStack {
            List(filteredItems) { item in
                Button(action: {
                    onSelect(item)
                    dismiss()
                }) {
                    HStack {
                        CachedThumbnailView(
                            imageData: item.pictures.first,
                            cacheKey: "manual-select-\(item.id.uuidString)-\(item.pictures.first?.count ?? 0)",
                            width: 50,
                            height: 50,
                            cornerRadius: 8
                        )
                        
                        Text(item.name)
                            .font(.headline)
                        
                        Spacer()
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Search items")
            .navigationTitle("Select Item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }
}
