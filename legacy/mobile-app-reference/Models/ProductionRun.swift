import Foundation
import SwiftData

@Model
final class ProductionRun {
    var id: UUID
    var productionProductID: UUID
    var outputItemID: UUID?
    var outputBatchID: UUID?
    var quantityMade: Double
    var packageBarcode: String?
    var expirationDate: Date
    var madeAt: Date
    var organizationId: String = "local-default"
    var storeId: String = ""
    var backendId: String?
    var revision: Int = 0
    var updatedByUid: String?
    var lastSyncedAt: Date?

    init(
        productionProductID: UUID,
        outputItemID: UUID?,
        outputBatchID: UUID?,
        quantityMade: Double,
        packageBarcode: String?,
        expirationDate: Date,
        madeAt: Date = Date(),
        organizationId: String = "local-default",
        storeId: String = "",
        backendId: String? = nil
    ) {
        self.id = UUID()
        self.productionProductID = productionProductID
        self.outputItemID = outputItemID
        self.outputBatchID = outputBatchID
        self.quantityMade = max(0, quantityMade)
        self.packageBarcode = packageBarcode?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.expirationDate = expirationDate
        self.madeAt = madeAt
        self.organizationId = organizationId
        self.storeId = storeId
        self.backendId = backendId
        self.revision = 0
        self.updatedByUid = nil
        self.lastSyncedAt = nil
    }
}
