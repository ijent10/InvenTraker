import Foundation
import SwiftData

enum CatalogInventoryImporter {
    private static func cleanedString(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func normalizedStoreID(_ storeId: String) -> String {
        storeId.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func matchesUPC(_ lhs: String?, _ rhs: String) -> Bool {
        guard let lhs else { return false }
        return lhs.caseInsensitiveCompare(rhs) == .orderedSame
    }

    @MainActor
    static func importOrGetLocalItem(
        from record: CatalogProductRecord,
        organizationId: String,
        storeId: String = "",
        modelContext: ModelContext,
        existingItems: [InventoryItem]
    ) -> InventoryItem {
        let normalizedUPC = CentralCatalogService.shared.normalizeUPC(record.upc)
        let resolvedStoreId = normalizedStoreID(record.storeId.isEmpty ? storeId : record.storeId)

        if let existing = existingItems.first(where: {
            $0.organizationId == organizationId &&
            normalizedStoreID($0.storeId) == resolvedStoreId &&
            matchesUPC($0.upc, normalizedUPC)
        }) {
            return existing
        }

        let orgTemplate = existingItems.first(where: {
            $0.organizationId == organizationId &&
            normalizedStoreID($0.storeId).isEmpty &&
            matchesUPC($0.upc, normalizedUPC)
        })

        let resolvedName = cleanedString(orgTemplate?.name) ?? cleanedString(record.title) ?? "Catalog Item"
        let resolvedPictures = orgTemplate?.pictures.isEmpty == false
            ? (orgTemplate?.pictures ?? [])
            : (record.thumbnailData.map { [$0] } ?? [])
        let resolvedUnitRaw = cleanedString(orgTemplate?.unit.rawValue) ?? cleanedString(record.unitRaw) ?? MeasurementUnit.pieces.rawValue
        let resolvedUnit = MeasurementUnit(rawValue: resolvedUnitRaw) ?? .pieces
        let resolvedMinimumQuantity = orgTemplate?.minimumQuantity ?? max(0, record.minimumQuantity)
        let resolvedQuantityPerBox = orgTemplate?.quantityPerBox ?? max(1, record.casePack)
        let resolvedHasExpiration = orgTemplate?.hasExpiration ?? record.hasExpiration
        let resolvedDefaultExpiration = resolvedHasExpiration
            ? (orgTemplate?.effectiveDefaultExpiration ?? max(1, record.defaultExpiration))
            : 0
        let resolvedDefaultPackedExpiration = resolvedHasExpiration
            ? (orgTemplate?.effectiveDefaultPackedExpiration ?? max(1, record.defaultPackedExpiration))
            : 0
        let resolvedCanBeReworked = orgTemplate?.canBeReworked ?? record.canBeReworked
        let resolvedReworkShelfLife = orgTemplate?.effectiveReworkShelfLifeDays ?? max(1, record.reworkShelfLifeDays)
        let resolvedMaxReworkCount = orgTemplate?.effectiveMaxReworkCount ?? max(1, record.maxReworkCount)
        let resolvedRewrapsWithUniqueBarcode = orgTemplate?.rewrapsWithUniqueBarcode ?? record.rewrapsWithUniqueBarcode
        let resolvedReworkItemCode = cleanedString(orgTemplate?.reworkItemCode)

        let item = InventoryItem(
            name: resolvedName,
            upc: normalizedUPC.isEmpty ? cleanedString(orgTemplate?.upc) : normalizedUPC,
            tags: orgTemplate?.tags ?? record.tags,
            pictures: resolvedPictures,
            hasExpiration: resolvedHasExpiration,
            defaultExpiration: resolvedDefaultExpiration,
            defaultPackedExpiration: resolvedDefaultPackedExpiration,
            vendor: orgTemplate?.vendor,
            minimumQuantity: resolvedMinimumQuantity,
            quantityPerBox: resolvedQuantityPerBox,
            department: cleanedString(orgTemplate?.department) ?? cleanedString(record.department),
            departmentLocation: cleanedString(orgTemplate?.departmentLocation) ?? cleanedString(record.departmentLocation),
            isPrepackaged: orgTemplate?.isPrepackaged ?? record.isPrepackaged,
            rewrapsWithUniqueBarcode: resolvedRewrapsWithUniqueBarcode,
            reworkItemCode: resolvedReworkItemCode,
            canBeReworked: resolvedCanBeReworked,
            reworkShelfLifeDays: resolvedReworkShelfLife,
            maxReworkCount: resolvedMaxReworkCount,
            price: orgTemplate?.price ?? max(0, record.price),
            unit: resolvedUnit,
            organizationId: organizationId,
            backendId: orgTemplate?.backendId,
            storeId: resolvedStoreId
        )
        item.includeInInsights = orgTemplate?.includeInInsights ?? true
        item.isOnSale = orgTemplate?.isOnSale ?? false
        item.salePercentage = max(0, min(100, orgTemplate?.salePercentage ?? 0))
        item.revision = max(item.revision, orgTemplate?.revision ?? 0)
        item.updatedByUid = orgTemplate?.updatedByUid
        item.lastSyncedAt = orgTemplate?.lastSyncedAt

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
        let trimmedStoreID = normalizedStoreID(storeId)
        if let existing = existingItems.first(where: {
            $0.organizationId == organizationId &&
            normalizedStoreID($0.storeId) == trimmedStoreID &&
            matchesUPC($0.upc, normalizedUPC)
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
            hasExpiration: true,
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

    @MainActor
    static func submissionDraftPayload(from item: InventoryItem?) -> ItemSubmissionDraftPayload? {
        guard let item else { return nil }
        return ItemSubmissionDraftPayload(
            backendItemId: item.backendId,
            name: item.name,
            upc: item.upc,
            unitRaw: item.unit.rawValue,
            price: item.price,
            hasExpiration: item.hasExpiration,
            defaultExpirationDays: item.effectiveDefaultExpiration,
            defaultPackedExpiration: item.effectiveDefaultPackedExpiration,
            minQuantity: item.minimumQuantity,
            qtyPerCase: item.quantityPerBox,
            caseSize: max(1, Double(item.quantityPerBox)),
            vendorId: item.vendor?.backendId,
            vendorName: item.vendor?.name,
            department: item.department,
            departmentLocation: item.departmentLocation,
            tags: item.tags,
            isPrepackaged: item.isPrepackaged,
            rewrapsWithUniqueBarcode: item.rewrapsWithUniqueBarcode,
            reworkItemCode: item.reworkItemCode,
            canBeReworked: item.canBeReworked,
            reworkShelfLifeDays: item.effectiveReworkShelfLifeDays,
            maxReworkCount: item.effectiveMaxReworkCount
        )
    }
}
