import Foundation
import SwiftData

/// Represents a vendor/supplier in the system
/// Vendors have delivery schedules and order windows
@Model
final class Vendor {
    var id: UUID
    var name: String
    
    // Delivery schedule
    var truckDays: [Int] // Days of week when deliveries arrive (0 = Sunday, 1 = Monday, etc.)
    var orderDays: [Int] // Days of week when orders can be placed
    var daysFromOrderToDelivery: Int // How many days between order and delivery
    
    // Order window (time range when orders can be placed)
    var orderWindowStart: Date? // Start time for ordering (e.g., 3:00 AM)
    var orderWindowEnd: Date? // End time for ordering (e.g., 9:00 AM)
    
    var notes: String?
    
    // Status
    var isActive: Bool
    
    // Relationships
    var items: [InventoryItem]?
    
    // Metadata
    var createdAt: Date
    var organizationId: String = "local-default"
    var backendId: String?
    var revision: Int = 0
    var updatedByUid: String?
    var lastSyncedAt: Date?
    
    init(
        name: String,
        truckDays: [Int] = [],
        orderDays: [Int] = [],
        daysFromOrderToDelivery: Int = 7,
        orderWindowStart: Date? = nil,
        orderWindowEnd: Date? = nil,
        notes: String? = nil,
        organizationId: String = "local-default",
        backendId: String? = nil
    ) {
        self.id = UUID()
        self.name = name
        self.truckDays = truckDays
        self.orderDays = orderDays
        self.daysFromOrderToDelivery = daysFromOrderToDelivery
        self.orderWindowStart = orderWindowStart
        self.orderWindowEnd = orderWindowEnd
        self.notes = notes
        self.isActive = true
        self.createdAt = Date()
        self.organizationId = organizationId
        self.backendId = backendId
        self.revision = 0
        self.updatedByUid = nil
        self.lastSyncedAt = nil
    }
    
    /// Check if today is a valid order day for this vendor
    var canOrderToday: Bool {
        let today = Calendar.current.component(.weekday, from: Date()) - 1 // 0-indexed
        return orderDays.contains(today)
    }
    
    /// Check if a delivery is expected today
    var hasDeliveryToday: Bool {
        let today = Calendar.current.component(.weekday, from: Date()) - 1
        return truckDays.contains(today)
    }
}
