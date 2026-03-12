import Foundation

enum RecommendationFallbackService {
    static func calculateOrderRecommendations(
        items: [ItemSnapshot],
        wastes: [WasteSnapshot],
        incomingOrders: [IncomingOrderSnapshot],
        productionDemandByItem: [UUID: Double]
    ) -> [OrderDraft] {
        var recommendations: [OrderDraft] = []
        let activeItems = items.filter { !$0.isArchived }
        let calendar = Calendar.current
        let now = Date()
        let todayStart = calendar.startOfDay(for: now)

        for item in activeItems {
            let currentQuantity = item.totalQuantity
            let productionDemand = max(0, productionDemandByItem[item.id] ?? 0)
            let minimumQuantity = item.minimumQuantity + productionDemand
            let qtyPerBox = max(item.quantityPerBox, 1)
            let leadTimeDays = max(item.vendorLeadTimeDays, 1)
            let cutoffDate = calendar.date(byAdding: .day, value: leadTimeDays, to: now) ?? now

            let incomingUnits = incomingOrders
                .filter { snapshot in
                    guard snapshot.itemID == item.id else { return false }
                    guard !snapshot.wasReceived else { return false }
                    guard let expected = snapshot.expectedDeliveryDate else { return false }
                    return expected >= todayStart && expected <= cutoffDate
                }
                .reduce(0.0) { partial, snapshot in
                    partial + snapshot.unitsOrdered
                }

            let projectedQuantity = currentQuantity + incomingUnits

            let relevantWaste = wastes.filter {
                $0.itemID == item.id && $0.affectsOrders
            }
            let totalWaste = relevantWaste.reduce(0.0) { $0 + $1.quantity }

            var recommendedUnits: Double = 0
            if projectedQuantity < minimumQuantity {
                recommendedUnits = (minimumQuantity - projectedQuantity) + (minimumQuantity * 0.2)
            } else if totalWaste > minimumQuantity * 0.1 {
                recommendedUnits = max(0, minimumQuantity * 0.8 - projectedQuantity)
            }

            let expiringSoon = item.batches.filter { batch in
                let days = calendar.dateComponents([.day], from: now, to: batch.expirationDate).day ?? 999
                return days <= leadTimeDays
            }
            let expiringQuantity = expiringSoon.reduce(0.0) { $0 + $1.quantity }
            if expiringQuantity > max(projectedQuantity, 1) * 0.3 {
                recommendedUnits *= 0.7
            }

            let recommendedBoxes = Int(ceil(recommendedUnits / Double(qtyPerBox)))
            recommendations.append(
                OrderDraft(
                    itemID: item.id,
                    backendItemID: nil,
                    name: item.name,
                    unit: item.unitRaw,
                    quantityPerBox: qtyPerBox,
                    caseInterpretation: "case_rounded",
                    recommendedQuantity: Double(max(0, recommendedBoxes)),
                    isChecked: false,
                    orderedQuantity: Double(max(0, recommendedBoxes))
                )
            )
        }

        return recommendations.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    static func productionSuggestions(
        products: [ProductionProduct],
        spotChecks: [ProductionSpotCheckRecord],
        runs: [ProductionRun]
    ) -> [ProductionSuggestion] {
        ProductionPlanningService.suggestions(products: products, spotChecks: spotChecks, runs: runs)
    }

    static func productionDemandByItem(
        products: [ProductionProduct],
        spotChecks: [ProductionSpotCheckRecord],
        runs: [ProductionRun],
        ingredients: [ProductionIngredient],
        inventoryItems: [InventoryItem]
    ) -> [UUID: Double] {
        let suggestions = productionSuggestions(products: products, spotChecks: spotChecks, runs: runs)
        return ProductionPlanningService.ingredientDemandByItem(
            suggestions: suggestions,
            products: products,
            ingredients: ingredients,
            inventoryItems: inventoryItems
        )
    }

    static func ingredientDemandRows(
        suggestions: [ProductionSuggestion],
        products: [ProductionProduct],
        ingredients: [ProductionIngredient],
        inventoryItems: [InventoryItem]
    ) -> [ProductionIngredientDemandRow] {
        ProductionPlanningService.ingredientDemandRows(
            suggestions: suggestions,
            products: products,
            ingredients: ingredients,
            inventoryItems: inventoryItems
        )
    }

    static func frozenPullForecast(
        products: [ProductionProduct],
        ingredients: [ProductionIngredient],
        spotChecks: [ProductionSpotCheckRecord],
        runs: [ProductionRun],
        inventoryItems: [InventoryItem],
        suggestionSeed: [ProductionSuggestion]? = nil,
        businessFactor: Double = 1,
        includeNonFrozen: Bool = false
    ) -> (rows: [FrozenPullRecommendation], factors: ProductionPullFactorSummary) {
        ProductionPlanningService.frozenPullForecast(
            products: products,
            ingredients: ingredients,
            spotChecks: spotChecks,
            runs: runs,
            inventoryItems: inventoryItems,
            suggestionSeed: suggestionSeed,
            businessFactor: businessFactor,
            includeNonFrozen: includeNonFrozen
        )
    }
}
