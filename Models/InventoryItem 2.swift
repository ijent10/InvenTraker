import Foundation
import SwiftData

/// Represents an item in the inventory system
/// Each item can have multiple batches with different expiration dates
@Model
final class InventoryItem {
    private static let batchDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "M-d"
        return formatter
    }()

    var id: UUID
    var name: String
    var upc: String?
    var tags: [String]
    var pictures: [Data]
    
    // Expiration settings
    var defaultExpiration: Int // days until expiration
    var defaultPackedExpiration: Int // days until expiration once wrapped/packed
    
    // Vendor and ordering information
    var vendor: Vendor?
    var minimumQuantity: Double // Minimum stock level before reordering
    var quantityPerBox: Int // How many units come in one box/case (e.g., 12 mangos per box)
    
    // Placement
    var department: String?
    var departmentLocation: String?
    var isPrepackaged: Bool
    var rewrapsWithUniqueBarcode: Bool
    var canBeReworked: Bool
    var reworkShelfLifeDays: Int
    var maxReworkCount: Int
    var storeId: String = ""
    
    // Pricing
    var price: Double // Price per unit
    
    // Measurement
    var unit: MeasurementUnit // The unit of measurement for this item
    
    // Status flags
    var isArchived: Bool
    var includeInInsights: Bool // Whether to include in analytics when archived
    var isOnSale: Bool
    var salePercentage: Int // Current sale percentage (0-100)
    
    // Relationships
    var batches: [Batch] // Stock batches with different expirations
    
    // Metadata
    var createdAt: Date
    var lastModified: Date
    var organizationId: String = "local-default"
    var backendId: String?
    var revision: Int = 0
    var updatedByUid: String?
    var lastSyncedAt: Date?
    
    init(
        name: String,
        upc: String? = nil,
        tags: [String] = [],
        pictures: [Data] = [],
        defaultExpiration: Int = 7,
        defaultPackedExpiration: Int? = nil,
        vendor: Vendor? = nil,
        minimumQuantity: Double = 0,
        quantityPerBox: Int = 1,
        department: String? = nil,
        departmentLocation: String? = nil,
        isPrepackaged: Bool = false,
        rewrapsWithUniqueBarcode: Bool = false,
        canBeReworked: Bool = false,
        reworkShelfLifeDays: Int = 1,
        maxReworkCount: Int = 1,
        price: Double = 0,
        unit: MeasurementUnit = .pieces,
        batches: [Batch] = [],
        organizationId: String = "local-default",
        backendId: String? = nil,
        storeId: String = ""
    ) {
        self.id = UUID()
        self.name = name
        self.upc = upc
        self.tags = tags
        self.pictures = pictures
        self.defaultExpiration = max(1, defaultExpiration)
        self.defaultPackedExpiration = max(1, defaultPackedExpiration ?? defaultExpiration)
        self.vendor = vendor
        self.minimumQuantity = minimumQuantity
        self.quantityPerBox = quantityPerBox
        self.department = department
        self.departmentLocation = departmentLocation
        self.isPrepackaged = isPrepackaged
        self.rewrapsWithUniqueBarcode = rewrapsWithUniqueBarcode
        self.canBeReworked = canBeReworked
        self.reworkShelfLifeDays = max(1, reworkShelfLifeDays)
        self.maxReworkCount = max(1, maxReworkCount)
        self.price = price
        self.unit = unit
        self.isArchived = false
        self.includeInInsights = true
        self.isOnSale = false
        self.salePercentage = 0
        self.batches = batches
        self.createdAt = Date()
        self.lastModified = Date()
        self.organizationId = organizationId
        self.backendId = backendId
        self.storeId = storeId
        self.revision = 0
        self.updatedByUid = nil
        self.lastSyncedAt = nil
    }

    var effectiveDefaultExpiration: Int {
        max(1, defaultExpiration)
    }

    var effectiveDefaultPackedExpiration: Int {
        max(1, defaultPackedExpiration)
    }

    var effectiveReworkShelfLifeDays: Int {
        max(1, reworkShelfLifeDays)
    }

    var effectiveMaxReworkCount: Int {
        max(1, maxReworkCount)
    }
    
    /// Total quantity across all batches
    var totalQuantity: Double {
        batches.reduce(0) { $0 + $1.quantity }
    }
    
    /// Summary of all batches with expiration dates
    /// Example: "4 expiring 2-19, 5 expiring 3-1"
    var batchesSummary: String {
        let grouped = Dictionary(grouping: batches) { $0.expirationDate }
        let sorted = grouped.sorted { $0.key < $1.key }
        return sorted.map { date, batches in
            let total = batches.reduce(0) { $0 + $1.quantity }
            return "\(Int(total)) expiring \(InventoryItem.batchDateFormatter.string(from: date))"
        }.joined(separator: ", ")
    }
    
    /// Calculate how many boxes are needed based on current stock and minimum
    /// Returns whole number only, never decimals
    func calculateBoxesNeeded() -> Int {
        let deficit = minimumQuantity - totalQuantity
        if deficit <= 0 { return 0 }
        
        // Round up to next whole box
        return Int(ceil(deficit / Double(quantityPerBox)))
    }
}
