import SwiftUI

struct OperationsView: View {
    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                OperationTile(title: "Spot Check", detail: "Count floor and backstock", icon: "viewfinder", color: AppTheme.accent, destination: SpotCheckView())
                OperationTile(title: "Restock", detail: "Calculate what to pull", icon: "arrow.triangle.2.circlepath", color: AppTheme.mint, destination: RestockView())
                OperationTile(title: "Waste", detail: "Record shrink", icon: "trash.fill", color: AppTheme.danger, destination: WasteView())
                OperationTile(title: "Health Checks", detail: "Complete assigned checks", icon: "checklist", color: AppTheme.amber, destination: HealthCheckListView())
            }
            .padding(16)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Work")
    }
}

private struct OperationTile<Destination: View>: View {
    let title: String
    let detail: String
    let icon: String
    let color: Color
    let destination: Destination

    var body: some View {
        NavigationLink { destination } label: {
            VStack(alignment: .leading, spacing: 14) {
                Image(systemName: icon).font(.title2.weight(.semibold)).foregroundStyle(.white)
                    .frame(width: 50, height: 50).background(color, in: RoundedRectangle(cornerRadius: 14))
                Spacer(minLength: 8)
                Text(title).font(.headline).foregroundStyle(.primary)
                Text(detail).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, minHeight: 176, alignment: .leading)
            .padding(16)
            .appSurface()
        }
        .buttonStyle(.plain)
    }
}

struct SpotCheckView: View {
    @EnvironmentObject private var session: AppSession
    @State private var lines: [SpotCheckLine] = []
    @State private var editingItem: InventoryItem?
    @State private var error = ""

    var body: some View {
        ZStack {
            List {
                if lines.isEmpty {
                    ContentUnavailableView("No items counted", systemImage: "viewfinder", description: Text("Add an item to begin the spot check."))
                        .listRowBackground(Color.clear)
                }
                ForEach(lines) { line in
                    let item = session.inventory.first { $0.id == line.itemId }
                    HStack {
                        VStack(alignment: .leading) {
                            Text(item?.name ?? "Item").font(.body.weight(.semibold))
                            Text("Floor \(line.frontStock.formattedQuantity) • Back \(line.backStock.formattedQuantity)")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Edit") { editingItem = item }.buttonStyle(.bordered)
                    }
                }
                Section {
                    NavigationLink { ItemPickerView(title: "Add to spot check") { editingItem = $0 } } label: {
                        Label("Add item", systemImage: "plus")
                    }
                }
            }
            if let item = editingItem {
                Color.black.opacity(0.36).ignoresSafeArea().onTapGesture { editingItem = nil }
                CountEntryCard(
                    item: item,
                    existing: lines.first { $0.itemId == item.id },
                    onCancel: { editingItem = nil },
                    onSave: { value in
                        lines.removeAll { $0.itemId == item.id }
                        lines.append(value)
                        editingItem = nil
                    }
                )
                .padding(22)
                .transition(.scale.combined(with: .opacity))
            }
        }
        .navigationTitle("Spot Check")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Submit") { submit() }.disabled(lines.isEmpty || session.isWorking)
            }
        }
        .alert("Couldn’t save", isPresented: .constant(!error.isEmpty)) {
            Button("OK") { error = "" }
        } message: { Text(error) }
    }

    private func submit() {
        Task {
            do { try await session.submitSpotCheck(lines); lines = [] }
            catch { self.error = error.localizedDescription }
        }
    }
}

private struct CountEntryCard: View {
    let item: InventoryItem
    let existing: SpotCheckLine?
    let onCancel: () -> Void
    let onSave: (SpotCheckLine) -> Void
    @State private var front: Double
    @State private var back: Double
    @State private var expiration = Date()

    init(item: InventoryItem, existing: SpotCheckLine?, onCancel: @escaping () -> Void, onSave: @escaping (SpotCheckLine) -> Void) {
        self.item = item
        self.existing = existing
        self.onCancel = onCancel
        self.onSave = onSave
        _front = State(initialValue: existing?.frontStock ?? item.frontStock)
        _back = State(initialValue: existing?.backStock ?? item.backStock)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Count item").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                Text(item.name).font(.title3.bold())
            }
            Stepper("Sales floor: \(front.formattedQuantity)", value: $front, in: 0...100_000)
            Stepper("Backstock: \(back.formattedQuantity)", value: $back, in: 0...100_000)
            if item.expires {
                DatePicker("Expiration", selection: $expiration, displayedComponents: .date)
            }
            HStack {
                Button("Cancel", action: onCancel).buttonStyle(.bordered)
                Spacer()
                Button("Save count") {
                    onSave(SpotCheckLine(itemId: item.id, frontStock: front, backStock: back, expirationDate: item.expires ? expiration.ISO8601Format() : nil))
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(20)
        .background(.thickMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.28), radius: 30, y: 12)
    }
}

struct RestockView: View {
    @EnvironmentObject private var session: AppSession
    @State private var lines: [RestockLine] = []
    @State private var recommendations: [RestockRecommendation] = []
    @State private var error = ""

    var body: some View {
        List {
            Section("Sales floor count") {
                ForEach($lines) { $line in
                    let item = session.inventory.first { $0.id == line.itemId }
                    Stepper("\(item?.name ?? "Item"): \(line.countedFrontStock.formattedQuantity)", value: $line.countedFrontStock, in: 0...100_000)
                }
                NavigationLink { ItemPickerView(title: "Add to restock") { item in
                    if !lines.contains(where: { $0.itemId == item.id }) {
                        lines.append(RestockLine(itemId: item.id, countedFrontStock: item.frontStock))
                    }
                } } label: { Label("Add item", systemImage: "plus") }
            }
            if !recommendations.isEmpty {
                Section("Pull from backstock") {
                    ForEach(recommendations) { item in
                        LabeledContent(item.name, value: item.pullQuantity == 0 ? "Nothing" : "Pull \(item.pullQuantity.formattedQuantity)")
                    }
                }
            }
        }
        .navigationTitle("Restock")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(recommendations.isEmpty ? "Calculate" : "Complete") { action() }
                    .disabled(lines.isEmpty || session.isWorking)
            }
        }
        .alert("Couldn’t complete restock", isPresented: .constant(!error.isEmpty)) { Button("OK") { error = "" } } message: { Text(error) }
    }

    private func action() {
        Task {
            do {
                if recommendations.isEmpty { recommendations = try await session.previewRestock(lines).recommendations }
                else { try await session.commitRestock(lines); lines = []; recommendations = [] }
            } catch { self.error = error.localizedDescription }
        }
    }
}

struct WasteView: View {
    @EnvironmentObject private var session: AppSession
    @State private var selected: InventoryItem?
    @State private var quantity = 1.0
    @State private var area = "front"
    @State private var reason = ""
    @State private var error = ""

    var body: some View {
        Form {
            Section("Item") {
                NavigationLink { ItemPickerView(title: "Choose item") { selected = $0 } } label: {
                    LabeledContent("Product", value: selected?.name ?? "Choose")
                }
                Stepper("Quantity: \(quantity.formattedQuantity)", value: $quantity, in: 1...100_000)
                Picker("Stock area", selection: $area) {
                    Text("Sales floor").tag("front")
                    Text("Backstock").tag("back")
                }
                .pickerStyle(.segmented)
            }
            Section("Reason") { TextField("Damaged, expired, quality…", text: $reason, axis: .vertical) }
            Button("Record waste") { submit() }
                .disabled(selected == nil || reason.trimmingCharacters(in: .whitespaces).isEmpty || session.isWorking)
        }
        .navigationTitle("Waste")
        .alert("Couldn’t record waste", isPresented: .constant(!error.isEmpty)) { Button("OK") { error = "" } } message: { Text(error) }
    }

    private func submit() {
        guard let selected else { return }
        Task {
            do {
                try await session.recordWaste(WasteLine(itemId: selected.id, quantity: quantity, area: area, reason: reason))
                self.selected = nil; quantity = 1; reason = ""
            } catch { self.error = error.localizedDescription }
        }
    }
}

struct HealthCheckListView: View {
    @EnvironmentObject private var session: AppSession
    var body: some View {
        List(session.workspace?.healthChecks ?? []) { check in
            VStack(alignment: .leading, spacing: 4) {
                Text(check.name).font(.body.weight(.semibold))
                Text("\(check.status) • \(check.schedule)").font(.caption).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Health Checks")
    }
}

struct ItemPickerView: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    let title: String
    let onSelect: (InventoryItem) -> Void
    @State private var search = ""
    @State private var scanEntry = false

    private var items: [InventoryItem] {
        guard !search.isEmpty else { return session.inventory }
        let query = search.lowercased()
        return session.inventory.filter { $0.name.lowercased().contains(query) || $0.sku.lowercased().contains(query) }
    }

    var body: some View {
        List(items.sorted { $0.name < $1.name }) { item in
            Button { onSelect(item); dismiss() } label: { InventoryRow(item: item) }.buttonStyle(.plain)
        }
        .navigationTitle(title)
        .searchable(text: $search, prompt: "Name or SKU")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { scanEntry = true } label: { Image(systemName: "barcode.viewfinder") }
            }
        }
        .sheet(isPresented: $scanEntry) {
            ScanEntryView { code in
                if let match = session.inventory.first(where: { $0.sku.caseInsensitiveCompare(code) == .orderedSame }) {
                    onSelect(match)
                    dismiss()
                } else {
                    search = code
                    scanEntry = false
                }
            }
        }
    }
}
