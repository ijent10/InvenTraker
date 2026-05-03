import Foundation
import SwiftData

/// Represents an item in an order
/// Smart ordering calculates recommended quantities based on usage patterns
@Model
final class OrderItem {
    var id: UUID
    var item: InventoryItem?
    var itemIDSnapshot: UUID?
    var itemNameSnapshot: String?
    var itemUnitSnapshot: String?
    var itemQuantityPerBoxSnapshot: Int?
    var vendorIDSnapshot: UUID?
    var vendorNameSnapshot: String?
    
    // Quantities (always whole numbers, never decimals)
    var recommendedQuantity: Int // Recommended boxes/units to order
    var orderedQuantity: Int? // Actual quantity ordered by user
    
    // Status
    var isChecked: Bool // User marked as ordered
    var orderDate: Date
    var expectedDeliveryDate: Date?
    
    // Tracking
    var wasReceived: Bool // Whether this order was actually received
    var receivedDate: Date?
    var organizationId: String = "local-default"
    var storeId: String = ""
    var backendId: String?
    var revision: Int = 0
    var updatedByUid: String?
    var lastSyncedAt: Date?
    
    init(
        item: InventoryItem?,
        recommendedQuantity: Int,
        orderDate: Date,
        expectedDeliveryDate: Date?,
        organizationId: String = "local-default",
        storeId: String = "",
        backendId: String? = nil
    ) {
        self.id = UUID()
        self.item = item
        self.itemIDSnapshot = item?.id
        self.itemNameSnapshot = item?.name
        self.itemUnitSnapshot = item?.unit.rawValue
        self.itemQuantityPerBoxSnapshot = item?.quantityPerBox
        self.vendorIDSnapshot = item?.vendor?.id
        self.vendorNameSnapshot = item?.vendor?.name
        self.recommendedQuantity = recommendedQuantity
        self.orderedQuantity = nil
        self.isChecked = false
        self.orderDate = orderDate
        self.expectedDeliveryDate = expectedDeliveryDate
        self.wasReceived = false
        self.receivedDate = nil
        self.organizationId = organizationId
        self.storeId = storeId
        self.backendId = backendId
        self.revision = 0
        self.updatedByUid = nil
        self.lastSyncedAt = nil
    }
}
