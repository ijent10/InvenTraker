import Foundation
import SwiftData

/// Tracks when users adjust sale percentages
/// Used to improve AI recommendations for future sales
@Model
final class SaleAdjustment {
    var id: UUID
    var item: InventoryItem?
    
    // Sale details
    var suggestedPercentage: Int // What the system recommended
    var actualPercentage: Int // What the user actually set
    var daysUntilExpiration: Int // How close to expiration when sale started
    
    // Outcome tracking
    var soldOut: Bool // Whether the item sold out during the sale
    var quantitySold: Double? // How much was sold during the sale
    
    var date: Date
    
    init(
        item: InventoryItem?,
        suggestedPercentage: Int,
        actualPercentage: Int,
        daysUntilExpiration: Int
    ) {
        self.id = UUID()
        self.item = item
        self.suggestedPercentage = suggestedPercentage
        self.actualPercentage = actualPercentage
        self.daysUntilExpiration = daysUntilExpiration
        self.soldOut = false
        self.quantitySold = nil
        self.date = Date()
    }
}

/// Historical spot check record used by Insights.
/// "Earned" is derived from decreases between previous and counted quantity.
@Model
final class SpotCheckInsightAction {
    var id: UUID
    var organizationId: String
    var storeId: String
    var itemIDSnapshot: UUID?
    var itemNameSnapshot: String
    var itemPriceSnapshot: Double
    var previousQuantity: Double
    var countedQuantity: Double
    var date: Date
    var includeInInsights: Bool

    init(
        organizationId: String,
        storeId: String = "",
        itemIDSnapshot: UUID?,
        itemNameSnapshot: String,
        itemPriceSnapshot: Double,
        previousQuantity: Double,
        countedQuantity: Double,
        date: Date = Date(),
        includeInInsights: Bool = true
    ) {
        self.id = UUID()
        self.organizationId = organizationId
        self.storeId = storeId
        self.itemIDSnapshot = itemIDSnapshot
        self.itemNameSnapshot = itemNameSnapshot
        self.itemPriceSnapshot = itemPriceSnapshot
        self.previousQuantity = previousQuantity
        self.countedQuantity = countedQuantity
        self.date = date
        self.includeInInsights = includeInInsights
    }

    var soldQuantityEstimate: Double {
        max(previousQuantity - countedQuantity, 0)
    }
}
