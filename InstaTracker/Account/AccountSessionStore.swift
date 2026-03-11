import Foundation
import Combine
import SwiftData
#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif
#if canImport(FirebaseCore)
import FirebaseCore
#endif

@MainActor
final class AccountSessionStore: ObservableObject {
    @Published var firebaseUser: SessionUser?
    @Published var activeOrganizationId: String?
    @Published var activeMembership: OrgMembership?
    @Published var organizations: [OrganizationSummary] = []
    @Published var stores: [StoreLocationRef] = []
    @Published var needsTutorial = false
    @Published var isLoading = false
    @Published var didInitialize = false
    @Published var errorMessage: String?

    let rbacService = RBACService()

    private let authService: AuthService
    private let organizationService: OrganizationService
    private let inviteService: InviteService
    private let migrationCoordinator: MigrationCoordinator
    private var authCancellable: AnyCancellable?
    #if canImport(FirebaseFirestore)
    private var membershipListener: ListenerRegistration?
    #endif
    private let tutorialSeenKeyPrefix = "account_tutorial_seen_"
    private let legacyRehomeKeyPrefix = "legacy_local_rehome_"

    init(
        authService: AuthService? = nil,
        organizationService: OrganizationService? = nil,
        inviteService: InviteService? = nil,
        migrationCoordinator: MigrationCoordinator? = nil
    ) {
        self.authService = authService ?? .shared
        self.organizationService = organizationService ?? .shared
        self.inviteService = inviteService ?? .shared
        self.migrationCoordinator = migrationCoordinator ?? .shared
    }

    func start() {
        if authCancellable != nil {
            return
        }
        authService.start()
        authCancellable = authService.$currentUser
            .receive(on: RunLoop.main)
            .sink { [weak self] user in
                Task { @MainActor in
                    self?.firebaseUser = user
                    await self?.refreshMembershipContext()
                }
            }
    }

    func canView(_ module: AppModule) -> Bool {
        if firebaseUser == nil { return false }
        return rbacService.canView(module)
    }

    func canPerform(_ action: AppAction) -> Bool {
        if firebaseUser == nil { return false }
        return rbacService.canPerform(action)
    }

    var inventoryDepartmentScope: Set<String> {
        guard let membership = activeMembership else { return [] }
        var values: [String] = []
        if let departmentId = membership.departmentId {
            values.append(departmentId)
        }
        values.append(contentsOf: membership.departmentIds ?? [])
        values.append(contentsOf: membership.departmentNames ?? [])
        let normalized = values
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .filter { !$0.isEmpty }
        return Set(normalized)
    }

    func canAccessInventoryDepartment(_ department: String?) -> Bool {
        let scope = inventoryDepartmentScope
        guard !scope.isEmpty else { return true }
        guard let department = department?.trimmingCharacters(in: .whitespacesAndNewlines),
              !department.isEmpty else {
            return false
        }
        return scope.contains(department.lowercased())
    }

    func signIn(email: String, password: String) async {
        do {
            isLoading = true
            errorMessage = nil
            try await authService.signIn(email: email, password: password)
            await refreshMembershipContext()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func createAccount(
        email: String,
        password: String,
        companyCode: String? = nil,
        employeeId: String? = nil
    ) async {
        do {
            isLoading = true
            errorMessage = nil
            try await authService.createAccount(email: email, password: password)
            if let createdUser = authService.currentUser {
                firebaseUser = createdUser
            }
            let normalizedCompanyCode = companyCode?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? ""
            if !normalizedCompanyCode.isEmpty {
                let normalizedEmployeeId = employeeId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                guard !normalizedEmployeeId.isEmpty else {
                    throw OrganizationServiceError.invalidEmployeeID
                }
                guard let user = firebaseUser ?? authService.currentUser else {
                    throw OrganizationServiceError.missingUser
                }
                let claimedOrg = try await organizationService.claimOrganizationByCompanyCode(
                    companyCode: normalizedCompanyCode,
                    employeeId: normalizedEmployeeId,
                    user: user
                )
                if !organizations.contains(where: { $0.id == claimedOrg.id }) {
                    organizations.append(claimedOrg)
                    organizations.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                }
                activeOrganizationId = claimedOrg.id
                if let defaultStoreID = claimedOrg.defaultStoreId, !defaultStoreID.isEmpty {
                    AppSettings.shared.activeStoreID = defaultStoreID
                }
            }
            await refreshMembershipContext()
        } catch {
            if firebaseUser == nil {
                firebaseUser = authService.currentUser
            }
            if firebaseUser != nil {
                await refreshMembershipContext()
            }
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func resetPassword(email: String) async {
        do {
            isLoading = true
            errorMessage = nil
            try await authService.sendPasswordReset(email: email)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func updateEmail(_ newEmail: String) async {
        do {
            isLoading = true
            errorMessage = nil
            try await authService.updateEmail(to: newEmail)
            firebaseUser = authService.currentUser
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func updatePassword(currentPassword: String, newPassword: String) async {
        do {
            isLoading = true
            errorMessage = nil
            try await authService.updatePassword(currentPassword: currentPassword, newPassword: newPassword)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func signOut() {
        do {
            try authService.signOut()
            stopMembershipListener()
            firebaseUser = nil
            organizations = []
            stores = []
            activeOrganizationId = nil
            activeMembership = nil
            AppSettings.shared.activeStoreID = ""
            needsTutorial = false
            rbacService.updateMembership(role: nil, permissionOverride: nil)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func completeTutorial() {
        guard let userId = firebaseUser?.id,
              let organizationId = activeOrganizationId else {
            needsTutorial = false
            return
        }
        UserDefaults.standard.set(true, forKey: tutorialKey(userId: userId, organizationId: organizationId))
        needsTutorial = false
    }

    func createOrganization(named name: String, initialStore: StoreLocationRef) async {
        guard let user = firebaseUser else {
            errorMessage = OrganizationServiceError.missingUser.localizedDescription
            return
        }

        do {
            isLoading = true
            errorMessage = nil
            let org = try await organizationService.createOrganization(
                name: name,
                owner: user,
                initialStore: initialStore
            )
            organizations.append(org)
            organizations.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            activeOrganizationId = org.id
            AppSettings.shared.activeStoreID = initialStore.id
            await refreshStoresForActiveOrganization()
            seedOwnerMembership(for: user, organizationId: org.id)

            do {
                try await loadActiveMembership()
            } catch {
                // Keep locally-seeded owner role if remote fetch is delayed.
            }
            await migrationCoordinator.runFirstAuthMigrationIfNeeded(
                userId: user.id,
                organizationId: org.id
            )
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func joinOrganization(inviteCode: String) async {
        guard let user = firebaseUser else {
            errorMessage = OrganizationServiceError.missingUser.localizedDescription
            return
        }

        do {
            isLoading = true
            errorMessage = nil
            let org = try await organizationService.joinOrganizationByInvite(
                code: inviteCode,
                user: user,
                inviteService: inviteService
            )
            if !organizations.contains(where: { $0.id == org.id }) {
                organizations.append(org)
                organizations.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            }
            activeOrganizationId = org.id
            if let defaultStoreID = org.defaultStoreId, !defaultStoreID.isEmpty {
                AppSettings.shared.activeStoreID = defaultStoreID
            }
            try await loadActiveMembership()
            await refreshStoresForActiveOrganization()
            await migrationCoordinator.runFirstAuthMigrationIfNeeded(
                userId: user.id,
                organizationId: org.id
            )
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func joinOrganization(companyCode: String, employeeId: String) async {
        guard let user = firebaseUser else {
            errorMessage = OrganizationServiceError.missingUser.localizedDescription
            return
        }
        do {
            isLoading = true
            errorMessage = nil
            let org = try await organizationService.claimOrganizationByCompanyCode(
                companyCode: companyCode,
                employeeId: employeeId,
                user: user
            )
            if !organizations.contains(where: { $0.id == org.id }) {
                organizations.append(org)
                organizations.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            }
            activeOrganizationId = org.id
            if let defaultStoreID = org.defaultStoreId, !defaultStoreID.isEmpty {
                AppSettings.shared.activeStoreID = defaultStoreID
            }
            try await loadActiveMembership()
            await refreshStoresForActiveOrganization()
            await migrationCoordinator.runFirstAuthMigrationIfNeeded(
                userId: user.id,
                organizationId: org.id
            )
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func switchOrganization(_ organizationId: String) async {
        guard let user = firebaseUser else { return }
        activeOrganizationId = organizationId
        do {
            try await loadActiveMembership()
            await refreshStoresForActiveOrganization()
            updateTutorialState(userId: user.id, organizationId: organizationId)
            organizationService.setDefaultOrganization(organizationId, for: user.id)
            configureMembershipListener(userId: user.id, organizationId: organizationId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func switchStore(_ storeId: String) {
        let normalized = normalizeStoreIdentifier(storeId)
        guard !normalized.isEmpty else { return }
        let allowedStores = Set(
            stores
                .map { normalizeStoreIdentifier($0.id) }
                .filter { !$0.isEmpty }
        )
        guard allowedStores.contains(normalized) else { return }
        guard normalized != normalizeStoreIdentifier(AppSettings.shared.activeStoreID) else { return }
        AppSettings.shared.activeStoreID = normalized
    }

    func sendInvite(
        email: String,
        role: UserRole,
        permissionOverride: PermissionOverride? = nil,
        departmentId: String? = nil
    ) async -> String? {
        guard let orgId = activeOrganizationId, let user = firebaseUser else { return nil }
        guard activeMembership?.role == .owner else {
            errorMessage = "Only the organization owner can create roles and invites."
            return nil
        }
        do {
            isLoading = true
            errorMessage = nil
            let code = try await inviteService.createInvite(
                organizationId: orgId,
                email: email,
                role: role,
                permissionOverride: permissionOverride,
                departmentId: departmentId,
                invitedBy: user.id
            )
            isLoading = false
            return code
        } catch {
            isLoading = false
            errorMessage = error.localizedDescription
            return nil
        }
    }

    private func refreshMembershipContext() async {
        guard let user = firebaseUser else {
            stopMembershipListener()
            organizations = []
            stores = []
            activeOrganizationId = nil
            activeMembership = nil
            AppSettings.shared.activeStoreID = ""
            needsTutorial = false
            rbacService.updateMembership(role: nil, permissionOverride: nil)
            didInitialize = true
            return
        }

        do {
            isLoading = true
            organizations = try await organizationService.organizations(for: user.id)
            if let existing = activeOrganizationId,
               organizations.contains(where: { $0.id == existing }) {
                // Keep existing selection.
            } else if let preferred = organizationService.defaultOrganizationId(for: user.id),
                      organizations.contains(where: { $0.id == preferred }) {
                activeOrganizationId = preferred
            } else {
                activeOrganizationId = organizations.first?.id
            }

            if let organizationId = activeOrganizationId {
                updateTutorialState(userId: user.id, organizationId: organizationId)
                configureMembershipListener(userId: user.id, organizationId: organizationId)
            } else {
                needsTutorial = false
                stopMembershipListener()
            }
            try await loadActiveMembership()
            await refreshStoresForActiveOrganization()
        } catch {
            errorMessage = error.localizedDescription
            activeMembership = nil
            stores = []
            needsTutorial = false
            rbacService.updateMembership(role: nil, permissionOverride: nil)
        }
        isLoading = false
        didInitialize = true
    }

    private func loadActiveMembership() async throws {
        guard let userId = firebaseUser?.id, let orgId = activeOrganizationId else {
            activeMembership = nil
            needsTutorial = false
            rbacService.updateMembership(role: nil, permissionOverride: nil)
            return
        }
        let membership = try await organizationService.membership(userId: userId, organizationId: orgId)
        activeMembership = membership
        rbacService.updateMembership(
            role: membership?.role,
            permissionOverride: membership?.permissionOverride
        )
        updateTutorialState(userId: userId, organizationId: orgId)
    }

    private func seedOwnerMembership(for user: SessionUser, organizationId: String) {
        let ownerMembership = OrgMembership(
            organizationId: organizationId,
            userId: user.id,
            role: .owner,
            permissionOverride: nil,
            departmentId: nil,
            status: .active,
            joinedAt: Date(),
            invitedBy: user.id
        )
        activeMembership = ownerMembership
        updateTutorialState(userId: user.id, organizationId: organizationId)
        rbacService.updateMembership(role: .owner, permissionOverride: nil)
    }

    private func updateTutorialState(userId: String, organizationId: String) {
        let seen = UserDefaults.standard.bool(
            forKey: tutorialKey(userId: userId, organizationId: organizationId)
        )
        needsTutorial = !seen
    }

    private func tutorialKey(userId: String, organizationId: String) -> String {
        "\(tutorialSeenKeyPrefix)\(userId)_\(organizationId)"
    }

    private func configureMembershipListener(userId: String, organizationId: String) {
#if canImport(FirebaseFirestore) && canImport(FirebaseCore)
        guard FirebaseApp.app() != nil else { return }
        stopMembershipListener()
        let ref = Firestore.firestore()
            .collection("organizations")
            .document(organizationId)
            .collection("members")
            .document(userId)
        membershipListener = ref.addSnapshotListener { [weak self] _, _ in
            Task { @MainActor in
                do {
                    try await self?.loadActiveMembership()
                    await self?.refreshStoresForActiveOrganization()
                } catch {
                    self?.errorMessage = error.localizedDescription
                }
            }
        }
#else
        _ = userId
        _ = organizationId
#endif
    }

    private func stopMembershipListener() {
#if canImport(FirebaseFirestore)
        membershipListener?.remove()
        membershipListener = nil
#endif
    }

    private func refreshStoresForActiveOrganization() async {
        guard let organizationId = activeOrganizationId else {
            stores = []
            AppSettings.shared.activeStoreID = ""
            return
        }

        do {
            let fetchedStores = try await organizationService.stores(for: organizationId)
            let scopedStores: [StoreLocationRef]
            if activeMembership?.role == .owner {
                scopedStores = fetchedStores
            } else if let assignedStoreIds = activeMembership?.storeIds, !assignedStoreIds.isEmpty {
                let allowedStoreIDs = Set(
                    assignedStoreIds
                        .map { normalizeStoreIdentifier($0) }
                        .filter { !$0.isEmpty }
                )
                scopedStores = fetchedStores.filter {
                    let normalizedID = normalizeStoreIdentifier($0.id)
                    return allowedStoreIDs.contains(normalizedID)
                }
            } else {
                // Membership can temporarily load without storeIds; keep the org default store accessible.
                if let defaultStoreID = organizations.first(where: { $0.id == organizationId })?.defaultStoreId,
                   !normalizeStoreIdentifier(defaultStoreID).isEmpty {
                    let normalizedDefaultStoreID = normalizeStoreIdentifier(defaultStoreID)
                    scopedStores = fetchedStores.filter { normalizeStoreIdentifier($0.id) == normalizedDefaultStoreID }
                } else {
                    scopedStores = []
                }
            }
            stores = scopedStores.map { store in
                var normalizedStore = store
                normalizedStore.id = normalizeStoreIdentifier(store.id)
                normalizedStore.name = store.name.trimmingCharacters(in: .whitespacesAndNewlines)
                normalizedStore.storeNumber = store.storeNumber?.trimmingCharacters(in: .whitespacesAndNewlines)
                return normalizedStore
            }

            let currentStoreID = normalizeStoreIdentifier(AppSettings.shared.activeStoreID)
            if stores.isEmpty {
                AppSettings.shared.activeStoreID = ""
                return
            }

            if stores.contains(where: { $0.id == currentStoreID }) {
                return
            }

            if let defaultStoreID = organizations.first(where: { $0.id == organizationId })?.defaultStoreId,
               !defaultStoreID.isEmpty {
                let normalizedDefaultStoreID = normalizeStoreIdentifier(defaultStoreID)
                if stores.contains(where: { $0.id == normalizedDefaultStoreID }) {
                    AppSettings.shared.activeStoreID = normalizedDefaultStoreID
                    return
                }
            }
            if let firstStoreID = stores.first?.id {
                AppSettings.shared.activeStoreID = firstStoreID
            } else {
                AppSettings.shared.activeStoreID = ""
            }
        } catch {
            stores = []
            if AppSettings.shared.activeStoreID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                AppSettings.shared.activeStoreID = stores.first?.id ?? ""
            }
        }
    }

    private func normalizeStoreIdentifier(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        if trimmed.contains("/") {
            return trimmed
                .split(separator: "/")
                .map(String.init)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .last(where: { !$0.isEmpty }) ?? ""
        }
        return trimmed
    }

    func recoverLegacyLocalDataIfNeeded(modelContext: ModelContext) async {
        guard let organizationId = activeOrganizationId,
              organizationId != "local-default" else {
            return
        }

        let key = "\(legacyRehomeKeyPrefix)\(organizationId)"
        guard !UserDefaults.standard.bool(forKey: key) else { return }
        let fallbackStoreID = AppSettings.shared.activeStoreID
            .trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            try rehome(FetchDescriptor<InventoryItem>(predicate: #Predicate { $0.organizationId == "local-default" }), to: organizationId, modelContext: modelContext) { item in
                item.organizationId = organizationId
                if item.storeId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    item.storeId = fallbackStoreID
                }
                for batch in item.batches where batch.organizationId == "local-default" {
                    batch.organizationId = organizationId
                    if batch.storeId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        batch.storeId = item.storeId
                    }
                }
            }

            try rehome(FetchDescriptor<Batch>(predicate: #Predicate { $0.organizationId == "local-default" }), to: organizationId, modelContext: modelContext) { batch in
                batch.organizationId = organizationId
                if batch.storeId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    batch.storeId = fallbackStoreID
                }
            }

            try rehome(FetchDescriptor<Vendor>(predicate: #Predicate { $0.organizationId == "local-default" }), to: organizationId, modelContext: modelContext) { vendor in
                vendor.organizationId = organizationId
            }

            try rehome(FetchDescriptor<OrderItem>(predicate: #Predicate { $0.organizationId == "local-default" }), to: organizationId, modelContext: modelContext) { order in
                order.organizationId = organizationId
            }

            try rehome(FetchDescriptor<WasteEntry>(predicate: #Predicate { $0.organizationId == "local-default" }), to: organizationId, modelContext: modelContext) { waste in
                waste.organizationId = organizationId
            }

            try rehome(FetchDescriptor<ToDoItem>(predicate: #Predicate { $0.organizationId == "local-default" }), to: organizationId, modelContext: modelContext) { todo in
                todo.organizationId = organizationId
            }

            try rehome(FetchDescriptor<ProductionProduct>(predicate: #Predicate { $0.organizationId == "local-default" }), to: organizationId, modelContext: modelContext) { product in
                product.organizationId = organizationId
                if product.storeId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    product.storeId = fallbackStoreID
                }
            }

            try rehome(FetchDescriptor<ProductionIngredient>(predicate: #Predicate { $0.organizationId == "local-default" }), to: organizationId, modelContext: modelContext) { ingredient in
                ingredient.organizationId = organizationId
            }

            try rehome(FetchDescriptor<ProductionRun>(predicate: #Predicate { $0.organizationId == "local-default" }), to: organizationId, modelContext: modelContext) { run in
                run.organizationId = organizationId
                if run.storeId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    run.storeId = fallbackStoreID
                }
            }

            try rehome(FetchDescriptor<ProductionSpotCheckRecord>(predicate: #Predicate { $0.organizationId == "local-default" }), to: organizationId, modelContext: modelContext) { record in
                record.organizationId = organizationId
                if record.storeId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    record.storeId = fallbackStoreID
                }
            }

            try rehome(FetchDescriptor<HowToGuide>(predicate: #Predicate { $0.organizationId == "local-default" }), to: organizationId, modelContext: modelContext) { guide in
                guide.organizationId = organizationId
            }

            try rehome(FetchDescriptor<SpotCheckInsightAction>(predicate: #Predicate { $0.organizationId == "local-default" }), to: organizationId, modelContext: modelContext) { action in
                action.organizationId = organizationId
                if action.storeId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    action.storeId = fallbackStoreID
                }
            }

            try rehome(FetchDescriptor<PendingSyncAction>(predicate: #Predicate { $0.organizationId == "local-default" }), to: organizationId, modelContext: modelContext) { action in
                action.organizationId = organizationId
            }

            try modelContext.save()
            UserDefaults.standard.set(true, forKey: key)
        } catch {
            errorMessage = "Could not recover legacy local data: \(error.localizedDescription)"
        }
    }

    private func rehome<T>(
        _ descriptor: FetchDescriptor<T>,
        to organizationId: String,
        modelContext: ModelContext,
        mutate: (T) -> Void
    ) throws {
        let records = try modelContext.fetch(descriptor)
        guard !records.isEmpty else { return }
        for record in records {
            mutate(record)
        }
    }
}
