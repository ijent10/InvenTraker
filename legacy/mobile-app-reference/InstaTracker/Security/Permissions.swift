import Foundation

enum AppModule: String, CaseIterable, Codable {
    case inventory
    case production
    case chopUp
    case spotCheck
    case healthChecks
    case expiration
    case waste
    case orders
    case toDo
    case received
    case transfers
    case insights
    case settings
    case account

    var displayName: String {
        switch self {
        case .production:
            return "Production"
        case .chopUp:
            return "Chop Items"
        case .spotCheck:
            return "Spot Check"
        case .healthChecks:
            return "Health Checks"
        case .toDo:
            return "To Do"
        case .transfers:
            return "Transfers"
        default:
            return rawValue.capitalized
        }
    }
}

enum AppAction: String, CaseIterable, Codable {
    case generateOrder
    case completeOrder
    case receiveInventory
    case spotCheck
    case recordWaste
    case manageMembers
    case manageDepartments
    case manageSettings
    case manageCatalog

    var displayName: String {
        switch self {
        case .generateOrder:
            return "Generate Order"
        case .completeOrder:
            return "Complete Order"
        case .receiveInventory:
            return "Receive Inventory"
        case .spotCheck:
            return "Spot Check"
        case .recordWaste:
            return "Record Waste"
        case .manageMembers:
            return "Manage Members"
        case .manageDepartments:
            return "Manage Departments"
        case .manageSettings:
            return "Manage Settings"
        case .manageCatalog:
            return "Manage Catalog"
        }
    }
}

protocol PermissionChecking {
    func canView(_ module: AppModule) -> Bool
    func canPerform(_ action: AppAction) -> Bool
}

struct RolePermissions {
    let modules: Set<AppModule>
    let actions: Set<AppAction>
}

enum PermissionMatrix {
    static func permissions(for role: UserRole) -> RolePermissions {
        switch role {
        case .owner:
            return RolePermissions(
                modules: Set(AppModule.allCases),
                actions: Set(AppAction.allCases)
            )
        case .manager:
            return RolePermissions(
                modules: Set(AppModule.allCases),
                actions: [
                    .generateOrder,
                    .completeOrder,
                    .receiveInventory,
                    .spotCheck,
                    .recordWaste,
                    .manageDepartments,
                    .manageSettings,
                    .manageCatalog
                ]
            )
        case .employee:
            return RolePermissions(
                modules: [.inventory, .production, .chopUp, .spotCheck, .healthChecks, .expiration, .waste, .orders, .toDo, .received, .transfers, .insights, .account],
                actions: [
                    .generateOrder,
                    .receiveInventory,
                    .spotCheck,
                    .recordWaste
                ]
            )
        case .viewer:
            return RolePermissions(
                modules: [.inventory, .expiration, .insights, .account],
                actions: []
            )
        }
    }

    static func permissions(for role: UserRole, permissionOverride: PermissionOverride?) -> RolePermissions {
        let base = permissions(for: role)
        guard role != .owner, let permissionOverride else { return base }
        return RolePermissions(
            modules: Set(permissionOverride.modules),
            actions: Set(permissionOverride.actions)
        )
    }
}

extension HomeSection {
    var appModule: AppModule {
        switch self {
        case .inventory: return .inventory
        case .production: return .production
        case .chopUp: return .chopUp
        case .spotCheck: return .spotCheck
        case .healthChecks: return .healthChecks
        case .expiration: return .expiration
        case .waste: return .waste
        case .orders: return .orders
        case .toDo: return .toDo
        case .received: return .received
        case .transfers: return .transfers
        case .insights: return .insights
        }
    }
}
