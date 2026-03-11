import SwiftUI
import PhotosUI
import SwiftData

/// Add new inventory item with UPC scanning support
/// Includes smart tag suggestions with spell-check
struct AddItemView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    @Query private var allItems: [InventoryItem]
    @Query private var vendors: [Vendor]
    @StateObject private var settings = AppSettings.shared
    @StateObject private var scannerService = BarcodeScannerService()
    private let catalogService = CentralCatalogService.shared
    
    // Basic fields
    @State private var name = ""
    @State private var upc = ""
    @State private var tags: [String] = []
    @State private var currentTag = ""
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var loadedImages: [Data] = []
    
    // Measurement and quantities
    @State private var unit: MeasurementUnit = .pieces
    @State private var customUnit = ""
    @State private var showingCustomUnit = false
    @State private var defaultExpiration = 7
    @State private var defaultPackedExpiration = 7
    @State private var minimumQuantity = ""
    @State private var quantityPerBox = "1"
    @State private var price = ""
    @State private var selectedDepartment = ""
    @State private var selectedDepartmentLocation = ""
    @State private var isPrepackaged = false
    @State private var rewrapsWithUniqueBarcode = false
    @State private var reworkItemCode = ""
    @State private var canBeReworked = false
    @State private var reworkShelfLifeDays = 1
    @State private var maxReworkCount = 1
    
    // Vendor
    @State private var selectedVendor: Vendor?
    
    // UI state
    @State private var showingUPCScanner = false
    @State private var showingTagSuggestion = false
    @State private var suggestedTag = ""
    @State private var originalTagEntry = ""
    @State private var liveTagSuggestion: String?
    @State private var catalogMatch: CatalogProductRecord?
    @State private var catalogLookupMessage: String?
    @State private var isCatalogLookupLoading = false
    @State private var catalogLookupTask: Task<Void, Never>?
    @State private var isSaving = false
    @State private var showAddToCentralCatalogPrompt = false
    @State private var pendingCatalogDraft: PendingCatalogDraft?
    @State private var catalogErrorMessage = ""
    @State private var showCatalogError = false
    @State private var pendingPostSaveItem: InventoryItem?
    @State private var showingPostSaveStockPrompt = false
    @State private var showingShipmentTypePrompt = false
    @State private var quickSpotCheckItem: InventoryItem?
    @State private var showingFullSpotCheckFlow = false
    private let initialUPC: String?

    init(initialUPC: String? = nil) {
        self.initialUPC = initialUPC
        _upc = State(initialValue: initialUPC ?? "")
    }

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? "local-default"
    }

    private var activeStoreId: String {
        settings.normalizedActiveStoreID
    }

    private var canAdjustInventory: Bool {
        session.canPerform(.manageCatalog) || session.canPerform(.manageSettings)
    }

    private var scopedItems: [InventoryItem] {
        allItems.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId)
        }
    }

    private var scopedVendors: [Vendor] {
        vendors.filter { $0.organizationId == activeOrganizationId }
    }
    
    var allExistingTags: [String] {
        TagSuggestionEngine.canonicalTags(from: scopedItems.flatMap { $0.tags })
    }

    private var tagSuggestionPool: [String] {
        TagSuggestionEngine.canonicalTags(from: allExistingTags + tags)
    }

    private var configuredDepartments: [DepartmentConfig] {
        settings.departmentConfigs
    }

    private var configuredLocations: [String] {
        settings.locations(forDepartment: selectedDepartment)
    }

    private var selectedPackagingMode: PackagingMode {
        if rewrapsWithUniqueBarcode {
            return .rewrapped
        }
        if isPrepackaged {
            return .prepackaged
        }
        return .standard
    }

    private var canConfigureRework: Bool {
        selectedPackagingMode != .standard
    }

    private var priceFieldTitle: String {
        if selectedPackagingMode == .rewrapped && settings.rewrapPricingDefaultMode == .byWeight {
            return "Price / lb"
        }
        return "Price"
    }
    
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ContextTipCard(context: .addItem, accentColor: settings.accentColor)
                }
                basicInfoSection
                photosSection
                tagsSection
                packagingSection
                measurementSection
                placementSection
                orderingSection
            }
            .disabled(!canAdjustInventory)
            .navigationTitle("New Item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if canAdjustInventory {
                        Button("Save") {
                            Task { await saveItem() }
                        }
                            .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                            .foregroundStyle(settings.accentColor)
                    }
                }
            }
            .sheet(isPresented: $showingUPCScanner) {
                BarcodeScannerSheet(scannerService: scannerService) { code in
                    upc = code
                }
            }
            .alert("Tag Suggestion", isPresented: $showingTagSuggestion) {
                Button("Use \"\(suggestedTag)\"") {
                    addTagIfNeeded(suggestedTag)
                    currentTag = ""
                    liveTagSuggestion = nil
                }
                Button("Keep \"\(originalTagEntry)\"") {
                    addTagIfNeeded(originalTagEntry)
                    currentTag = ""
                    liveTagSuggestion = nil
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Did you mean \"\(suggestedTag)\"?")
            }
            .onChange(of: selectedPhotos) { _, newValue in
                Task {
                    loadedImages.removeAll()
                    for photo in newValue {
                        if let data = try? await photo.loadTransferable(type: Data.self) {
                            loadedImages.append(ImagePipeline.optimizedPhotoData(from: data))
                        }
                    }
                }
            }
            .onChange(of: selectedDepartment) { _, _ in
                if !configuredLocations.contains(selectedDepartmentLocation) {
                    selectedDepartmentLocation = ""
                }
            }
            .onChange(of: upc) { _, newValue in
                scheduleCatalogLookup(for: newValue)
            }
            .onChange(of: currentTag) { _, newValue in
                handleTagTextChanged(newValue)
            }
            .onAppear {
                if let initialUPC, !initialUPC.isEmpty {
                    scheduleCatalogLookup(for: initialUPC)
                }
            }
            .onDisappear {
                catalogLookupTask?.cancel()
            }
            .alert("Add To Central Catalog?", isPresented: $showAddToCentralCatalogPrompt) {
                Button("Not Now") {
                    pendingCatalogDraft = nil
                    beginPostSaveInventoryPrompt()
                }
                Button("Add") {
                    Task {
                        await addPendingItemToCentralCatalog()
                    }
                }
            } message: {
                if let pendingCatalogDraft {
                    Text("UPC \(pendingCatalogDraft.upc) is new. Add this product to the shared catalog so future adds auto-fill?")
                } else {
                    Text("Add this product to the shared catalog?")
                }
            }
            .alert("Do you already have this product in stock?", isPresented: $showingPostSaveStockPrompt) {
                Button("No") {
                    pendingPostSaveItem = nil
                    dismiss()
                }
                Button("Yes") {
                    showingShipmentTypePrompt = true
                }
            } message: {
                Text("If yes, we can launch Spot Check right now so on-hand quantity and expiration are accurate.")
            }
            .alert("Stock setup", isPresented: $showingShipmentTypePrompt) {
                Button("First Shipment") {
                    quickSpotCheckItem = pendingPostSaveItem
                }
                Button("Already Had Shipments") {
                    showingFullSpotCheckFlow = true
                }
                Button("Cancel", role: .cancel) {
                    pendingPostSaveItem = nil
                    dismiss()
                }
            } message: {
                Text("Choose quick first-shipment entry or open the full Spot Check workflow.")
            }
            .alert("Central Catalog Error", isPresented: $showCatalogError) {
                Button("OK", role: .cancel) {
                    dismiss()
                }
            } message: {
                Text(catalogErrorMessage)
            }
            .sheet(item: $quickSpotCheckItem) { item in
                SpotCheckCountView(
                    item: item,
                    initialBatches: [],
                    initialStockArea: .backOfHouse
                ) {
                    pendingPostSaveItem = nil
                    dismiss()
                }
            }
            .fullScreenCover(isPresented: $showingFullSpotCheckFlow, onDismiss: {
                pendingPostSaveItem = nil
                dismiss()
            }) {
                NavigationStack {
                    SpotCheckView()
                        .toolbar {
                            ToolbarItem(placement: .topBarLeading) {
                                Button("Close") {
                                    showingFullSpotCheckFlow = false
                                }
                            }
                        }
                }
            }
        }
    }
    
    // MARK: - Sections
    
    private var basicInfoSection: some View {
        Section("Basic Information") {
            TextField("Name *", text: $name)
            
            HStack {
                TextField("UPC (Optional)", text: $upc)
                    .keyboardType(.numberPad)
                
                Button(action: { showingUPCScanner = true }) {
                    Image(systemName: "barcode.viewfinder")
                        .foregroundStyle(settings.accentColor)
                }
            }

            if isCatalogLookupLoading {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Looking up central catalog...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else if let catalogMatch {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Catalog match found")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.green)
                    Text(catalogMatch.title)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else if let catalogLookupMessage, !catalogLookupMessage.isEmpty {
                Text(catalogLookupMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
    
    private var photosSection: some View {
        Section("Photos") {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(Array(loadedImages.enumerated()), id: \.offset) { index, imageData in
                        CachedThumbnailView(
                            imageData: imageData,
                            cacheKey: "add-item-preview-\(index)-\(imageData.count)",
                            width: 80,
                            height: 80,
                            cornerRadius: 8
                        )
                    }
                    
                    PhotosPicker(selection: $selectedPhotos, maxSelectionCount: 10, matching: .images) {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(settings.accentColor.opacity(0.1))
                            .frame(width: 80, height: 80)
                            .overlay {
                                Image(systemName: "plus")
                                    .foregroundStyle(settings.accentColor)
                            }
                    }
                }
            }
            .frame(height: 80)
        }
    }
    
    private var tagsSection: some View {
        Section("Tags") {
            if !tags.isEmpty {
                FlowLayout(spacing: 8) {
                    ForEach(Array(tags.enumerated()), id: \.offset) { index, tag in
                        HStack(spacing: 4) {
                            Text(tag)
                            Button(action: { tags.remove(at: index) }) {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.caption)
                            }
                        }
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(settings.accentColor.opacity(0.1))
                        .foregroundStyle(settings.accentColor)
                        .clipShape(Capsule())
                    }
                }
            }
            
            HStack {
                TextField("Add tag", text: $currentTag)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .onSubmit(checkAndAddTag)
                
                Button("Add") { checkAndAddTag() }
                    .disabled(TagSuggestionEngine.cleanedTag(currentTag).isEmpty)
            }

            if let liveTagSuggestion {
                Button {
                    currentTag = liveTagSuggestion
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "sparkles")
                            .font(.caption)
                            .foregroundStyle(settings.accentColor)
                        Text("Suggestion: \(liveTagSuggestion)")
                            .font(.caption)
                        Spacer()
                        Text("Space to autofill")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.plain)
            }
            
            if !allExistingTags.isEmpty {
                Text("Library: \(allExistingTags.prefix(5).joined(separator: ", "))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
    
    private var measurementSection: some View {
        Section("Measurement") {
            Picker("Unit", selection: $unit) {
                ForEach(MeasurementUnit.allCases) { unit in
                    Text(unit.displayName).tag(unit)
                }
            }
            .onChange(of: unit) { _, newValue in
                if newValue == .custom {
                    showingCustomUnit = true
                }
            }
            
            if unit == .custom {
                TextField("Custom unit", text: $customUnit)
            }
            
            HStack {
                Text("Default Expiration (Source)")
                Spacer()
                TextField("Days", value: $defaultExpiration, format: .number)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 60)
                    .roundedInputField(tint: settings.accentColor)
                Text("days").foregroundStyle(.secondary)
            }

            if selectedPackagingMode != .standard {
                HStack {
                    Text("Default Expiration (Packed)")
                    Spacer()
                    TextField("Days", value: $defaultPackedExpiration, format: .number)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 60)
                        .roundedInputField(tint: settings.accentColor)
                    Text("days").foregroundStyle(.secondary)
                }
            }
        }
    }
    
    private var orderingSection: some View {
        Section("Ordering") {
            Picker("Vendor", selection: $selectedVendor) {
                Text("None").tag(nil as Vendor?)
                ForEach(scopedVendors) { vendor in
                    Text(vendor.name).tag(vendor as Vendor?)
                }
            }
            
            HStack {
                Text("Minimum Quantity")
                Spacer()
                TextField("0", text: $minimumQuantity)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 80)
                    .roundedInputField(tint: settings.accentColor)
            }
            
            HStack {
                Text("Qty per Box/Case")
                Spacer()
                TextField("1", text: $quantityPerBox)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 80)
                    .roundedInputField(tint: settings.accentColor)
            }
            
            HStack {
                Text(priceFieldTitle)
                Spacer()
                TextField("0.00", text: $price)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 80)
                    .roundedInputField(tint: settings.accentColor)
            }

            if selectedPackagingMode == .rewrapped {
                Text("Rewrapped pricing default is \(settings.rewrapPricingDefaultMode.title). You can override specific items in Settings > Rewrap Pricing.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var packagingSection: some View {
        Section("Packaging") {
            ForEach(PackagingMode.allCases) { mode in
                Button {
                    setPackagingMode(mode)
                } label: {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(mode.title)
                                .foregroundStyle(.primary)
                            Text(mode.subtitle)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: selectedPackagingMode == mode ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(selectedPackagingMode == mode ? settings.accentColor : .secondary)
                    }
                }
                .buttonStyle(.plain)
            }

            if canConfigureRework {
                if selectedPackagingMode == .rewrapped {
                    HStack {
                        Text("Item Code")
                        Spacer()
                        TextField("Required for scanner match", text: $reworkItemCode)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .multilineTextAlignment(.trailing)
                            .frame(width: 180)
                            .roundedInputField(tint: settings.accentColor)
                    }
                    Text("This code maps rewrapped barcodes to the source item.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                Toggle("Can Be Reworked", isOn: $canBeReworked)

                if canBeReworked {
                    HStack {
                        Text("Reworked Shelf Life")
                        Spacer()
                        TextField("Days", value: $reworkShelfLifeDays, format: .number)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 60)
                            .roundedInputField(tint: settings.accentColor)
                        Text("days")
                            .foregroundStyle(.secondary)
                    }

                    HStack {
                        Text("Max Reworks")
                        Spacer()
                        TextField("Times", value: $maxReworkCount, format: .number)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 60)
                            .roundedInputField(tint: settings.accentColor)
                        Text("times")
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var placementSection: some View {
        Section("Placement") {
            Picker("Department", selection: $selectedDepartment) {
                Text("None").tag("")
                ForEach(configuredDepartments) { department in
                    Text(department.name).tag(department.name)
                }
            }

            if !selectedDepartment.isEmpty {
                if configuredLocations.isEmpty {
                    Text("No locations configured for this department. Add locations in Settings.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Picker("Location", selection: $selectedDepartmentLocation) {
                        Text("None").tag("")
                        ForEach(configuredLocations, id: \.self) { location in
                            Text(location).tag(location)
                        }
                    }
                }
            }
        }
    }
    
    // MARK: - Actions
    
    private func checkAndAddTag() {
        let trimmed = TagSuggestionEngine.cleanedTag(currentTag)
        guard !trimmed.isEmpty else { return }

        if let exact = TagSuggestionEngine.exactCanonicalMatch(
            for: trimmed,
            existingTags: tagSuggestionPool
        ) {
            addTagIfNeeded(exact)
            currentTag = ""
            liveTagSuggestion = nil
            return
        }

        if let similar = TagSuggestionEngine.fuzzySuggestion(
            for: trimmed,
            existingTags: tagSuggestionPool
        ) {
            suggestedTag = similar
            originalTagEntry = trimmed
            showingTagSuggestion = true
            return
        }

        addTagIfNeeded(trimmed)
        currentTag = ""
        liveTagSuggestion = nil
    }

    private func handleTagTextChanged(_ newValue: String) {
        let endedWithWhitespace = newValue.last?.isWhitespace == true
        let cleaned = TagSuggestionEngine.cleanedTag(newValue)

        guard !cleaned.isEmpty else {
            liveTagSuggestion = nil
            return
        }

        liveTagSuggestion = TagSuggestionEngine.prefixSuggestion(
            for: cleaned,
            existingTags: tagSuggestionPool
        )

        guard endedWithWhitespace else { return }

        if let suggestion = liveTagSuggestion {
            currentTag = suggestion
        } else if let exact = TagSuggestionEngine.exactCanonicalMatch(
            for: cleaned,
            existingTags: tagSuggestionPool
        ) {
            currentTag = exact
        } else {
            currentTag = cleaned
        }
        liveTagSuggestion = nil
    }

    private func addTagIfNeeded(_ rawTag: String) {
        let cleaned = TagSuggestionEngine.cleanedTag(rawTag)
        guard !cleaned.isEmpty else { return }
        guard !tags.contains(where: { $0.caseInsensitiveCompare(cleaned) == .orderedSame }) else { return }
        tags.append(cleaned)
    }
    
    private func saveItem() async {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else { return }

        isSaving = true
        let packagingMode = selectedPackagingMode
        let normalizedUPC = catalogService.normalizeUPC(upc)
        let normalizedReworkCode = reworkItemCode
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .filter { $0.isNumber }
        let resolvedReworkItemCode: String? = {
            guard packagingMode == .rewrapped else { return nil }
            if !normalizedReworkCode.isEmpty { return normalizedReworkCode }
            return normalizedUPC.isEmpty ? nil : normalizedUPC
        }()

        let existingCatalogProduct: CatalogProductRecord?
        do {
            existingCatalogProduct = normalizedUPC.isEmpty
                ? nil
                : try await catalogService.product(
                    forUPC: normalizedUPC,
                    organizationId: activeOrganizationId,
                    storeId: activeStoreId
                )
        } catch {
            existingCatalogProduct = nil
        }

        if let existingCatalogProduct {
            catalogMatch = existingCatalogProduct
        }

        let item = InventoryItem(
            name: cleanName,
            upc: normalizedUPC.isEmpty ? nil : normalizedUPC,
            tags: tags,
            pictures: loadedImages,
            defaultExpiration: defaultExpiration,
            defaultPackedExpiration: defaultPackedExpiration,
            vendor: selectedVendor?.organizationId == activeOrganizationId ? selectedVendor : nil,
            minimumQuantity: Double(minimumQuantity) ?? 0,
            quantityPerBox: Int(quantityPerBox) ?? 1,
            department: selectedDepartment.isEmpty ? nil : selectedDepartment,
            departmentLocation: selectedDepartmentLocation.isEmpty ? nil : selectedDepartmentLocation,
            isPrepackaged: packagingMode != .standard,
            rewrapsWithUniqueBarcode: packagingMode == .rewrapped,
            reworkItemCode: resolvedReworkItemCode,
            canBeReworked: packagingMode == .standard ? false : canBeReworked,
            reworkShelfLifeDays: max(1, reworkShelfLifeDays),
            maxReworkCount: max(1, maxReworkCount),
            price: Double(price) ?? 0,
            unit: unit == .custom && !customUnit.isEmpty ? unit : unit,
            organizationId: activeOrganizationId,
            storeId: activeStoreId
        )
        
        modelContext.insert(item)
        try? modelContext.save()
        syncInventorySnapshot()
        pendingPostSaveItem = item

        if normalizedUPC.isEmpty, session.canPerform(.manageCatalog) {
            await syncCompanyCatalogForNoUPC(
                title: cleanName,
                tags: tags,
                price: Double(price) ?? 0,
                casePack: Int(quantityPerBox) ?? 1,
                defaultExpiration: defaultExpiration,
                defaultPackedExpiration: defaultPackedExpiration,
                vendorName: selectedVendor?.name,
                department: selectedDepartment.isEmpty ? nil : selectedDepartment,
                departmentLocation: selectedDepartmentLocation.isEmpty ? nil : selectedDepartmentLocation,
                unitRaw: unit.rawValue,
                minimumQuantity: Double(minimumQuantity) ?? 0,
                isPrepackaged: packagingMode != .standard,
                rewrapsWithUniqueBarcode: packagingMode == .rewrapped,
                canBeReworked: packagingMode == .standard ? false : canBeReworked,
                reworkShelfLifeDays: max(1, reworkShelfLifeDays),
                maxReworkCount: max(1, maxReworkCount),
                thumbnailData: loadedImages.first
            )
        }

        if !normalizedUPC.isEmpty, session.canPerform(.manageCatalog) {
            let draft = PendingCatalogDraft(
                upc: normalizedUPC,
                title: cleanName,
                tags: tags,
                price: Double(price) ?? 0,
                casePack: Int(quantityPerBox) ?? 1,
                defaultExpiration: defaultExpiration,
                defaultPackedExpiration: defaultPackedExpiration,
                vendorName: selectedVendor?.name,
                department: selectedDepartment.isEmpty ? nil : selectedDepartment,
                departmentLocation: selectedDepartmentLocation.isEmpty ? nil : selectedDepartmentLocation,
                unitRaw: unit.rawValue,
                minimumQuantity: Double(minimumQuantity) ?? 0,
                isPrepackaged: packagingMode != .standard,
                rewrapsWithUniqueBarcode: packagingMode == .rewrapped,
                canBeReworked: packagingMode == .standard ? false : canBeReworked,
                reworkShelfLifeDays: max(1, reworkShelfLifeDays),
                maxReworkCount: max(1, maxReworkCount),
                storeId: activeStoreId,
                thumbnailData: loadedImages.first
            )

            await syncCatalogLayers(draft: draft, publishToGlobal: false)

            if existingCatalogProduct == nil {
                pendingCatalogDraft = draft
                showAddToCentralCatalogPrompt = true
                isSaving = false
                return
            }
        }

        isSaving = false
        beginPostSaveInventoryPrompt()
    }

    private func scheduleCatalogLookup(for rawUPC: String) {
        catalogLookupTask?.cancel()
        catalogLookupMessage = nil
        let normalizedUPC = catalogService.normalizeUPC(rawUPC)

        guard !normalizedUPC.isEmpty else {
            catalogMatch = nil
            isCatalogLookupLoading = false
            return
        }

        catalogLookupTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            await lookupCatalog(upc: normalizedUPC)
        }
    }

    @MainActor
    private func lookupCatalog(upc: String) async {
        isCatalogLookupLoading = true
        defer { isCatalogLookupLoading = false }

        do {
            guard let product = try await catalogService.product(
                forUPC: upc,
                organizationId: activeOrganizationId,
                storeId: activeStoreId
            ) else {
                catalogMatch = nil
                catalogLookupMessage = "No central catalog match yet."
                return
            }

            catalogMatch = product
            catalogLookupMessage = "Filled from central catalog."
            applyCatalogPrefill(product)
        } catch {
            catalogLookupMessage = "Central catalog lookup unavailable right now."
        }
    }

    private func applyCatalogPrefill(_ product: CatalogProductRecord) {
        if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            name = product.title
        }

        if tags.isEmpty {
            tags = product.tags
        }

        if (Double(price) ?? 0) <= 0 {
            price = String(format: "%.2f", product.price)
        }

        let currentCasePack = Int(quantityPerBox) ?? 1
        if currentCasePack <= 1 {
            quantityPerBox = String(max(1, product.casePack))
        }

        if defaultExpiration <= 1 || defaultExpiration == 7 {
            defaultExpiration = max(1, product.defaultExpiration)
        }
        if defaultPackedExpiration <= 1 || defaultPackedExpiration == 7 {
            defaultPackedExpiration = max(1, product.defaultPackedExpiration)
        }

        if (Double(minimumQuantity) ?? 0) <= 0 {
            minimumQuantity = product.minimumQuantity.formattedQuantity(maximumFractionDigits: 3)
        }

        if selectedDepartment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           let department = product.department {
            selectedDepartment = department
        }

        if selectedDepartmentLocation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           let location = product.departmentLocation {
            selectedDepartmentLocation = location
        }

        if selectedVendor == nil, let vendorName = product.vendorName {
            selectedVendor = scopedVendors.first {
                $0.name.caseInsensitiveCompare(vendorName) == .orderedSame
            }
        }

        if unit == .pieces, let prefUnit = MeasurementUnit(rawValue: product.unitRaw) {
            unit = prefUnit
        }

        if product.rewrapsWithUniqueBarcode {
            setPackagingMode(.rewrapped)
        } else if product.isPrepackaged {
            setPackagingMode(.prepackaged)
        }

        canBeReworked = product.canBeReworked
        reworkShelfLifeDays = max(1, product.reworkShelfLifeDays)
        maxReworkCount = max(1, product.maxReworkCount)
        if reworkItemCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            reworkItemCode = product.upc ?? ""
        }

        if loadedImages.isEmpty, let thumbnail = product.thumbnailData {
            loadedImages = [thumbnail]
        }
    }

    private func setPackagingMode(_ mode: PackagingMode) {
        switch mode {
        case .standard:
            isPrepackaged = false
            rewrapsWithUniqueBarcode = false
            canBeReworked = false
            reworkItemCode = ""
        case .prepackaged:
            isPrepackaged = true
            rewrapsWithUniqueBarcode = false
            reworkItemCode = ""
        case .rewrapped:
            isPrepackaged = true
            rewrapsWithUniqueBarcode = true
            if reworkItemCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                reworkItemCode = upc.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
    }

    @MainActor
    private func addPendingItemToCentralCatalog() async {
        guard let pendingCatalogDraft else {
            beginPostSaveInventoryPrompt()
            return
        }
        await syncCatalogLayers(draft: pendingCatalogDraft, publishToGlobal: true)
        if !showCatalogError {
            self.pendingCatalogDraft = nil
            beginPostSaveInventoryPrompt()
        }
    }

    @MainActor
    private func syncCatalogLayers(draft: PendingCatalogDraft, publishToGlobal: Bool) async {
        do {
            _ = try await catalogService.upsertProduct(
                upc: draft.upc,
                title: draft.title,
                tags: draft.tags,
                price: draft.price,
                casePack: draft.casePack,
                thumbnailData: draft.thumbnailData,
                editorUid: session.firebaseUser?.id,
                editorOrganizationId: session.activeOrganizationId,
                hasPermission: session.canPerform(.manageCatalog),
                defaultExpiration: draft.defaultExpiration,
                defaultPackedExpiration: draft.defaultPackedExpiration,
                vendorName: draft.vendorName,
                department: draft.department,
                departmentLocation: draft.departmentLocation,
                unitRaw: draft.unitRaw,
                minimumQuantity: draft.minimumQuantity,
                storeDepartment: draft.department,
                storeDepartmentLocation: draft.departmentLocation,
                storeId: draft.storeId,
                isPrepackaged: draft.isPrepackaged,
                rewrapsWithUniqueBarcode: draft.rewrapsWithUniqueBarcode,
                canBeReworked: draft.canBeReworked,
                reworkShelfLifeDays: draft.reworkShelfLifeDays,
                maxReworkCount: draft.maxReworkCount,
                updateGlobalCatalog: publishToGlobal
            )
        } catch {
            if publishToGlobal {
                catalogErrorMessage = error.localizedDescription
                showCatalogError = true
            }
        }
    }

    @MainActor
    private func syncCompanyCatalogForNoUPC(
        title: String,
        tags: [String],
        price: Double,
        casePack: Int,
        defaultExpiration: Int,
        defaultPackedExpiration: Int,
        vendorName: String?,
        department: String?,
        departmentLocation: String?,
        unitRaw: String,
        minimumQuantity: Double,
        isPrepackaged: Bool,
        rewrapsWithUniqueBarcode: Bool,
        canBeReworked: Bool,
        reworkShelfLifeDays: Int,
        maxReworkCount: Int,
        thumbnailData: Data?
    ) async {
        _ = try? await catalogService.upsertCompanyProductWithoutUPC(
            title: title,
            tags: tags,
            price: price,
            casePack: casePack,
            defaultExpiration: defaultExpiration,
            defaultPackedExpiration: defaultPackedExpiration,
            vendorName: vendorName,
            department: department,
            departmentLocation: departmentLocation,
            unitRaw: unitRaw,
            minimumQuantity: minimumQuantity,
            isPrepackaged: isPrepackaged,
            rewrapsWithUniqueBarcode: rewrapsWithUniqueBarcode,
            canBeReworked: canBeReworked,
            reworkShelfLifeDays: reworkShelfLifeDays,
            maxReworkCount: maxReworkCount,
            thumbnailData: thumbnailData,
            editorUid: session.firebaseUser?.id,
            editorOrganizationId: activeOrganizationId,
            storeId: activeStoreId,
            hasPermission: session.canPerform(.manageCatalog)
        )
    }

    @MainActor
    private func beginPostSaveInventoryPrompt() {
        showingPostSaveStockPrompt = pendingPostSaveItem != nil
    }

    private func syncInventorySnapshot() {
        guard !activeOrganizationId.isEmpty else { return }
        Task { @MainActor in
            try? await InventoryStateSyncService.shared.syncFullSnapshot(
                organizationId: activeOrganizationId,
                modelContext: modelContext
            )
        }
    }
}

private struct PendingCatalogDraft {
    var upc: String
    var title: String
    var tags: [String]
    var price: Double
    var casePack: Int
    var defaultExpiration: Int
    var defaultPackedExpiration: Int
    var vendorName: String?
    var department: String?
    var departmentLocation: String?
    var unitRaw: String
    var minimumQuantity: Double
    var isPrepackaged: Bool
    var rewrapsWithUniqueBarcode: Bool
    var canBeReworked: Bool
    var reworkShelfLifeDays: Int
    var maxReworkCount: Int
    var storeId: String
    var thumbnailData: Data?
}

private enum PackagingMode: String, CaseIterable, Identifiable {
    case standard
    case prepackaged
    case rewrapped

    var id: String { rawValue }

    var title: String {
        switch self {
        case .standard:
            return "Standard"
        case .prepackaged:
            return "Repacked"
        case .rewrapped:
            return "Rewrapped"
        }
    }

    var subtitle: String {
        switch self {
        case .standard:
            return "No prep package workflow"
        case .prepackaged:
            return "Shows in Chop Items"
        case .rewrapped:
            return "Shows in Chop Items and requires unique barcode"
        }
    }
}
