import Foundation
import SwiftUI
import Combine

enum RewrapPricingMode: String, Codable, CaseIterable, Identifiable {
    case byWeight
    case manual

    var id: String { rawValue }

    var title: String {
        switch self {
        case .byWeight:
            return "Price by Weight"
        case .manual:
            return "Manual Price"
        }
    }

    var shortTitle: String {
        switch self {
        case .byWeight:
            return "By Weight"
        case .manual:
            return "Manual"
        }
    }

    var summary: String {
        switch self {
        case .byWeight:
            return "Use item price as price per pound and auto-calculate package price in Chop."
        case .manual:
            return "Enter package price manually during Chop."
        }
    }
}

enum QuantityDisplayMode: String, Codable, CaseIterable, Identifiable {
    case eaches
    case caseEquivalent

    var id: String { rawValue }

    var title: String {
        switch self {
        case .eaches:
            return "Eaches"
        case .caseEquivalent:
            return "Case Equivalents"
        }
    }

    var summary: String {
        switch self {
        case .eaches:
            return "Show quantities in the item's base unit."
        case .caseEquivalent:
            return "Show quantities as case fractions (example: 23 on hand with case pack 10 = 2.3)."
        }
    }
}

/// Manages app-wide settings and preferences
class AppSettings: ObservableObject {
    
    static let shared = AppSettings()
    private static let activeStoreIDKey = "active_store_id"
    
    // MARK: - Waste Settings (which types affect orders)
    
    @AppStorage("waste_expired_affects_orders") var expiredAffectsOrders: Bool = true
    @AppStorage("waste_moldy_affects_orders") var moldyAffectsOrders: Bool = true
    @AppStorage("waste_temped_wrong_affects_orders") var tempedWrongAffectsOrders: Bool = false
    @AppStorage("waste_sampling_affects_orders") var samplingAffectsOrders: Bool = false
    @AppStorage("waste_custom_affects_orders") var customAffectsOrders: Bool = false
    @AppStorage(WasteReasonRuleStore.storageKey) private var wasteReasonRulesData: Data = {
        let defaults = WasteReasonRuleStore.defaultRules
        return (try? JSONEncoder().encode(defaults)) ?? Data()
    }()
    @AppStorage("department_configs") private var departmentConfigsData: Data = {
        (try? JSONEncoder().encode([DepartmentConfig]())) ?? Data()
    }()
    @AppStorage("rewrap_pricing_default_mode") private var rewrapPricingDefaultModeRaw: String = RewrapPricingMode.byWeight.rawValue
    @AppStorage("rewrap_pricing_item_overrides") private var rewrapPricingItemOverridesData: Data = {
        (try? JSONEncoder().encode([String: String]())) ?? Data()
    }()
    @AppStorage("quantity_display_mode") private var quantityDisplayModeRaw: String = QuantityDisplayMode.eaches.rawValue
    
    // MARK: - Appearance Settings
    
    @AppStorage("app_color_scheme") var colorScheme: String = AppColorScheme.blue.rawValue
    @AppStorage("preferred_color_scheme") var preferredColorScheme: String = "system" // "light", "dark", "system"
    @Published var activeStoreID: String {
        didSet {
            let normalized = activeStoreID.trimmingCharacters(in: .whitespacesAndNewlines)
            if activeStoreID != normalized {
                activeStoreID = normalized
                return
            }
            if normalized == oldValue.trimmingCharacters(in: .whitespacesAndNewlines) { return }
            UserDefaults.standard.set(normalized, forKey: Self.activeStoreIDKey)
            NotificationCenter.default.post(
                name: .activeStoreDidChange,
                object: nil,
                userInfo: ["storeId": normalized]
            )
        }
    }

    var normalizedActiveStoreID: String {
        activeStoreID.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    
    @AppStorage("home_section_order") private var homeSectionOrderData: Data = {
        let defaults = HomeSection.allCases.map(\.rawValue)
        return (try? JSONEncoder().encode(defaults)) ?? Data()
    }()
    @AppStorage("home_primary_quick_action") private var primaryQuickActionRaw: String = HomeSection.chopUp.rawValue
    
    // MARK: - Enabled Insights
    
    @AppStorage("enabled_insights") private var enabledInsightsData: Data = {
        // Default to all insights enabled
        let allInsights = InsightType.allCases.map { $0.rawValue }
        return (try? JSONEncoder().encode(allInsights)) ?? Data()
    }()

    @AppStorage("insight_card_order") private var insightCardOrderData: Data = {
        let defaults = InsightCardKind.allCases.map(\.rawValue)
        return (try? JSONEncoder().encode(defaults)) ?? Data()
    }()

    @AppStorage("enabled_insight_cards") private var enabledInsightCardsData: Data = {
        let defaults = InsightCardKind.allCases.map(\.rawValue)
        return (try? JSONEncoder().encode(defaults)) ?? Data()
    }()
    
    var enabledInsights: Set<InsightType> {
        get {
            guard let insights = try? JSONDecoder().decode([String].self, from: enabledInsightsData) else {
                return Set(InsightType.allCases)
            }
            return Set(insights.compactMap { InsightType(rawValue: $0) })
        }
        set {
            let insightStrings = newValue.map { $0.rawValue }
            enabledInsightsData = (try? JSONEncoder().encode(insightStrings)) ?? Data()
        }
    }
    
    /// Check if an insight type is enabled
    func isInsightEnabled(_ insight: InsightType) -> Bool {
        enabledInsights.contains(insight)
    }
    
    /// Toggle an insight on/off
    func toggleInsight(_ insight: InsightType) {
        var current = enabledInsights
        if current.contains(insight) {
            current.remove(insight)
        } else {
            current.insert(insight)
        }
        enabledInsights = current
    }

    // MARK: - Modular Insight Cards

    var insightCardOrder: [InsightCardKind] {
        get {
            guard let cardKeys = try? JSONDecoder().decode([String].self, from: insightCardOrderData) else {
                return InsightCardKind.allCases
            }
            var seen = Set<InsightCardKind>()
            var decoded = cardKeys
                .compactMap(InsightCardKind.init(rawValue:))
                .filter { seen.insert($0).inserted }
            let missing = InsightCardKind.allCases.filter { !decoded.contains($0) }
            decoded.append(contentsOf: missing)
            return decoded
        }
        set {
            let keys = newValue.map(\.rawValue)
            insightCardOrderData = (try? JSONEncoder().encode(keys)) ?? Data()
        }
    }

    var enabledInsightCards: Set<InsightCardKind> {
        get {
            guard let cardKeys = try? JSONDecoder().decode([String].self, from: enabledInsightCardsData) else {
                return Set(InsightCardKind.allCases)
            }
            let decoded = cardKeys.compactMap(InsightCardKind.init(rawValue:))
            return Set(decoded)
        }
        set {
            let keys = newValue.map(\.rawValue)
            enabledInsightCardsData = (try? JSONEncoder().encode(keys)) ?? Data()
        }
    }

    func isInsightCardEnabled(_ card: InsightCardKind) -> Bool {
        enabledInsightCards.contains(card)
    }

    func setInsightCardEnabled(_ enabled: Bool, for card: InsightCardKind) {
        var current = enabledInsightCards
        if enabled {
            current.insert(card)
        } else {
            current.remove(card)
        }
        enabledInsightCards = current
    }
    
    // MARK: - Notification Settings
    
    @AppStorage("notifications_enabled") var notificationsEnabled: Bool = false
    @AppStorage("expiration_notification_days") var expirationNotificationDays: Int = 3
    @AppStorage("low_stock_notifications") var lowStockNotifications: Bool = true
    @AppStorage("order_day_reminders") var orderDayReminders: Bool = true
    @AppStorage("spot_check_days_before_order") var spotCheckDaysBeforeOrder: Int = 1
    @AppStorage("show_tips") var showTips: Bool = true
    @AppStorage("enable_legacy_inventory_reads") var enableLegacyInventoryReads: Bool = false

    private init() {
        activeStoreID = UserDefaults.standard.string(forKey: Self.activeStoreIDKey) ?? ""
    }
    
    var wasteReasonRules: [WasteReasonRule] {
        get {
            if let decoded = try? JSONDecoder().decode([WasteReasonRule].self, from: wasteReasonRulesData) {
                return WasteReasonRuleStore.normalize(decoded)
            }
            let migrated = WasteReasonRuleStore.load()
            wasteReasonRulesData = (try? JSONEncoder().encode(migrated)) ?? Data()
            return migrated
        }
        set {
            let cleaned = WasteReasonRuleStore.normalize(newValue)
            wasteReasonRulesData = (try? JSONEncoder().encode(cleaned)) ?? Data()
        }
    }
    
    var customWasteReasons: [String] {
        get {
            wasteReasonRules.map(\.name)
        }
        set {
            wasteReasonRules = newValue.map { WasteReasonRule(name: $0, affectsOrders: false) }
        }
    }
    
    func affectsOrders(forWasteReason reason: String) -> Bool {
        WasteReasonRuleStore.affectsOrders(for: reason) ?? false
    }
    
    func setAffectsOrders(_ affects: Bool, forWasteReason reason: String) {
        var current = wasteReasonRules
        guard let index = current.firstIndex(where: { $0.name.caseInsensitiveCompare(reason) == .orderedSame }) else {
            return
        }
        current[index].affectsOrders = affects
        wasteReasonRules = current
    }

    // MARK: - Departments

    var departmentConfigs: [DepartmentConfig] {
        get {
            guard let decoded = try? JSONDecoder().decode([DepartmentConfig].self, from: departmentConfigsData) else {
                return []
            }
            return normalizeDepartmentConfigs(decoded)
        }
        set {
            let normalized = normalizeDepartmentConfigs(newValue)
            departmentConfigsData = (try? JSONEncoder().encode(normalized)) ?? Data()
        }
    }

    func locations(forDepartment departmentName: String) -> [String] {
        let trimmed = departmentName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        return departmentConfigs.first {
            $0.name.caseInsensitiveCompare(trimmed) == .orderedSame
        }?.locations ?? []
    }

    private func normalizeDepartmentConfigs(_ input: [DepartmentConfig]) -> [DepartmentConfig] {
        var seenDepartments = Set<String>()
        var normalized: [DepartmentConfig] = []

        for config in input {
            let cleanedName = config.name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanedName.isEmpty else { continue }

            let departmentKey = cleanedName.lowercased()
            guard !seenDepartments.contains(departmentKey) else { continue }
            seenDepartments.insert(departmentKey)

            var seenLocations = Set<String>()
            let cleanedLocations = config.locations.compactMap { raw -> String? in
                let cleaned = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !cleaned.isEmpty else { return nil }
                let key = cleaned.lowercased()
                guard !seenLocations.contains(key) else { return nil }
                seenLocations.insert(key)
                return cleaned
            }

            normalized.append(
                DepartmentConfig(
                    id: config.id,
                    name: cleanedName,
                    locations: cleanedLocations
                )
            )
        }

        return normalized.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    // MARK: - Rewrap Pricing

    var rewrapPricingDefaultMode: RewrapPricingMode {
        get { RewrapPricingMode(rawValue: rewrapPricingDefaultModeRaw) ?? .byWeight }
        set { rewrapPricingDefaultModeRaw = newValue.rawValue }
    }

    func rewrapPricingMode(forItemID itemID: UUID, organizationId: String?) -> RewrapPricingMode {
        rewrapPricingOverride(forItemID: itemID, organizationId: organizationId) ?? rewrapPricingDefaultMode
    }

    func rewrapPricingOverride(forItemID itemID: UUID, organizationId: String?) -> RewrapPricingMode? {
        let key = rewrapOverrideKey(itemID: itemID, organizationId: organizationId)
        guard let raw = rewrapPricingOverridesMap[key] else { return nil }
        return RewrapPricingMode(rawValue: raw)
    }

    func setRewrapPricingOverride(_ mode: RewrapPricingMode?, forItemID itemID: UUID, organizationId: String?) {
        let key = rewrapOverrideKey(itemID: itemID, organizationId: organizationId)
        var map = rewrapPricingOverridesMap
        if let mode {
            map[key] = mode.rawValue
        } else {
            map.removeValue(forKey: key)
        }
        saveRewrapPricingOverridesMap(map)
    }

    func rewrapPricingOverrideCount(for organizationId: String?) -> Int {
        let prefix = "\(normalizedOrganizationId(organizationId))|"
        return rewrapPricingOverridesMap.keys.filter { $0.hasPrefix(prefix) }.count
    }

    private var rewrapPricingOverridesMap: [String: String] {
        get {
            guard let decoded = try? JSONDecoder().decode([String: String].self, from: rewrapPricingItemOverridesData) else {
                return [:]
            }
            return decoded
        }
        set {
            rewrapPricingItemOverridesData = (try? JSONEncoder().encode(newValue)) ?? Data()
        }
    }

    private func saveRewrapPricingOverridesMap(_ map: [String: String]) {
        rewrapPricingOverridesMap = map
    }

    private func rewrapOverrideKey(itemID: UUID, organizationId: String?) -> String {
        "\(normalizedOrganizationId(organizationId))|\(itemID.uuidString.lowercased())"
    }

    private func normalizedOrganizationId(_ organizationId: String?) -> String {
        let trimmed = organizationId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? "local-default" : trimmed
    }
    
    // MARK: - Home Sections

    // MARK: - Quantity Display

    var quantityDisplayMode: QuantityDisplayMode {
        get { QuantityDisplayMode(rawValue: quantityDisplayModeRaw) ?? .eaches }
        set { quantityDisplayModeRaw = newValue.rawValue }
    }

    func quantityValueForDisplay(_ quantity: Double, item: InventoryItem) -> Double {
        guard quantityDisplayMode == .caseEquivalent else { return quantity }
        let casePack = max(1, item.quantityPerBox)
        return quantity / Double(casePack)
    }

    func quantityUnitForDisplay(item: InventoryItem) -> String {
        switch quantityDisplayMode {
        case .eaches:
            return item.unit.rawValue
        case .caseEquivalent:
            return "cases"
        }
    }

    func formattedQuantityForDisplay(_ quantity: Double, item: InventoryItem, includeUnit: Bool = true) -> String {
        let formatted = quantityValueForDisplay(quantity, item: item).formattedQuantity(maximumFractionDigits: 3)
        guard includeUnit else { return formatted }
        return "\(formatted) \(quantityUnitForDisplay(item: item))"
    }

    // MARK: - Home Sections
    
    var homeSectionOrder: [HomeSection] {
        get {
            guard let sectionNames = try? JSONDecoder().decode([String].self, from: homeSectionOrderData) else {
                return HomeSection.allCases
            }
            
            var decoded = sectionNames.compactMap(HomeSection.init(rawValue:))
            let missing = HomeSection.allCases.filter { !decoded.contains($0) }
            decoded.append(contentsOf: missing)
            return decoded
        }
        set {
            let names = newValue.map(\.rawValue)
            homeSectionOrderData = (try? JSONEncoder().encode(names)) ?? Data()
        }
    }

    var primaryQuickAction: HomeSection {
        get { HomeSection(rawValue: primaryQuickActionRaw) ?? .chopUp }
        set { primaryQuickActionRaw = newValue.rawValue }
    }
    
    // MARK: - App Color
    
    var accentColor: Color {
        switch AppColorScheme(rawValue: colorScheme) ?? .blue {
        case .blue: return .blue
        case .purple: return .purple
        case .green: return .green
        case .orange: return .orange
        case .red: return .red
        case .pink: return .pink
        case .teal: return .teal
        case .indigo: return .indigo
        }
    }
    
}

extension Notification.Name {
    static let activeStoreDidChange = Notification.Name("activeStoreDidChange")
}
