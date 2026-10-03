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
            Image(systemName: item.status == "Low" ? "exclamationmark.triangle.fill" : "shippingbox.fill")
                .foregroundStyle(item.status == "Low" ? AppTheme.amber : session.theme.accentColor)
                .frame(width: 38, height: 38)
                .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
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
            if let nutrition = item.nutrition, nutrition.servingWeightGrams > 0 {
                Section("Nutrition for cut weight") {
                    Stepper("Cut: \(nutritionAmount.formatted(.number.precision(.fractionLength(2)))) \(item.unit)", value: $nutritionAmount, in: 0...100, step: item.unit == "pounds" ? 0.05 : 0.25)
                    let grams = item.unit == "pounds" ? nutritionAmount * 453.59237 : item.unit == "ounces" ? nutritionAmount * 28.349523125 : nutritionAmount
                    let servings = grams / nutrition.servingWeightGrams
                    LabeledContent("Serving basis", value: nutrition.servingSize)
                    LabeledContent("Servings", value: servings.formatted(.number.precision(.fractionLength(2))))
                    if let calories = nutrition.caloriesKcal { LabeledContent("Calories", value: (calories * servings).formatted(.number.precision(.fractionLength(0)))) }
                    if let fat = nutrition.fatG { LabeledContent("Fat", value: "\((fat * servings).formatted(.number.precision(.fractionLength(1)))) g") }
                    if let carbs = nutrition.carbohydratesG { LabeledContent("Carbohydrates", value: "\((carbs * servings).formatted(.number.precision(.fractionLength(1)))) g") }
                    if let protein = nutrition.proteinG { LabeledContent("Protein", value: "\((protein * servings).formatted(.number.precision(.fractionLength(1)))) g") }
                    if let sodium = nutrition.sodiumMg { LabeledContent("Sodium", value: "\((sodium * servings).formatted(.number.precision(.fractionLength(0)))) mg") }
                    if nutrition.dataKind == "representative_product_type" { Text("Representative values for this cut product type.").font(.caption).foregroundStyle(.secondary) }
                }
            }
        }
        .navigationTitle(item.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
