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
                search = code
                scanEntry = false
            }
        }
        .refreshable { await session.loadWorkspace(storeId: session.selectedStoreId, quiet: true) }
    }
}

struct InventoryRow: View {
    let item: InventoryItem

    var body: some View {
        HStack(spacing: 13) {
            Image(systemName: item.status == "Low" ? "exclamationmark.triangle.fill" : "shippingbox.fill")
                .foregroundStyle(item.status == "Low" ? AppTheme.amber : AppTheme.accent)
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
    let item: InventoryItem
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
        }
        .navigationTitle(item.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
