import SwiftUI
import SwiftData
#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif
#if canImport(FirebaseCore)
import FirebaseCore
#endif

struct TransfersView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    @Query(filter: #Predicate<InventoryItem> { !$0.isArchived }) private var items: [InventoryItem]
    @Query private var transfers: [TransferRecord]
    @StateObject private var settings = AppSettings.shared
    @StateObject private var scannerService = BarcodeScannerService()

    @State private var itemSelectionMode: ItemSelectionMode = .list
    @State private var itemSearchText = ""
    @State private var showingItemScanner = false
    @State private var selectedItemID: UUID?
    @State private var fromDepartment = ""
    @State private var toDepartment = ""
    @State private var quantityText = ""
    @State private var showingExportPreview = false
    @State private var exportRows: [TransferExportRow] = []
    @State private var errorMessage = ""
    @State private var showingError = false
    @State private var isSaving = false

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? "local-default"
    }

    private var activeStoreId: String {
        settings.normalizedActiveStoreID
    }

    private var scopedItems: [InventoryItem] {
        items
            .filter {
                $0.organizationId == activeOrganizationId &&
                $0.belongsToStore(activeStoreId)
            }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private var selectedItem: InventoryItem? {
        guard let selectedItemID else { return nil }
        return scopedItems.first(where: { $0.id == selectedItemID })
    }

    private var filteredItems: [InventoryItem] {
        let needle = itemSearchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !needle.isEmpty else { return scopedItems }
        return scopedItems.filter { item in
            let nameMatch = item.name.lowercased().contains(needle)
            let upcMatch = (item.upc ?? "").lowercased().contains(needle)
            return nameMatch || upcMatch
        }
    }

    private var scopedTransfers: [TransferRecord] {
        transfers
            .filter {
                $0.organizationId == activeOrganizationId &&
                $0.belongsToStore(activeStoreId)
            }
            .sorted { $0.createdAt > $1.createdAt }
    }

    private var departmentOptions: [String] {
        var values: [String] = settings.departmentConfigs.map(\.name)
        values.append(contentsOf: scopedItems.compactMap(\.department))
        let cleaned = values
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return Array(Set(cleaned))
            .sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    private var canSave: Bool {
        guard let item = selectedItem else { return false }
        guard !fromDepartment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        let destination = toDepartment.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !destination.isEmpty else { return false }
        guard destination.caseInsensitiveCompare(fromDepartment.trimmingCharacters(in: .whitespacesAndNewlines)) != .orderedSame else {
            return false
        }
        guard let quantity = Double(quantityText), quantity > 0 else { return false }
        return quantity <= max(item.totalQuantity, 0)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                ContextTipCard(context: .transfers, accentColor: settings.accentColor)

                VStack(alignment: .leading, spacing: 12) {
                    Text("Create Transfer")
                        .font(.headline)
                    Text("Choose what item is moving, where it is moving from, and where it is going.")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Picker("Item Source", selection: $itemSelectionMode) {
                        ForEach(ItemSelectionMode.allCases) { mode in
                            Text(mode.title).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)

                    Text("What item are you transferring?")
                        .font(.subheadline.weight(.semibold))

                    switch itemSelectionMode {
                    case .search:
                        TextField("Search item name or barcode", text: $itemSearchText)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding(12)
                            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        if !filteredItems.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                ForEach(Array(filteredItems.prefix(8))) { item in
                                    Button {
                                        selectedItemID = item.id
                                    } label: {
                                        HStack {
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(item.name)
                                                    .font(.subheadline.weight(.semibold))
                                                    .foregroundStyle(.primary)
                                                Text("Barcode: \((item.upc ?? "").isEmpty ? "—" : (item.upc ?? ""))")
                                                    .font(.caption)
                                                    .foregroundStyle(.secondary)
                                            }
                                            Spacer()
                                            if selectedItemID == item.id {
                                                Image(systemName: "checkmark.circle.fill")
                                                    .foregroundStyle(settings.accentColor)
                                            }
                                        }
                                        .padding(10)
                                        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        } else {
                            Text("No matching items.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    case .scan:
                        Button {
                            showingItemScanner = true
                        } label: {
                            HStack {
                                Image(systemName: "barcode.viewfinder")
                                Text("Scan Item Barcode")
                            }
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        if let selectedItem {
                            Text("Selected: \(selectedItem.name)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    case .list:
                        Picker("Item", selection: $selectedItemID) {
                            Text("Select Item").tag(UUID?.none)
                            ForEach(scopedItems) { item in
                                Text(item.name).tag(Optional(item.id))
                            }
                        }
                    }

                    Text("Transfer from (current department)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Picker("From Department", selection: $fromDepartment) {
                        Text("Select").tag("")
                        ForEach(departmentOptions, id: \.self) { department in
                            Text(department).tag(department)
                        }
                    }

                    Text("Transfer to (destination department)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Picker("To Department", selection: $toDepartment) {
                        Text("Select").tag("")
                        ForEach(departmentOptions, id: \.self) { department in
                            Text(department).tag(department)
                        }
                    }

                    HStack {
                        TextField("Quantity", text: $quantityText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                        Text(selectedItem?.unit.rawValue ?? "")
                            .foregroundStyle(.secondary)
                    }
                    .padding(12)
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                    if let selectedItem {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Preview")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            Text("\(selectedItem.name)")
                                .font(.subheadline.weight(.semibold))
                            Text("From \(fromDepartment.isEmpty ? "—" : fromDepartment) → \(toDepartment.isEmpty ? "—" : toDepartment)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }

                    Button(isSaving ? "Saving..." : "Transfer Item") {
                        saveTransfer()
                    }
                    .disabled(!canSave || isSaving)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(settings.accentColor, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(Color(.systemBackground))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.06), radius: 10, y: 4)

                VStack(alignment: .leading, spacing: 12) {
                    Text("Recent Transfers")
                        .font(.headline)
                    if scopedTransfers.isEmpty {
                        ContentUnavailableView(
                            "No Transfers Yet",
                            systemImage: "arrow.left.arrow.right.circle",
                            description: Text("Move product between departments to build transfer history.")
                        )
                    } else {
                        VStack(spacing: 8) {
                            ForEach(scopedTransfers) { row in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(row.itemName)
                                        .font(.headline)
                                    Text("From \(row.fromDepartmentName) → \(row.toDepartmentName)")
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                    HStack(spacing: 8) {
                                        Text("Barcode: \(row.barcode.isEmpty ? "—" : row.barcode)")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        Text("•")
                                            .foregroundStyle(.tertiary)
                                        Text("Qty \(formattedTransferQuantity(row))")
                                            .font(.caption.weight(.semibold))
                                            .foregroundStyle(settings.accentColor)
                                    }
                                    Text(row.createdAt.formatted(date: .abbreviated, time: .shortened))
                                        .font(.caption2)
                                        .foregroundStyle(.tertiary)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                        }
                    }
                }
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(Color(.systemBackground))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.06), radius: 10, y: 4)
            }
            .padding()
        }
        .navigationTitle("Transfers")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: selectedItemID) { _, _ in
            guard let item = selectedItem else { return }
            if fromDepartment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                fromDepartment = item.department?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            }
            if quantityText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                quantityText = item.totalQuantity.formattedQuantity(maximumFractionDigits: 3)
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Export") {
                    openExportPreview()
                }
            }
        }
        .sheet(isPresented: $showingItemScanner) {
            BarcodeScannerSheet(scannerService: scannerService) { code in
                selectItemFromBarcode(code)
            }
        }
        .sheet(isPresented: $showingExportPreview) {
            TransferExportPreviewView(rows: exportRows)
        }
        .alert("Transfer Error", isPresented: $showingError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage)
        }
    }

    private func selectItemFromBarcode(_ rawCode: String) {
        let normalized = normalizedBarcode(rawCode)
        guard !normalized.isEmpty else { return }
        guard let matched = scopedItems.first(where: { normalizedBarcode($0.upc).caseInsensitiveCompare(normalized) == .orderedSame }) else {
            errorMessage = "No inventory item matched barcode \(normalized)."
            showingError = true
            return
        }
        selectedItemID = matched.id
    }

    private func saveTransfer() {
        guard let item = selectedItem, let quantity = Double(quantityText), quantity > 0 else { return }
        guard session.canPerform(.manageSettings) || session.canPerform(.spotCheck) else {
            errorMessage = "You do not have permission to transfer inventory."
            showingError = true
            return
        }
        let from = fromDepartment.trimmingCharacters(in: .whitespacesAndNewlines)
        let to = toDepartment.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !from.isEmpty, !to.isEmpty else { return }

        isSaving = true

        let transfer = TransferRecord(
            organizationId: activeOrganizationId,
            storeId: activeStoreId,
            itemId: item.id,
            itemName: item.name,
            barcode: normalizedBarcode(item.upc),
            quantity: quantity,
            unitRaw: item.unit.rawValue,
            fromDepartmentId: normalizedDepartmentID(from),
            toDepartmentId: normalizedDepartmentID(to),
            fromDepartmentName: from,
            toDepartmentName: to,
            createdByUid: session.firebaseUser?.id,
            createdByName: session.firebaseUser?.displayName
        )

        modelContext.insert(transfer)
        item.department = to
        item.lastModified = Date()
        item.revision += 1
        item.updatedByUid = session.firebaseUser?.id
        try? modelContext.save()

        Task {
            await syncTransferRemote(transfer)
        }

        selectedItemID = nil
        quantityText = ""
        toDepartment = ""
        fromDepartment = ""
        isSaving = false
    }

    private func openExportPreview() {
        guard !scopedTransfers.isEmpty else {
            errorMessage = "No transfer records to export."
            showingError = true
            return
        }

        let itemByID = Dictionary(uniqueKeysWithValues: scopedItems.map { ($0.id, $0) })
        exportRows = scopedTransfers.map { row in
            let item = row.itemId.flatMap { itemByID[$0] }
            let quantityText: String
            if let item {
                quantityText = settings.formattedQuantityForDisplay(row.quantity, item: item)
            } else {
                quantityText = "\(row.quantity.formattedQuantity(maximumFractionDigits: 3)) \(row.unitRaw)"
            }
            let barcode = normalizedBarcode(row.barcode)
            return TransferExportRow(
                title: row.itemName,
                barcode: barcode,
                barcodeImage: BarcodeRenderService.makeCode128(from: barcode),
                quantity: quantityText,
                fromDepartment: row.fromDepartmentName,
                toDepartment: row.toDepartmentName
            )
        }
        showingExportPreview = true
    }

    private func formattedTransferQuantity(_ record: TransferRecord) -> String {
        if let item = record.itemId.flatMap({ id in scopedItems.first(where: { $0.id == id }) }) {
            return settings.formattedQuantityForDisplay(record.quantity, item: item)
        }
        return "\(record.quantity.formattedQuantity(maximumFractionDigits: 3)) \(record.unitRaw)"
    }

    private func normalizedBarcode(_ raw: String?) -> String {
        (raw ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: " ", with: "")
    }

    private func normalizedDepartmentID(_ raw: String) -> String {
        raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: " ", with: "_")
    }

    private func syncTransferRemote(_ transfer: TransferRecord) async {
#if canImport(FirebaseFirestore) && canImport(FirebaseCore)
        guard FirebaseApp.app() != nil else { return }
        guard !activeOrganizationId.isEmpty, !activeStoreId.isEmpty else { return }
        let db = Firestore.firestore()

        let payload: [String: Any] = [
            "organizationId": transfer.organizationId,
            "storeId": transfer.storeId,
            "itemId": transfer.itemId?.uuidString ?? "",
            "itemName": transfer.itemName,
            "barcode": transfer.barcode,
            "quantity": transfer.quantity,
            "unit": transfer.unitRaw,
            "fromDepartmentId": transfer.fromDepartmentId,
            "toDepartmentId": transfer.toDepartmentId,
            "fromDepartmentName": transfer.fromDepartmentName,
            "toDepartmentName": transfer.toDepartmentName,
            "createdByUid": transfer.createdByUid ?? "",
            "createdByName": transfer.createdByName ?? "",
            "createdAt": Timestamp(date: transfer.createdAt),
            "updatedAt": FieldValue.serverTimestamp()
        ]

        if let nestedStoreRef = await resolveNestedStoreReference(
            db: db,
            organizationId: transfer.organizationId,
            storeId: transfer.storeId
        ) {
            try? await nestedStoreRef
                .collection("transfers")
                .document(transfer.id.uuidString.lowercased())
                .setData(payload, merge: true)
        }
#endif
    }

#if canImport(FirebaseFirestore)
    private func resolveNestedStoreReference(
        db: Firestore,
        organizationId: String,
        storeId: String
    ) async -> DocumentReference? {
        do {
            let orgRef = db.collection("organizations").document(organizationId)
            let regionsSnapshot = try await orgRef.collection("regions").getDocuments()
            for regionDoc in regionsSnapshot.documents {
                let districtsSnapshot = try await regionDoc.reference.collection("districts").getDocuments()
                for districtDoc in districtsSnapshot.documents {
                    let nestedStoreRef = districtDoc.reference.collection("stores").document(storeId)
                    let nestedStoreDoc = try await nestedStoreRef.getDocument()
                    if nestedStoreDoc.exists {
                        return nestedStoreRef
                    }
                }
            }

            // One-release compatibility path for legacy /organizations/{orgId}/stores/{storeId}.
            let legacyStoreRef = orgRef.collection("stores").document(storeId)
            let legacyStoreDoc = try await legacyStoreRef.getDocument()
            if legacyStoreDoc.exists {
                return legacyStoreRef
            }
        } catch {
            return nil
        }
        return nil
    }
#endif
}

private enum ItemSelectionMode: String, CaseIterable, Identifiable {
    case search
    case scan
    case list

    var id: String { rawValue }

    var title: String {
        switch self {
        case .search: return "Search"
        case .scan: return "Scan"
        case .list: return "List"
        }
    }
}

private struct TransferExportRow: Identifiable {
    let id = UUID()
    let title: String
    let barcode: String
    let barcodeImage: UIImage?
    let quantity: String
    let fromDepartment: String
    let toDepartment: String
}

private struct TransferExportPreviewView: View {
    @Environment(\.dismiss) private var dismiss
    let rows: [TransferExportRow]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(rows) { row in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(row.title)
                                .font(.headline)
                            Text("Barcode: \(row.barcode.isEmpty ? "—" : row.barcode)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            if !row.barcode.isEmpty,
                               let image = row.barcodeImage ?? BarcodeRenderService.makeCode128(from: row.barcode) {
                                Image(uiImage: image)
                                    .resizable()
                                    .interpolation(.none)
                                    .scaledToFit()
                                    .frame(maxWidth: 220, maxHeight: 64, alignment: .leading)
                            }
                            Text("Quantity: \(row.quantity)")
                                .font(.subheadline.weight(.semibold))
                            Text("From: \(row.fromDepartment)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("To: \(row.toDepartment)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                }
                .padding()
            }
            .navigationTitle("Transfer Export")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
