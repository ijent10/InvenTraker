import Foundation
import SwiftData

@Model
final class ProductionProduct {
    var id: UUID
    var name: String
    var outputItemID: UUID?
    var outputItemNameSnapshot: String?
    var outputUnitRaw: String
    var howToGuideID: UUID?
    var defaultBatchYield: Double
    var targetDaysOnHand: Double
    var instructions: [String]
    var isActive: Bool
    var lastSpotCheckQuantity: Double
    var lastSpotCheckDate: Date?
    var organizationId: String = "local-default"
    var storeId: String = ""
    var backendId: String?
    var revision: Int = 0
    var updatedByUid: String?
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        name: String,
        outputItemID: UUID?,
        outputItemNameSnapshot: String?,
        outputUnitRaw: String,
        howToGuideID: UUID? = nil,
        defaultBatchYield: Double,
        targetDaysOnHand: Double = 1.5,
        instructions: [String] = [],
        isActive: Bool = true,
        lastSpotCheckQuantity: Double = 0,
        lastSpotCheckDate: Date? = nil,
        organizationId: String = "local-default",
        storeId: String = "",
        backendId: String? = nil
    ) {
        self.id = UUID()
        self.name = name
        self.outputItemID = outputItemID
        self.outputItemNameSnapshot = outputItemNameSnapshot
        self.outputUnitRaw = outputUnitRaw
        self.howToGuideID = howToGuideID
        self.defaultBatchYield = max(0.001, defaultBatchYield)
        self.targetDaysOnHand = max(0.25, targetDaysOnHand)
        self.instructions = instructions
        self.isActive = isActive
        self.lastSpotCheckQuantity = max(0, lastSpotCheckQuantity)
        self.lastSpotCheckDate = lastSpotCheckDate
        self.organizationId = organizationId
        self.storeId = storeId
        self.backendId = backendId
        self.revision = 0
        self.updatedByUid = nil
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    var outputUnit: MeasurementUnit {
        MeasurementUnit(rawValue: outputUnitRaw) ?? .pieces
    }
}
