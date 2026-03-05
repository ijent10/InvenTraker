import Foundation

/// Units of measurement for inventory items
/// Includes standard units plus custom option for user-defined units
enum MeasurementUnit: String, Codable, CaseIterable, Identifiable {
    case pieces = "pieces"
    case each = "each"
    case pounds = "lbs"
    case ounces = "oz"
    case grams = "g"
    case kilograms = "kg"
    case gallons = "gal"
    case liters = "L"
    case milliliters = "mL"
    case custom = "custom"
    
    var id: String { self.rawValue }
    
    /// Display name for the unit
    var displayName: String {
        switch self {
        case .custom:
            return "Custom..."
        default:
            return self.rawValue
        }
    }
}

/// Sections displayed on the home screen
/// Users can customize the order
enum HomeSection: String, CaseIterable, Identifiable {
    case inventory = "Inventory"
    case production = "Production"
    case spotCheck = "Spot Check"
    case healthChecks = "Health Checks"
    case expiration = "Expiration"
    case waste = "Waste"
    case orders = "Orders"
    case toDo = "To-Do"
    case received = "Received"
    case insights = "Insights"
    case transfers = "Transfers"
    case chopUp = "Chop Items"
    
    var id: String { self.rawValue }
    
    /// SF Symbol icon name for each section
    var iconName: String {
        switch self {
        case .inventory: return "shippingbox.fill"
        case .production: return "flame.fill"
        case .spotCheck: return "barcode.viewfinder"
        case .healthChecks: return "checklist.checked"
        case .expiration: return "calendar.badge.exclamationmark"
        case .waste: return "trash.fill"
        case .orders: return "cart.fill"
        case .toDo: return "checklist"
        case .received: return "arrow.down.circle.fill"
        case .insights: return "chart.bar.fill"
        case .transfers: return "arrow.left.arrow.right.circle.fill"
        case .chopUp: return "scissors"
        }
    }
}

/// Insights that users can enable/disable
enum InsightType: String, CaseIterable, Identifiable {
    // Ordering insights
    case mostOrdered = "Most Ordered Items"
    case leastOrdered = "Least Ordered Items"
    
    // Sales insights
    case highestSelling = "Highest Selling Items"
    case lowestSelling = "Lowest Selling Items"
    case onSaleMost = "Items On Sale Most"
    case bestSalePercentage = "Best Sale Percentages"
    
    // Waste insights
    case mostWasted = "Most Wasted Items"
    case mostExpired = "Most Frequently Expired"
    case wasteByType = "Waste by Type"
    
    // Stock insights
    case lowStock = "Low Stock Alerts"
    case overstocked = "Overstocked Items"
    case inventoryValue = "Total Inventory Value"
    case averageStockAge = "Average Stock Age"
    
    // Trend insights
    case fastestMoving = "Fastest Moving Items"
    case slowestMoving = "Slowest Moving Items"
    case seasonalTrends = "Seasonal Trends"
    
    var id: String { self.rawValue }
    
    /// Category grouping for settings
    var category: String {
        switch self {
        case .mostOrdered, .leastOrdered:
            return "Ordering"
        case .highestSelling, .lowestSelling, .onSaleMost, .bestSalePercentage:
            return "Sales"
        case .mostWasted, .mostExpired, .wasteByType:
            return "Waste"
        case .lowStock, .overstocked, .inventoryValue, .averageStockAge:
            return "Stock"
        case .fastestMoving, .slowestMoving, .seasonalTrends:
            return "Trends"
        }
    }
}

/// Modular cards displayed on the Insights screen.
/// Users can enable/disable and reorder these cards.
enum InsightCardKind: String, CaseIterable, Codable, Identifiable {
    case inventoryHealth = "inventory_health"
    case weeklyFinancial = "weekly_financial"
    case topMoneyMovers = "top_money_movers"
    case lowStock = "low_stock"
    case expiringSoon = "expiring_soon"
    case mostWasted = "most_wasted"
    case wasteByType = "waste_by_type"
    case mostOrdered = "most_ordered"
    case inventoryValue = "inventory_value"
    case overstocked = "overstocked"
    case saleCoverage = "sale_coverage"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .inventoryHealth: return "Inventory Health"
        case .weeklyFinancial: return "Weekly Money Snapshot"
        case .topMoneyMovers: return "Top Money Movers"
        case .lowStock: return "Low Stock"
        case .expiringSoon: return "Expiring Soon"
        case .mostWasted: return "Most Wasted"
        case .wasteByType: return "Waste by Type"
        case .mostOrdered: return "Most Ordered"
        case .inventoryValue: return "Inventory Value"
        case .overstocked: return "Overstocked"
        case .saleCoverage: return "Sale Coverage"
        }
    }

    var iconName: String {
        switch self {
        case .inventoryHealth: return "heart.text.square.fill"
        case .weeklyFinancial: return "dollarsign.arrow.circlepath"
        case .topMoneyMovers: return "chart.line.uptrend.xyaxis"
        case .lowStock: return "exclamationmark.triangle.fill"
        case .expiringSoon: return "calendar.badge.exclamationmark"
        case .mostWasted: return "trash.fill"
        case .wasteByType: return "chart.pie.fill"
        case .mostOrdered: return "cart.fill.badge.plus"
        case .inventoryValue: return "dollarsign.circle.fill"
        case .overstocked: return "shippingbox.fill"
        case .saleCoverage: return "tag.fill"
        }
    }
}

/// App color schemes for icon tinting
enum AppColorScheme: String, CaseIterable, Identifiable {
    case blue = "Blue"
    case purple = "Purple"
    case green = "Green"
    case orange = "Orange"
    case red = "Red"
    case pink = "Pink"
    case teal = "Teal"
    case indigo = "Indigo"
    
    var id: String { self.rawValue }
}
