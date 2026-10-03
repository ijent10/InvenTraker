import SwiftUI

struct WorkShortcutHostView: View {
    let shortcut: WorkShortcut

    var body: some View {
        Group {
            switch shortcut {
            case .work:
                OperationsView()
            case .inventory:
                InventoryView()
            case .spotCheck:
                SpotCheckView()
            case .restock:
                RestockView()
            case .receiving:
                ReceivingView()
            case .waste:
                WasteView()
            case .transfer:
                TransferView()
            case .portion:
                PortionView()
            case .orders:
                OrdersView()
            case .healthChecks:
                HealthCheckListView()
            case .insights:
                InsightsView()
            }
        }
        .toolbar {
            if shortcut != .work {
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink {
                        OperationsView()
                    } label: {
                        Label("All work", systemImage: "square.grid.2x2")
                    }
                    .accessibilityLabel("All work")
                }
            }
        }
    }
}

struct OperationsView: View {
    @EnvironmentObject private var session: AppSession

    private var modules: [WorkShortcut] {
        WorkShortcut.allCases.filter { $0 != .work && canOpen($0) }
    }

    var body: some View {
        Group {
            if modules.isEmpty {
                ContentUnavailableView(
                    "No work tools assigned",
                    systemImage: "lock",
                    description: Text("Ask an organization owner to assign a Work permission in the portal.")
                )
                .padding(.top, 88)
            } else {
                List {
                    Section {
                        Text("Choose a task. Your favorite task stays in the bottom bar for one-tap access.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Section("All tools") {
                    ForEach(modules) { module in
                        NavigationLink {
                            WorkShortcutHostView(shortcut: module)
                        } label: {
                            OperationTile(module: module, color: color(for: module))
                        }
                        .buttonStyle(.plain)
                    }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .background(session.theme.backgroundColor)
        .navigationTitle("Work Tools")
    }

    private func canOpen(_ shortcut: WorkShortcut) -> Bool {
        session.availableWorkShortcuts.contains(shortcut)
    }

    private func color(for module: WorkShortcut) -> Color {
        switch module {
        case .inventory:
            session.theme.accentColor
        case .spotCheck:
            session.theme.accentColor.opacity(0.84)
        case .restock:
            session.theme.secondaryColor
        case .receiving:
            session.theme.accentColor.opacity(0.68)
        case .waste:
            AppTheme.danger
        case .transfer:
            Color.indigo
        case .portion:
            Color.cyan
        case .orders:
            session.theme.secondaryColor.opacity(0.82)
        case .healthChecks:
            AppTheme.amber
        case .insights:
            Color.purple
        case .work:
            session.theme.accentColor
        }
    }
}

struct WorkTabSettingsView: View {
    @EnvironmentObject private var session: AppSession

    var body: some View {
        List {
            Section {
                Text("Choose the task shown as your customizable bottom-bar button. It works on this iPhone immediately and syncs when the server supports mobile settings.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section("Shortcut button") {
                ForEach(session.availableWorkShortcuts) { shortcut in
                    Button {
                        Task { await session.updateWorkShortcut(shortcut) }
                    } label: {
                        HStack(spacing: 14) {
                            Image(systemName: shortcut.icon)
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(shortcut == session.workShortcut ? session.theme.accentColor : .secondary)
                                .frame(width: 28)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(shortcut.title)
                                    .foregroundStyle(.primary)
                                Text(shortcut.detail)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if shortcut == session.workShortcut {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(session.theme.accentColor)
                            }
                        }
                        .contentShape(Rectangle())
                        .padding(.vertical, 4)
                        .padding(.horizontal, 8)
                        .background(
                            shortcut == session.workShortcut ? session.theme.controlHoverColor : session.theme.controlBackgroundColor,
                            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                        )
                        .overlay {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(session.theme.controlBorderColor, lineWidth: 1)
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(session.isWorking)
                }
            }
        }
        .navigationTitle("Shortcut button")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct OperationTile: View {
    @EnvironmentObject private var session: AppSession
    let module: WorkShortcut
    let color: Color

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: module.icon).font(.title2.weight(.semibold)).foregroundStyle(session.theme.buttonTextColor)
                .frame(width: 46, height: 46).background(color, in: RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 3) {
                Text(module.title).font(.headline).foregroundStyle(session.theme.textColor)
                Text(module.detail).font(.caption).foregroundStyle(session.theme.subtleColor).multilineTextAlignment(.leading).lineLimit(2)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(session.theme.subtleColor)
        }
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .padding(.vertical, 5)
    }
}

struct SpotCheckView: View {
    @EnvironmentObject private var session: AppSession
    @State private var lines: [SpotCheckLine] = []
    @State private var editingItem: InventoryItem?
    @State private var scanEntry = false
    @State private var manualPicker = false
    @State private var error = ""

    var body: some View {
        ZStack {
            List {
                Section {
                    TaskCameraPrompt(
                        title: "Scan to count",
                        detail: "Scan each product, then enter its floor and backstock count.",
                        scanTitle: "Scan product",
                        onScan: { scanEntry = true },
                        onManual: { manualPicker = true }
                    )
                    .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)
                }
                if lines.isEmpty {
                    ContentUnavailableView("Ready for a count", systemImage: "viewfinder", description: Text("Scan the first product to begin."))
                        .listRowBackground(Color.clear)
                } else {
                    Section("Items counted") {
                        ForEach(lines) { line in
                            let item = session.inventory.first { $0.id == line.itemId }
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(item?.name ?? "Item").font(.body.weight(.semibold))
                                    Text("Floor \(line.frontStock.formattedQuantity) • Back \(line.backStock.formattedQuantity)")
                                        .font(.caption).foregroundStyle(session.theme.mutedColor)
                                }
                                Spacer()
                                Button("Edit") { editingItem = item }.buttonStyle(.bordered)
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
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
        .sheet(isPresented: $scanEntry) {
            ScanEntryView { code in
                scanEntry = false
                selectScannedItem(code)
            }
        }
        .sheet(isPresented: $manualPicker) {
            NavigationStack {
                ItemPickerView(title: "Choose product") { item in
                    editingItem = item
                    manualPicker = false
                }
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

    private func selectScannedItem(_ code: String) {
        guard let item = session.inventory.first(where: { $0.matchesBarcode(code) }) else {
            error = "No existing portal item matches this barcode or SKU."
            return
        }
        editingItem = item
    }
}

private struct CountEntryCard: View {
    @EnvironmentObject private var session: AppSession
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
                Text("Count item").font(.caption.weight(.semibold)).foregroundStyle(session.theme.mutedColor)
                Text(item.name).font(.title3.bold()).foregroundStyle(session.theme.textColor)
            }
            Stepper("Sales floor: \(front.formattedQuantity)", value: $front, in: 0...100_000)
            Stepper("Backstock: \(back.formattedQuantity)", value: $back, in: 0...100_000)
            if item.expires {
                DatePicker("Expiration", selection: $expiration, displayedComponents: .date)
            }
            HStack {
                Button("Cancel", action: onCancel)
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .foregroundStyle(session.theme.textColor)
                    .background(session.theme.controlBackgroundColor, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(session.theme.controlBorderColor, lineWidth: 1)
                    }
                Button("Save count") {
                    onSave(SpotCheckLine(itemId: item.id, expectedRevision: item.revision, frontStock: front, backStock: back, expirationDate: item.expires ? expiration.ISO8601Format() : nil))
                }
                .font(.body.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .foregroundStyle(session.theme.buttonTextColor)
                .background(session.theme.accentColor, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .padding(20)
        .background(session.theme.panelStrongColor, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(session.theme.controlBorderColor, lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.28), radius: 30, y: 12)
    }
}

struct RestockView: View {
    @EnvironmentObject private var session: AppSession
    @State private var lines: [RestockLine] = []
    @State private var recommendations: [RestockRecommendation] = []
    @State private var scanEntry = false
    @State private var manualPicker = false
    @State private var error = ""

    var body: some View {
        List {
            Section {
                TaskCameraPrompt(
                    title: "Scan the sales floor",
                    detail: "Scan products to count what is out, then InvenTracker calculates what to pull.",
                    scanTitle: "Scan product",
                    onScan: { scanEntry = true },
                    onManual: { manualPicker = true }
                )
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 8, trailing: 16))
                .listRowBackground(Color.clear)
            }
            Section("Sales floor count") {
                ForEach($lines) { $line in
                    let item = session.inventory.first { $0.id == line.itemId }
                    Stepper("\(item?.name ?? "Item"): \(line.countedFrontStock.formattedQuantity)", value: $line.countedFrontStock, in: 0...100_000)
                }
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
        .sheet(isPresented: $scanEntry) {
            ScanEntryView { code in
                scanEntry = false
                addScannedItem(code)
            }
        }
        .sheet(isPresented: $manualPicker) {
            NavigationStack {
                ItemPickerView(title: "Choose product") { item in
                    add(item)
                    manualPicker = false
                }
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

    private func addScannedItem(_ code: String) {
        guard let item = session.inventory.first(where: { $0.matchesBarcode(code) }) else {
            error = "No existing portal item matches this barcode or SKU."
            return
        }
        add(item)
    }

    private func add(_ item: InventoryItem) {
        guard !lines.contains(where: { $0.itemId == item.id }) else { return }
        lines.append(RestockLine(itemId: item.id, countedFrontStock: item.frontStock))
    }
}

struct WasteView: View {
    @EnvironmentObject private var session: AppSession
    @State private var selected: InventoryItem?
    @State private var quantity = 1.0
    @State private var area = "front"
    @State private var selectedBatchId = ""
    @State private var reason = ""
    @State private var scanEntry = false
    @State private var manualPicker = false
    @State private var error = ""

    private var eligibleBatches: [InventoryBatch] {
        guard let selected else { return [] }
        return session.batches.filter { $0.itemId == selected.id && $0.area == area && $0.remainingQuantity > 0 }
            .sorted { ($0.expirationDate.isEmpty ? "9999" : $0.expirationDate) < ($1.expirationDate.isEmpty ? "9999" : $1.expirationDate) }
    }

    var body: some View {
        Form {
            Section {
                TaskCameraPrompt(
                    title: "Scan the discard",
                    detail: "Scan the product first, then record the quantity and reason.",
                    scanTitle: "Scan product",
                    onScan: { scanEntry = true },
                    onManual: { manualPicker = true }
                )
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 8, trailing: 16))
                .listRowBackground(Color.clear)
            }
            Section("Item") {
                LabeledContent("Product", value: selected?.name ?? "Not selected")
                Stepper("Quantity: \(quantity.formattedQuantity)", value: $quantity, in: 1...100_000)
                Picker("Stock area", selection: $area) {
                    Text("Sales floor").tag("front")
                    Text("Backstock").tag("back")
                }
                .pickerStyle(.segmented)
                if !eligibleBatches.isEmpty {
                    Picker("Batch to use", selection: $selectedBatchId) {
                        Text("Automatic — earliest expiry").tag("")
                        ForEach(eligibleBatches) { batch in
                            Text("\(batch.expirationDate.isEmpty ? "Unknown date" : String(batch.expirationDate.prefix(10))) • \(batch.remainingQuantity.formattedQuantity)").tag(batch.id)
                        }
                    }
                }
            }
            Section("Reason") { TextField("Damaged, expired, quality…", text: $reason, axis: .vertical) }
            Button("Record discard") { submit() }
                .disabled(selected == nil || reason.trimmingCharacters(in: .whitespaces).isEmpty || session.isWorking)
        }
        .navigationTitle("Discards")
        .sheet(isPresented: $scanEntry) {
            ScanEntryView { code in
                scanEntry = false
                selectScannedItem(code)
            }
        }
        .sheet(isPresented: $manualPicker) {
            NavigationStack {
                ItemPickerView(title: "Choose product") { item in
                    selected = item
                    manualPicker = false
                }
            }
        }
        .alert("Couldn’t record discard", isPresented: .constant(!error.isEmpty)) { Button("OK") { error = "" } } message: { Text(error) }
    }

    private func submit() {
        guard let selected else { return }
        Task {
            do {
                try await session.recordWaste(WasteLine(itemId: selected.id, quantity: quantity, area: area, reason: reason, batchId: selectedBatchId.isEmpty ? nil : selectedBatchId))
                self.selected = nil; quantity = 1; reason = ""; selectedBatchId = ""
            } catch { self.error = error.localizedDescription }
        }
    }

    private func selectScannedItem(_ code: String) {
        guard let item = session.inventory.first(where: { $0.matchesBarcode(code) }) else {
            error = "No existing portal item matches this barcode or SKU."
            return
        }
        selected = item
        selectedBatchId = ""
    }
}

struct ReceivingView: View {
    @EnvironmentObject private var session: AppSession
    @State private var selected: InventoryItem?
    @State private var quantity = 1.0
    @State private var expiration = Date()
    @State private var selectedOrderLineId = ""
    @State private var scanEntry = false
    @State private var manualPicker = false
    @State private var error = ""

    private var eligibleOrderLines: [(OrderDraft, OrderLine)] {
        guard let selected else { return [] }
        return session.orders
            .filter { ["Submitted", "Partially received"].contains($0.status) }
            .flatMap { order in order.lines.filter { $0.itemId == selected.id && $0.receivedQuantity < $0.finalQuantity }.map { (order, $0) } }
    }

    var body: some View {
        Form {
            Section {
                TaskCameraPrompt(
                    title: "Scan the delivery",
                    detail: "Scan each received product, then enter the quantity going into backstock.",
                    scanTitle: "Scan product",
                    onScan: { scanEntry = true },
                    onManual: { manualPicker = true }
                )
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 8, trailing: 16))
                .listRowBackground(Color.clear)
            }
            Section("Delivery") {
                LabeledContent("Product", value: selected?.name ?? "Not selected")
                Stepper("Quantity: \(quantity.formattedQuantity)", value: $quantity, in: 1...100_000)
                if selected?.expires == true {
                    DatePicker("Expiration", selection: $expiration, displayedComponents: .date)
                }
                if !eligibleOrderLines.isEmpty {
                    Picker("Linked order", selection: $selectedOrderLineId) {
                        Text("Unplanned receipt").tag("")
                        ForEach(eligibleOrderLines, id: \.1.id) { order, line in
                            Text("\(order.vendor) • \((line.finalQuantity - line.receivedQuantity).formattedQuantity) remaining").tag("\(order.id)|\(line.id)")
                        }
                    }
                }
            }
            Section {
                Button("Receive into backstock") { submit() }
                    .disabled(selected == nil || session.isWorking)
            }
        }
        .navigationTitle("Receiving")
        .sheet(isPresented: $scanEntry) {
            ScanEntryView { code in
                scanEntry = false
                selectScannedItem(code)
            }
        }
        .sheet(isPresented: $manualPicker) {
            NavigationStack {
                ItemPickerView(title: "Choose product") { item in
                    selected = item
                    manualPicker = false
                }
            }
        }
        .alert("Couldn’t save receiving", isPresented: .constant(!error.isEmpty)) { Button("OK") { error = "" } } message: { Text(error) }
    }

    private func submit() {
        guard let selected else { return }
        Task {
            do {
                let link = selectedOrderLineId.split(separator: "|", maxSplits: 1).map(String.init)
                let linked = link.count == 2 ? eligibleOrderLines.first { $0.0.id == link[0] && $0.1.id == link[1] } : nil
                try await session.receive(
                    ReceivingLine(
                        itemId: selected.id,
                        quantity: quantity,
                        expirationDate: selected.expires ? expiration.ISO8601Format() : nil,
                        orderId: linked?.0.id,
                        orderLineId: linked?.1.id,
                        receivedOrderQuantity: linked.map { quantity / max(1, $0.1.stockUnitsPerOrderUnit) }
                    )
                )
                self.selected = nil
                quantity = 1
                expiration = Date()
                selectedOrderLineId = ""
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func selectScannedItem(_ code: String) {
        guard let item = session.inventory.first(where: { $0.matchesBarcode(code) }) else {
            error = "No existing portal item matches this barcode or SKU."
            return
        }
        selected = item
        selectedOrderLineId = ""
    }
}

struct TransferView: View {
    @EnvironmentObject private var session: AppSession
    @State private var selected: InventoryItem?
    @State private var quantity = 1.0
    @State private var source = "back"
    @State private var selectedBatchId = ""
    @State private var scanEntry = false
    @State private var manualPicker = false
    @State private var error = ""

    private var destination: String { source == "front" ? "back" : "front" }
    private var available: Double {
        guard let selected else { return 0 }
        return source == "front" ? selected.frontStock : selected.backStock
    }
    private var eligibleBatches: [InventoryBatch] {
        guard let selected else { return [] }
        return session.batches.filter { $0.itemId == selected.id && $0.area == source && $0.remainingQuantity > 0 }
            .sorted { ($0.expirationDate.isEmpty ? "9999" : $0.expirationDate) < ($1.expirationDate.isEmpty ? "9999" : $1.expirationDate) }
    }

    var body: some View {
        Form {
            Section {
                TaskCameraPrompt(
                    title: "Scan to move stock",
                    detail: "Scan the product, choose the source, then move its quantity.",
                    scanTitle: "Scan product",
                    onScan: { scanEntry = true },
                    onManual: { manualPicker = true }
                )
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 8, trailing: 16))
                .listRowBackground(Color.clear)
            }
            Section("Transfer") {
                LabeledContent("Product", value: selected?.name ?? "Not selected")
                Picker("Move from", selection: $source) {
                    Text("Backstock").tag("back")
                    Text("Sales floor").tag("front")
                }
                .pickerStyle(.segmented)
                if let selected {
                    LabeledContent("Available", value: "\(available.formattedQuantity) \(selected.unit)")
                    Stepper(
                        "Quantity: \(quantity.formattedQuantity)",
                        value: $quantity,
                        in: 1...max(1, available)
                    )
                    .disabled(available <= 0)
                    LabeledContent("Move to", value: destination == "front" ? "Sales floor" : "Backstock")
                    if !eligibleBatches.isEmpty {
                        Picker("Batch to move", selection: $selectedBatchId) {
                            Text("Automatic — earliest expiry").tag("")
                            ForEach(eligibleBatches) { batch in
                                Text("\(batch.expirationDate.isEmpty ? "Unknown date" : String(batch.expirationDate.prefix(10))) • \(batch.remainingQuantity.formattedQuantity)").tag(batch.id)
                            }
                        }
                    }
                }
            }
            Section {
                Button("Save transfer") { submit() }
                    .disabled(selected == nil || available <= 0 || session.isWorking)
            }
        }
        .navigationTitle("Transfer")
        .onChange(of: source) { _, _ in
            quantity = min(max(1, quantity), max(1, available))
            selectedBatchId = ""
        }
        .sheet(isPresented: $scanEntry) {
            ScanEntryView { code in
                scanEntry = false
                selectScannedItem(code)
            }
        }
        .sheet(isPresented: $manualPicker) {
            NavigationStack {
                ItemPickerView(title: "Choose product") { item in
                    select(item)
                    manualPicker = false
                }
            }
        }
        .alert("Couldn’t save transfer", isPresented: .constant(!error.isEmpty)) {
            Button("OK") { error = "" }
        } message: {
            Text(error)
        }
    }

    private func submit() {
        guard let selected else { return }
        Task {
            do {
                try await session.transfer(TransferLine(itemId: selected.id, quantity: quantity, source: source, destination: destination, batchId: selectedBatchId.isEmpty ? nil : selectedBatchId))
                self.selected = nil
                quantity = 1
                selectedBatchId = ""
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func selectScannedItem(_ code: String) {
        guard let item = session.inventory.first(where: { $0.sku.caseInsensitiveCompare(code) == .orderedSame }) else {
            error = "No existing portal item matches this barcode or SKU."
            return
        }
        select(item)
    }

    private func select(_ item: InventoryItem) {
        selected = item
        selectedBatchId = ""
        quantity = min(max(1, quantity), max(1, source == "front" ? item.frontStock : item.backStock))
    }
}

struct InsightsView: View {
    @EnvironmentObject private var session: AppSession
    @State private var insights: MobileInsights?
    @State private var isLoading = true
    @State private var error = ""

    var body: some View {
        ScrollView {
            if isLoading && insights == nil {
                ProgressView("Loading store signals")
                    .frame(maxWidth: .infinity, minHeight: 260)
            } else if let insights {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Store signals")
                            .font(.title2.bold())
                        Text(insights.period)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        InsightMetric(title: "Active items", value: "\(insights.activeItems)", icon: "shippingbox.fill", color: session.theme.accentColor)
                        InsightMetric(title: "Low stock", value: "\(insights.lowStockItems)", detail: "\(Int((insights.lowStockRatio * 100).rounded()))% of active stock", icon: "exclamationmark.triangle.fill", color: AppTheme.amber)
                        InsightMetric(title: "On hand", value: insights.totalUnits.formattedQuantity, detail: "\(insights.backstockUnits.formattedQuantity) in backstock", icon: "cube.box.fill", color: session.theme.secondaryColor)
                        InsightMetric(title: "Waste", value: insights.wasteUnits.formattedQuantity, detail: "\(insights.wasteEvents) events", icon: "trash.fill", color: AppTheme.danger)
                        InsightMetric(title: "Open orders", value: "\(insights.openOrders)", icon: "cart.fill", color: Color.indigo)
                    }

                    if !insights.attention.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Needs attention")
                                .font(.headline)
                            ForEach(insights.attention) { item in
                                HStack(spacing: 12) {
                                    Image(systemName: "arrow.down.circle.fill")
                                        .foregroundStyle(AppTheme.amber)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(item.name).font(.subheadline.weight(.semibold))
                                        Text("\(item.onHand.formattedQuantity) \(item.unit) on hand • reorder at \(item.reorderPoint.formattedQuantity)")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(12)
                                .appSurface()
                            }
                        }
                    } else {
                        ContentUnavailableView("No low-stock items", systemImage: "checkmark.circle", description: Text("Current portal inventory has no low-stock signals."))
                            .padding(.vertical, 24)
                    }
                }
                .padding(16)
            } else {
                ContentUnavailableView("Insights unavailable", systemImage: "chart.bar.xaxis", description: Text("Try refreshing this tool in a moment."))
                    .padding(.top, 88)
            }
        }
        .background(session.theme.backgroundColor)
        .navigationTitle("Insights")
        .refreshable { await load() }
        .task { await load() }
        .alert("Couldn’t load insights", isPresented: .constant(!error.isEmpty)) {
            Button("OK") { error = "" }
        } message: {
            Text(error)
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            insights = try await session.loadInsights()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct InsightMetric: View {
    let title: String
    let value: String
    var detail: String? = nil
    let icon: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.headline)
                .foregroundStyle(color)
            Text(value)
                .font(.title2.bold())
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            if let detail {
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 118, alignment: .leading)
        .padding(14)
        .appSurface()
    }
}

struct HealthCheckListView: View {
    @EnvironmentObject private var session: AppSession

    var body: some View {
        List {
            if session.workspace?.healthChecks.isEmpty != false {
                ContentUnavailableView("No assigned checks", systemImage: "checklist", description: Text("Checks assigned to this store will appear here."))
                    .listRowBackground(Color.clear)
            } else {
                ForEach(session.workspace?.healthChecks ?? []) { check in
                    NavigationLink { HealthCheckDetailView(check: check) } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(check.name).font(.body.weight(.semibold))
                            Text("\(check.status) • \(check.schedule)").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Health Checks")
    }
}

private struct HealthCheckDetailView: View {
    let check: HealthCheck

    var body: some View {
        List {
            Section("Schedule") {
                LabeledContent("Current status", value: check.status)
                LabeledContent("Schedule", value: check.schedule.isEmpty ? "Set in portal" : check.schedule)
            }
            Section("Latest completion") {
                LabeledContent("Last completed", value: check.lastCompleted.isEmpty ? "No completion recorded" : check.lastCompleted)
                if !check.completedBy.isEmpty {
                    LabeledContent("Completed by", value: check.completedBy)
                }
                LabeledContent("Saved responses", value: "\(check.responses)")
            }
        }
        .navigationTitle(check.name)
        .navigationBarTitleDisplayMode(.inline)
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
                if let match = session.inventory.first(where: { $0.matchesBarcode(code) }) {
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
