import Foundation

struct ProductionSuggestion: Identifiable, Hashable {
    var id: UUID { productID }
    let productID: UUID
    let productName: String
    let outputItemID: UUID?
    let outputUnitRaw: String
    let recommendedMakeQuantity: Double
    let expectedUsageToday: Double
    let onHandQuantity: Double
    let scaleFactor: Double
}

struct ProductionIngredientDemandRow: Identifiable, Hashable {
    var id: UUID { itemID }
    let itemID: UUID
    let itemName: String
    let unitRaw: String
    let requiredQuantity: Double
}

struct ProductionPullFactorSummary: Hashable {
    let businessFactor: Double
    let weatherFactor: Double
    let holidayFactor: Double
    let trendFactor: Double
    let holidayName: String?
}

struct FrozenPullRecommendation: Identifiable, Hashable {
    var id: UUID { itemID }
    let itemID: UUID
    let itemName: String
    let unitRaw: String
    let requiredQuantity: Double
    let recommendedPullQuantity: Double
    let onHandQuantity: Double
    let rationale: String
}

enum MeasurementConverter {
    private enum Domain {
        case unitless
        case mass
        case volume
    }

    static func convert(
        quantity: Double,
        from source: MeasurementUnit,
        to destination: MeasurementUnit
    ) -> Double? {
        if source == destination {
            return quantity
        }

        let sourceDomain = domain(for: source)
        let destinationDomain = domain(for: destination)
        guard sourceDomain == destinationDomain else {
            return nil
        }

        switch sourceDomain {
        case .unitless:
            return quantity
        case .mass:
            let grams = quantity * gramsPerUnit(source)
            guard grams.isFinite else { return nil }
            return grams / gramsPerUnit(destination)
        case .volume:
            let ml = quantity * millilitersPerUnit(source)
            guard ml.isFinite else { return nil }
            return ml / millilitersPerUnit(destination)
        }
    }

    private static func domain(for unit: MeasurementUnit) -> Domain {
        switch unit {
        case .pieces, .each, .custom:
            return .unitless
        case .pounds, .ounces, .grams, .kilograms:
            return .mass
        case .gallons, .liters, .milliliters:
            return .volume
        }
    }

    private static func gramsPerUnit(_ unit: MeasurementUnit) -> Double {
        switch unit {
        case .grams: return 1
        case .kilograms: return 1_000
        case .ounces: return 28.349523125
        case .pounds: return 453.59237
        default: return 1
        }
    }

    private static func millilitersPerUnit(_ unit: MeasurementUnit) -> Double {
        switch unit {
        case .milliliters: return 1
        case .liters: return 1_000
        case .gallons: return 3_785.411784
        default: return 1
        }
    }
}

enum ProductionPlanningService {
    static func suggestions(
        products: [ProductionProduct],
        spotChecks: [ProductionSpotCheckRecord],
        runs: [ProductionRun],
        asOf date: Date = Date()
    ) -> [ProductionSuggestion] {
        let calendar = Calendar.current
        let activeProducts = products.filter(\.isActive)

        return activeProducts.map { product in
            let expectedUsage = predictedUsage(
                productID: product.id,
                spotChecks: spotChecks,
                runs: runs,
                asOf: date,
                calendar: calendar
            )
            let targetStock = max(
                expectedUsage * max(product.targetDaysOnHand, 0.25),
                max(product.defaultBatchYield * 0.5, 0.25)
            )
            let rawRecommended = max(0, targetStock - max(product.lastSpotCheckQuantity, 0))
            let roundedRecommended = roundedQuantity(
                rawRecommended,
                unit: MeasurementUnit(rawValue: product.outputUnitRaw) ?? .pieces
            )
            let scaleFactor = roundedRecommended / max(product.defaultBatchYield, 0.001)

            return ProductionSuggestion(
                productID: product.id,
                productName: product.name,
                outputItemID: product.outputItemID,
                outputUnitRaw: product.outputUnitRaw,
                recommendedMakeQuantity: roundedRecommended,
                expectedUsageToday: max(expectedUsage, 0),
                onHandQuantity: max(product.lastSpotCheckQuantity, 0),
                scaleFactor: max(scaleFactor, 0)
            )
        }
        .sorted { lhs, rhs in
            lhs.productName.localizedCaseInsensitiveCompare(rhs.productName) == .orderedAscending
        }
    }

    static func ingredientDemandByItem(
        suggestions: [ProductionSuggestion],
        products: [ProductionProduct],
        ingredients: [ProductionIngredient],
        inventoryItems: [InventoryItem]
    ) -> [UUID: Double] {
        let inventoryByID = Dictionary(uniqueKeysWithValues: inventoryItems.map { ($0.id, $0) })
        let ingredientsByProduct = Dictionary(grouping: ingredients, by: \.productionProductID)
        let productByID = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })
        var requiredByItem: [UUID: Double] = [:]

        for suggestion in suggestions where suggestion.recommendedMakeQuantity > 0 {
            guard let product = productByID[suggestion.productID] else { continue }
            guard let productIngredients = ingredientsByProduct[product.id] else { continue }
            let factor = suggestion.recommendedMakeQuantity / max(product.defaultBatchYield, 0.001)
            guard factor > 0 else { continue }

            for ingredient in productIngredients where ingredient.quantityPerBatch > 0 {
                guard let itemID = ingredient.inventoryItemID else { continue }
                let baseRequired = ingredient.quantityPerBatch * factor
                let converted = convertForInventoryItem(
                    quantity: baseRequired,
                    fromUnitRaw: ingredient.unitRaw,
                    inventoryItem: inventoryByID[itemID]
                )
                requiredByItem[itemID, default: 0] += max(0, converted)
            }
        }

        return requiredByItem
    }

    static func ingredientDemandRows(
        suggestions: [ProductionSuggestion],
        products: [ProductionProduct],
        ingredients: [ProductionIngredient],
        inventoryItems: [InventoryItem]
    ) -> [ProductionIngredientDemandRow] {
        let inventoryByID = Dictionary(uniqueKeysWithValues: inventoryItems.map { ($0.id, $0) })
        let demandMap = ingredientDemandByItem(
            suggestions: suggestions,
            products: products,
            ingredients: ingredients,
            inventoryItems: inventoryItems
        )
        return demandMap.compactMap { itemID, quantity in
            guard let item = inventoryByID[itemID] else { return nil }
            return ProductionIngredientDemandRow(
                itemID: itemID,
                itemName: item.name,
                unitRaw: item.unit.rawValue,
                requiredQuantity: roundedQuantity(quantity, unit: item.unit)
            )
        }
        .sorted { lhs, rhs in
            lhs.itemName.localizedCaseInsensitiveCompare(rhs.itemName) == .orderedAscending
        }
    }

    static func frozenPullForecast(
        products: [ProductionProduct],
        ingredients: [ProductionIngredient],
        spotChecks: [ProductionSpotCheckRecord],
        runs: [ProductionRun],
        inventoryItems: [InventoryItem],
        businessFactor: Double = 1.0,
        includeNonFrozen: Bool = false,
        asOf date: Date = Date()
    ) -> (rows: [FrozenPullRecommendation], factors: ProductionPullFactorSummary) {
        let suggestions = suggestions(products: products, spotChecks: spotChecks, runs: runs, asOf: date)
        let demandByItem = ingredientDemandByItem(
            suggestions: suggestions,
            products: products,
            ingredients: ingredients,
            inventoryItems: inventoryItems
        )

        let holiday = holidayBoost(for: date)
        let factorSummary = ProductionPullFactorSummary(
            businessFactor: max(0.6, min(1.6, businessFactor)),
            weatherFactor: seasonalWeatherFactor(for: date),
            holidayFactor: holiday.factor,
            trendFactor: inferredTrendFactor(from: suggestions),
            holidayName: holiday.name
        )
        let combinedFactor = factorSummary.businessFactor
            * factorSummary.weatherFactor
            * factorSummary.holidayFactor
            * factorSummary.trendFactor

        let inventoryByID = Dictionary(uniqueKeysWithValues: inventoryItems.map { ($0.id, $0) })
        let rows = demandByItem.compactMap { itemID, quantity -> FrozenPullRecommendation? in
            guard let item = inventoryByID[itemID] else { return nil }
            if !includeNonFrozen && !looksFrozen(item: item) { return nil }

            let required = roundedQuantity(quantity * combinedFactor, unit: item.unit)
            guard required > 0 else { return nil }
            let onHand = roundedQuantity(max(0, item.totalQuantity), unit: item.unit)
            let pull = roundedQuantity(required, unit: item.unit)
            return FrozenPullRecommendation(
                itemID: itemID,
                itemName: item.name,
                unitRaw: item.unit.rawValue,
                requiredQuantity: required,
                recommendedPullQuantity: pull,
                onHandQuantity: onHand,
                rationale: "Trend \(percentString(factorSummary.trendFactor)) · Weather \(percentString(factorSummary.weatherFactor)) · Holiday \(percentString(factorSummary.holidayFactor)) · Input \(percentString(factorSummary.businessFactor))"
            )
        }
        .sorted { lhs, rhs in
            if lhs.recommendedPullQuantity == rhs.recommendedPullQuantity {
                return lhs.itemName.localizedCaseInsensitiveCompare(rhs.itemName) == .orderedAscending
            }
            return lhs.recommendedPullQuantity > rhs.recommendedPullQuantity
        }

        return (rows, factorSummary)
    }

    private static func predictedUsage(
        productID: UUID,
        spotChecks: [ProductionSpotCheckRecord],
        runs: [ProductionRun],
        asOf date: Date,
        calendar: Calendar
    ) -> Double {
        let horizonStart = calendar.date(byAdding: .day, value: -56, to: date) ?? date
        let records = spotChecks
            .filter { $0.productionProductID == productID && $0.checkedAt >= horizonStart && $0.usageObserved > 0 }
            .sorted { $0.checkedAt > $1.checkedAt }

        let baseUsage = average(records.prefix(14).map(\.usageObserved))
        let weekday = calendar.component(.weekday, from: date)
        let weekdayUsage = average(
            records.filter { calendar.component(.weekday, from: $0.checkedAt) == weekday }
                .prefix(8)
                .map(\.usageObserved)
        )

        let spotCheckPrediction: Double
        if weekdayUsage > 0 && baseUsage > 0 {
            spotCheckPrediction = (weekdayUsage * 0.65) + (baseUsage * 0.35)
        } else {
            spotCheckPrediction = max(weekdayUsage, baseUsage)
        }

        if spotCheckPrediction > 0 {
            return spotCheckPrediction
        }

        let runFallbackStart = calendar.date(byAdding: .day, value: -28, to: date) ?? date
        let recentRuns = runs
            .filter { $0.productionProductID == productID && $0.madeAt >= runFallbackStart && $0.quantityMade > 0 }
            .map(\.quantityMade)
        let fallbackDaily = average(recentRuns) * 0.7
        return max(0, fallbackDaily)
    }

    private static func convertForInventoryItem(
        quantity: Double,
        fromUnitRaw: String,
        inventoryItem: InventoryItem?
    ) -> Double {
        guard let inventoryItem else { return quantity }
        let sourceUnit = MeasurementUnit(rawValue: fromUnitRaw) ?? inventoryItem.unit
        if sourceUnit == inventoryItem.unit {
            return quantity
        }
        if let converted = MeasurementConverter.convert(
            quantity: quantity,
            from: sourceUnit,
            to: inventoryItem.unit
        ) {
            return converted
        }
        return quantity
    }

    private static func roundedQuantity(_ value: Double, unit: MeasurementUnit) -> Double {
        switch unit {
        case .pieces, .each:
            return ceil(max(0, value))
        default:
            let scaled = (max(0, value) * 1_000).rounded()
            return scaled / 1_000
        }
    }

    private static func inferredTrendFactor(from suggestions: [ProductionSuggestion]) -> Double {
        guard !suggestions.isEmpty else { return 1 }
        let totalExpected = suggestions.reduce(0) { $0 + max(0, $1.expectedUsageToday) }
        let totalRecommended = suggestions.reduce(0) { $0 + max(0, $1.recommendedMakeQuantity) }
        guard totalExpected > 0 else {
            return totalRecommended > 0 ? 1.05 : 1
        }
        let deltaRatio = (totalRecommended - totalExpected) / max(1, totalExpected)
        return min(1.25, max(0.85, 1 + deltaRatio * 0.2))
    }

    private static func seasonalWeatherFactor(for date: Date) -> Double {
        let month = Calendar.current.component(.month, from: date)
        if [11, 12, 1, 2].contains(month) { return 1.08 }
        if [6, 7, 8].contains(month) { return 0.94 }
        return 1.0
    }

    private static func holidayBoost(for date: Date) -> (factor: Double, name: String?) {
        let calendar = Calendar.current
        let year = calendar.component(.year, from: date)
        let candidates = holidayCandidates(year: year) + holidayCandidates(year: year + 1)
        let startOfToday = calendar.startOfDay(for: date)
        var nearest: (name: String, daysAway: Int)?

        for candidate in candidates {
            let holidayDate = calendar.startOfDay(for: candidate.date)
            let delta = calendar.dateComponents([.day], from: startOfToday, to: holidayDate).day ?? Int.max
            if delta < -1 || delta > 5 { continue }
            let absDelta = abs(delta)
            if nearest == nil || absDelta < (nearest?.daysAway ?? Int.max) {
                nearest = (candidate.name, absDelta)
            }
        }

        guard let nearest else { return (1.0, nil) }
        return (1.12, nearest.name)
    }

    private static func holidayCandidates(year: Int) -> [(name: String, date: Date)] {
        [
            ("New Year's", makeDate(year: year, month: 1, day: 1)),
            ("Memorial Day", lastWeekday(year: year, month: 5, weekday: 2)),
            ("Independence Day", makeDate(year: year, month: 7, day: 4)),
            ("Labor Day", nthWeekday(year: year, month: 9, weekday: 2, nth: 1)),
            ("Thanksgiving", nthWeekday(year: year, month: 11, weekday: 5, nth: 4)),
            ("Christmas", makeDate(year: year, month: 12, day: 25))
        ]
    }

    private static func makeDate(year: Int, month: Int, day: Int) -> Date {
        Calendar.current.date(from: DateComponents(year: year, month: month, day: day)) ?? Date()
    }

    // Calendar weekday values: Sunday=1 ... Saturday=7
    private static func nthWeekday(year: Int, month: Int, weekday: Int, nth: Int) -> Date {
        let calendar = Calendar.current
        let firstOfMonth = calendar.date(from: DateComponents(year: year, month: month, day: 1)) ?? Date()
        let firstWeekday = calendar.component(.weekday, from: firstOfMonth)
        let offset = (weekday - firstWeekday + 7) % 7
        let day = 1 + offset + max(0, nth - 1) * 7
        return calendar.date(from: DateComponents(year: year, month: month, day: day)) ?? firstOfMonth
    }

    private static func lastWeekday(year: Int, month: Int, weekday: Int) -> Date {
        let calendar = Calendar.current
        let nextMonth = month == 12 ? 1 : month + 1
        let nextMonthYear = month == 12 ? year + 1 : year
        let firstOfNextMonth = calendar.date(from: DateComponents(year: nextMonthYear, month: nextMonth, day: 1)) ?? Date()
        let lastOfMonth = calendar.date(byAdding: .day, value: -1, to: firstOfNextMonth) ?? firstOfNextMonth
        let lastWeekday = calendar.component(.weekday, from: lastOfMonth)
        let offset = (lastWeekday - weekday + 7) % 7
        return calendar.date(byAdding: .day, value: -offset, to: lastOfMonth) ?? lastOfMonth
    }

    private static func looksFrozen(item: InventoryItem) -> Bool {
        let haystack = [
            item.name,
            item.department ?? "",
            item.tags.joined(separator: " ")
        ]
        .joined(separator: " ")
        .lowercased()
        return haystack.contains("frozen") || haystack.contains("freezer")
    }

    private static func percentString(_ value: Double) -> String {
        "\(Int((value * 100).rounded()))%"
    }

    private static func average<S: Sequence>(_ values: S) -> Double where S.Element == Double {
        let array = Array(values)
        guard !array.isEmpty else { return 0 }
        let total = array.reduce(0, +)
        return total / Double(array.count)
    }
}
