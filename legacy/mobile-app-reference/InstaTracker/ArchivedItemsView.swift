import SwiftUI
import SwiftData

struct ArchivedItemsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    @StateObject private var settings = AppSettings.shared
    @Query(filter: #Predicate<InventoryItem> { $0.isArchived }) private var archivedItems: [InventoryItem]

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? "local-default"
    }

    private var canAdjustInventory: Bool {
        session.canPerform(.manageCatalog) || session.canPerform(.manageSettings)
    }

    private var scopedArchivedItems: [InventoryItem] {
        let storeId = settings.normalizedActiveStoreID
        return archivedItems.filter {
            $0.organizationId == activeOrganizationId &&
            $0.belongsToStore(storeId) &&
            session.canAccessInventoryDepartment($0.department)
        }
    }
    
    var body: some View {
        NavigationStack {
            List {
                ForEach(scopedArchivedItems) { item in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(item.name)
                            Text(item.includeInInsights ? "In insights" : "Not in insights")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Unarchive") {
                            unarchive(item)
                        }
                        .buttonStyle(.bordered)
                        .disabled(!canAdjustInventory)
                    }
                }
            }
            .navigationTitle("Archived Items")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func unarchive(_ item: InventoryItem) {
        guard canAdjustInventory else { return }
        item.isArchived = false
        item.lastModified = Date()
        try? modelContext.save()
        syncInventorySnapshot()
    }

    private func syncInventorySnapshot() {
        guard !activeOrganizationId.isEmpty else { return }
        Task { @MainActor in
            try? await InventoryStateSyncService.shared.syncFullSnapshot(
                organizationId: activeOrganizationId,
                modelContext: modelContext
            )
        }
    }
}
