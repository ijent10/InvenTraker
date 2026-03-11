import Foundation
import SwiftData

enum CatalogInventoryImporter {
    @MainActor
    static func importOrGetLocalItem(
        from record: CatalogProductRecord,
        organizationId: String,
        storeId: String = "",
        modelContext: ModelContext,
        existingItems: [InventoryItem]
    ) -> InventoryItem {
        let normalizedUPC = CentralCatalogService.shared.normalizeUPC(record.upc)
        let resolvedStoreId = record.storeId.isEmpty ? storeId : record.storeId

        if let existing = existingItems.first(where: {
            $0.organizationId == organizationId &&
            $0.storeId == resolvedStoreId &&
            (($0.upc ?? "").caseInsensitiveCompare(normalizedUPC) == .orderedSame)
        }) {
            return existing
        }

        let item = InventoryItem(
            name: record.title,
            upc: normalizedUPC.isEmpty ? nil : normalizedUPC,
            tags: record.tags,
            pictures: record.thumbnailData.map { [$0] } ?? [],
            defaultExpiration: max(1, record.defaultExpiration),
            defaultPackedExpiration: max(1, record.defaultPackedExpiration),
            vendor: nil,
            minimumQuantity: max(0, record.minimumQuantity),
            quantityPerBox: max(1, record.casePack),
            department: record.department,
            departmentLocation: record.departmentLocation,
            isPrepackaged: record.isPrepackaged,
            rewrapsWithUniqueBarcode: record.rewrapsWithUniqueBarcode,
            canBeReworked: record.canBeReworked,
            reworkShelfLifeDays: record.reworkShelfLifeDays,
            maxReworkCount: record.maxReworkCount,
            price: max(0, record.price),
            unit: MeasurementUnit(rawValue: record.unitRaw) ?? .pieces,
            organizationId: organizationId,
            storeId: resolvedStoreId
        )

        modelContext.insert(item)
        try? modelContext.save()
        return item
    }

    @MainActor
    static func createStoreDraftForUnknownUPC(
        scannedUPC rawUPC: String,
        organizationId: String,
        storeId: String,
        modelContext: ModelContext,
        existingItems: [InventoryItem]
    ) -> InventoryItem {
        let normalizedUPC = CentralCatalogService.shared.normalizeUPC(rawUPC)
        let trimmedStoreID = storeId.trimmingCharacters(in: .whitespacesAndNewlines)
        if let existing = existingItems.first(where: {
            $0.organizationId == organizationId &&
            $0.storeId == trimmedStoreID &&
            (($0.upc ?? "").caseInsensitiveCompare(normalizedUPC) == .orderedSame)
        }) {
            return existing
        }

        let fallbackName: String = {
            if normalizedUPC.isEmpty {
                return "New Draft Item"
            }
            let suffix = String(normalizedUPC.suffix(6))
            return "Draft Item \(suffix)"
        }()

        let item = InventoryItem(
            name: fallbackName,
            upc: normalizedUPC.isEmpty ? nil : normalizedUPC,
            tags: ["pending-review"],
            pictures: [],
            defaultExpiration: 7,
            defaultPackedExpiration: 7,
            vendor: nil,
            minimumQuantity: 0,
            quantityPerBox: 1,
            department: nil,
            departmentLocation: nil,
            isPrepackaged: false,
            rewrapsWithUniqueBarcode: false,
            canBeReworked: false,
            reworkShelfLifeDays: 1,
            maxReworkCount: 1,
            price: 0,
            unit: .pieces,
            organizationId: organizationId,
            backendId: nil,
            storeId: trimmedStoreID
        )
        item.includeInInsights = false
        item.lastModified = Date()
        item.revision = max(item.revision, 1)

        modelContext.insert(item)
        try? modelContext.save()
        return item
    }
}
