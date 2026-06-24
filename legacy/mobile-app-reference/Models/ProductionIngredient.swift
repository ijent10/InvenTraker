import Foundation
import SwiftData

@Model
final class ProductionIngredient {
    var id: UUID
    var productionProductID: UUID
    var inventoryItemID: UUID?
    var inventoryItemNameSnapshot: String
    var quantityPerBatch: Double
    var unitRaw: String
    var organizationId: String = "local-default"
    var storeId: String = ""
    var backendId: String?
    var revision: Int = 0
    var updatedByUid: String?
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        productionProductID: UUID,
        inventoryItemID: UUID?,
        inventoryItemNameSnapshot: String,
        quantityPerBatch: Double,
        unitRaw: String,
        organizationId: String = "local-default",
        storeId: String = "",
        backendId: String? = nil
    ) {
        self.id = UUID()
        self.productionProductID = productionProductID
        self.inventoryItemID = inventoryItemID
        self.inventoryItemNameSnapshot = inventoryItemNameSnapshot
        self.quantityPerBatch = max(0, quantityPerBatch)
        self.unitRaw = unitRaw
        self.organizationId = organizationId
        self.storeId = storeId
        self.backendId = backendId
        self.revision = 0
        self.updatedByUid = nil
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    var unit: MeasurementUnit {
        MeasurementUnit(rawValue: unitRaw) ?? .pieces
    }
}
