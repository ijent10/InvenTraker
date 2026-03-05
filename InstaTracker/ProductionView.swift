import SwiftUI
import SwiftData

struct ProductionView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    @Query private var products: [ProductionProduct]
    @Query private var ingredients: [ProductionIngredient]
    @Query(sort: \ProductionSpotCheckRecord.checkedAt, order: .reverse) private var spotChecks: [ProductionSpotCheckRecord]
    @Query(sort: \ProductionRun.madeAt, order: .reverse) private var runs: [ProductionRun]
    @Query(filter: #Predicate<InventoryItem> { !$0.isArchived }) private var items: [InventoryItem]
    @Query private var guides: [HowToGuide]
    @StateObject private var settings = AppSettings.shared

    @State private var showingSetup = false
    @State private var showingGuideLibrary = false
    @State private var selectedSuggestion: ProductionSuggestion?
    @State private var guidePreview: GuidePreview?
    @State private var spotCheckDrafts: [UUID: String] = [:]
    @State private var feedbackMessage: String?
    @State private var isLoadingFromDatabase = false
    @State private var usingLocalCache = false
    @State private var pullBusinessFactor: Double = 1.0
    @State private var includeNonFrozenPull = false

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? "local-default"
    }

    private var activeStoreId: String {
        settings.normalizedActiveStoreID
    }

    private var canRunProduction: Bool {
        session.canPerform(.receiveInventory)
    }

    private var canSpotCheckProduction: Bool {
        session.canPerform(.spotCheck)
    }

    private var canEditProductionSetup: Bool {
        // Product and How-To authoring are managed on web to keep mobile lean.
        false
    }

    private var scopedProducts: [ProductionProduct] {
        products.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId)
        }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private var scopedIngredients: [ProductionIngredient] {
        ingredients.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId)
        }
    }

    private var scopedSpotChecks: [ProductionSpotCheckRecord] {
        spotChecks.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId)
        }
    }

    private var scopedRuns: [ProductionRun] {
        runs.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId)
        }
    }

    private var scopedItems: [InventoryItem] {
        items.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(activeStoreId)
        }
    }

    private var companyGuides: [HowToGuide] {
        let scoped = guides.filter { $0.organizationId == activeOrganizationId && $0.isActive }
        var deduped: [String: HowToGuide] = [:]
        for guide in scoped {
            let key = guide.title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard !key.isEmpty else { continue }
            if let current = deduped[key] {
                if preferredGuide(guide, over: current) {
                    deduped[key] = guide
                }
            } else {
                deduped[key] = guide
            }
        }
        return deduped.values.sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
    }

    private var suggestions: [ProductionSuggestion] {
        ProductionPlanningService.suggestions(
            products: scopedProducts,
            spotChecks: scopedSpotChecks,
            runs: scopedRuns
        )
    }

    private var makeTodaySuggestions: [ProductionSuggestion] {
        suggestions.filter { $0.recommendedMakeQuantity > 0 }
    }

    private var ingredientDemandRows: [ProductionIngredientDemandRow] {
        ProductionPlanningService.ingredientDemandRows(
            suggestions: suggestions,
            products: scopedProducts,
            ingredients: scopedIngredients,
            inventoryItems: scopedItems
        )
    }

    private var ingredientCountByProductID: [UUID: Int] {
        Dictionary(grouping: scopedIngredients, by: \.productionProductID).mapValues(\.count)
    }

    private var frozenPullForecast: (rows: [FrozenPullRecommendation], factors: ProductionPullFactorSummary) {
        ProductionPlanningService.frozenPullForecast(
            products: scopedProducts,
            ingredients: scopedIngredients,
            spotChecks: scopedSpotChecks,
            runs: scopedRuns,
            inventoryItems: scopedItems,
            businessFactor: pullBusinessFactor,
            includeNonFrozen: includeNonFrozenPull
        )
    }

    var body: some View {
        List {
            Section {
                ContextTipCard(context: .production, accentColor: settings.accentColor)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)
            }

            Section {
                Label(
                    "Production products and How-To authoring are managed on the web dashboard.",
                    systemImage: "desktopcomputer"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            if isLoadingFromDatabase {
                Section {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Refreshing production from company database…")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if usingLocalCache {
                Section {
                    Label(
                        "Using local production cache. Changes will sync when your connection returns.",
                        systemImage: "icloud.slash"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }

            morningSpotCheckSection
            productionSuggestionSection
            ingredientForecastSection
            frozenPullSection
            setupSection
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Production")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingGuideLibrary = true
                } label: {
                    Image(systemName: "questionmark.circle")
                        .foregroundStyle(settings.accentColor)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                if canEditProductionSetup {
                    Button {
                        showingSetup = true
                    } label: {
                        Image(systemName: "plus")
                            .foregroundStyle(settings.accentColor)
                    }
                }
            }
        }
        .sheet(isPresented: $showingSetup) {
            NavigationStack {
                ProductionSetupView(
                    organizationId: activeOrganizationId,
                    storeId: activeStoreId,
                    availableItems: scopedItems,
                    guides: companyGuides,
                    onSaved: syncProductionSnapshotToDatabase
                )
            }
        }
        .sheet(isPresented: $showingGuideLibrary) {
            NavigationStack {
                HowToLibraryView(
                    organizationId: activeOrganizationId,
                    canEdit: canEditProductionSetup,
                    onGuideChanged: syncProductionSnapshotToDatabase
                )
            }
        }
        .sheet(item: $selectedSuggestion) { suggestion in
            NavigationStack {
                ProductionRunSheet(
                    suggestion: suggestion,
                    product: scopedProducts.first(where: { $0.id == suggestion.productID }),
                    outputItem: scopedItems.first(where: { $0.id == suggestion.outputItemID }),
                    organizationId: activeOrganizationId,
                    storeId: activeStoreId,
                    onSaved: syncProductionSnapshotToDatabase
                )
            }
        }
        .sheet(item: $guidePreview) { preview in
            NavigationStack {
                HowToGuideDetailView(preview: preview)
            }
        }
        .alert(
            "Production Update",
            isPresented: Binding(
                get: { feedbackMessage != nil },
                set: { if !$0 { feedbackMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(feedbackMessage ?? "")
        }
        .onAppear {
            seedSpotCheckDraftsIfNeeded()
            Task {
                await refreshProductionDatabaseFirst()
            }
        }
        .task(id: "\(activeOrganizationId)|\(activeStoreId)") {
            seedSpotCheckDraftsIfNeeded()
            await refreshProductionDatabaseFirst()
        }
    }

    private var morningSpotCheckSection: some View {
        Section("Morning Spot Check") {
            if scopedProducts.isEmpty {
                Text("No production products configured yet.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(scopedProducts) { product in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(product.name)
                                .font(.headline)
                            Spacer()
                            Text("On hand: \(product.lastSpotCheckQuantity.formattedQuantity()) \(product.outputUnit.rawValue)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        HStack(spacing: 10) {
                            TextField(
                                "Counted qty",
                                text: Binding(
                                    get: { spotCheckDrafts[product.id] ?? product.lastSpotCheckQuantity.formattedQuantity() },
                                    set: { spotCheckDrafts[product.id] = $0 }
                                )
                            )
                            .keyboardType(.decimalPad)
                            .roundedInputField(tint: settings.accentColor)

                            Button("Save") {
                                saveSpotCheck(for: product)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(settings.accentColor)
                            .disabled(!canSpotCheckProduction)
                        }

                        if let last = product.lastSpotCheckDate {
                            Text("Last checked: \(last.formatted(date: .abbreviated, time: .shortened))")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private var productionSuggestionSection: some View {
        Section("Make Today (Trend Based)") {
            if makeTodaySuggestions.isEmpty {
                Text("Add production products to generate make recommendations.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(makeTodaySuggestions) { suggestion in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(suggestion.productName)
                                .font(.headline)
                            Spacer()
                            Text("Make \(suggestion.recommendedMakeQuantity.formattedQuantity()) \(suggestion.outputUnitRaw)")
                                .font(.headline)
                                .foregroundStyle(settings.accentColor)
                        }
                        Text(
                            "Expected usage: \(suggestion.expectedUsageToday.formattedQuantity()) • On hand: \(suggestion.onHandQuantity.formattedQuantity()) \(suggestion.outputUnitRaw)"
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)

                        HStack {
                            Button {
                                openHowTo(for: suggestion.productID)
                            } label: {
                                Label("Guide", systemImage: "questionmark.circle")
                            }
                            .buttonStyle(.bordered)

                            Spacer()

                            Button("Mark Made") {
                                selectedSuggestion = suggestion
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(settings.accentColor)
                            .disabled(!canRunProduction)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private var ingredientForecastSection: some View {
        Section("Ingredient Pull Forecast") {
            if ingredientDemandRows.isEmpty {
                Text("Ingredient demand will appear once make suggestions are above zero.")
                    .foregroundStyle(.secondary)
            } else {
                Text("These forecasted ingredient pulls are included in order recommendations.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ForEach(ingredientDemandRows) { row in
                    HStack {
                        Text(row.itemName)
                        Spacer()
                        Text("\(row.requiredQuantity.formattedQuantity()) \(row.unitRaw)")
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var frozenPullSection: some View {
        Section("Frozen Pull (Next Day)") {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Business Input")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\(pullBusinessFactor.formatted(.number.precision(.fractionLength(2))))x")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                Slider(value: $pullBusinessFactor, in: 0.7...1.5, step: 0.05)
                    .tint(settings.accentColor)

                Toggle("Include non-frozen", isOn: $includeNonFrozenPull)
                    .font(.caption)
            }

            let factors = frozenPullForecast.factors
            Text(
                "Trend \(factorPercent(factors.trendFactor)) · Weather \(factorPercent(factors.weatherFactor)) · Holiday \(factorPercent(factors.holidayFactor))\(factors.holidayName.map { " (\($0))" } ?? "")"
            )
            .font(.caption2)
            .foregroundStyle(.secondary)

            if frozenPullForecast.rows.isEmpty {
                Text("No pull recommendations yet. Add frozen ingredients and production formulas.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(frozenPullForecast.rows) { row in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(row.itemName)
                                .font(.headline)
                            Spacer()
                            Text("Pull \(row.recommendedPullQuantity.formattedQuantity()) \(row.unitRaw)")
                                .font(.headline)
                                .foregroundStyle(settings.accentColor)
                        }
                        Text(
                            "Need \(row.requiredQuantity.formattedQuantity()) · On hand \(row.onHandQuantity.formattedQuantity()) · \(row.rationale)"
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private var setupSection: some View {
        Section("Product Setup") {
            if scopedProducts.isEmpty {
                Text("No production products yet. Set up products with ingredient formulas and output yields on the web dashboard.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(scopedProducts) { product in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(product.name)
                                .font(.headline)
                            Spacer()
                            Text("\(ingredientCountByProductID[product.id, default: 0]) ingredient(s)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Text("Batch yield: \(product.defaultBatchYield.formattedQuantity()) \(product.outputUnit.rawValue)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .swipeActions(edge: .trailing) {
                        if canEditProductionSetup {
                            Button(role: .destructive) {
                                deleteProduct(product)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
            }
        }
    }

    private func seedSpotCheckDraftsIfNeeded() {
        guard spotCheckDrafts.isEmpty else { return }
        for product in scopedProducts {
            spotCheckDrafts[product.id] = product.lastSpotCheckQuantity.formattedQuantity()
        }
    }

    private func saveSpotCheck(for product: ProductionProduct) {
        guard canSpotCheckProduction else { return }
        guard let text = spotCheckDrafts[product.id], let counted = Double(text), counted >= 0 else {
            feedbackMessage = "Enter a valid counted quantity first."
            return
        }
        let now = Date()
        let previous = product.lastSpotCheckQuantity
        let lastCheck = product.lastSpotCheckDate ?? .distantPast
        let producedSinceLast = scopedRuns
            .filter { $0.productionProductID == product.id && $0.madeAt > lastCheck }
            .reduce(0.0) { $0 + $1.quantityMade }
        let usage = max(0, previous + producedSinceLast - counted)

        let record = ProductionSpotCheckRecord(
            productionProductID: product.id,
            countedQuantity: counted,
            previousQuantity: previous,
            quantityProducedSinceLast: producedSinceLast,
            usageObserved: usage,
            checkedAt: now,
            organizationId: activeOrganizationId,
            storeId: activeStoreId
        )
        modelContext.insert(record)

        product.lastSpotCheckQuantity = counted
        product.lastSpotCheckDate = now
        product.updatedAt = now
        product.revision += 1
        product.updatedByUid = session.firebaseUser?.id
        try? modelContext.save()
        syncProductionSnapshotToDatabase()

        feedbackMessage = "Saved production count for \(product.name)."
    }

    private func deleteProduct(_ product: ProductionProduct) {
        let productID = product.id
        for ingredient in scopedIngredients where ingredient.productionProductID == productID {
            modelContext.delete(ingredient)
        }
        modelContext.delete(product)
        try? modelContext.save()
        syncProductionSnapshotToDatabase()
    }

    private func openHowTo(for productID: UUID) {
        guard let product = scopedProducts.first(where: { $0.id == productID }) else { return }
        if
            let guideID = product.howToGuideID,
            let guide = companyGuides.first(where: { $0.id == guideID })
        {
            guidePreview = GuidePreview(from: guide)
            return
        }

        if !product.instructions.isEmpty {
            guidePreview = GuidePreview(
                title: "\(product.name) How-To",
                keywords: [],
                steps: product.instructions,
                notes: ""
            )
            return
        }

        feedbackMessage = "No linked guide yet for \(product.name)."
    }

    private func refreshProductionDatabaseFirst() async {
        guard !isLoadingFromDatabase else { return }
        guard !activeOrganizationId.isEmpty else { return }

        isLoadingFromDatabase = true
        let loadedFromRemote = await InventoryStateSyncService.shared.refreshProductionCacheFromRemote(
            organizationId: activeOrganizationId,
            storeId: activeStoreId,
            modelContext: modelContext
        )
        usingLocalCache = !loadedFromRemote
        seedSpotCheckDraftsIfNeeded()
        isLoadingFromDatabase = false
    }

    private func syncProductionSnapshotToDatabase() {
        guard !activeOrganizationId.isEmpty else { return }
        Task {
            try? await InventoryStateSyncService.shared.syncProductionSnapshot(
                organizationId: activeOrganizationId,
                storeId: activeStoreId,
                modelContext: modelContext
            )
        }
    }

    private func factorPercent(_ value: Double) -> String {
        "\(Int((value * 100).rounded()))%"
    }

    private func preferredGuide(_ candidate: HowToGuide, over current: HowToGuide) -> Bool {
        if candidate.revision != current.revision {
            return candidate.revision > current.revision
        }
        if candidate.updatedAt != current.updatedAt {
            return candidate.updatedAt > current.updatedAt
        }
        if candidate.steps.count != current.steps.count {
            return candidate.steps.count > current.steps.count
        }
        return candidate.notes.count > current.notes.count
    }
}

private struct ProductionSetupView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let organizationId: String
    let storeId: String
    let availableItems: [InventoryItem]
    let guides: [HowToGuide]
    let onSaved: () -> Void

    @State private var name = ""
    @State private var outputItemID: UUID?
    @State private var defaultBatchYield = "1"
    @State private var targetDaysOnHand: Double = 1.5
    @State private var howToGuideID: UUID?
    @State private var inlineInstructions = ""
    @State private var ingredientDrafts: [IngredientDraft] = [IngredientDraft()]
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section("Product") {
                TextField("Production product name", text: $name)
                Picker("Output inventory item", selection: $outputItemID) {
                    Text("Select item").tag(Optional<UUID>.none)
                    ForEach(availableItems) { item in
                        Text(item.name).tag(Optional(item.id))
                    }
                }
                TextField("Default batch yield", text: $defaultBatchYield)
                    .keyboardType(.decimalPad)
                HStack {
                    Text("Target days on hand")
                    Spacer()
                    Text(targetDaysOnHand.formattedQuantity(maximumFractionDigits: 1))
                        .foregroundStyle(.secondary)
                }
                Stepper(value: $targetDaysOnHand, in: 0.5...7, step: 0.5) {
                    EmptyView()
                }
            }

            Section("How-To Link") {
                Picker("Guide", selection: $howToGuideID) {
                    Text("None").tag(Optional<UUID>.none)
                    ForEach(guides) { guide in
                        Text(guide.title).tag(Optional(guide.id))
                    }
                }
                Text("If no guide is selected, inline steps below will be used for the question-mark help.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextEditor(text: $inlineInstructions)
                    .frame(minHeight: 120)
            }

            Section("Ingredients Per Batch") {
                ForEach($ingredientDrafts) { $draft in
                    VStack(alignment: .leading, spacing: 8) {
                        Picker("Inventory item", selection: $draft.inventoryItemID) {
                            Text("Select ingredient").tag(Optional<UUID>.none)
                            ForEach(availableItems) { item in
                                Text(item.name).tag(Optional(item.id))
                            }
                        }
                        HStack {
                            TextField("Amount", text: $draft.quantityText)
                                .keyboardType(.decimalPad)
                            Picker("Unit", selection: $draft.unit) {
                                ForEach(MeasurementUnit.allCases) { unit in
                                    Text(unit.rawValue).tag(unit)
                                }
                            }
                        }

                        conversionPreview(for: draft)
                            .font(.caption2)
                            .foregroundStyle(.secondary)

                        if ingredientDrafts.count > 1 {
                            Button(role: .destructive) {
                                ingredientDrafts.removeAll { $0.id == draft.id }
                            } label: {
                                Label("Remove ingredient", systemImage: "trash")
                            }
                        }
                    }
                }
                Button {
                    ingredientDrafts.append(IngredientDraft())
                } label: {
                    Label("Add ingredient", systemImage: "plus")
                }
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }
        }
        .navigationTitle("New Production Product")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Save") { save() }
            }
        }
    }

    @ViewBuilder
    private func conversionPreview(for draft: IngredientDraft) -> some View {
        if
            let raw = Double(draft.quantityText),
            raw > 0,
            let itemID = draft.inventoryItemID,
            let item = availableItems.first(where: { $0.id == itemID })
        {
            if draft.unit == item.unit {
                Text("Matches inventory unit (\(item.unit.rawValue)).")
            } else if let converted = MeasurementConverter.convert(
                quantity: raw,
                from: draft.unit,
                to: item.unit
            ) {
                Text("Converts to \(converted.formattedQuantity()) \(item.unit.rawValue) in inventory.")
            } else {
                Text("No direct conversion to \(item.unit.rawValue). Keep matching units for best accuracy.")
            }
        } else {
            EmptyView()
        }
    }

    private func save() {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            errorMessage = "Enter a product name."
            return
        }
        guard let outputItemID, let outputItem = availableItems.first(where: { $0.id == outputItemID }) else {
            errorMessage = "Select an output inventory item."
            return
        }
        guard let yield = Double(defaultBatchYield), yield > 0 else {
            errorMessage = "Enter a valid batch yield."
            return
        }

        let instructions = inlineInstructions
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        let product = ProductionProduct(
            name: trimmedName,
            outputItemID: outputItem.id,
            outputItemNameSnapshot: outputItem.name,
            outputUnitRaw: outputItem.unit.rawValue,
            howToGuideID: howToGuideID,
            defaultBatchYield: yield,
            targetDaysOnHand: targetDaysOnHand,
            instructions: instructions,
            isActive: true,
            lastSpotCheckQuantity: 0,
            lastSpotCheckDate: nil,
            organizationId: organizationId,
            storeId: storeId
        )
        modelContext.insert(product)

        for draft in ingredientDrafts {
            guard
                let ingredientItemID = draft.inventoryItemID,
                let ingredientItem = availableItems.first(where: { $0.id == ingredientItemID }),
                let qty = Double(draft.quantityText),
                qty > 0
            else {
                continue
            }

            let ingredient = ProductionIngredient(
                productionProductID: product.id,
                inventoryItemID: ingredientItem.id,
                inventoryItemNameSnapshot: ingredientItem.name,
                quantityPerBatch: qty,
                unitRaw: draft.unit.rawValue,
                organizationId: organizationId,
                storeId: storeId
            )
            modelContext.insert(ingredient)
        }

        try? modelContext.save()
        onSaved()
        dismiss()
    }

    private struct IngredientDraft: Identifiable {
        let id = UUID()
        var inventoryItemID: UUID?
        var quantityText: String = ""
        var unit: MeasurementUnit = .pieces
    }
}

private struct ProductionRunSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let suggestion: ProductionSuggestion
    let product: ProductionProduct?
    let outputItem: InventoryItem?
    let organizationId: String
    let storeId: String
    let onSaved: () -> Void

    @State private var quantityToMakeText: String = ""
    @State private var packageBarcode = ""
    @State private var expirationDate = Date()
    @State private var validationMessage: String?

    var body: some View {
        Form {
            Section("Production") {
                Text(suggestion.productName)
                    .font(.headline)
                HStack {
                    Text("Suggested")
                    Spacer()
                    Text("\(suggestion.recommendedMakeQuantity.formattedQuantity()) \(suggestion.outputUnitRaw)")
                        .foregroundStyle(.secondary)
                }
                TextField("Quantity made", text: $quantityToMakeText)
                    .keyboardType(.decimalPad)
                TextField("Barcode (optional)", text: $packageBarcode)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                DatePicker("Expiration", selection: $expirationDate, displayedComponents: .date)
            }

            if let validationMessage {
                Section {
                    Text(validationMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }
        }
        .navigationTitle("Mark Production")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Save") { saveRun() }
            }
        }
        .onAppear {
            quantityToMakeText = suggestion.recommendedMakeQuantity.formattedQuantity()
            if let item = outputItem {
                let days = (item.isPrepackaged || item.rewrapsWithUniqueBarcode)
                    ? item.effectiveDefaultPackedExpiration
                    : item.effectiveDefaultExpiration
                if let suggestedDate = Calendar.current.date(byAdding: .day, value: days, to: Date()) {
                    expirationDate = suggestedDate
                }
            } else if let suggestedDate = Calendar.current.date(byAdding: .day, value: 7, to: Date()) {
                expirationDate = suggestedDate
            }
        }
    }

    private func saveRun() {
        guard let product else {
            validationMessage = "This production product could not be loaded."
            return
        }
        guard let quantity = Double(quantityToMakeText), quantity > 0 else {
            validationMessage = "Enter a valid made quantity."
            return
        }

        guard let resolvedOutputItem = resolveOrCreateOutputItem(for: product) else {
            validationMessage = "Could not resolve an output inventory item."
            return
        }

        let trimmedBarcode = packageBarcode.trimmingCharacters(in: .whitespacesAndNewlines)
        let batch = Batch(
            quantity: quantity,
            expirationDate: expirationDate,
            receivedDate: Date(),
            packageBarcode: trimmedBarcode.isEmpty ? nil : trimmedBarcode,
            organizationId: organizationId,
            storeId: storeId
        )
        batch.item = resolvedOutputItem
        resolvedOutputItem.batches.append(batch)
        resolvedOutputItem.lastModified = Date()
        resolvedOutputItem.revision += 1

        let run = ProductionRun(
            productionProductID: product.id,
            outputItemID: resolvedOutputItem.id,
            outputBatchID: batch.id,
            quantityMade: quantity,
            packageBarcode: trimmedBarcode,
            expirationDate: expirationDate,
            madeAt: Date(),
            organizationId: organizationId,
            storeId: storeId
        )
        modelContext.insert(run)

        product.lastSpotCheckQuantity += quantity
        product.updatedAt = Date()
        product.revision += 1

        try? modelContext.save()
        onSaved()
        dismiss()
    }

    private func resolveOrCreateOutputItem(for product: ProductionProduct) -> InventoryItem? {
        if let outputItem {
            return outputItem
        }

        let fallbackName = product.outputItemNameSnapshot?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let outputName = (fallbackName?.isEmpty == false) ? fallbackName! : product.name
        let outputUnit = MeasurementUnit(rawValue: product.outputUnitRaw) ?? .pieces

        let created = InventoryItem(
            name: outputName,
            upc: nil,
            tags: ["production"],
            pictures: [],
            defaultExpiration: 7,
            defaultPackedExpiration: 7,
            vendor: nil,
            minimumQuantity: 0,
            quantityPerBox: 1,
            department: "Production",
            departmentLocation: nil,
            isPrepackaged: false,
            rewrapsWithUniqueBarcode: false,
            price: 0,
            unit: outputUnit,
            batches: [],
            organizationId: organizationId,
            backendId: nil,
            storeId: storeId
        )
        modelContext.insert(created)

        product.outputItemID = created.id
        if product.outputItemNameSnapshot?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true {
            product.outputItemNameSnapshot = created.name
        }
        product.outputUnitRaw = created.unit.rawValue
        product.updatedAt = Date()
        product.revision += 1

        return created
    }
}

private struct HowToLibraryView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @Query private var guides: [HowToGuide]

    let organizationId: String
    let canEdit: Bool
    let onGuideChanged: () -> Void

    @State private var searchText = ""
    @State private var showingNewGuide = false
    @State private var selectedGuide: GuidePreview?

    private var scopedGuides: [HowToGuide] {
        guides.filter { $0.organizationId == organizationId && $0.isActive }
            .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
    }

    private var filteredGuides: [HowToGuide] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return scopedGuides }
        return scopedGuides.filter { $0.searchableBlob.contains(query) }
    }

    var body: some View {
        List {
            Section {
                Text("Search company guides by title, keywords, or step text.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section("Guides") {
                if filteredGuides.isEmpty {
                    Text("No matching guides.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(filteredGuides) { guide in
                        Button {
                            selectedGuide = GuidePreview(from: guide)
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(guide.title)
                                if !guide.keywords.isEmpty {
                                    Text(guide.keywords.joined(separator: ", "))
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing) {
                            if canEdit {
                                Button(role: .destructive) {
                                    guide.isActive = false
                                    guide.updatedAt = Date()
                                    guide.revision += 1
                                    try? modelContext.save()
                                    onGuideChanged()
                                } label: {
                                    Label("Archive", systemImage: "archivebox")
                                }
                            }
                        }
                    }
                }
            }
        }
        .searchable(text: $searchText, prompt: "Search guides")
        .navigationTitle("How-To Library")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Done") { dismiss() }
            }
            if canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingNewGuide = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
        }
        .sheet(isPresented: $showingNewGuide) {
            NavigationStack {
                HowToEditorView(
                    organizationId: organizationId,
                    onSaved: onGuideChanged
                )
            }
        }
        .sheet(item: $selectedGuide) { preview in
            NavigationStack {
                HowToGuideDetailView(preview: preview)
            }
        }
    }
}

private struct HowToEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let organizationId: String
    let onSaved: () -> Void

    @State private var title = ""
    @State private var keywordsText = ""
    @State private var stepsText = ""
    @State private var notes = ""
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section("Guide") {
                TextField("Title", text: $title)
                TextField("Keywords (comma separated)", text: $keywordsText)
                TextEditor(text: $stepsText)
                    .frame(minHeight: 160)
                TextEditor(text: $notes)
                    .frame(minHeight: 100)
            }
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("New How-To")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Save") { saveGuide() }
            }
        }
    }

    private func saveGuide() {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            errorMessage = "Enter a title."
            return
        }

        let keywords = keywordsText
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        let steps = stepsText
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        let guide = HowToGuide(
            title: trimmedTitle,
            keywords: keywords,
            steps: steps,
            notes: notes.trimmingCharacters(in: .whitespacesAndNewlines),
            isActive: true,
            organizationId: organizationId
        )
        modelContext.insert(guide)
        try? modelContext.save()
        onSaved()
        dismiss()
    }
}

private struct GuidePreview: Identifiable {
    let id = UUID()
    let title: String
    let keywords: [String]
    let steps: [String]
    let notes: String

    init(from guide: HowToGuide) {
        self.title = guide.title
        self.keywords = guide.keywords
        self.steps = guide.steps
        self.notes = guide.notes
    }

    init(title: String, keywords: [String], steps: [String], notes: String) {
        self.title = title
        self.keywords = keywords
        self.steps = steps
        self.notes = notes
    }
}

private struct HowToGuideDetailView: View {
    @Environment(\.dismiss) private var dismiss
    let preview: GuidePreview

    var body: some View {
        List {
            Section("Guide") {
                Text(preview.title)
                    .font(.headline)
                if !preview.keywords.isEmpty {
                    Text(preview.keywords.joined(separator: ", "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Steps") {
                if preview.steps.isEmpty {
                    Text("No steps added yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(Array(preview.steps.enumerated()), id: \.offset) { index, step in
                        HStack(alignment: .top, spacing: 8) {
                            Text("\(index + 1).")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.secondary)
                            Text(step)
                        }
                    }
                }
            }

            if !preview.notes.isEmpty {
                Section("Notes") {
                    Text(preview.notes)
                }
            }
        }
        .navigationTitle("How-To")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { dismiss() }
            }
        }
    }
}
