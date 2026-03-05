import SwiftUI
import SwiftData
#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif
#if canImport(FirebaseCore)
import FirebaseCore
#endif

struct ChopUpView: View {
    @EnvironmentObject private var session: AccountSessionStore
    @Query(filter: #Predicate<InventoryItem> { !$0.isArchived }) private var items: [InventoryItem]
    @StateObject private var settings = AppSettings.shared
    @State private var selectedItem: InventoryItem?
    @State private var showingReworkFlow = false

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? "local-default"
    }

    private var prepackagedItems: [InventoryItem] {
        let storeId = settings.normalizedActiveStoreID
        return items
            .filter {
                $0.organizationId == activeOrganizationId &&
                $0.belongsToStore(storeId) &&
                $0.isPrepackaged
            }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private var reworkableItems: [InventoryItem] {
        prepackagedItems.filter { $0.canBeReworked }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ContextTipCard(context: .home, accentColor: settings.accentColor, label: "Prep Tip")
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                        .listRowBackground(Color.clear)
                }

                Section("Rework") {
                    Button {
                        showingReworkFlow = true
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "arrow.triangle.2.circlepath.circle.fill")
                                .font(.title3)
                                .foregroundStyle(settings.accentColor)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Rework Item")
                                    .font(.headline)
                                    .foregroundStyle(.primary)
                                Text("Scan wrapped barcode and issue a new barcode.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(reworkableItems.isEmpty)

                    if reworkableItems.isEmpty {
                        Text("Enable “Can Be Reworked” in item packaging settings to use rework.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                if prepackagedItems.isEmpty {
                    ContentUnavailableView(
                        "No Prepackaged Items",
                        systemImage: "scissors",
                        description: Text("Mark items as prepackaged in Add Item or Item Detail to use Chop.")
                    )
                } else {
                    ForEach(prepackagedItems) { item in
                        Button {
                            selectedItem = item
                        } label: {
                            HStack(spacing: 12) {
                                CachedThumbnailView(
                                    imageData: item.pictures.first,
                                    cacheKey: "chop-list-\(item.id.uuidString)-\(item.pictures.first?.count ?? 0)",
                                    width: 54,
                                    height: 54,
                                    cornerRadius: 10
                                )

                                VStack(alignment: .leading, spacing: 3) {
                                    Text(item.name)
                                        .font(.headline)
                                        .foregroundStyle(.primary)

                                    Text("\(item.totalQuantity.formattedQuantity()) \(item.unit.rawValue) on hand")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)

                                    if item.rewrapsWithUniqueBarcode {
                                        Label("Unique barcode required", systemImage: "barcode.viewfinder")
                                            .font(.caption2)
                                            .foregroundStyle(settings.accentColor)
                                    }
                                }

                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Chop Items")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(item: $selectedItem) { item in
                ChopPackageEntryView(item: item)
            }
            .sheet(isPresented: $showingReworkFlow) {
                ChopReworkView(items: reworkableItems)
            }
        }
    }
}

private struct ChopPackageEntryView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @Bindable var item: InventoryItem
    @StateObject private var settings = AppSettings.shared
    @StateObject private var scannerService = BarcodeScannerService()

    @State private var sourceBatchID: UUID?
    @State private var packageBarcode = ""
    @State private var packageWeightText = ""
    @State private var packagePricePerPoundText = ""
    @State private var manualPackagePriceText = ""
    @State private var packageExpiration = Date()
    @State private var showingScanner = false
    @State private var showingValidationError = false
    @State private var validationMessage = ""
    @State private var showingSavedToast = false

    private var sourceBatches: [Batch] {
        item.batches
            .filter { $0.quantity > 0 }
            .sorted { $0.expirationDate < $1.expirationDate }
    }

    private var selectedSourceBatch: Batch? {
        guard let sourceBatchID else { return sourceBatches.first }
        return sourceBatches.first(where: { $0.id == sourceBatchID })
    }

    private var rewrapPricingMode: RewrapPricingMode {
        settings.rewrapPricingMode(forItemID: item.id, organizationId: item.organizationId)
    }

    private var usesWeightPricingForRewrap: Bool {
        item.rewrapsWithUniqueBarcode && rewrapPricingMode == .byWeight
    }

    private var parsedPackageWeight: Double? {
        Double(packageWeightText.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private var effectivePricePerPound: Double {
        if let typed = Double(packagePricePerPoundText.trimmingCharacters(in: .whitespacesAndNewlines)), typed >= 0 {
            return typed
        }
        return max(0, item.price)
    }

    private var computedPackagePrice: Double {
        guard let weight = parsedPackageWeight, weight > 0 else { return 0 }
        return effectivePricePerPound * weight
    }

    private func suggestedPackedExpirationDate() -> Date {
        Calendar.current.date(
            byAdding: .day,
            value: item.effectiveDefaultPackedExpiration,
            to: Date()
        ) ?? Date()
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Item") {
                    HStack {
                        CachedThumbnailView(
                            imageData: item.pictures.first,
                            cacheKey: "chop-detail-\(item.id.uuidString)-\(item.pictures.first?.count ?? 0)",
                            width: 56,
                            height: 56,
                            cornerRadius: 10
                        )
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.name)
                                .font(.headline)
                            Text("\(item.totalQuantity.formattedQuantity()) \(item.unit.rawValue) available")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section("Source Batch") {
                    if sourceBatches.isEmpty {
                        Text("No stock available to package.")
                            .foregroundStyle(.secondary)
                    } else {
                        Picker("Use quantity from", selection: sourceBatchBinding) {
                            ForEach(sourceBatches) { batch in
                                Text("\(batch.quantity.formattedQuantity()) \(item.unit.rawValue) • \(batch.expirationDate.formatted(date: .abbreviated, time: .omitted))")
                                    .tag(batch.id)
                            }
                        }
                    }
                }

                Section("Package Details") {
                    HStack(spacing: 8) {
                        TextField(
                            item.rewrapsWithUniqueBarcode ? "Package barcode (required)" : "Package barcode (optional)",
                            text: $packageBarcode
                        )
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                        Button {
                            showingScanner = true
                        } label: {
                            Image(systemName: "barcode.viewfinder")
                                .foregroundStyle(settings.accentColor)
                        }
                    }

                    HStack(spacing: 8) {
                        TextField("Weight (e.g. 1.250)", text: $packageWeightText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .roundedInputField(tint: settings.accentColor)
                        Text(item.unit.rawValue)
                            .foregroundStyle(.secondary)
                    }

                    if item.rewrapsWithUniqueBarcode {
                        HStack {
                            Text("Pricing Mode")
                            Spacer()
                            Text(rewrapPricingMode.title)
                                .foregroundStyle(.secondary)
                        }

                        if usesWeightPricingForRewrap {
                            HStack {
                                Text("Price / lb")
                                Spacer()
                                TextField("0.00", text: $packagePricePerPoundText)
                                    .keyboardType(.decimalPad)
                                    .multilineTextAlignment(.trailing)
                                    .frame(width: 110)
                                    .roundedInputField(tint: settings.accentColor)
                            }
                            HStack {
                                Text("Package Price")
                                Spacer()
                                Text("$\(computedPackagePrice, specifier: "%.2f")")
                                    .fontWeight(.semibold)
                                    .foregroundStyle(settings.accentColor)
                            }
                        } else {
                            HStack(spacing: 8) {
                                Text("Package Price")
                                Spacer()
                                TextField("0.00", text: $manualPackagePriceText)
                                    .keyboardType(.decimalPad)
                                    .multilineTextAlignment(.trailing)
                                    .frame(width: 110)
                                    .roundedInputField(tint: settings.accentColor)
                            }
                        }
                    }

                    DatePicker("Expiration", selection: $packageExpiration, displayedComponents: .date)
                    Text("Default packed expiration: \(item.effectiveDefaultPackedExpiration) day(s) from today.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Button {
                        savePackage()
                    } label: {
                        Text("Save Packaged Item")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(sourceBatches.isEmpty)
                }
            }
            .navigationTitle("Package Item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(isPresented: $showingScanner) {
                BarcodeScannerSheet(scannerService: scannerService) { scanned in
                    packageBarcode = scanned.trimmingCharacters(in: .whitespacesAndNewlines)
                }
            }
            .alert("Can’t Save Package", isPresented: $showingValidationError) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(validationMessage)
            }
            .alert("Saved", isPresented: $showingSavedToast) {
                Button("OK", role: .cancel) { }
            } message: {
                Text("Packaged item saved and inventory updated.")
            }
            .onAppear {
                if sourceBatchID == nil {
                    sourceBatchID = sourceBatches.first?.id
                }
                packageExpiration = suggestedPackedExpirationDate()
                if packagePricePerPoundText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    packagePricePerPoundText = String(format: "%.2f", max(0, item.price))
                }
            }
        }
    }

    private var sourceBatchBinding: Binding<UUID> {
        Binding<UUID>(
            get: { sourceBatchID ?? sourceBatches.first?.id ?? UUID() },
            set: { sourceBatchID = $0 }
        )
    }

    private func savePackage() {
        guard let source = selectedSourceBatch else {
            validationMessage = "Pick a source batch first."
            showingValidationError = true
            return
        }

        let trimmedBarcode = packageBarcode.trimmingCharacters(in: .whitespacesAndNewlines)
        if item.rewrapsWithUniqueBarcode && trimmedBarcode.isEmpty {
            validationMessage = "This item requires a unique package barcode."
            showingValidationError = true
            return
        }

        guard let packageWeight = Double(packageWeightText), packageWeight > 0 else {
            validationMessage = "Enter a valid package weight."
            showingValidationError = true
            return
        }

        if packageWeight > source.quantity {
            validationMessage = "Package weight can’t exceed source batch quantity."
            showingValidationError = true
            return
        }

        let packagePrice: Double?
        if item.rewrapsWithUniqueBarcode {
            if usesWeightPricingForRewrap {
                guard effectivePricePerPound >= 0 else {
                    validationMessage = "Enter a valid price per pound."
                    showingValidationError = true
                    return
                }
                packagePrice = effectivePricePerPound * packageWeight
            } else {
                guard let manualPrice = Double(manualPackagePriceText), manualPrice >= 0 else {
                    validationMessage = "Enter a valid package price."
                    showingValidationError = true
                    return
                }
                packagePrice = manualPrice
            }
        } else {
            packagePrice = nil
        }

        source.quantity -= packageWeight
        if source.quantity <= 0.000_1 {
            item.batches.removeAll { $0.id == source.id }
        }

        let packageBatch = Batch(
            quantity: packageWeight,
            expirationDate: packageExpiration,
            receivedDate: Date(),
            packageBarcode: trimmedBarcode.isEmpty ? nil : trimmedBarcode,
            packageWeight: packageWeight,
            packagePrice: packagePrice,
            organizationId: item.organizationId,
            storeId: item.storeId
        )
        packageBatch.item = item
        item.batches.append(packageBatch)
        item.lastModified = Date()
        item.revision += 1
        try? modelContext.save()

        packageWeightText = ""
        packageBarcode = ""
        packagePricePerPoundText = ""
        manualPackagePriceText = ""
        sourceBatchID = sourceBatches.first?.id
        showingSavedToast = true
    }
}

private struct ChopReworkView: View {
    private enum ReworkEntryMode: String, CaseIterable, Identifiable {
        case quickScan = "Scan Only"
        case manual = "Manual Review"

        var id: String { rawValue }
    }

    private struct ReworkedBarcodeRule {
        var enabled: Bool = false
        var productCodeLength: Int = 6
        var encodedPriceLength: Int = 5
        var trailingDigitsLength: Int = 1
        var priceDivisor: Int = 100

        static let `default` = ReworkedBarcodeRule()

        init() {}

        init(dictionary: [String: Any]) {
            enabled = dictionary["enabled"] as? Bool ?? false
            productCodeLength = max(1, dictionary["productCodeLength"] as? Int ?? 6)
            encodedPriceLength = max(1, dictionary["encodedPriceLength"] as? Int ?? 5)
            trailingDigitsLength = max(0, dictionary["trailingDigitsLength"] as? Int ?? 1)
            priceDivisor = max(1, dictionary["priceDivisor"] as? Int ?? 100)
        }

        var minimumBarcodeLength: Int {
            productCodeLength + encodedPriceLength + trailingDigitsLength
        }
    }

    private struct ParsedReworkedBarcode {
        let barcode: String
        let productCode: String
        let encodedPrice: String
        let packagePrice: Double
        let trailingDigits: String?
    }

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    let items: [InventoryItem]
    @StateObject private var settings = AppSettings.shared
    @StateObject private var scannerService = BarcodeScannerService()

    @State private var entryMode: ReworkEntryMode = .quickScan
    @State private var showingScanner = false
    @State private var scannedBarcode = ""
    @State private var selectedItemID: UUID?
    @State private var packageWeightText = ""
    @State private var packagePriceText = ""
    @State private var newExpirationDate = Date()
    @State private var parserRule = ReworkedBarcodeRule.default
    @State private var parsedTrailingDigits: String?
    @State private var parsedProductCode = ""
    @State private var ruleLoaded = false
    @State private var showingError = false
    @State private var errorMessage = ""
    @State private var showingSaved = false
    @State private var savedMessage = ""

    private var selectedItem: InventoryItem? {
        guard let selectedItemID else { return nil }
        return items.first(where: { $0.id == selectedItemID })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Rework Entry") {
                    Picker("Mode", selection: $entryMode) {
                        ForEach(ReworkEntryMode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)

                    Text(entryMode == .quickScan
                         ? "Scan a reworked label and add it instantly."
                         : "Scan barcode, review values, then save.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Barcode") {
                    Button {
                        showingScanner = true
                    } label: {
                        Label(scannedBarcode.isEmpty ? "Scan Barcode" : "Scan Again", systemImage: "barcode.viewfinder")
                    }

                    TextField("Scan or enter barcode", text: $scannedBarcode)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit {
                            parseBarcodeAndPrepareSave(autoSave: entryMode == .quickScan)
                        }

                    if entryMode == .manual {
                        Button("Parse Barcode") {
                            parseBarcodeAndPrepareSave(autoSave: false)
                        }
                    }

                    if !scannedBarcode.isEmpty {
                        Text("Barcode: \(scannedBarcode)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                if let item = selectedItem {
                    Section("Parsed Item") {
                        HStack(spacing: 12) {
                            CachedThumbnailView(
                                imageData: item.pictures.first,
                                cacheKey: "rework-\(item.id.uuidString)-\(item.pictures.first?.count ?? 0)",
                                width: 56,
                                height: 56,
                                cornerRadius: 10
                            )
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.name)
                                    .font(.headline)
                                Text("Product code: \(parsedProductCode)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                if let trailing = parsedTrailingDigits, !trailing.isEmpty {
                                    Text("Trailing digit(s): \(trailing)")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }

                        HStack {
                            Text("Price")
                            Spacer()
                            TextField("0.00", text: $packagePriceText)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 120)
                                .roundedInputField(tint: settings.accentColor)
                        }

                        HStack {
                            Text("Weight")
                            Spacer()
                            TextField("0", text: $packageWeightText)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 120)
                                .roundedInputField(tint: settings.accentColor)
                            Text(item.unit.rawValue)
                                .foregroundStyle(.secondary)
                        }

                        DatePicker("Expiration", selection: $newExpirationDate, displayedComponents: .date)
                        Text("Default rework shelf life: \(item.effectiveReworkShelfLifeDays) day(s).")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }

                    if entryMode == .manual {
                        Section {
                            Button("Add Reworked Item") {
                                saveReworkedItem()
                            }
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                        }
                    }
                } else {
                    Section {
                        Text("Scan a reworked barcode to decode item, price, and weight.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Rework")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                }
            }
            .task {
                await loadReworkedBarcodeRule()
            }
            .sheet(isPresented: $showingScanner) {
                BarcodeScannerSheet(scannerService: scannerService) { scanned in
                    scannedBarcode = scanned.replacingOccurrences(of: " ", with: "")
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    parseBarcodeAndPrepareSave(autoSave: entryMode == .quickScan)
                }
            }
            .alert("Rework Error", isPresented: $showingError) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(errorMessage)
            }
            .alert("Saved", isPresented: $showingSaved) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(savedMessage)
            }
        }
    }

    private func loadReworkedBarcodeRule() async {
        guard !ruleLoaded else { return }
        defer { ruleLoaded = true }

        let organizationId = session.activeOrganizationId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let storeId = settings.normalizedActiveStoreID
        guard !organizationId.isEmpty else { return }

#if canImport(FirebaseFirestore) && canImport(FirebaseCore)
        guard FirebaseApp.app() != nil else { return }
        let db = Firestore.firestore()

        if !storeId.isEmpty,
           let settingsSnapshot = try? await db.collectionGroup("settings")
            .whereField("organizationId", isEqualTo: organizationId)
            .whereField("storeId", isEqualTo: storeId)
            .limit(to: 1)
            .getDocuments(),
           let storeSettings = settingsSnapshot.documents.first,
           let ruleData = storeSettings.data()["reworkedBarcodeRule"] as? [String: Any] {
            parserRule = ReworkedBarcodeRule(dictionary: ruleData)
            return
        }

        if let orgSettingsDoc = try? await db.collection("organizations")
            .document(organizationId)
            .collection("settings")
            .document("default")
            .getDocument(),
           let data = orgSettingsDoc.data(),
           let ruleData = data["reworkedBarcodeRule"] as? [String: Any] {
            parserRule = ReworkedBarcodeRule(dictionary: ruleData)
        }
#endif
    }

    private func parseBarcodeAndPrepareSave(autoSave: Bool) {
        let normalizedBarcode = scannedBarcode.numericCharactersOnly
        guard !normalizedBarcode.isEmpty else {
            errorMessage = "Scan or enter a barcode first."
            showingError = true
            return
        }

        let parsedRule = parserRule.enabled ? parserRule : ReworkedBarcodeRule.default
        guard normalizedBarcode.count >= parsedRule.minimumBarcodeLength else {
            errorMessage = "Barcode is too short for this store rule. Expected at least \(parsedRule.minimumBarcodeLength) digits."
            showingError = true
            return
        }

        guard let parsed = parseReworkedBarcode(normalizedBarcode, with: parsedRule) else {
            errorMessage = "Could not parse that barcode with the current store rule."
            showingError = true
            return
        }

        guard let matchedItem = findItem(forProductCode: parsed.productCode) else {
            errorMessage = "No rework-eligible item found for product code \(parsed.productCode)."
            showingError = true
            return
        }

        let derivedWeight = derivePackageWeight(for: matchedItem, packagePrice: parsed.packagePrice)
        selectedItemID = matchedItem.id
        scannedBarcode = parsed.barcode
        parsedProductCode = parsed.productCode
        parsedTrailingDigits = parsed.trailingDigits
        packagePriceText = String(format: "%.2f", parsed.packagePrice)
        packageWeightText = derivedWeight.formattedQuantity(maximumFractionDigits: 3)
        newExpirationDate = Calendar.current.date(
            byAdding: .day,
            value: matchedItem.effectiveReworkShelfLifeDays,
            to: Date()
        ) ?? Date()

        if autoSave {
            saveReworkedItem()
        }
    }

    private func parseReworkedBarcode(_ barcode: String, with rule: ReworkedBarcodeRule) -> ParsedReworkedBarcode? {
        let productEnd = barcode.index(barcode.startIndex, offsetBy: rule.productCodeLength)
        let priceEnd = barcode.index(productEnd, offsetBy: rule.encodedPriceLength)
        let productCode = String(barcode[barcode.startIndex..<productEnd])
        let encodedPrice = String(barcode[productEnd..<priceEnd])
        let trailingDigits = rule.trailingDigitsLength > 0 && priceEnd < barcode.endIndex
            ? String(barcode[priceEnd...])
            : nil
        guard let rawPrice = Int(encodedPrice) else { return nil }
        let packagePrice = Double(rawPrice) / Double(rule.priceDivisor)
        return ParsedReworkedBarcode(
            barcode: barcode,
            productCode: productCode,
            encodedPrice: encodedPrice,
            packagePrice: packagePrice,
            trailingDigits: trailingDigits
        )
    }

    private func findItem(forProductCode productCode: String) -> InventoryItem? {
        let normalizedProductCode = productCode.numericCharactersOnly
        guard !normalizedProductCode.isEmpty else { return nil }
        return items.first(where: { item in
            guard item.canBeReworked else { return false }
            let upc = (item.upc ?? "").numericCharactersOnly
            guard !upc.isEmpty else { return false }
            return upc.hasPrefix(normalizedProductCode) || normalizedProductCode.hasPrefix(upc)
        })
    }

    private func derivePackageWeight(for item: InventoryItem, packagePrice: Double) -> Double {
        if item.unit == .pounds {
            let pricePerPound = max(0, item.price)
            if pricePerPound > 0 {
                return max(0.001, packagePrice / pricePerPound)
            }
        }
        return 1
    }

    private func saveReworkedItem() {
        guard let item = selectedItem else {
            errorMessage = "Scan a reworked item barcode first."
            showingError = true
            return
        }

        let normalizedBarcode = scannedBarcode.numericCharactersOnly
        guard !normalizedBarcode.isEmpty else {
            errorMessage = "A barcode is required."
            showingError = true
            return
        }

        guard let packagePrice = Double(packagePriceText), packagePrice >= 0 else {
            errorMessage = "Enter a valid package price."
            showingError = true
            return
        }

        guard let packageWeight = Double(packageWeightText), packageWeight > 0 else {
            errorMessage = "Enter a valid package weight."
            showingError = true
            return
        }

        let previousReworkCount = item.batches
            .filter { ($0.packageBarcode ?? "").numericCharactersOnly == normalizedBarcode }
            .map(\.reworkCount)
            .max() ?? 0
        let nextReworkCount = max(1, previousReworkCount + 1)
        guard nextReworkCount <= item.effectiveMaxReworkCount else {
            errorMessage = "\(item.name) has already reached max reworks (\(item.effectiveMaxReworkCount)). Discard instead."
            showingError = true
            return
        }

        let batch = Batch(
            quantity: packageWeight,
            expirationDate: newExpirationDate,
            receivedDate: Date(),
            packageBarcode: normalizedBarcode,
            packageWeight: packageWeight,
            packagePrice: packagePrice,
            reworkCount: nextReworkCount,
            stockArea: .frontOfHouse,
            organizationId: item.organizationId,
            storeId: item.storeId
        )
        batch.item = item
        item.batches.append(batch)
        item.rewrapsWithUniqueBarcode = true
        item.canBeReworked = true
        item.lastModified = Date()
        item.revision += 1
        try? modelContext.save()

        savedMessage = "\(item.name) saved as reworked item."
        showingSaved = true

        if entryMode == .quickScan {
            selectedItemID = nil
            scannedBarcode = ""
            packageWeightText = ""
            packagePriceText = ""
            parsedProductCode = ""
            parsedTrailingDigits = nil
        }
    }
}

private extension String {
    var numericCharactersOnly: String {
        filter(\.isNumber)
    }
}
