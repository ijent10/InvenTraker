import Foundation
import SwiftData

@Model
final class TransferRecord {
    var id: UUID
    var organizationId: String
    var storeId: String
    var itemId: UUID?
    var itemName: String
    var barcode: String
    var quantity: Double
    var unitRaw: String
    var fromDepartmentId: String
    var toDepartmentId: String
    var fromDepartmentName: String
    var toDepartmentName: String
    var createdByUid: String?
    var createdByName: String?
    var createdAt: Date
    var backendId: String?
    var revision: Int
    var lastSyncedAt: Date?

    init(
        id: UUID = UUID(),
        organizationId: String,
        storeId: String,
        itemId: UUID? = nil,
        itemName: String,
        barcode: String = "",
        quantity: Double,
        unitRaw: String,
        fromDepartmentId: String,
        toDepartmentId: String,
        fromDepartmentName: String,
        toDepartmentName: String,
        createdByUid: String? = nil,
        createdByName: String? = nil,
        createdAt: Date = Date(),
        backendId: String? = nil
    ) {
        self.id = id
        self.organizationId = organizationId
        self.storeId = storeId
        self.itemId = itemId
        self.itemName = itemName
        self.barcode = barcode
        self.quantity = quantity
        self.unitRaw = unitRaw
        self.fromDepartmentId = fromDepartmentId
        self.toDepartmentId = toDepartmentId
        self.fromDepartmentName = fromDepartmentName
        self.toDepartmentName = toDepartmentName
        self.createdByUid = createdByUid
        self.createdByName = createdByName
        self.createdAt = createdAt
        self.backendId = backendId
        self.revision = 0
        self.lastSyncedAt = nil
    }
}

