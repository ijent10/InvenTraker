import Foundation
import SwiftData
#if canImport(UIKit)
import UIKit
#endif

struct InventorySharePayload: Codable {
    var version: Int
    var exportedAt: Date
    var items: [InventoryShareItem]
}

struct InventoryShareItem: Codable {
    var name: String
    var upc: String?
    var tags: [String]
    var pictures: [Data]?
    var hasExpiration: Bool?
    var defaultExpiration: Int
    var defaultPackedExpiration: Int?
    var vendorName: String?
    var minimumQuantity: Double
    var quantityPerBox: Int
    var department: String?
    var departmentLocation: String?
    var isPrepackaged: Bool
    var rewrapsWithUniqueBarcode: Bool
    var canBeReworked: Bool?
    var reworkShelfLifeDays: Int?
    var maxReworkCount: Int?
    var price: Double
    var unitRaw: String
    var isOnSale: Bool
    var salePercentage: Int
    var storeId: String?
    var batches: [InventoryShareBatch]
}

struct InventoryShareBatch: Codable {
    var quantity: Double
    var expirationDate: Date
    var receivedDate: Date
    var packageBarcode: String?
    var packageWeight: Double?
    var packagePrice: Double?
    var reworkCount: Int?
    var stockAreaRaw: String?
}

struct InventoryImportResult {
    var importedCount: Int
    var updatedCount: Int
    var createdVendorCount: Int
}

enum InventoryShareService {
    static let urlScheme = "inventraker"
    private static let importHost = "import"
    private static let payloadQueryKey = "data"
    
    @MainActor
    static func shareURL(for items: [InventoryItem]) -> URL? {
        let payloadItems = items.map { item in
            InventoryShareItem(
                name: item.name,
                upc: item.upc,
                tags: item.tags,
                pictures: optimizedPictures(from: item.pictures),
                hasExpiration: item.hasExpiration,
                defaultExpiration: item.defaultExpiration,
                defaultPackedExpiration: item.effectiveDefaultPackedExpiration,
                vendorName: item.vendor?.name,
                minimumQuantity: item.minimumQuantity,
                quantityPerBox: item.quantityPerBox,
                department: item.department,
                departmentLocation: item.departmentLocation,
                isPrepackaged: item.isPrepackaged,
                rewrapsWithUniqueBarcode: item.rewrapsWithUniqueBarcode,
                canBeReworked: item.canBeReworked,
                reworkShelfLifeDays: item.effectiveReworkShelfLifeDays,
                maxReworkCount: item.effectiveMaxReworkCount,
                price: item.price,
                unitRaw: item.unit.rawValue,
                isOnSale: item.isOnSale,
                salePercentage: item.salePercentage,
                storeId: item.storeId,
                batches: item.batches.map { batch in
                    InventoryShareBatch(
                        quantity: batch.quantity,
                        expirationDate: batch.expirationDate,
                        receivedDate: batch.receivedDate,
                        packageBarcode: batch.packageBarcode,
                        packageWeight: batch.packageWeight,
                        packagePrice: batch.packagePrice,
                        reworkCount: batch.reworkCount,
                        stockAreaRaw: batch.stockAreaRaw
                    )
                }
            )
        }
        
        let payload = InventorySharePayload(
            version: 3,
            exportedAt: Date(),
            items: payloadItems
        )
        
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(payload) else { return nil }
        
        var components = URLComponents()
        components.scheme = urlScheme
        components.host = importHost
        components.queryItems = [
            URLQueryItem(
                name: payloadQueryKey,
                value: data.base64EncodedString()
                    .replacingOccurrences(of: "+", with: "-")
                    .replacingOccurrences(of: "/", with: "_")
                    .replacingOccurrences(of: "=", with: "")
            )
        ]
        return components.url
    }
    
    static func decode(url: URL) -> InventorySharePayload? {
        guard url.scheme?.lowercased() == urlScheme else { return nil }
        guard url.host?.lowercased() == importHost else { return nil }
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let encoded = components.queryItems?.first(where: { $0.name == payloadQueryKey })?.value else {
            return nil
        }
        
        var base64 = encoded
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = base64.count % 4
        if remainder > 0 {
            base64 += String(repeating: "=", count: 4 - remainder)
        }
        
        guard let data = Data(base64Encoded: base64) else { return nil }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(InventorySharePayload.self, from: data)
    }
    
    static func importPayload(
        _ payload: InventorySharePayload,
        into modelContext: ModelContext,
        existingItems: [InventoryItem],
        existingVendors: [Vendor],
        organizationId: String? = nil
    ) -> InventoryImportResult {
        var result = InventoryImportResult(importedCount: 0, updatedCount: 0, createdVendorCount: 0)
        let targetOrganizationId = organizationId ?? "local-default"
        var mutableItems = existingItems.filter { $0.organizationId == targetOrganizationId }
        var mutableVendors = existingVendors.filter { $0.organizationId == targetOrganizationId }
        
        for shared in payload.items {
            let vendor = resolveVendor(
                named: shared.vendorName,
                modelContext: modelContext,
                vendors: &mutableVendors,
                createdVendorCount: &result.createdVendorCount,
                organizationId: targetOrganizationId
            )
            
            if let existing = findExistingItem(
                shared,
                in: mutableItems,
                vendorName: vendor?.name,
                organizationId: targetOrganizationId
            ) {
                apply(shared: shared, to: existing, vendor: vendor)
                result.updatedCount += 1
            } else {
                let imported = makeInventoryItem(from: shared, vendor: vendor, organizationId: targetOrganizationId)
                modelContext.insert(imported)
                mutableItems.append(imported)
                result.importedCount += 1
            }
        }
        
        try? modelContext.save()
        return result
    }
    
    private static func resolveVendor(
        named name: String?,
        modelContext: ModelContext,
        vendors: inout [Vendor],
        createdVendorCount: inout Int,
        organizationId: String
    ) -> Vendor? {
        let trimmed = name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !trimmed.isEmpty else { return nil }
        
        if let existing = vendors.first(where: { $0.name.caseInsensitiveCompare(trimmed) == .orderedSame }) {
            return existing
        }
        
        let created = Vendor(name: trimmed, organizationId: organizationId)
        modelContext.insert(created)
        vendors.append(created)
        createdVendorCount += 1
        return created
    }
    
    private static func findExistingItem(
        _ shared: InventoryShareItem,
        in items: [InventoryItem],
        vendorName: String?,
        organizationId: String
    ) -> InventoryItem? {
        let upc = shared.upc?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !upc.isEmpty,
           let existingUPC = items.first(where: {
               $0.organizationId == organizationId &&
               ($0.upc ?? "").caseInsensitiveCompare(upc) == .orderedSame
           }) {
            return existingUPC
        }
        
        return items.first {
            $0.organizationId == organizationId &&
            $0.name.caseInsensitiveCompare(shared.name) == .orderedSame &&
            (($0.vendor?.name ?? "").caseInsensitiveCompare(vendorName ?? "") == .orderedSame)
        }
    }
    
    private static func apply(shared: InventoryShareItem, to item: InventoryItem, vendor: Vendor?) {
        item.name = shared.name
        let cleanedUPC = shared.upc?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        item.upc = cleanedUPC.isEmpty ? nil : cleanedUPC
        item.tags = shared.tags
        item.pictures = shared.pictures ?? []
        let hasExpiration = shared.hasExpiration ?? (shared.defaultExpiration > 0)
        item.hasExpiration = hasExpiration
        item.defaultExpiration = hasExpiration ? max(1, shared.defaultExpiration) : 0
        item.defaultPackedExpiration = hasExpiration ? max(1, shared.defaultPackedExpiration ?? shared.defaultExpiration) : 0
        item.vendor = vendor
        item.minimumQuantity = max(0, shared.minimumQuantity)
        item.quantityPerBox = max(1, shared.quantityPerBox)
        item.department = cleanedString(shared.department)
        item.departmentLocation = cleanedString(shared.departmentLocation)
        item.isPrepackaged = shared.isPrepackaged
        item.rewrapsWithUniqueBarcode = shared.rewrapsWithUniqueBarcode
        item.canBeReworked = shared.canBeReworked ?? false
        item.reworkShelfLifeDays = max(1, shared.reworkShelfLifeDays ?? 1)
        item.maxReworkCount = max(1, shared.maxReworkCount ?? 1)
        item.price = max(0, shared.price)
        item.unit = MeasurementUnit(rawValue: shared.unitRaw) ?? .pieces
        item.isOnSale = shared.isOnSale
        item.salePercentage = max(0, min(100, shared.salePercentage))
        item.storeId = cleanedString(shared.storeId) ?? ""
        item.lastModified = Date()
        
        item.batches.removeAll()
        for batch in shared.batches where batch.quantity > 0 {
            let copy = Batch(
                quantity: batch.quantity,
                expirationDate: batch.expirationDate,
                receivedDate: batch.receivedDate,
                packageBarcode: cleanedString(batch.packageBarcode),
                packageWeight: batch.packageWeight,
                packagePrice: batch.packagePrice,
                reworkCount: max(0, batch.reworkCount ?? 0),
                stockArea: StockArea(rawValue: batch.stockAreaRaw ?? "") ?? .backOfHouse,
                organizationId: item.organizationId,
                storeId: item.storeId
            )
            copy.item = item
            item.batches.append(copy)
        }
    }
    
    private static func makeInventoryItem(
        from shared: InventoryShareItem,
        vendor: Vendor?,
        organizationId: String
    ) -> InventoryItem {
        let hasExpiration = shared.hasExpiration ?? (shared.defaultExpiration > 0)
        let batches = shared.batches
            .filter { $0.quantity > 0 }
            .map {
                Batch(
                    quantity: $0.quantity,
                    expirationDate: $0.expirationDate,
                    receivedDate: $0.receivedDate,
                    packageBarcode: cleanedString($0.packageBarcode),
                    packageWeight: $0.packageWeight,
                    packagePrice: $0.packagePrice,
                    reworkCount: max(0, $0.reworkCount ?? 0),
                    stockArea: StockArea(rawValue: $0.stockAreaRaw ?? "") ?? .backOfHouse,
                    organizationId: organizationId,
                    storeId: cleanedString(shared.storeId) ?? ""
                )
            }
        
        let item = InventoryItem(
            name: shared.name,
            upc: shared.upc,
            tags: shared.tags,
            pictures: shared.pictures ?? [],
            hasExpiration: hasExpiration,
            defaultExpiration: hasExpiration ? max(1, shared.defaultExpiration) : 0,
            defaultPackedExpiration: hasExpiration ? max(1, shared.defaultPackedExpiration ?? shared.defaultExpiration) : 0,
            vendor: vendor,
            minimumQuantity: max(0, shared.minimumQuantity),
            quantityPerBox: max(1, shared.quantityPerBox),
            department: cleanedString(shared.department),
            departmentLocation: cleanedString(shared.departmentLocation),
            isPrepackaged: shared.isPrepackaged,
            rewrapsWithUniqueBarcode: shared.rewrapsWithUniqueBarcode,
            canBeReworked: shared.canBeReworked ?? false,
            reworkShelfLifeDays: max(1, shared.reworkShelfLifeDays ?? 1),
            maxReworkCount: max(1, shared.maxReworkCount ?? 1),
            price: max(0, shared.price),
            unit: MeasurementUnit(rawValue: shared.unitRaw) ?? .pieces,
            batches: batches,
            organizationId: organizationId,
            storeId: cleanedString(shared.storeId) ?? ""
        )
        item.isOnSale = shared.isOnSale
        item.salePercentage = max(0, min(100, shared.salePercentage))
        item.lastModified = Date()
        for batch in item.batches {
            batch.item = item
        }
        return item
    }

    private static func cleanedString(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    @MainActor
    private static func optimizedPictures(from pictures: [Data]) -> [Data] {
        pictures.compactMap(optimizedImageData(from:))
    }

    @MainActor
    private static func optimizedImageData(from data: Data) -> Data? {
        #if canImport(UIKit)
        guard let image = UIImage(data: data) else { return data }
        let maxDimension: CGFloat = 1024
        let sourceSize = image.size
        let maxSide = max(sourceSize.width, sourceSize.height)
        let scale = maxSide > 0 ? min(1, maxDimension / maxSide) : 1
        let targetSize = CGSize(width: sourceSize.width * scale, height: sourceSize.height * scale)

        let renderer = UIGraphicsImageRenderer(size: targetSize)
        let resized = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }
        return resized.jpegData(compressionQuality: 0.75) ?? data
        #else
        return data
        #endif
    }
}
