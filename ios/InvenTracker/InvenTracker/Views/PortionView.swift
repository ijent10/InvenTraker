import SwiftUI

struct PortionView: View {
    @EnvironmentObject private var session: AppSession
    @State private var selectedItem: InventoryItem?
    @State private var showItemPicker = false
    @State private var scanEntry = false
    @State private var sourceArea = "back"
    @State private var sourceBatchId = ""
    @State private var portionWeight = 8.0
    @State private var portionCount = 1
    @State private var weightUnit = PortionWeightUnit.ounces
    @State private var expirationDate = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
    @State private var packageBarcodePrefix = ""
    @State private var error = ""

    private var weighableItems: [InventoryItem] {
        session.inventory.filter { item in
            item.variableMeasure?.isVariableMeasure == true || PortionWeightUnit.inventoryGrams(for: item.unit) != nil
        }
    }

    private var sourceBatches: [InventoryBatch] {
        guard let selectedItem else { return [] }
        return session.batches.filter {
            $0.itemId == selectedItem.id && $0.area == sourceArea && $0.remainingQuantity > 0
        }.sorted { $0.expirationDate < $1.expirationDate }
    }

    private var portionWeightInInventoryUnit: Double {
        guard let selectedItem,
              let inventoryGrams = PortionWeightUnit.inventoryGrams(for: selectedItem.unit) else { return 0 }
        return weightUnit.grams(for: portionWeight) / inventoryGrams
    }

    private var totalWeightInInventoryUnit: Double {
        portionWeightInInventoryUnit * Double(portionCount)
    }

    private var available: Double {
        guard let selectedItem else { return 0 }
        return sourceArea == "front" ? selectedItem.frontStock : selectedItem.backStock
    }

    private var canSubmit: Bool {
        selectedItem != nil && portionWeight > 0 && portionCount > 0 && totalWeightInInventoryUnit <= available && !session.isWorking
    }

    var body: some View {
        List {
            Section {
                TaskCameraPrompt(
                    title: "Choose weighable product",
                    detail: "Scan or select bulk product, then define the finished portions.",
                    scanTitle: "Scan product",
                    onScan: { scanEntry = true },
                    onManual: { showItemPicker = true }
                )
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 8, trailing: 16))
                .listRowBackground(Color.clear)
            }

            if let item = selectedItem {
                Section("Product") {
                    InventoryRow(item: item)
                    Picker("Take stock from", selection: $sourceArea) {
                        Text("Backstock · \(item.backStock.formattedQuantity) \(item.unit)").tag("back")
                        Text("Sales floor · \(item.frontStock.formattedQuantity) \(item.unit)").tag("front")
                    }
                    if !sourceBatches.isEmpty {
                        Picker("Source batch", selection: $sourceBatchId) {
                            Text("Use earliest expiring").tag("")
                            ForEach(sourceBatches) { batch in
                                Text("\(batch.remainingQuantity.formattedQuantity) \(batch.unit) · \(batch.expirationDate.isEmpty ? "date unknown" : String(batch.expirationDate.prefix(10)))")
                                    .tag(batch.id)
                            }
                        }
                    } else {
                        Label("No tracked batches yet; available area stock will become tracked portions.", systemImage: "info.circle")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Portion setup") {
                    HStack {
                        Text("Each portion")
                        Spacer()
                        TextField("0", value: $portionWeight, format: .number.precision(.fractionLength(0...3)))
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 90)
                        Picker("Unit", selection: $weightUnit) {
                            ForEach(PortionWeightUnit.allCases) { unit in Text(unit.label).tag(unit) }
                        }
                        .labelsHidden()
                        .frame(width: 86)
                    }
                    Stepper("Number of portions: \(portionCount)", value: $portionCount, in: 1...200)
                    if item.expires {
                        DatePicker("Finished expiration", selection: $expirationDate, displayedComponents: .date)
                    }
                    TextField("Label barcode prefix (optional)", text: $packageBarcodePrefix)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Section("Preview") {
                    PortionPreviewBubble(title: "Total used", value: "\(totalWeightInInventoryUnit.formatted(.number.precision(.fractionLength(0...3)))) \(item.unit)", color: session.theme.accentColor)
                    PortionPreviewBubble(title: "Remaining in area", value: "\(max(0, available - totalWeightInInventoryUnit).formatted(.number.precision(.fractionLength(0...3)))) \(item.unit)", color: .green)
                    if let nutrition = item.nutrition, nutrition.servingWeightGrams > 0 {
                        let servings = weightUnit.grams(for: portionWeight) / nutrition.servingWeightGrams
                        HStack(spacing: 10) {
                            if let calories = nutrition.caloriesKcal {
                                PortionPreviewBubble(title: "Calories each", value: (calories * servings).formatted(.number.precision(.fractionLength(0))), color: .orange)
                            }
                            PortionPreviewBubble(title: "Servings each", value: servings.formatted(.number.precision(.fractionLength(2))), color: .purple)
                        }
                        Text("Nutrition is calculated for one finished portion from the product’s \(nutrition.servingSize) basis.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if totalWeightInInventoryUnit > available {
                        Label("These portions require more than the \(available.formattedQuantity) \(item.unit) available in \(sourceArea == "front" ? "sales floor" : "backstock").", systemImage: "exclamationmark.triangle.fill")
                            .font(.caption)
                            .foregroundStyle(AppTheme.danger)
                    }
                }

                Section {
                    Button {
                        submit(item)
                    } label: {
                        HStack {
                            Spacer()
                            if session.isWorking { ProgressView().tint(session.theme.buttonTextColor) }
                            Text("Create \(portionCount) portion\(portionCount == 1 ? "" : "s")").fontWeight(.semibold)
                            Spacer()
                        }
                    }
                    .disabled(!canSubmit)
                    .listRowBackground(session.theme.accentColor)
                    .foregroundStyle(session.theme.buttonTextColor)
                }
            } else {
                ContentUnavailableView("Select a weighable item", systemImage: "scissors", description: Text("Cut and portion is available for products stored by weight."))
            }
        }
        .navigationTitle("Cut & Portion")
        .sheet(isPresented: $showItemPicker) {
            NavigationStack {
                PortionItemPicker(items: weighableItems) { select($0) }
            }
        }
        .sheet(isPresented: $scanEntry) {
            ScanEntryView { code in
                scanEntry = false
                guard let item = weighableItems.first(where: { $0.matchesBarcode(code) }) else {
                    error = "That barcode does not match a weighable item in this store."
                    return
                }
                select(item)
            }
        }
        .alert("Couldn’t create portions", isPresented: .constant(!error.isEmpty)) {
            Button("OK") { error = "" }
        } message: { Text(error) }
    }

    private func select(_ item: InventoryItem) {
        selectedItem = item
        sourceArea = item.backStock > 0 ? "back" : "front"
        sourceBatchId = ""
    }

    private func submit(_ item: InventoryItem) {
        let request = PortionRequest(
            itemId: item.id,
            sourceArea: sourceArea,
            sourceBatchId: sourceBatchId.isEmpty ? nil : sourceBatchId,
            portionWeight: portionWeightInInventoryUnit,
            portionCount: portionCount,
            expirationDate: item.expires ? expirationDate.ISO8601Format() : nil,
            packageBarcodePrefix: packageBarcodePrefix.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : packageBarcodePrefix.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        Task {
            do {
                _ = try await session.portion(request)
                portionCount = 1
                packageBarcodePrefix = ""
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

private enum PortionWeightUnit: String, CaseIterable, Identifiable {
    case ounces, pounds, grams
    var id: String { rawValue }
    var label: String { self == .ounces ? "oz" : self == .pounds ? "lb" : "g" }
    func grams(for amount: Double) -> Double { self == .ounces ? amount * 28.349523125 : self == .pounds ? amount * 453.59237 : amount }
    static func inventoryGrams(for unit: String) -> Double? {
        switch unit.lowercased() {
        case "pounds", "pound", "lbs", "lb": 453.59237
        case "ounces", "ounce", "oz": 28.349523125
        case "grams", "gram", "g": 1
        case "kilograms", "kilogram", "kg": 1_000
        default: nil
        }
    }
}

private struct PortionPreviewBubble: View {
    let title: String
    let value: String
    let color: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.headline.monospacedDigit())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct PortionItemPicker: View {
    @Environment(\.dismiss) private var dismiss
    let items: [InventoryItem]
    let onSelect: (InventoryItem) -> Void
    @State private var search = ""

    private var filtered: [InventoryItem] {
        guard !search.isEmpty else { return items.sorted { $0.name < $1.name } }
        let query = search.lowercased()
        return items.filter { $0.name.lowercased().contains(query) || $0.sku.contains(query) }.sorted { $0.name < $1.name }
    }

    var body: some View {
        List(filtered) { item in
            Button { onSelect(item); dismiss() } label: { InventoryRow(item: item) }.buttonStyle(.plain)
        }
        .navigationTitle("Choose weighable product")
        .searchable(text: $search, prompt: "Name or barcode")
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
    }
}
