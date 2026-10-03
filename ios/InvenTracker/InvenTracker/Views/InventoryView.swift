import SwiftUI

struct InventoryView: View {
    @EnvironmentObject private var session: AppSession
    @State private var search = ""
    @State private var scanEntry = false

    private var filtered: [InventoryItem] {
        guard !search.isEmpty else { return session.inventory.sorted { $0.name < $1.name } }
        let query = search.lowercased()
        return session.inventory.filter {
            [$0.name, $0.sku, $0.department, $0.category, $0.location].contains { $0.lowercased().contains(query) }
        }.sorted { $0.name < $1.name }
    }

    var body: some View {
        Group {
            if filtered.isEmpty {
                ContentUnavailableView("No inventory found", systemImage: "shippingbox", description: Text(search.isEmpty ? "This store has no inventory records yet." : "Try a different name or SKU."))
            } else {
                List(filtered) { item in
                    NavigationLink(value: item) { InventoryRow(item: item) }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Inventory")
        .navigationDestination(for: InventoryItem.self) { InventoryDetailView(item: $0) }
        .searchable(text: $search, prompt: "Name, SKU, department, or location")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { scanEntry = true } label: { Image(systemName: "barcode.viewfinder") }
            }
        }
        .sheet(isPresented: $scanEntry) {
            ScanEntryView { code in
                search = session.inventory.first(where: { $0.matchesBarcode(code) })?.name ?? code
                scanEntry = false
            }
        }
        .refreshable { await session.loadWorkspace(storeId: session.selectedStoreId, quiet: true) }
    }
}

struct InventoryRow: View {
    @EnvironmentObject private var session: AppSession
    let item: InventoryItem

    var body: some View {
        HStack(spacing: 13) {
            ProductImage(item: item, size: 52)
            VStack(alignment: .leading, spacing: 3) {
                Text(item.name).font(.body.weight(.semibold))
                Text([item.department, item.location].filter { !$0.isEmpty }.joined(separator: " • "))
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(item.onHand.formattedQuantity).font(.headline.monospacedDigit())
                Text(item.unit).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

struct InventoryDetailView: View {
    @EnvironmentObject private var session: AppSession
    let item: InventoryItem
    @State private var nutritionAmount = 0.25
    private var isVariableMeasure: Bool {
        item.variableMeasure?.isVariableMeasure == true || ["pounds", "ounces", "grams"].contains(item.unit.lowercased())
    }
    private func grams(for amount: Double) -> Double {
        switch item.unit.lowercased() {
        case "pounds", "pound", "lb", "lbs": return amount * 453.59237
        case "ounces", "ounce", "oz": return amount * 28.349523125
        case "kilograms", "kilogram", "kg": return amount * 1_000
        default: return amount
        }
    }
    private func nutritionValue(_ value: Double?, multiplier: Double = 1, unit: String = "") -> String? {
        guard let value else { return nil }
        let scaled = value * multiplier
        let digits = unit == "mg" || unit.isEmpty ? 0 : 1
        return scaled.formatted(.number.precision(.fractionLength(digits))) + (unit.isEmpty ? "" : " \(unit)")
    }
    private var batches: [InventoryBatch] {
        session.batches
            .filter { $0.itemId == item.id && $0.remainingQuantity > 0 }
            .sorted {
                if $0.expirationDate.isEmpty { return false }
                if $1.expirationDate.isEmpty { return true }
                return $0.expirationDate < $1.expirationDate
            }
    }
    private var today: Date { Calendar.current.startOfDay(for: Date()) }
    private func parsedDate(_ value: String) -> Date? {
        if let date = ISO8601DateFormatter().date(from: value) { return date }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "MMM d, yyyy"
        return formatter.date(from: value)
    }
    private var nextDelivery: (label: String, date: Date)? {
        session.orders
            .filter { ["Submitted", "Auto-submitted", "Partially received"].contains($0.status) }
            .filter { order in order.lines.contains { $0.sku == item.sku || $0.itemName == item.name } }
            .compactMap { order in parsedDate(order.expectedArrival).map { (order.expectedArrival, $0) } }
            .sorted { $0.1 < $1.1 }
            .first
    }
    private var expiredQuantity: Double { batches.filter { parsedDate($0.expirationDate).map { $0 < today } == true }.reduce(0) { $0 + $1.remainingQuantity } }
    private var unknownQuantity: Double { batches.filter { parsedDate($0.expirationDate) == nil }.reduce(0) { $0 + $1.remainingQuantity } }
    private var usableQuantity: Double { batches.filter { parsedDate($0.expirationDate).map { $0 >= today } == true }.reduce(0) { $0 + $1.remainingQuantity } }
    private var expiringBeforeDelivery: Double {
        guard let delivery = nextDelivery else { return 0 }
        return batches.filter { batch in parsedDate(batch.expirationDate).map { $0 >= today && $0 <= delivery.date } == true }.reduce(0) { $0 + $1.remainingQuantity }
    }
    var body: some View {
        List {
            Section {
                HStack {
                    Spacer()
                    ProductImage(item: item, size: 220)
                    Spacer()
                }
                .listRowBackground(Color.clear)
            }
            Section {
                LabeledContent("On hand", value: "\(item.onHand.formattedQuantity) \(item.unit)")
                LabeledContent("Sales floor", value: item.frontStock.formattedQuantity)
                LabeledContent("Backstock", value: item.backStock.formattedQuantity)
                LabeledContent("Par", value: item.par.formattedQuantity)
                LabeledContent("Reorder point", value: item.reorderPoint.formattedQuantity)
            } header: { Text("Stock") }
            Section {
                LabeledContent("SKU", value: item.sku)
                LabeledContent("Department", value: item.department)
                LabeledContent("Category", value: item.category)
                LabeledContent("Location", value: item.location)
                LabeledContent("Vendor", value: item.vendor)
                LabeledContent("Expiration", value: item.expires ? "Tracked" : "Not tracked")
            } header: { Text("Item") }
            if item.expires {
                Section("Availability") {
                    LabeledContent("Total physical", value: batches.reduce(0) { $0 + $1.remainingQuantity }.formattedQuantity)
                    LabeledContent("Usable dated", value: usableQuantity.formattedQuantity)
                    LabeledContent("Expired", value: expiredQuantity.formattedQuantity)
                    LabeledContent("Unknown date", value: unknownQuantity.formattedQuantity)
                    if let nextDelivery {
                        LabeledContent("Expires by \(nextDelivery.label)", value: expiringBeforeDelivery.formattedQuantity)
                    } else {
                        LabeledContent("Before next delivery", value: "Delivery unknown")
                    }
                    Text("Expired stock stays in the physical total but is excluded from usable dated stock.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section("Use first") {
                    if batches.isEmpty {
                        Text("Current stock predates batch tracking, so its expiration detail is unknown.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(batches) { batch in
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(batch.remainingQuantity.formattedQuantity) \(batch.unit)")
                                    .font(.body.weight(.semibold))
                                Text(batch.expirationKnown && parsedDate(batch.expirationDate) != nil
                                     ? "\(parsedDate(batch.expirationDate)! < today ? "Expired" : "Expires") \(String(batch.expirationDate.prefix(10))) • \(batch.area == "front" ? "Sales floor" : "Backstock")"
                                     : "Expiration unknown • \(batch.area == "front" ? "Sales floor" : "Backstock")")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            if let nutrition = item.nutrition {
                Section("Nutrition facts") {
                    LabeledContent("Serving size", value: nutrition.servingSize.isEmpty ? "Declared serving" : nutrition.servingSize)
                    if let value = nutritionValue(nutrition.caloriesKcal) { LabeledContent("Calories", value: value) }
                    if let value = nutritionValue(nutrition.fatG, unit: "g") { LabeledContent("Total fat", value: value) }
                    if let value = nutritionValue(nutrition.saturatedFatG, unit: "g") { LabeledContent("Saturated fat", value: value) }
                    if let value = nutritionValue(nutrition.carbohydratesG, unit: "g") { LabeledContent("Carbohydrates", value: value) }
                    if let value = nutritionValue(nutrition.fiberG, unit: "g") { LabeledContent("Fiber", value: value) }
                    if let value = nutritionValue(nutrition.sugarsG, unit: "g") { LabeledContent("Sugars", value: value) }
                    if let value = nutritionValue(nutrition.proteinG, unit: "g") { LabeledContent("Protein", value: value) }
                    if let value = nutritionValue(nutrition.sodiumMg, unit: "mg") { LabeledContent("Sodium", value: value) }
                    if !nutrition.ingredientsText.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Ingredients").font(.subheadline.weight(.semibold))
                            Text(nutrition.ingredientsText).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    if let url = URL(string: nutrition.sourceUrl), !nutrition.sourceUrl.isEmpty {
                        Link("Nutrition source", destination: url)
                    }
                    if nutrition.dataKind == "representative_product_type" {
                        Text("Representative values for this product type. Confirm against the supplier label when available.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                if isVariableMeasure && nutrition.servingWeightGrams > 0 {
                    Section("Nutrition for cut weight") {
                        Stepper("Cut: \(nutritionAmount.formatted(.number.precision(.fractionLength(2)))) \(item.unit)", value: $nutritionAmount, in: 0.01...100, step: item.unit.lowercased() == "pounds" ? 0.05 : 0.25)
                        let servings = grams(for: nutritionAmount) / nutrition.servingWeightGrams
                        LabeledContent("Serving basis", value: nutrition.servingSize)
                        LabeledContent("Servings", value: servings.formatted(.number.precision(.fractionLength(2))))
                        if let value = nutritionValue(nutrition.caloriesKcal, multiplier: servings) { LabeledContent("Calories", value: value) }
                        if let value = nutritionValue(nutrition.fatG, multiplier: servings, unit: "g") { LabeledContent("Total fat", value: value) }
                        if let value = nutritionValue(nutrition.saturatedFatG, multiplier: servings, unit: "g") { LabeledContent("Saturated fat", value: value) }
                        if let value = nutritionValue(nutrition.carbohydratesG, multiplier: servings, unit: "g") { LabeledContent("Carbohydrates", value: value) }
                        if let value = nutritionValue(nutrition.fiberG, multiplier: servings, unit: "g") { LabeledContent("Fiber", value: value) }
                        if let value = nutritionValue(nutrition.sugarsG, multiplier: servings, unit: "g") { LabeledContent("Sugars", value: value) }
                        if let value = nutritionValue(nutrition.proteinG, multiplier: servings, unit: "g") { LabeledContent("Protein", value: value) }
                        if let value = nutritionValue(nutrition.sodiumMg, multiplier: servings, unit: "mg") { LabeledContent("Sodium", value: value) }
                    }
                }
            }
        }
        .navigationTitle(item.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct ProductImage: View {
    @EnvironmentObject private var session: AppSession
    let item: InventoryItem
    let size: CGFloat

    var body: some View {
        Group {
            if let url = item.primaryImageURL {
                AsyncImage(url: url, transaction: Transaction(animation: .easeInOut(duration: 0.2))) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFit().padding(size > 100 ? 10 : 4)
                    case .failure:
                        placeholder
                    case .empty:
                        ProgressView()
                    @unknown default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: size > 100 ? 18 : 11, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: size > 100 ? 18 : 11, style: .continuous))
        .accessibilityLabel("Photo of \(item.name)")
    }

    private var placeholder: some View {
        Image(systemName: item.status == "Low" ? "exclamationmark.triangle.fill" : "shippingbox.fill")
            .font(.system(size: size > 100 ? 54 : 20))
            .foregroundStyle(item.status == "Low" ? AppTheme.amber : session.theme.accentColor)
    }
}
