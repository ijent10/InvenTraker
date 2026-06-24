import Foundation

enum UserRole: String, Codable, CaseIterable, Identifiable {
    case owner
    case manager
    case employee
    case viewer

    var id: String { rawValue }

    var displayName: String {
        rawValue.capitalized
    }

    static func fromBackend(_ rawValue: String?) -> UserRole {
        guard let rawValue else { return .viewer }
        let normalized = rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        switch normalized {
        case "owner":
            return .owner
        case "manager":
            return .manager
        case "employee", "staff":
            return .employee
        case "viewer":
            return .viewer
        default:
            if normalized.contains("owner") {
                return .owner
            }
            if normalized.contains("manager") {
                return .manager
            }
            if normalized.contains("staff") || normalized.contains("employee") || normalized.contains("assistant") {
                return .employee
            }
            return .employee
        }
    }
}

enum MembershipStatus: String, Codable {
    case active
    case invited
    case suspended
}

struct SessionUser: Identifiable, Codable, Hashable {
    var id: String
    var email: String?
    var displayName: String?
}

struct OrganizationSummary: Identifiable, Codable, Hashable {
    var id: String
    var name: String
    var ownerUid: String
    var defaultStoreId: String?
    var status: String
    var createdAt: Date
    var updatedAt: Date
}

struct OrgMembership: Identifiable, Codable, Hashable {
    var id: String { userId }
    var organizationId: String
    var userId: String
    var role: UserRole
    var jobTitle: String? = nil
    var permissionOverride: PermissionOverride? = nil
    var storeIds: [String]? = nil
    var employeeId: String? = nil
    var departmentId: String?
    var departmentIds: [String]? = nil
    var departmentNames: [String]? = nil
    var status: MembershipStatus
    var joinedAt: Date
    var invitedBy: String?
}

struct DepartmentRef: Identifiable, Codable, Hashable {
    var id: String
    var name: String
    var isActive: Bool
    var updatedAt: Date
}

struct LocationRef: Identifiable, Codable, Hashable {
    var id: String
    var name: String
    var sortOrder: Int
    var isActive: Bool
}

struct StoreLocationRef: Identifiable, Codable, Hashable {
    var id: String
    var name: String
    var storeNumber: String? = nil
    var addressLine1: String
    var addressLine2: String?
    var city: String
    var state: String
    var postalCode: String
    var country: String
    var isActive: Bool
    var createdAt: Date
    var updatedAt: Date
}

enum AppHeaderStyle: String, Codable {
    case iconOnly = "icon_only"
    case iconName = "icon_name"
}

enum ModuleIconStyle: String, Codable {
    case rounded
    case square
}

struct OrganizationBrandingConfig: Codable, Hashable {
    var enabled: Bool
    var brandDisplayName: String?
    var logoLightUrl: String?
    var logoDarkUrl: String?
    var appHeaderStyle: AppHeaderStyle
    var moduleIconStyle: ModuleIconStyle
    var welcomeMessage: String?

    static let `default` = OrganizationBrandingConfig(
        enabled: false,
        brandDisplayName: nil,
        logoLightUrl: nil,
        logoDarkUrl: nil,
        appHeaderStyle: .iconName,
        moduleIconStyle: .rounded,
        welcomeMessage: nil
    )
}

struct OrgInvite: Identifiable, Codable, Hashable {
    var id: String
    var organizationId: String
    var email: String
    var role: UserRole
    var permissionOverride: PermissionOverride? = nil
    var departmentId: String?
    var codeHash: String
    var expiresAt: Date
    var status: MembershipStatus
    var invitedBy: String
}

struct PermissionOverride: Codable, Hashable {
    var modules: [AppModule]
    var actions: [AppAction]
}

enum AuditActionType: String, Codable, CaseIterable {
    case generateOrder = "generate_order"
    case completeOrder = "complete_order"
    case receiveInventory = "receive_inventory"
    case receiveOrderLine = "receive_order_line"
    case spotCheckSetCount = "spot_check_set_count"
    case wasteRecorded = "waste_recorded"
    case migrationImport = "migration_import"
}

struct AuditObjectRefs: Codable, Hashable {
    var organizationId: String
    var itemId: String?
    var orderId: String?
    var batchIds: [String]
}

struct GenerateOrderPayload: Codable, Hashable {
    var vendorId: String?
    var lineCount: Int
    var orderIds: [String]
    var expectedDeliveryDate: Date?
}

struct CompleteOrderPayload: Codable, Hashable {
    var orderIds: [String]
}

struct ReceiveInventoryPayload: Codable, Hashable {
    var itemId: String
    var quantity: Double
    var batchIds: [String]
    var fromOrderLineId: String?
}

struct ReceiveOrderLinePayload: Codable, Hashable {
    var orderId: String
    var lineId: String
    var quantity: Int
}

struct SpotCheckSetCountPayload: Codable, Hashable {
    var itemId: String
    var newTotal: Double
    var batchCount: Int
}

struct WasteRecordedPayload: Codable, Hashable {
    var itemId: String
    var quantity: Double
    var reason: String
}

struct MigrationImportPayload: Codable, Hashable {
    var entity: String
    var count: Int
}

enum ActionPayload: Codable, Hashable {
    case generateOrder(GenerateOrderPayload)
    case completeOrder(CompleteOrderPayload)
    case receiveInventory(ReceiveInventoryPayload)
    case receiveOrderLine(ReceiveOrderLinePayload)
    case spotCheckSetCount(SpotCheckSetCountPayload)
    case wasteRecorded(WasteRecordedPayload)
    case migrationImport(MigrationImportPayload)

    var actionType: AuditActionType {
        switch self {
        case .generateOrder: return .generateOrder
        case .completeOrder: return .completeOrder
        case .receiveInventory: return .receiveInventory
        case .receiveOrderLine: return .receiveOrderLine
        case .spotCheckSetCount: return .spotCheckSetCount
        case .wasteRecorded: return .wasteRecorded
        case .migrationImport: return .migrationImport
        }
    }

    private enum CodingKeys: String, CodingKey {
        case kind
        case payload
    }

    private enum Kind: String, Codable {
        case generateOrder
        case completeOrder
        case receiveInventory
        case receiveOrderLine
        case spotCheckSetCount
        case wasteRecorded
        case migrationImport
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .generateOrder(let payload):
            try container.encode(Kind.generateOrder, forKey: .kind)
            try container.encode(payload, forKey: .payload)
        case .completeOrder(let payload):
            try container.encode(Kind.completeOrder, forKey: .kind)
            try container.encode(payload, forKey: .payload)
        case .receiveInventory(let payload):
            try container.encode(Kind.receiveInventory, forKey: .kind)
            try container.encode(payload, forKey: .payload)
        case .receiveOrderLine(let payload):
            try container.encode(Kind.receiveOrderLine, forKey: .kind)
            try container.encode(payload, forKey: .payload)
        case .spotCheckSetCount(let payload):
            try container.encode(Kind.spotCheckSetCount, forKey: .kind)
            try container.encode(payload, forKey: .payload)
        case .wasteRecorded(let payload):
            try container.encode(Kind.wasteRecorded, forKey: .kind)
            try container.encode(payload, forKey: .payload)
        case .migrationImport(let payload):
            try container.encode(Kind.migrationImport, forKey: .kind)
            try container.encode(payload, forKey: .payload)
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(Kind.self, forKey: .kind)
        switch kind {
        case .generateOrder:
            self = .generateOrder(try container.decode(GenerateOrderPayload.self, forKey: .payload))
        case .completeOrder:
            self = .completeOrder(try container.decode(CompleteOrderPayload.self, forKey: .payload))
        case .receiveInventory:
            self = .receiveInventory(try container.decode(ReceiveInventoryPayload.self, forKey: .payload))
        case .receiveOrderLine:
            self = .receiveOrderLine(try container.decode(ReceiveOrderLinePayload.self, forKey: .payload))
        case .spotCheckSetCount:
            self = .spotCheckSetCount(try container.decode(SpotCheckSetCountPayload.self, forKey: .payload))
        case .wasteRecorded:
            self = .wasteRecorded(try container.decode(WasteRecordedPayload.self, forKey: .payload))
        case .migrationImport:
            self = .migrationImport(try container.decode(MigrationImportPayload.self, forKey: .payload))
        }
    }
}

struct AuditActionRecord: Identifiable, Codable, Hashable {
    var id: String
    var type: AuditActionType
    var actorUid: String
    var actorRole: UserRole
    var deviceId: String
    var createdAt: Date
    var objectRefs: AuditObjectRefs
    var payload: ActionPayload
    var baseRevision: Int?
    var resultStatus: String
}
