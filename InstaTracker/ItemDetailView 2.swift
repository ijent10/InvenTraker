import SwiftUI
import PhotosUI
import SwiftData

/// Detailed view of an inventory item
/// Fully scrollable to access all options including archive/sale
/// Batches are labeled as "Stock"
struct ItemDetailView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: AccountSessionStore
    @Query private var vendors: [Vendor]
    @Bindable var item: InventoryItem
    @StateObject private var settings = AppSettings.shared
    private let catalogService = CentralCatalogService.shared
    
    @State private var isEditing = false
    @State private var showingDeleteAlert = false
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var draftName = ""
    @State private var draftUPC = ""
    @State private var draftTags: [String] = []
    @State private var draftTagText = ""
    @State private var showingTagSuggestion = false
    @State private var suggestedTag = ""
    @State private var originalTagEntry = ""
    @State private var liveTagSuggestion: String?
    @State private var draftVendorID: UUID?
    @State private var draftMinimumQuantity = ""
    @State private var draftQuantityPerBox = ""
    @State private var draftPrice = ""
    @State private var draftHasExpiration = true
    @State private var draftDefaultExpiration = ""
    @State private var draftDefaultPackedExpiration = ""
    @State private var draftUnit: MeasurementUnit = .pieces
    @State private var draftDepartment = ""
    @State private var draftDepartmentLocation = ""
    @State private var draftIsPrepackaged = false
    @State private var draftRewrapsWithUniqueBarcode = false
    @State private var draftReworkItemCode = ""
    @State private var draftCanBeReworked = false
    @State private var draftReworkShelfLifeDays = ""
    @State private var draftMaxReworkCount = ""
    @State private var pendingCentralPublishUPC = ""
    @State private var showingCentralPublishPrompt = false
    @State private var shareURL: URL?
    @State private var isPreparingShareURL = false
    @State private var showPhotos = false
    @State private var pendingInventoryUploadTask: Task<Void, Never>?

    private var configuredDepartments: [DepartmentConfig] {
        settings.departmentConfigs
    }

    private var configuredLocations: [String] {
        settings.locations(forDepartment: draftDepartment)
    }

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? item.organizationId
    }

    private var canAdjustInventory: Bool {
        session.canPerform(.manageCatalog) || session.canPerform(.manageSettings)
    }

    private var currentRewrapPricingMode: RewrapPricingMode {
        settings.rewrapPricingMode(forItemID: item.id, organizationId: activeOrganizationId)
    }

    private var draftPriceLabel: String {
        if draftRewrapsWithUniqueBarcode && currentRewrapPricingMode == .byWeight {
            return "Price / lb"
        }
        return "Price"
    }

    private var displayPriceLabel: String {
        if item.rewrapsWithUniqueBarcode && currentRewrapPricingMode == .byWeight {
            return "Price / lb"
        }
        return "Price"
    }

    private var selectedPackagingMode: ItemPackagingMode {
        if draftRewrapsWithUniqueBarcode {
            return .rewrapped
        }
        if draftIsPrepackaged {
            return .prepackaged
        }
        return .standard
    }

    private var canConfigureRework: Bool {
        selectedPackagingMode != .standard
    }

    private var tagSuggestionPool: [String] {
        TagSuggestionEngine.canonicalTags(from: item.tags + draftTags)
    }
    
    var body: some View {
        ScrollView { // IMPORTANT: ScrollView wraps entire content
            VStack(spacing: 20) {
                // Photos Section
                photosSection
                
                // Basic Info
                basicInfoSection

                // Placement
                placementSection

                // Packaging
                packagingSection
                
                // Stock (Batches)
                stockSection
                
                // Vendor & Ordering
                vendorSection
                
                if canAdjustInventory {
                    // Actions (Archive, Sale)
                    actionsSection
                }
                
                // Extra bottom padding so content isn't hidden
                Color.clear.frame(height: 100)
            }
            .padding()
        }
        .navigationTitle(item.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let shareURL {
                    ShareLink(
                        item: shareURL,
                        subject: Text("Inventory Item Share"),
                        message: Text("Open in InvenTraker to import this item.")
                    ) {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .foregroundStyle(settings.accentColor)
                } else {
                    Button(action: prepareShareURL) {
                        if isPreparingShareURL {
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
                if canAdjustInventory {
                    Button(isEditing ? "Done" : "Edit") {
                        if isEditing {
                            applyDraftToItem()
                            isEditing = false
                        } else {
                            showPhotos = true
                            loadDraftFromItem()
                            isEditing = true
                        }
                    }
                    .foregroundStyle(settings.accentColor)
                }
            }
        }
        .alert("Archive Item", isPresented: $showingDeleteAlert) {
            Button("Keep in Insights", role: .none) {
                archiveItem(includeInInsights: true)
            }
            Button("Remove from Insights", role: .destructive) {
                archiveItem(includeInInsights: false)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Do you want to keep this item in insights after archiving?")
        }
        .alert("Tag Suggestion", isPresented: $showingTagSuggestion) {
            Button("Use \"\(suggestedTag)\"") {
                addDraftTagIfNeeded(suggestedTag)
                draftTagText = ""
                liveTagSuggestion = nil
            }
            Button("Keep \"\(originalTagEntry)\"") {
                addDraftTagIfNeeded(originalTagEntry)
                draftTagText = ""
                liveTagSuggestion = nil
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Did you mean \"\(suggestedTag)\"?")
        }
        .alert("Add UPC To Central Catalog?", isPresented: $showingCentralPublishPrompt) {
            Button("Not Now", role: .cancel) {
                pendingCentralPublishUPC = ""
            }
            Button("Add") {
                Task { await publishCurrentItemToCentralCatalog() }
            }
        } message: {
            Text("UPC \(pendingCentralPublishUPC) was just added to an item that had no UPC. Publish it to the central catalog for other stores?")
        }
        .onChange(of: selectedPhotos) { oldValue, newValue in
            Task {
                for photo in newValue {
                    if let data = try? await photo.loadTransferable(type: Data.self) {
                        let optimized = ImagePipeline.optimizedPhotoData(from: data)
                        item.pictures.append(optimized)
                        shareURL = nil
                        showPhotos = true
                    }
                }
                selectedPhotos.removeAll()
            }
        }
        .onAppear {
            loadDraftFromItem()
            shareURL = nil
            showPhotos = false
            if !canAdjustInventory {
                isEditing = false
            }
        }
        .onChange(of: draftDepartment) { _, _ in
            if !configuredLocations.contains(draftDepartmentLocation) {
                draftDepartmentLocation = ""
            }
        }
        .onChange(of: item.isOnSale) { _, _ in
            scheduleInventoryUpload()
        }
        .onChange(of: item.salePercentage) { _, _ in
            scheduleInventoryUpload()
        }
        .onChange(of: item.price) { _, _ in
            if !isEditing {
                scheduleInventoryUpload()
            }
        }
        .onChange(of: draftTagText) { _, newValue in
            handleDraftTagTextChanged(newValue)
        }
        .onDisappear {
            pendingInventoryUploadTask?.cancel()
            pendingInventoryUploadTask = nil
        }
    }
    
    // MARK: - View Components
    
    /// Photos gallery section
    private var photosSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Photos")
                .font(.headline)

            if !showPhotos && !isEditing {
                Button {
                    showPhotos = true
                } label: {
                    Label("Load Photos", systemImage: "photo.on.rectangle.angled")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.bordered)
            } else {
            
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 12) {
                        // Display existing photos
                        ForEach(Array(item.pictures.prefix(20).enumerated()), id: \.offset) { index, imageData in
                            CachedThumbnailView(
                                imageData: imageData,
                                cacheKey: "item-detail-\(item.id.uuidString)-\(index)-\(imageData.count)",
                                width: 120,
                                height: 120,
                                cornerRadius: 12
                            )
                        }
                        
                        // Add photo button when editing
                        if isEditing {
                            PhotosPicker(selection: $selectedPhotos, maxSelectionCount: 10, matching: .images) {
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(settings.accentColor.opacity(0.1))
                                    .frame(width: 120, height: 120)
                                    .overlay {
                                        Image(systemName: "plus")
                                            .font(.largeTitle)
                                            .foregroundStyle(settings.accentColor)
                                    }
                            }
                        }
                    }
                    .padding(.vertical, 8)
                }

                if item.pictures.count > 20 {
                    Text("Showing first 20 photos")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
    
    /// Basic information section
    private var basicInfoSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Basic Information")
                .font(.headline)
            
            if isEditing {
                TextField("Name", text: $draftName)
                    .textFieldStyle(.roundedBorder)
                
                TextField("UPC (Optional)", text: $draftUPC)
                .textFieldStyle(.roundedBorder)
            } else {
                InfoRow(label: "Name", value: item.name)
                if let upc = item.upc {
                    InfoRow(label: "UPC", value: upc)
                }
            }
            
            // Tags display
            tagsView
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
    
    /// Tags display
    private var tagsView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Tags")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            
            let tags = isEditing ? draftTags : item.tags
            if !tags.isEmpty {
                FlowLayout(spacing: 8) {
                    ForEach(tags, id: \.self) { tag in
                        HStack(spacing: 4) {
                            Text(tag)
                            if isEditing {
                                Button {
                                    draftTags.removeAll { $0 == tag }
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.caption)
                                }
                                .buttonStyle(.plain)
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
            } else {
                Text("No tags")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            
            if isEditing {
                HStack {
                    TextField("Add tag", text: $draftTagText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)
                        .submitLabel(.done)
                        .onSubmit(addDraftTagFromInput)
                    Button("Add", action: addDraftTagFromInput)
                        .disabled(TagSuggestionEngine.cleanedTag(draftTagText).isEmpty)
                }

                if let liveTagSuggestion {
                    Button {
                        draftTagText = liveTagSuggestion
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
            }
        }
    }
    
    /// Stock (Batches) section
    private var stockSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Stock")
                .font(.headline)

            VStack(alignment: .leading, spacing: 4) {
                Text("Total: \(settings.formattedQuantityForDisplay(item.totalQuantity, item: item))")
                    .font(.subheadline.weight(.semibold))
                Text("Back stock: \(settings.formattedQuantityForDisplay(item.backStockQuantity, item: item))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("Front stock: \(settings.formattedQuantityForDisplay(item.frontStockQuantity, item: item))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            
            if item.batches.isEmpty {
                Text("No stock on hand")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 8)
            } else {
                ForEach(item.batches.sorted(by: { $0.expirationDate < $1.expirationDate })) { batch in
                    stockBatchRow(batch)
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private var placementSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Placement")
                .font(.headline)

            if isEditing {
                Picker("Department", selection: $draftDepartment) {
                    Text("None").tag("")
                    ForEach(configuredDepartments) { department in
                        Text(department.name).tag(department.name)
                    }
                }

                if !draftDepartment.isEmpty {
                    if configuredLocations.isEmpty {
                        Text("No locations configured for this department. Add locations in Settings.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        Picker("Location", selection: $draftDepartmentLocation) {
                            Text("None").tag("")
                            ForEach(configuredLocations, id: \.self) { location in
                                Text(location).tag(location)
                            }
                        }
                    }
                }
            } else {
                InfoRow(label: "Department", value: item.department ?? "None")
                InfoRow(label: "Location", value: item.departmentLocation ?? "None")
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private var packagingSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Packaging")
                .font(.headline)

            if isEditing {
                ForEach(ItemPackagingMode.allCases) { mode in
                    Button {
                        setDraftPackagingMode(mode)
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
                            TextField("Required for scanner match", text: $draftReworkItemCode)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .multilineTextAlignment(.trailing)
                                .frame(width: 180)
                                .roundedInputField(tint: settings.accentColor)
                        }
                        Text("Used to match parsed reworked barcodes to this item.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }

                    Toggle("Can Be Reworked", isOn: $draftCanBeReworked)

                    if draftCanBeReworked {
                        HStack {
                            Text("Reworked Shelf Life")
                            Spacer()
                            TextField("Days", text: $draftReworkShelfLifeDays)
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 90)
                                .roundedInputField(tint: settings.accentColor)
                            Text("days")
                                .foregroundStyle(.secondary)
                        }

                        HStack {
                            Text("Max Reworks")
                            Spacer()
                            TextField("Times", text: $draftMaxReworkCount)
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 90)
                                .roundedInputField(tint: settings.accentColor)
                            Text("times")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            } else {
                InfoRow(label: "Packaging", value: packagingDisplayText(for: item))
                if item.isPrepackaged || item.rewrapsWithUniqueBarcode {
                    if item.rewrapsWithUniqueBarcode {
                        let code = item.reworkItemCode?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                        if !code.isEmpty {
                            InfoRow(label: "Item Code", value: code)
                        }
                    }
                    InfoRow(label: "Can Be Reworked", value: item.canBeReworked ? "Yes" : "No")
                    if item.canBeReworked {
                        InfoRow(label: "Reworked Shelf Life", value: "\(item.effectiveReworkShelfLifeDays) days")
                        InfoRow(label: "Max Reworks", value: "\(item.effectiveMaxReworkCount)")
                    }
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
    
    /// Individual stock batch row
    private func stockBatchRow(_ batch: Batch) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("\(batch.quantity.formattedQuantity()) \(item.unit.rawValue)")
                    .font(.headline)
                Spacer()
                Text(batch.expirationDate, style: .date)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            
            // Expiration status
            let daysUntil = batch.daysUntilExpiration
            if daysUntil < 0 {
                Text("Expired")
                    .font(.caption)
                    .foregroundStyle(.red)
            } else if daysUntil <= 7 {
                Text("\(daysUntil) days until expiration")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
        }
        .padding(.vertical, 8)
    }
    
    /// Vendor and ordering section
    private var vendorSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Vendor & Ordering")
                .font(.headline)
            
            if isEditing {
                Picker("Vendor", selection: $draftVendorID) {
                    Text("None").tag(nil as UUID?)
                    ForEach(vendors) { vendor in
                        Text(vendor.name).tag(Optional(vendor.id))
                    }
                }
                
                Picker("Unit", selection: $draftUnit) {
                    ForEach(MeasurementUnit.allCases) { unit in
                        Text(unit.displayName).tag(unit)
                    }
                }
                
                HStack {
                    Text("Min Quantity")
                    Spacer()
                    TextField("0", text: $draftMinimumQuantity)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 90)
                        .roundedInputField(tint: settings.accentColor)
                }
                
                HStack {
                    Text("Qty per Box")
                    Spacer()
                    TextField("1", text: $draftQuantityPerBox)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 90)
                        .roundedInputField(tint: settings.accentColor)
                }
                
                HStack {
                    Text(draftPriceLabel)
                    Spacer()
                    TextField("0.00", text: $draftPrice)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 90)
                        .roundedInputField(tint: settings.accentColor)
                }

                if draftRewrapsWithUniqueBarcode {
                    Text("Current rewrap pricing mode: \(currentRewrapPricingMode.title). Change per-item behavior in Settings > Rewrap Pricing.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Toggle("Item has an expiration", isOn: $draftHasExpiration)
                    .tint(settings.accentColor)
                    .onChange(of: draftHasExpiration) { _, expires in
                        if expires {
                            if (Int(draftDefaultExpiration) ?? 0) <= 0 {
                                draftDefaultExpiration = "7"
                            }
                            if (Int(draftDefaultPackedExpiration) ?? 0) <= 0 {
                                draftDefaultPackedExpiration = draftDefaultExpiration
                            }
                        } else {
                            draftDefaultExpiration = "0"
                            draftDefaultPackedExpiration = "0"
                        }
                    }
                
                HStack {
                    Text("Default Expiration (Source)")
                    Spacer()
                    TextField("7", text: $draftDefaultExpiration)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 90)
                        .roundedInputField(tint: settings.accentColor)
                        .disabled(!draftHasExpiration)
                }

                if selectedPackagingMode == .rewrapped {
                    HStack {
                        Text("Default Expiration (Packed)")
                        Spacer()
                        TextField("7", text: $draftDefaultPackedExpiration)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 90)
                            .roundedInputField(tint: settings.accentColor)
                            .disabled(!draftHasExpiration)
                    }
                }
            } else {
                InfoRow(label: "Vendor", value: item.vendor?.name ?? "None")
                InfoRow(label: "Unit", value: item.unit.rawValue)
                InfoRow(label: "Min Quantity", value: "\(item.minimumQuantity.formattedQuantity()) \(item.unit.rawValue)")
                InfoRow(label: "Qty per Box", value: "\(item.quantityPerBox)")
                InfoRow(label: displayPriceLabel, value: "$\(String(format: "%.2f", item.price))")
                InfoRow(
                    label: "Default Expiration (Source)",
                    value: item.hasExpiration ? "\(item.effectiveDefaultExpiration) days" : "No expiration"
                )
                if item.rewrapsWithUniqueBarcode {
                    InfoRow(
                        label: "Default Expiration (Packed)",
                        value: item.hasExpiration ? "\(item.effectiveDefaultPackedExpiration) days" : "No expiration"
                    )
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
    
    /// Actions section (Archive, Sale)
    private var actionsSection: some View {
        VStack(spacing: 12) {
            // Sale toggle with percentage
            Toggle("On Sale", isOn: $item.isOnSale)
                .tint(.orange)
            
            if item.isOnSale {
                HStack {
                    Text("Sale Percentage")
                    Spacer()
                    Stepper("\(item.salePercentage)%", value: $item.salePercentage, in: 5...90, step: 5)
                }

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
            }
            
            Divider()
            
            // Archive button
            Button(role: .destructive, action: { showingDeleteAlert = true }) {
                Label("Archive Item", systemImage: "archivebox")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
    
    private func prepareShareURL() {
        guard !isPreparingShareURL else { return }
        isPreparingShareURL = true
        let snapshot = item
        Task { @MainActor in
            shareURL = InventoryShareService.shareURL(for: [snapshot])
            isPreparingShareURL = false
        }
    }

    private func addDraftTagFromInput() {
        let cleaned = TagSuggestionEngine.cleanedTag(draftTagText)
        guard !cleaned.isEmpty else { return }

        if let exact = TagSuggestionEngine.exactCanonicalMatch(
            for: cleaned,
            existingTags: tagSuggestionPool
        ) {
            addDraftTagIfNeeded(exact)
            draftTagText = ""
            liveTagSuggestion = nil
            return
        }

        if let similar = TagSuggestionEngine.fuzzySuggestion(
            for: cleaned,
            existingTags: tagSuggestionPool
        ) {
            suggestedTag = similar
            originalTagEntry = cleaned
            showingTagSuggestion = true
            return
        }

        addDraftTagIfNeeded(cleaned)
        draftTagText = ""
        liveTagSuggestion = nil
    }

    private func handleDraftTagTextChanged(_ newValue: String) {
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
            draftTagText = suggestion
        } else if let exact = TagSuggestionEngine.exactCanonicalMatch(
            for: cleaned,
            existingTags: tagSuggestionPool
        ) {
            draftTagText = exact
        } else {
            draftTagText = cleaned
        }
        liveTagSuggestion = nil
    }

    private func addDraftTagIfNeeded(_ rawTag: String) {
        let cleaned = TagSuggestionEngine.cleanedTag(rawTag)
        guard !cleaned.isEmpty else { return }
        guard !draftTags.contains(where: { $0.caseInsensitiveCompare(cleaned) == .orderedSame }) else { return }
        draftTags.append(cleaned)
    }
    
    private func loadDraftFromItem() {
        draftName = item.name
        draftUPC = item.upc ?? ""
        draftTags = item.tags
        draftTagText = ""
        liveTagSuggestion = nil
        draftVendorID = item.vendor?.id
        draftMinimumQuantity = item.minimumQuantity.formattedQuantity()
        draftQuantityPerBox = "\(item.quantityPerBox)"
        draftPrice = String(format: "%.2f", item.price)
        draftHasExpiration = item.hasExpiration
        draftDefaultExpiration = "\(item.defaultExpiration)"
        draftDefaultPackedExpiration = "\(item.effectiveDefaultPackedExpiration)"
        draftUnit = item.unit
        draftDepartment = item.department ?? ""
        draftDepartmentLocation = item.departmentLocation ?? ""
        draftIsPrepackaged = item.isPrepackaged
        draftRewrapsWithUniqueBarcode = item.rewrapsWithUniqueBarcode
        draftReworkItemCode = item.reworkItemCode ?? item.upc ?? ""
        draftCanBeReworked = item.canBeReworked
        draftReworkShelfLifeDays = "\(item.effectiveReworkShelfLifeDays)"
        draftMaxReworkCount = "\(item.effectiveMaxReworkCount)"
        if draftRewrapsWithUniqueBarcode {
            draftIsPrepackaged = true
        }
    }
    
    private func applyDraftToItem() {
        let previousNormalizedUPC = catalogService.normalizeUPC(item.upc ?? "")
        let cleanedName = draftName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanedName.isEmpty {
            item.name = cleanedName
        }
        
        let cleanedUPC = draftUPC.trimmingCharacters(in: .whitespacesAndNewlines)
        item.upc = cleanedUPC.isEmpty ? nil : cleanedUPC
        
        let cleanedTags = draftTags
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        item.tags = Array(Set(cleanedTags)).sorted()
        
        if let draftVendorID {
            item.vendor = vendors.first(where: { $0.id == draftVendorID })
        } else {
            item.vendor = nil
        }
        
        if let value = Double(draftMinimumQuantity) {
            item.minimumQuantity = max(0, value)
        }
        if let value = Int(draftQuantityPerBox) {
            item.quantityPerBox = max(1, value)
        }
        if let value = Double(draftPrice) {
            item.price = max(0, value)
        }
        item.hasExpiration = draftHasExpiration
        if let value = Int(draftDefaultExpiration) {
            item.defaultExpiration = draftHasExpiration ? max(1, value) : 0
        } else if !draftHasExpiration {
            item.defaultExpiration = 0
        }
        if let value = Int(draftDefaultPackedExpiration) {
            item.defaultPackedExpiration = draftHasExpiration ? max(1, value) : 0
        } else {
            item.defaultPackedExpiration = draftHasExpiration ? item.effectiveDefaultExpiration : 0
        }

        let cleanedDepartment = draftDepartment.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanedLocation = draftDepartmentLocation.trimmingCharacters(in: .whitespacesAndNewlines)
        item.department = cleanedDepartment.isEmpty ? nil : cleanedDepartment
        item.departmentLocation = cleanedDepartment.isEmpty || cleanedLocation.isEmpty ? nil : cleanedLocation
        switch selectedPackagingMode {
        case .standard:
            item.isPrepackaged = false
            item.rewrapsWithUniqueBarcode = false
            item.reworkItemCode = nil
            item.canBeReworked = false
        case .prepackaged:
            item.isPrepackaged = true
            item.rewrapsWithUniqueBarcode = false
            item.reworkItemCode = nil
            item.canBeReworked = draftCanBeReworked
        case .rewrapped:
            item.isPrepackaged = true
            item.rewrapsWithUniqueBarcode = true
            let normalizedReworkCode = draftReworkItemCode
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .filter { $0.isNumber }
            if !normalizedReworkCode.isEmpty {
                item.reworkItemCode = normalizedReworkCode
            } else {
                let normalizedUPC = catalogService.normalizeUPC(item.upc ?? "")
                item.reworkItemCode = normalizedUPC.isEmpty ? nil : normalizedUPC
            }
            item.canBeReworked = draftCanBeReworked
        }

        if item.canBeReworked {
            if let value = Int(draftReworkShelfLifeDays) {
                item.reworkShelfLifeDays = max(1, value)
            }
            if let value = Int(draftMaxReworkCount) {
                item.maxReworkCount = max(1, value)
            }
        } else {
            item.reworkShelfLifeDays = max(1, item.reworkShelfLifeDays)
            item.maxReworkCount = max(1, item.maxReworkCount)
        }
        
        item.unit = draftUnit
        item.lastModified = Date()
        try? modelContext.save()
        shareURL = nil
        scheduleInventoryUpload()
        syncCatalogLayersIfNeeded()
        let updatedNormalizedUPC = catalogService.normalizeUPC(item.upc ?? "")
        if previousNormalizedUPC.isEmpty && !updatedNormalizedUPC.isEmpty && session.canPerform(.manageCatalog) {
            pendingCentralPublishUPC = updatedNormalizedUPC
            showingCentralPublishPrompt = true
        }
        loadDraftFromItem()
    }

    private func archiveItem(includeInInsights: Bool) {
        item.isArchived = true
        item.includeInInsights = includeInInsights
        item.lastModified = Date()
        try? modelContext.save()
        scheduleInventoryUpload()
        dismiss()
    }

    private func scheduleInventoryUpload() {
        guard !activeOrganizationId.isEmpty else { return }
        pendingInventoryUploadTask?.cancel()
        pendingInventoryUploadTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 500_000_000)
            try? await InventoryStateSyncService.shared.syncFullSnapshot(
                organizationId: activeOrganizationId,
                modelContext: modelContext
            )
        }
    }

    private func syncCatalogLayersIfNeeded() {
        let normalizedUPC = catalogService.normalizeUPC(item.upc ?? "")
        guard session.canPerform(.manageCatalog) else { return }

        Task {
            if normalizedUPC.isEmpty {
                _ = try? await catalogService.upsertCompanyProductWithoutUPC(
                    title: item.name,
                    tags: item.tags,
                    price: item.price,
                    casePack: item.quantityPerBox,
                    hasExpiration: item.hasExpiration,
                    defaultExpiration: item.defaultExpiration,
                    defaultPackedExpiration: item.effectiveDefaultPackedExpiration,
                    vendorName: item.vendor?.name,
                    department: item.department,
                    departmentLocation: item.departmentLocation,
                    unitRaw: item.unit.rawValue,
                    minimumQuantity: item.minimumQuantity,
                    isPrepackaged: item.isPrepackaged,
                    rewrapsWithUniqueBarcode: item.rewrapsWithUniqueBarcode,
                    canBeReworked: item.canBeReworked,
                    reworkShelfLifeDays: item.effectiveReworkShelfLifeDays,
                    maxReworkCount: item.effectiveMaxReworkCount,
                    thumbnailData: item.pictures.first,
                    editorUid: session.firebaseUser?.id,
                    editorOrganizationId: item.organizationId,
                    storeId: item.storeId,
                    hasPermission: session.canPerform(.manageCatalog)
                )
            } else {
                _ = try? await catalogService.upsertProduct(
                    upc: normalizedUPC,
                    title: item.name,
                    tags: item.tags,
                    price: item.price,
                    casePack: item.quantityPerBox,
                    thumbnailData: item.pictures.first,
                    editorUid: session.firebaseUser?.id,
                    editorOrganizationId: item.organizationId,
                    hasPermission: session.canPerform(.manageCatalog),
                    hasExpiration: item.hasExpiration,
                    defaultExpiration: item.defaultExpiration,
                    defaultPackedExpiration: item.effectiveDefaultPackedExpiration,
                    vendorName: item.vendor?.name,
                    department: item.department,
                    departmentLocation: item.departmentLocation,
                    unitRaw: item.unit.rawValue,
                    minimumQuantity: item.minimumQuantity,
                    storeDepartment: item.department,
                    storeDepartmentLocation: item.departmentLocation,
                    storeId: item.storeId,
                    isPrepackaged: item.isPrepackaged,
                    rewrapsWithUniqueBarcode: item.rewrapsWithUniqueBarcode,
                    canBeReworked: item.canBeReworked,
                    reworkShelfLifeDays: item.effectiveReworkShelfLifeDays,
                    maxReworkCount: item.effectiveMaxReworkCount,
                    updateGlobalCatalog: false
                )
            }
        }
    }

    private func setDraftPackagingMode(_ mode: ItemPackagingMode) {
        switch mode {
        case .standard:
            draftIsPrepackaged = false
            draftRewrapsWithUniqueBarcode = false
            draftReworkItemCode = ""
            draftCanBeReworked = false
        case .prepackaged:
            draftIsPrepackaged = true
            draftRewrapsWithUniqueBarcode = false
            draftReworkItemCode = ""
        case .rewrapped:
            draftIsPrepackaged = true
            draftRewrapsWithUniqueBarcode = true
            if draftReworkItemCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                draftReworkItemCode = draftUPC.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            if Int(draftDefaultPackedExpiration) == nil {
                draftDefaultPackedExpiration = draftDefaultExpiration
            }
        }
    }

    private func packagingDisplayText(for item: InventoryItem) -> String {
        if item.rewrapsWithUniqueBarcode {
            return "Rewrapped"
        }
        if item.isPrepackaged {
            return "Repacked"
        }
        return "Standard"
    }

    @MainActor
    private func publishCurrentItemToCentralCatalog() async {
        let normalizedUPC = catalogService.normalizeUPC(item.upc ?? "")
        guard !normalizedUPC.isEmpty else { return }
        guard session.canPerform(.manageCatalog) else { return }

        _ = try? await catalogService.upsertProduct(
            upc: normalizedUPC,
            title: item.name,
            tags: item.tags,
            price: item.price,
            casePack: item.quantityPerBox,
            thumbnailData: item.pictures.first,
            editorUid: session.firebaseUser?.id,
            editorOrganizationId: item.organizationId,
            hasPermission: session.canPerform(.manageCatalog),
            hasExpiration: item.hasExpiration,
            defaultExpiration: item.defaultExpiration,
            defaultPackedExpiration: item.effectiveDefaultPackedExpiration,
            vendorName: item.vendor?.name,
            department: item.department,
            departmentLocation: item.departmentLocation,
            unitRaw: item.unit.rawValue,
            minimumQuantity: item.minimumQuantity,
            storeDepartment: item.department,
            storeDepartmentLocation: item.departmentLocation,
            storeId: item.storeId,
            isPrepackaged: item.isPrepackaged,
            rewrapsWithUniqueBarcode: item.rewrapsWithUniqueBarcode,
            canBeReworked: item.canBeReworked,
            reworkShelfLifeDays: item.effectiveReworkShelfLifeDays,
            maxReworkCount: item.effectiveMaxReworkCount,
            updateGlobalCatalog: true
        )
        pendingCentralPublishUPC = ""
    }
}

/// Simple info row helper
struct InfoRow: View {
    let label: String
    let value: String
    
    var body: some View {
        HStack {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .fontWeight(.medium)
        }
    }
}

/// Flow layout for tags (same as before)
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = FlowResult(in: proposal.replacingUnspecifiedDimensions().width, subviews: subviews, spacing: spacing)
        return result.size
    }
    
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(in: bounds.width, subviews: subviews, spacing: spacing)
        for (index, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(x: bounds.minX + result.positions[index].x, y: bounds.minY + result.positions[index].y), proposal: .unspecified)
        }
    }
    
    struct FlowResult {
        var size: CGSize = .zero
        var positions: [CGPoint] = []
        
        init(in maxWidth: CGFloat, subviews: Subviews, spacing: CGFloat) {
            var currentX: CGFloat = 0
            var currentY: CGFloat = 0
            var lineHeight: CGFloat = 0
            
            for subview in subviews {
                let size = subview.sizeThatFits(.unspecified)
                
                if currentX + size.width > maxWidth && currentX > 0 {
                    currentX = 0
                    currentY += lineHeight + spacing
                    lineHeight = 0
                }
                
                positions.append(CGPoint(x: currentX, y: currentY))
                lineHeight = max(lineHeight, size.height)
                currentX += size.width + spacing
            }
            
            self.size = CGSize(width: maxWidth, height: currentY + lineHeight)
        }
    }
}

private enum ItemPackagingMode: String, CaseIterable, Identifiable {
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
