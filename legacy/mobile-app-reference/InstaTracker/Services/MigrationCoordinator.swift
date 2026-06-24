import Foundation
import SwiftData

@MainActor
final class MigrationCoordinator {
    static let shared = MigrationCoordinator()

    private let migrationPrefix = "migration_v1_completed_"

    private init() {}

    func runFirstAuthMigrationIfNeeded(
        userId: String,
        organizationId: String,
        modelContext: ModelContext? = nil
    ) async {
        let key = "\(migrationPrefix)\(organizationId)"
        guard !UserDefaults.standard.bool(forKey: key) else { return }
        guard let modelContext else { return }

        let inventoryCount = (try? modelContext.fetchCount(FetchDescriptor<InventoryItem>())) ?? 0
        let batchCount = (try? modelContext.fetchCount(FetchDescriptor<Batch>())) ?? 0
        let orderCount = (try? modelContext.fetchCount(FetchDescriptor<OrderItem>())) ?? 0
        let wasteCount = (try? modelContext.fetchCount(FetchDescriptor<WasteEntry>())) ?? 0
        let todoCount = (try? modelContext.fetchCount(FetchDescriptor<ToDoItem>())) ?? 0
        let vendorCount = (try? modelContext.fetchCount(FetchDescriptor<Vendor>())) ?? 0

        let objects: [(String, Int)] = [
            ("inventory_item", inventoryCount),
            ("batch", batchCount),
            ("order", orderCount),
            ("waste", wasteCount),
            ("todo", todoCount),
            ("vendor", vendorCount)
        ]

        for (entity, count) in objects where count > 0 {
            let payload = ActionPayload.migrationImport(MigrationImportPayload(entity: entity, count: count))
            let refs = AuditObjectRefs(organizationId: organizationId, itemId: nil, orderId: nil, batchIds: [])
            await ActionSyncService.shared.logAndApply(
                action: payload,
                refs: refs,
                baseRevision: nil,
                actorUid: userId,
                actorRole: .owner,
                modelContext: modelContext
            )
        }

        UserDefaults.standard.set(true, forKey: key)
    }
}
