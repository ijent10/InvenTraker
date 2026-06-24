import Foundation
import Combine

@MainActor
final class RBACService: ObservableObject, PermissionChecking {
    @Published private(set) var role: UserRole = .viewer
    @Published private(set) var permissionOverride: PermissionOverride?

    func updateRole(_ role: UserRole?) {
        updateMembership(role: role, permissionOverride: nil)
    }

    func updateMembership(role: UserRole?, permissionOverride: PermissionOverride?) {
        self.role = role ?? .viewer
        self.permissionOverride = permissionOverride
    }

    func canView(_ module: AppModule) -> Bool {
        PermissionMatrix.permissions(for: role, permissionOverride: permissionOverride).modules.contains(module)
    }

    func canPerform(_ action: AppAction) -> Bool {
        PermissionMatrix.permissions(for: role, permissionOverride: permissionOverride).actions.contains(action)
    }
}
