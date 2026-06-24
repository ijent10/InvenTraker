import Foundation
import SwiftData

@Model
final class ProductionSpotCheckRecord {
    var id: UUID
    var productionProductID: UUID
    var countedQuantity: Double
    var previousQuantity: Double
    var quantityProducedSinceLast: Double
    var usageObserved: Double
    var checkedAt: Date
    var organizationId: String = "local-default"
    var storeId: String = ""
    var backendId: String?
    var revision: Int = 0
    var updatedByUid: String?
    var lastSyncedAt: Date?

    init(
        productionProductID: UUID,
        countedQuantity: Double,
        previousQuantity: Double,
        quantityProducedSinceLast: Double,
        usageObserved: Double,
        checkedAt: Date = Date(),
        organizationId: String = "local-default",
        storeId: String = "",
        backendId: String? = nil
    ) {
        self.id = UUID()
        self.productionProductID = productionProductID
        self.countedQuantity = max(0, countedQuantity)
        self.previousQuantity = max(0, previousQuantity)
        self.quantityProducedSinceLast = max(0, quantityProducedSinceLast)
        self.usageObserved = max(0, usageObserved)
        self.checkedAt = checkedAt
        self.organizationId = organizationId
        self.storeId = storeId
        self.backendId = backendId
        self.revision = 0
        self.updatedByUid = nil
        self.lastSyncedAt = nil
    }
}
