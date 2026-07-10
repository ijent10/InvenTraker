import SwiftUI

struct OrdersView: View {
    @EnvironmentObject private var session: AppSession

    var body: some View {
        Group {
            if session.orders.isEmpty {
                ContentUnavailableView("No orders", systemImage: "cart", description: Text("Order drafts created on the website will appear here."))
            } else {
                List(session.orders) { order in
                    NavigationLink(value: order) {
                        VStack(alignment: .leading, spacing: 5) {
                            HStack {
                                Text(order.vendor).font(.body.weight(.semibold))
                                Spacer()
                                Text(order.estimatedTotal).font(.body.monospacedDigit())
                            }
                            HStack {
                                Text(order.status)
                                Spacer()
                                Text(order.dueBy)
                            }
                            .font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Orders")
        .navigationDestination(for: OrderDraft.self) { OrderDetailView(order: $0) }
        .refreshable { await session.loadWorkspace(storeId: session.selectedStoreId, quiet: true) }
    }
}

private struct OrderDetailView: View {
    @EnvironmentObject private var session: AppSession
    let order: OrderDraft
    @State private var confirmSubmit = false
    @State private var error = ""

    var body: some View {
        List {
            Section("Order") {
                LabeledContent("Status", value: order.status)
                LabeledContent("Estimated total", value: order.estimatedTotal)
                LabeledContent("Vendor minimum", value: order.minimum)
                LabeledContent("Due", value: order.dueBy)
                LabeledContent("Arrival", value: order.expectedArrival)
            }
            Section("Items") {
                ForEach(order.lines) { line in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(line.itemName).font(.body.weight(.semibold))
                            Spacer()
                            Text("\(line.quantity.formattedQuantity) \(line.unit)")
                        }
                        Text(line.reason).font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 3)
                }
            }
            if !order.notes.isEmpty { Section("Notes") { Text(order.notes) } }
            if !["Submitted", "Auto-submitted"].contains(order.status) {
                Section {
                    Button("Submit order") { confirmSubmit = true }
                        .disabled(session.isWorking)
                }
            }
        }
        .navigationTitle(order.vendor)
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Submit this order?", isPresented: $confirmSubmit, titleVisibility: .visible) {
            Button("Submit order") { submit() }
            Button("Cancel", role: .cancel) {}
        } message: { Text("The website will validate the vendor catalog and minimum before submitting.") }
        .alert("Couldn’t submit order", isPresented: .constant(!error.isEmpty)) { Button("OK") { error = "" } } message: { Text(error) }
    }

    private func submit() {
        Task {
            do { try await session.submitOrder(order.id) }
            catch { self.error = error.localizedDescription }
        }
    }
}
