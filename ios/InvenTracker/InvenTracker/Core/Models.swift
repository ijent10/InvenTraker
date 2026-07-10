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
    let orders: [OrderDraft]
    let healthChecks: [HealthCheck]
    let notifications: [WorkspaceNotification]
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
    }
}

struct OrderDraft: Identifiable, Decodable, Hashable {
    let id: String
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

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: DynamicKey.self)
        id = values.string("id")
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
    }
}

struct OrderLine: Identifiable, Decodable, Hashable {
    let id: String
    let itemName: String
    let sku: String
    let quantity: Double
    let unit: String
    let unitCost: String
    let reason: String
    let vendorOffered: Bool

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: DynamicKey.self)
        id = values.string("id", fallback: UUID().uuidString)
        itemName = values.string("itemName", fallback: "Item")
        sku = values.string("sku")
        quantity = values.double("quantity")
        unit = values.string("unit", fallback: "eaches")
        unitCost = values.string("unitCost")
        reason = values.string("reason")
        vendorOffered = values.bool("vendorOffered", fallback: true)
    }
}

struct HealthCheck: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let status: String
    let schedule: String
    let lastCompleted: String

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: DynamicKey.self)
        id = values.string("id")
        name = values.string("name", fallback: "Health check")
        status = values.string("status", fallback: "Current")
        schedule = values.string("schedule")
        lastCompleted = values.string("lastCompleted")
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

    func bool(_ key: String, fallback: Bool = false) -> Bool {
        (try? decodeIfPresent(Bool.self, forKey: DynamicKey(key))) ?? fallback
    }

    func decode<Value: Decodable>(_ type: Value.Type, _ key: String) -> Value? {
        try? decodeIfPresent(type, forKey: DynamicKey(key))
    }
}
