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
    @State private var approvalReason = ""
    @State private var recommendation: MobileOrderRecommendation?
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
                        if line.receivedQuantity > 0 {
                            Text("Received \(line.receivedQuantity.formattedQuantity) of \(line.finalQuantity.formattedQuantity)").font(.caption).foregroundStyle(.secondary)
                        }
                        if line.finalQuantity != line.suggestedQuantity {
                            Text("Suggested \(line.suggestedQuantity.formattedQuantity) • Override: \(line.overrideReason)").font(.caption).foregroundStyle(AppTheme.amber)
                        }
                    }
                    .padding(.vertical, 3)
                }
            }
            Section("Server recommendation") {
                if let recommendation {
                    Text("Engine \(recommendation.engineVersion) • \(recommendation.rulePath)")
                        .font(.caption).foregroundStyle(.secondary)
                    ForEach(recommendation.lines) { line in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(line.itemName): \(line.suggestedQuantity.formattedQuantity) \(line.orderUnit)").font(.subheadline.weight(.semibold))
                            Text(line.calculation).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    if !recommendation.degradedFlags.isEmpty {
                        Text("Data limits: \(recommendation.degradedFlags.joined(separator: ", "))").font(.caption).foregroundStyle(AppTheme.amber)
                    }
                }
                Button(recommendation == nil ? "Load current recommendation" : "Refresh recommendation") { loadRecommendation() }
                    .disabled(session.isWorking)
            }
            if !order.notes.isEmpty { Section("Notes") { Text(order.notes) } }
            if session.canSubmitOrders && ["Draft", "Needs review", "Ready"].contains(order.status) {
                Section {
                    if order.minimumGapAmount > 0 {
                        TextField("Below-minimum approval reason", text: $approvalReason, axis: .vertical)
                    }
                    Button("Approve order") { approve() }
                        .disabled(order.minimumGapAmount > 0 && approvalReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            if session.canSubmitOrders && order.status == "Approved" {
                Section {
                    Button("Record as submitted") { confirmSubmit = true }
                        .disabled(session.isWorking)
                }
            }
            if session.canSubmitOrders && order.status == "Received" {
                Section { Button("Reconcile and close") { reconcile() }.disabled(session.isWorking) }
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
            do { try await session.transitionOrder(order, action: "submit", sentMethod: "recorded") }
            catch { self.error = error.localizedDescription }
        }
    }

    private func approve() {
        Task {
            do { try await session.transitionOrder(order, action: "approve", reason: approvalReason.isEmpty ? nil : approvalReason) }
            catch { self.error = error.localizedDescription }
        }
    }

    private func reconcile() {
        Task {
            do { try await session.transitionOrder(order, action: "reconcile") }
            catch { self.error = error.localizedDescription }
        }
    }

    private func loadRecommendation() {
        Task {
            do { recommendation = try await session.recommendOrder(order) }
            catch { self.error = error.localizedDescription }
        }
    }
}
