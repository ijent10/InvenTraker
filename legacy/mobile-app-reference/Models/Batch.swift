import Foundation
import SwiftData

enum StockArea: String, Codable, CaseIterable, Identifiable {
    case backOfHouse = "back_of_house"
    case frontOfHouse = "front_of_house"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .backOfHouse: return "Back of House"
        case .frontOfHouse: return "Front of House"
        }
    }
}

/// Represents a batch/lot of stock for an inventory item
/// Each batch has a specific quantity and expiration date
/// Spot checks manipulate existing batches or split them
@Model
final class Batch {
    var id: UUID
    var quantity: Double
    var expirationDate: Date
    var receivedDate: Date
    var packageBarcode: String?
    var packageWeight: Double?
    var packagePrice: Double?
    var reworkCount: Int
    var stockAreaRaw: String = StockArea.backOfHouse.rawValue
    var organizationId: String = "local-default"
    var storeId: String = ""
    var backendId: String?
    var revision: Int = 0
    var updatedByUid: String?
    var lastSyncedAt: Date?
    
    // Relationship to parent item
    var item: InventoryItem?
    
    init(
        quantity: Double,
        expirationDate: Date,
        receivedDate: Date = Date(),
        packageBarcode: String? = nil,
        packageWeight: Double? = nil,
        packagePrice: Double? = nil,
        reworkCount: Int = 0,
        stockArea: StockArea = .backOfHouse,
        organizationId: String = "local-default",
        backendId: String? = nil,
        storeId: String = ""
    ) {
        self.id = UUID()
        self.quantity = quantity
        self.expirationDate = expirationDate
        self.receivedDate = receivedDate
        self.packageBarcode = packageBarcode
        self.packageWeight = packageWeight
        self.packagePrice = packagePrice
        self.reworkCount = max(0, reworkCount)
        self.stockAreaRaw = stockArea.rawValue
        self.organizationId = organizationId
        self.storeId = storeId
        self.backendId = backendId
        self.revision = 0
        self.updatedByUid = nil
        self.lastSyncedAt = nil
    }
    
    /// Check if this batch is expired
    var isExpired: Bool {
        expirationDate < Date()
    }
    
    /// Days until expiration (negative if expired)
    var daysUntilExpiration: Int {
        Calendar.current.dateComponents([.day], from: Date(), to: expirationDate).day ?? 0
    }

    var stockArea: StockArea {
        StockArea(rawValue: stockAreaRaw) ?? .backOfHouse
    }
    
    /// Split this batch into a new batch with a different expiration
    /// Used for spot checks when updating partial quantities
    /// - Parameters:
    ///   - splitQuantity: Amount to move to new batch
    ///   - newExpiration: New expiration date for the split portion
    /// - Returns: New batch with the split quantity
    func split(quantity splitQuantity: Double, newExpiration: Date) -> Batch? {
        guard splitQuantity > 0 && splitQuantity <= quantity else { return nil }
        
        // Reduce current batch
        self.quantity -= splitQuantity
        
        // Create new batch
        let newBatch = Batch(
            quantity: splitQuantity,
            expirationDate: newExpiration,
            receivedDate: self.receivedDate,
            packageBarcode: self.packageBarcode,
            packageWeight: self.packageWeight,
            packagePrice: self.packagePrice,
            reworkCount: self.reworkCount,
            stockArea: self.stockArea,
            organizationId: self.organizationId,
            storeId: self.storeId
        )
        newBatch.item = self.item
        
        return newBatch
    }
}
