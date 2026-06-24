import Foundation
import SwiftData

/// Represents waste/loss of inventory
/// Automatically subtracts from inventory when created
@Model
final class WasteEntry {
    var id: UUID
    var item: InventoryItem?
    var itemIDSnapshot: UUID?
    var itemNameSnapshot: String?
    var quantity: Double
    var wasteType: WasteType
    var customTypeName: String?
    var date: Date
    var notes: String
    var itemPriceSnapshot: Double?
    var includeInInsights: Bool?
    var organizationId: String = "local-default"
    var storeId: String = ""
    var backendId: String?
    var revision: Int = 0
    var updatedByUid: String?
    var lastSyncedAt: Date?
    
    // This is determined by app settings, not per-entry
    // The actual value is stored in UserDefaults and read when generating orders
    var wasteTypeAffectsOrders: Bool {
        get {
            if let configured = WasteReasonRuleStore.affectsOrders(for: displayWasteType) {
                return configured
            }
            
            switch wasteType {
            case .expired:
                return UserDefaults.standard.bool(forKey: "waste_expired_affects_orders")
            case .moldy:
                return UserDefaults.standard.bool(forKey: "waste_moldy_affects_orders")
            case .tempedWrong:
                return UserDefaults.standard.bool(forKey: "waste_temped_wrong_affects_orders")
            case .sampling:
                return UserDefaults.standard.bool(forKey: "waste_sampling_affects_orders")
            case .custom, .other:
                return UserDefaults.standard.bool(forKey: "waste_custom_affects_orders")
            }
        }
    }
    
    var displayWasteType: String {
        if wasteType == .custom || wasteType == .other {
            let trimmed = customTypeName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return trimmed.isEmpty ? WasteType.custom.rawValue : trimmed
        }
        return wasteType.rawValue
    }
    
    var displayItemName: String {
        let trimmed = itemNameSnapshot?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? "Unknown" : trimmed
    }

    var isIncludedInInsights: Bool {
        includeInInsights ?? true
    }
    
    init(
        item: InventoryItem?,
        quantity: Double,
        wasteType: WasteType,
        customTypeName: String? = nil,
        notes: String = "",
        organizationId: String = "local-default",
        storeId: String = "",
        backendId: String? = nil
    ) {
        self.id = UUID()
        self.item = item
        self.itemIDSnapshot = item?.id
        self.itemNameSnapshot = item?.name
        self.quantity = quantity
        self.wasteType = wasteType
        self.customTypeName = customTypeName
        self.date = Date()
        self.notes = notes
        self.itemPriceSnapshot = item?.price
        self.includeInInsights = true
        self.organizationId = organizationId
        self.storeId = storeId
        self.backendId = backendId
        self.revision = 0
        self.updatedByUid = nil
        self.lastSyncedAt = nil
    }
}

/// Types of waste that can occur
enum WasteType: String, Codable, CaseIterable {
    case expired = "Expired"
    case moldy = "Moldy"
    case tempedWrong = "Temped Wrong"
    case sampling = "Sampling"
    case custom = "Custom"
    case other = "Other" // kept for backward compatibility with existing data
}
