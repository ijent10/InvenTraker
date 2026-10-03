import Foundation

struct APIEnvelope<Value: Decodable>: Decodable {
    let apiVersion: String
    let serverTime: String
    let data: Value
}

struct APIErrorEnvelope: Decodable {
    struct Payload: Decodable {
        let code: String
        let message: String
    }
    let error: Payload
}

struct FirebaseSession: Codable {
    let idToken: String
    let refreshToken: String
    let localId: String
    let email: String
    let expiresAt: Date
}

struct FirebaseSignInResponse: Decodable {
    let idToken: String
    let refreshToken: String
    let localId: String
    let email: String
    let expiresIn: String
}

struct FirebaseRefreshResponse: Decodable {
    let idToken: String
    let refreshToken: String
    let userId: String
    let expiresIn: String

    enum CodingKeys: String, CodingKey {
        case idToken = "id_token"
        case refreshToken = "refresh_token"
        case userId = "user_id"
        case expiresIn = "expires_in"
    }
}

struct WorkspaceBootstrap: Decodable {
    let session: WorkspaceSession
    let organization: Organization
    let stores: [Store]
    let selectedStoreId: String
    let dashboard: DashboardMetrics
    let inventory: [InventoryItem]
    let batches: [InventoryBatch]?
    let orders: [OrderDraft]
    let healthChecks: [HealthCheck]
    let notifications: [WorkspaceNotification]
    let today: MobileToday?
    let preferences: MobilePreferences?
    let capabilities: MobileCapabilities?
}

struct MobileToday: Decodable {
    let generatedAt: String
    let engineVersion: String
    let issues: [MobileTodayIssue]
    let observability: MobileObservability
}

struct MobileTodayIssue: Identifiable, Decodable {
    let id: String
    let type: String
    let title: String
    let detail: String
    let evidence: [MobileIssueEvidence]
    let severity: String
    let priorityScore: Double
    let deadline: String?
    let suggestedAction: String
    let action: MobileIssueAction
    let freshness: MobileIssueFreshness
}

struct MobileIssueEvidence: Decodable {
    let label: String
    let value: String
    let sourceRef: String
}

struct MobileIssueAction: Decodable {
    let kind: String
    let href: String
}

struct MobileIssueFreshness: Decodable {
    let asOf: String?
    let state: String
}

struct MobileObservability: Decodable {
    let balanceMismatches: Int
    let duplicateOperationIds: Int
    let managerOverrides: Int
    let unresolvedVariances: Int
}

enum WorkShortcut: String, CaseIterable, Identifiable, Codable {
    case work
    case inventory
    case spotCheck
    case restock
    case receiving
    case waste
    case transfer
    case portion
    case orders
    case healthChecks
    case insights

    var id: String { rawValue }

    var title: String {
        switch self {
        case .work: "Work Center"
        case .inventory: "Inventory"
        case .spotCheck: "Spot Check"
        case .restock: "Restock"
        case .receiving: "Receiving"
        case .waste: "Discards"
        case .transfer: "Transfer"
        case .portion: "Cut & Portion"
        case .orders: "Orders"
        case .healthChecks: "Health Checks"
        case .insights: "Insights"
        }
    }

    var tabTitle: String {
        switch self {
        case .work: "Quick work"
        case .inventory: "Inventory"
        case .spotCheck: "Spot check"
        case .restock: "Restock"
        case .receiving: "Receive"
        case .waste: "Discards"
        case .transfer: "Transfer"
        case .portion: "Cut"
        case .orders: "Orders"
        case .healthChecks: "Checks"
        case .insights: "Insights"
        }
    }

    var detail: String {
        switch self {
        case .work: "Choose a task whenever you open this tab."
        case .inventory: "Browse stock already set up in the portal."
        case .spotCheck: "Count floor and backstock as you work."
        case .restock: "Calculate what to pull to the sales floor."
        case .receiving: "Put received product into backstock."
        case .waste: "Record damaged, expired, or quality discards."
        case .transfer: "Move stock between the floor and backstock."
        case .portion: "Split weighable stock into labeled portions."
        case .orders: "Review and submit current order drafts."
        case .healthChecks: "Open current health and safety checks."
        case .insights: "See live store stock and waste signals."
        }
    }

    var icon: String {
        switch self {
        case .work: "square.grid.2x2.fill"
        case .inventory: "shippingbox.fill"
        case .spotCheck: "viewfinder"
        case .restock: "arrow.triangle.2.circlepath"
        case .receiving: "shippingbox.and.arrow.backward.fill"
        case .waste: "trash.fill"
        case .transfer: "arrow.left.arrow.right"
        case .portion: "scissors"
        case .orders: "cart.fill"
        case .healthChecks: "checklist"
        case .insights: "chart.bar.xaxis"
        }
    }
}

struct MobileTheme: Codable, Equatable {
    var name: String?
    var accent: String
    var secondary: String
    var background: String?
    var backgroundSoft: String?
    var panel: String?
    var panelStrong: String?
    var controlBg: String?
    var controlHover: String?
    var controlBorder: String?
    var text: String?
    var muted: String?
    var subtle: String?
    var buttonText: String?
    var mode: String
    var dense: Bool

    static let standard = MobileTheme(
        name: "Blue steel",
        accent: "#2563eb",
        secondary: "#14b8a6",
        background: "#020617",
        backgroundSoft: "#0f172a",
        panel: "#0f172a",
        panelStrong: "#111827",
        controlBg: "#020617",
        controlHover: "#172033",
        controlBorder: "#334155",
        text: "#f8fafc",
        muted: "#94a3b8",
        subtle: "#64748b",
        buttonText: "#ffffff",
        mode: "Dark",
        dense: false
    )

    static let websitePresets: [MobileTheme] = [
        .standard,
        MobileTheme(name: "Fresh green", accent: "#16a34a", secondary: "#0f766e", background: "#f0fdf4", backgroundSoft: "#dcfce7", panel: "#f8fafc", panelStrong: "#ffffff", controlBg: "#ffffff", controlHover: "#ecfdf5", controlBorder: "#86efac", text: "#052e16", muted: "#166534", subtle: "#4d7c0f", buttonText: "#ffffff", mode: "Light", dense: false),
        MobileTheme(name: "High contrast", accent: "#f59e0b", secondary: "#22c55e", background: "#020617", backgroundSoft: "#111827", panel: "#020617", panelStrong: "#030712", controlBg: "#000000", controlHover: "#1f2937", controlBorder: "#f59e0b", text: "#fff7ed", muted: "#fde68a", subtle: "#fbbf24", buttonText: "#111827", mode: "Dark", dense: false),
        MobileTheme(name: "Pride", accent: "#ef4444", secondary: "#a855f7", background: "#101022", backgroundSoft: "#1e1b4b", panel: "#17122f", panelStrong: "#211844", controlBg: "#120f2a", controlHover: "#2e245f", controlBorder: "#f97316", text: "#fff7ed", muted: "#fbcfe8", subtle: "#fde68a", buttonText: "#ffffff", mode: "Dark", dense: false),
        MobileTheme(name: "Valentines", accent: "#e11d48", secondary: "#db2777", background: "#fff1f2", backgroundSoft: "#fce7f3", panel: "#ffffff", panelStrong: "#fff7fb", controlBg: "#ffffff", controlHover: "#ffe4e6", controlBorder: "#fda4af", text: "#4c0519", muted: "#9f1239", subtle: "#be185d", buttonText: "#ffffff", mode: "Light", dense: false),
        MobileTheme(name: "Christmas", accent: "#dc2626", secondary: "#22c55e", background: "#07130d", backgroundSoft: "#052e16", panel: "#0f1f17", panelStrong: "#13251a", controlBg: "#08170f", controlHover: "#16351f", controlBorder: "#15803d", text: "#fef2f2", muted: "#bbf7d0", subtle: "#fca5a5", buttonText: "#ffffff", mode: "Dark", dense: false),
        MobileTheme(name: "Halloween", accent: "#f97316", secondary: "#a855f7", background: "#120817", backgroundSoft: "#2e1065", panel: "#1b1024", panelStrong: "#24112f", controlBg: "#0f0713", controlHover: "#321244", controlBorder: "#f97316", text: "#fff7ed", muted: "#fdba74", subtle: "#c084fc", buttonText: "#111827", mode: "Dark", dense: false),
        MobileTheme(name: "Northern lights", accent: "#22d3ee", secondary: "#a78bfa", background: "#031525", backgroundSoft: "#0f766e", panel: "#082f49", panelStrong: "#0b324e", controlBg: "#051923", controlHover: "#164e63", controlBorder: "#22d3ee", text: "#ecfeff", muted: "#a5f3fc", subtle: "#c4b5fd", buttonText: "#06202a", mode: "Dark", dense: false),
        MobileTheme(name: "Cosmo and Wanda", accent: "#ff4fd8", secondary: "#43ff64", background: "#15051d", backgroundSoft: "#29143a", panel: "#21102f", panelStrong: "#2f1544", controlBg: "#180820", controlHover: "#3b1654", controlBorder: "#43ff64", text: "#fff5fd", muted: "#f0abfc", subtle: "#86efac", buttonText: "#19051f", mode: "Dark", dense: false)
    ]

    static func newTheme(name: String, accent: String, secondary: String, background: String) -> MobileTheme {
        MobileTheme(
            name: name,
            accent: accent,
            secondary: secondary,
            background: background,
            backgroundSoft: mix(secondary, with: "#ffffff", amount: 0.86),
            panel: "#ffffff",
            panelStrong: mix(accent, with: "#ffffff", amount: 0.98),
            controlBg: "#ffffff",
            controlHover: mix(accent, with: "#ffffff", amount: 0.9),
            controlBorder: mix(accent, with: "#cbd5e1", amount: 0.68),
            text: "#0f172a",
            muted: "#475569",
            subtle: "#64748b",
            buttonText: contrastText(for: accent),
            mode: "Light",
            dense: false
        )
    }

    private static func mix(_ source: String, with target: String, amount: Double) -> String {
        let sourceValues = rgbValues(from: source)
        let targetValues = rgbValues(from: target)
        let mixed = zip(sourceValues, targetValues).map { source, target in
            Int((Double(source) * (1 - amount) + Double(target) * amount).rounded())
        }
        return String(format: "#%02x%02x%02x", mixed[0], mixed[1], mixed[2])
    }

    private static func contrastText(for hex: String) -> String {
        let values = rgbValues(from: hex)
        let luminance = (0.299 * Double(values[0]) + 0.587 * Double(values[1]) + 0.114 * Double(values[2])) / 255
        return luminance > 0.58 ? "#0f172a" : "#ffffff"
    }

    private static func rgbValues(from hex: String) -> [Int] {
        let normalized = hex.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
        guard normalized.count == 6 else { return [37, 99, 235] }
        return stride(from: 0, to: 6, by: 2).map { offset in
            Int(normalized.dropFirst(offset).prefix(2), radix: 16) ?? 0
        }
    }

    init(
        name: String? = nil,
        accent: String,
        secondary: String,
        background: String? = nil,
        backgroundSoft: String? = nil,
        panel: String? = nil,
        panelStrong: String? = nil,
        controlBg: String? = nil,
        controlHover: String? = nil,
        controlBorder: String? = nil,
        text: String? = nil,
        muted: String? = nil,
        subtle: String? = nil,
        buttonText: String? = nil,
        mode: String = "System",
        dense: Bool = false
    ) {
        self.name = name
        self.accent = accent
        self.secondary = secondary
        self.background = background
        self.backgroundSoft = backgroundSoft
        self.panel = panel
        self.panelStrong = panelStrong
        self.controlBg = controlBg
        self.controlHover = controlHover
        self.controlBorder = controlBorder
        self.text = text
        self.muted = muted
        self.subtle = subtle
        self.buttonText = buttonText
        self.mode = mode
        self.dense = dense
    }
}

struct MobilePreferences: Codable, Equatable {
    let workShortcut: WorkShortcut
    let theme: MobileTheme?
    let savedThemes: [MobileTheme]

    init(workShortcut: WorkShortcut = .spotCheck, theme: MobileTheme? = nil, savedThemes: [MobileTheme] = []) {
        self.workShortcut = workShortcut
        self.theme = theme
        self.savedThemes = savedThemes
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: DynamicKey.self)
        workShortcut = WorkShortcut(rawValue: values.string("workShortcut")) ?? .spotCheck
        theme = values.decode(MobileTheme.self, "theme")
        savedThemes = values.decode([MobileTheme].self, "savedThemes") ?? []
    }
}

struct MobileCapabilities: Decodable, Equatable {
    let canViewInventory: Bool
    let canUpdateInventory: Bool
    let canTransferInventory: Bool
    let canViewOrders: Bool
    let canSubmitOrders: Bool
    let canViewHealthChecks: Bool
    let canCompleteHealthChecks: Bool
    let canViewInsights: Bool

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: DynamicKey.self)
        canViewInventory = values.bool("canViewInventory")
        canUpdateInventory = values.bool("canUpdateInventory")
        canTransferInventory = values.bool("canTransferInventory", fallback: canUpdateInventory)
        canViewOrders = values.bool("canViewOrders")
        canSubmitOrders = values.bool("canSubmitOrders")
        canViewHealthChecks = values.bool("canViewHealthChecks")
        canCompleteHealthChecks = values.bool("canCompleteHealthChecks")
        canViewInsights = values.bool("canViewInsights")
    }

    init(
        canViewInventory: Bool,
        canUpdateInventory: Bool,
        canTransferInventory: Bool,
        canViewOrders: Bool,
        canSubmitOrders: Bool,
        canViewHealthChecks: Bool,
        canCompleteHealthChecks: Bool,
        canViewInsights: Bool
    ) {
        self.canViewInventory = canViewInventory
        self.canUpdateInventory = canUpdateInventory
        self.canTransferInventory = canTransferInventory
        self.canViewOrders = canViewOrders
        self.canSubmitOrders = canSubmitOrders
        self.canViewHealthChecks = canViewHealthChecks
        self.canCompleteHealthChecks = canCompleteHealthChecks
        self.canViewInsights = canViewInsights
    }

    static let none = MobileCapabilities(
        canViewInventory: false,
        canUpdateInventory: false,
        canTransferInventory: false,
        canViewOrders: false,
        canSubmitOrders: false,
        canViewHealthChecks: false,
        canCompleteHealthChecks: false,
        canViewInsights: false
    )

    // Older deployed portals did not send the capability payload. This only keeps the
    // interface usable during that rollout; every server mutation still enforces access.
    static func legacy(member: Member?, permissions: [String]) -> MobileCapabilities {
        let title = member?.jobTitle.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        let isManager = ["owner", "organization owner", "administrator", "admin", "manager"].contains(title)
        func allowed(_ permission: String) -> Bool {
            isManager || permissions.contains("*") || permissions.contains(permission)
        }

        let canUpdateInventory = allowed("inventory.edit")
        let canSubmitOrders = allowed("orders.approve")
        let canCompleteHealthChecks = allowed("health.complete")
        return MobileCapabilities(
            canViewInventory: allowed("inventory.view") || canUpdateInventory,
            canUpdateInventory: canUpdateInventory,
            canTransferInventory: canUpdateInventory,
            canViewOrders: allowed("orders.view") || canSubmitOrders,
            canSubmitOrders: canSubmitOrders,
            canViewHealthChecks: allowed("health.view") || canCompleteHealthChecks,
            canCompleteHealthChecks: canCompleteHealthChecks,
            canViewInsights: allowed("insights.view")
        )
    }
}

struct WorkspaceSession: Decodable {
    let uid: String
    let email: String
    let orgId: String
    let member: Member
    let permissions: [String]
}

struct Member: Decodable {
    let id: String
    let name: String
    let employeeId: String
    let email: String
    let jobTitle: String
    let department: String
    let location: String
    let store: String
    let status: String

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: DynamicKey.self)
        id = values.string("id")
        name = values.string("name", fallback: values.string("email", fallback: "Team member"))
        employeeId = values.string("employeeId")
        email = values.string("email")
        jobTitle = values.string("jobTitle", fallback: values.string("role"))
        department = values.string("department")
        location = values.string("location")
        store = values.string("store")
        status = values.string("status", fallback: "Active")
    }
}

struct Organization: Decodable {
    let id: String
    let companyName: String
    let logoUrl: String
    let headerText: String
    let accentColor: String

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: DynamicKey.self)
        id = values.string("id")
        companyName = values.string("companyName", fallback: "InvenTracker")
        logoUrl = values.string("logoUrl")
        headerText = values.string("headerText", fallback: "Store operations")
        accentColor = values.string("accentColor", fallback: "#234d9f")
    }
}

struct Store: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let code: String
    let address: String

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: DynamicKey.self)
        id = values.string("id")
        name = values.string("name", fallback: "Store")
        code = values.string("code")
        address = values.string("address")
    }
}

struct DashboardMetrics: Decodable {
    let activeItems: Int
    let lowStockItems: Int
    let openOrders: Int
    let dueHealthChecks: Int
    let unreadNotifications: Int
}

struct InventoryItem: Identifiable, Decodable, Hashable {
    let id: String
    let storeId: String
    let name: String
    let sku: String
    let department: String
    let category: String
    let location: String
    let unit: String
    let onHand: Double
    let frontStock: Double
    let backStock: Double
    let par: Double
    let reorderPoint: Double
    let vendor: String
    let updatedAt: String
    let expires: Bool
    let status: String
    let revision: Int
    let nutrition: ProductNutrition?
    let variableMeasure: VariableMeasureInfo?
    let images: [String]

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: DynamicKey.self)
        id = values.string("id")
        storeId = values.string("storeId")
        name = values.string("name", fallback: "Inventory item")
        sku = values.string("sku")
        department = values.string("department")
        category = values.string("category")
        location = values.string("location")
        unit = values.string("unit", fallback: "eaches")
        onHand = values.double("onHand")
        frontStock = values.double("frontStock")
        backStock = values.double("backStock")
        par = values.double("par")
        reorderPoint = values.double("reorderPoint")
        vendor = values.string("vendor")
        updatedAt = values.string("updatedAt")
        expires = values.bool("expires")
        status = values.string("status", fallback: "Active")
        revision = Int(values.double("revision"))
        nutrition = values.decode(ProductNutrition.self, "nutrition")
        variableMeasure = values.decode(VariableMeasureInfo.self, "variableMeasure")
        images = values.decode([String].self, "images") ?? []
    }

    var primaryImageURL: URL? {
        let candidate = images.first(where: { !$0.isEmpty }) ?? nutrition?.imageUrl ?? ""
        guard let url = URL(string: candidate), url.scheme == "https" else { return nil }
        return url
    }

    func matchesBarcode(_ scanned: String) -> Bool {
        let left = sku.filter(\.isNumber)
        let right = scanned.filter(\.isNumber)
        if left.caseInsensitiveCompare(right) == .orderedSame { return true }
        let storedUPC = String(left.suffix(12))
        let scannedUPC = String(right.suffix(12))
        return storedUPC.count == 12 && scannedUPC.count == 12 && storedUPC.first == "2" && scannedUPC.first == "2" && storedUPC.prefix(6) == scannedUPC.prefix(6)
    }
}

struct VariableMeasureInfo: Decodable, Hashable {
    let isVariableMeasure: Bool

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: DynamicKey.self)
        isVariableMeasure = values.bool("isVariableMeasure")
    }
}

struct ProductNutrition: Decodable, Hashable {
    let servingSize: String
    let servingWeightGrams: Double
    let caloriesKcal: Double?
    let fatG: Double?
    let saturatedFatG: Double?
    let carbohydratesG: Double?
    let sugarsG: Double?
    let fiberG: Double?
    let proteinG: Double?
    let sodiumMg: Double?
    let dataKind: String
    let ingredientsText: String
    let sourceSummary: String
    let sourceUrl: String
    let imageUrl: String

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: DynamicKey.self)
        servingSize = values.string("servingSize")
        servingWeightGrams = values.double("servingWeightGrams")
        caloriesKcal = values.optionalDouble("caloriesKcal")
        fatG = values.optionalDouble("fatG")
        saturatedFatG = values.optionalDouble("saturatedFatG")
        carbohydratesG = values.optionalDouble("carbohydratesG")
        sugarsG = values.optionalDouble("sugarsG")
        fiberG = values.optionalDouble("fiberG")
        proteinG = values.optionalDouble("proteinG")
        sodiumMg = values.optionalDouble("sodiumMg")
        dataKind = values.string("dataKind")
        ingredientsText = values.string("ingredientsText")
        sourceSummary = values.string("sourceSummary")
        sourceUrl = values.string("sourceUrl")
        imageUrl = values.string("imageUrl")
    }
}

struct InventoryBatch: Identifiable, Decodable, Hashable {
    let id: String
    let itemId: String
    let storeId: String
    let remainingQuantity: Double
    let unit: String
    let area: String
    let receivedAt: String
    let expirationDate: String
    let expirationKnown: Bool
    let openedAt: String
    let preparedAt: String

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: DynamicKey.self)
        id = values.string("id")
        itemId = values.string("itemId")
        storeId = values.string("storeId")
        remainingQuantity = values.double("remainingQuantity")
        unit = values.string("unit", fallback: "eaches")
        area = values.string("area", fallback: "back")
        receivedAt = values.string("receivedAt")
        expirationDate = values.string("expirationDate")
        expirationKnown = values.bool("expirationKnown")
        openedAt = values.string("openedAt")
        preparedAt = values.string("preparedAt")
    }
}

struct OrderDraft: Identifiable, Decodable, Hashable {
    let id: String
    let vendorId: String
    let storeId: String
    let vendor: String
    let lines: [OrderLine]
    let estimatedTotal: String
    let minimum: String
    let status: String
    let dueBy: String
    let dueAt: String
    let expectedArrival: String
    let notes: String
    let minimumGapAmount: Double
    let approvedBy: String
    let submittedBy: String

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: DynamicKey.self)
        id = values.string("id")
        vendorId = values.string("vendorId")
        storeId = values.string("storeId")
        vendor = values.string("vendor", fallback: "Vendor")
        lines = values.decode([OrderLine].self, "lines") ?? []
        estimatedTotal = values.string("estimatedTotal", fallback: "$0")
        minimum = values.string("minimum", fallback: "$0")
        status = values.string("status", fallback: "Draft")
        dueBy = values.string("dueBy")
        dueAt = values.string("dueAt")
        expectedArrival = values.string("expectedArrival")
        notes = values.string("notes")
        minimumGapAmount = values.double("minimumGapAmount")
        approvedBy = values.string("approvedBy")
        submittedBy = values.string("submittedBy")
    }
}

struct MobileOrderRecommendation: Decodable {
    let runId: String
    let generatedAt: String
    let engineVersion: String
    let rulePath: String
    let subtotalAmount: Double
    let minimumAmount: Double
    let minimumGapAmount: Double
    let degradedFlags: [String]
    let lines: [MobileOrderRecommendationLine]
}

struct MobileOrderRecommendationLine: Identifiable, Decodable {
    let id: String
    let itemName: String
    let suggestedQuantity: Double
    let orderUnit: String
    let calculation: String
    let degradedFlags: [String]
}

struct OrderLine: Identifiable, Decodable, Hashable {
    let id: String
    let itemId: String
    let itemName: String
    let sku: String
    let quantity: Double
    let unit: String
    let unitCost: String
    let reason: String
    let vendorOffered: Bool
    let suggestedQuantity: Double
    let finalQuantity: Double
    let receivedQuantity: Double
    let overrideReason: String
    let calculation: String
    let stockUnitsPerOrderUnit: Double

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: DynamicKey.self)
        id = values.string("id", fallback: UUID().uuidString)
        itemId = values.string("itemId")
        itemName = values.string("itemName", fallback: "Item")
        sku = values.string("sku")
        quantity = values.double("quantity")
        unit = values.string("unit", fallback: "eaches")
        unitCost = values.string("unitCost")
        reason = values.string("reason")
        vendorOffered = values.bool("vendorOffered", fallback: true)
        suggestedQuantity = values.double("suggestedQuantity", fallback: values.double("aiRecommendedQuantity", fallback: quantity))
        finalQuantity = values.double("finalQuantity", fallback: quantity)
        receivedQuantity = values.double("receivedQuantity")
        overrideReason = values.string("overrideReason")
        calculation = values.string("calculation", fallback: reason)
        stockUnitsPerOrderUnit = values.double("stockUnitsPerOrderUnit", fallback: 1)
    }
}

struct HealthCheck: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let status: String
    let schedule: String
    let lastCompleted: String
    let completedBy: String
    let responses: Int

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: DynamicKey.self)
        id = values.string("id")
        name = values.string("name", fallback: "Health check")
        status = values.string("status", fallback: "Current")
        schedule = values.string("schedule")
        lastCompleted = values.string("lastCompleted")
        completedBy = values.string("completedBy")
        responses = Int(values.double("responses"))
    }
}

struct WorkspaceNotification: Identifiable, Decodable, Hashable {
    let id: String
    let title: String
    let detail: String
    let href: String
    let read: Bool

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: DynamicKey.self)
        id = values.string("id")
        title = values.string("title", fallback: "Notification")
        detail = values.string("detail")
        href = values.string("href")
        read = values.bool("read")
    }
}

struct SpotCheckLine: Encodable, Identifiable {
    let itemId: String
    let expectedRevision: Int
    var frontStock: Double
    var backStock: Double
    var expirationDate: String?
    var id: String { itemId }
}

struct RestockLine: Encodable, Identifiable {
    let itemId: String
    var countedFrontStock: Double
    var id: String { itemId }
}

struct RestockResult: Decodable {
    let committed: Bool
    let recommendations: [RestockRecommendation]
}

struct RestockRecommendation: Identifiable, Decodable {
    let itemId: String
    let name: String
    let countedFrontStock: Double
    let previousBackStock: Double
    let targetFrontStock: Double
    let pullQuantity: Double
    let resultingFrontStock: Double
    let resultingBackStock: Double
    var id: String { itemId }
}

struct WasteLine: Encodable {
    let itemId: String
    let quantity: Double
    let area: String
    let reason: String
    let batchId: String?
}

struct ReceivingLine: Encodable {
    let itemId: String
    let quantity: Double
    let expirationDate: String?
    var orderId: String? = nil
    var orderLineId: String? = nil
    var receivedOrderQuantity: Double? = nil
}

struct TransferLine: Encodable {
    let itemId: String
    let quantity: Double
    let source: String
    let destination: String
    let batchId: String?
}

struct TransferResult: Decodable {
    let itemId: String
    let itemName: String
    let frontStock: Double
    let backStock: Double
    let onHand: Double
}

struct PortionRequest: Encodable {
    let itemId: String
    let sourceArea: String
    let sourceBatchId: String?
    let portionWeight: Double
    let portionCount: Int
    let expirationDate: String?
    let packageBarcodePrefix: String?
}

struct PortionResult: Decodable {
    let itemId: String
    let itemName: String
    let portionCount: Int
    let portionWeight: Double
    let totalWeight: Double
    let unit: String
    let portionIds: [String]
}

struct MobileInsights: Decodable {
    let storeId: String
    let period: String
    let activeItems: Int
    let lowStockItems: Int
    let lowStockRatio: Double
    let totalUnits: Double
    let backstockUnits: Double
    let wasteEvents: Int
    let wasteUnits: Double
    let openOrders: Int
    let attention: [MobileInsightAttention]
}

struct MobileInsightAttention: Identifiable, Decodable {
    let itemId: String
    let name: String
    let onHand: Double
    let reorderPoint: Double
    let unit: String

    var id: String { itemId }
}

private struct DynamicKey: CodingKey {
    var stringValue: String
    var intValue: Int?
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { self.stringValue = String(intValue); self.intValue = intValue }
    init(_ value: String) { stringValue = value }
}

private extension KeyedDecodingContainer where Key == DynamicKey {
    func string(_ key: String, fallback: String = "") -> String {
        (try? decodeIfPresent(String.self, forKey: DynamicKey(key))) ?? fallback
    }

    func double(_ key: String, fallback: Double = 0) -> Double {
        if let value = try? decodeIfPresent(Double.self, forKey: DynamicKey(key)) { return value }
        if let value = try? decodeIfPresent(Int.self, forKey: DynamicKey(key)) { return Double(value) }
        return fallback
    }

    func optionalDouble(_ key: String) -> Double? {
        if let value = try? decodeIfPresent(Double.self, forKey: DynamicKey(key)) { return value }
        if let value = try? decodeIfPresent(Int.self, forKey: DynamicKey(key)) { return Double(value) }
        return nil
    }

    func bool(_ key: String, fallback: Bool = false) -> Bool {
        (try? decodeIfPresent(Bool.self, forKey: DynamicKey(key))) ?? fallback
    }

    func decode<Value: Decodable>(_ type: Value.Type, _ key: String) -> Value? {
        try? decodeIfPresent(type, forKey: DynamicKey(key))
    }
}
