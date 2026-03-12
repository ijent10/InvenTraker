import Foundation
#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif
#if canImport(FirebaseCore)
import FirebaseCore
#endif
#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

enum OrganizationServiceError: LocalizedError {
    case missingUser
    case missingOrganization
    case missingMembership
    case invalidName
    case invalidStoreName
    case invalidStoreAddress
    case invalidCompanyCode
    case invalidEmployeeID
    case companyCodeClaimFailed(String)

    var errorDescription: String? {
        switch self {
        case .missingUser:
            return "No authenticated user found."
        case .missingOrganization:
            return "Organization not found."
        case .missingMembership:
            return "Membership not found."
        case .invalidName:
            return "Organization name is required."
        case .invalidStoreName:
            return "Store name is required."
        case .invalidStoreAddress:
            return "Store physical address is required."
        case .invalidCompanyCode:
            return "Company code is required."
        case .invalidEmployeeID:
            return "Employee ID is required."
        case .companyCodeClaimFailed(let message):
            return message
        }
    }
}

@MainActor
final class OrganizationService {
    static let shared = OrganizationService()

    private let fallbackOrganizationsKey = "account_orgs_fallback"
    private let fallbackMembershipsKey = "account_memberships_fallback"
    private let fallbackDefaultOrgPrefix = "account_default_org_"
    private let fallbackDepartmentsPrefix = "account_departments_"
    private let fallbackLocationsPrefix = "account_locations_"
    private let fallbackStoresPrefix = "account_stores_"

    private init() {}

    private var firestoreEnabled: Bool {
#if canImport(FirebaseFirestore) && canImport(FirebaseCore)
        return FirebaseApp.app() != nil
#else
        return false
#endif
    }

    func organizations(for userId: String) async throws -> [OrganizationSummary] {
#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let db = Firestore.firestore()
            var activeMembershipsByOrg: [String: OrgMembership] = [:]
            var orgsByID: [String: OrganizationSummary] = [:]
            var memberDocsByPath: [String: DocumentSnapshot] = [:]

            if let membershipSnapshot = try? await db.collectionGroup("members")
                .whereField("userId", isEqualTo: userId)
                .getDocuments() {
                for memberDoc in membershipSnapshot.documents {
                    memberDocsByPath[memberDoc.reference.path] = memberDoc
                }
            }

            for memberDoc in memberDocsByPath.values {
                guard let orgRef = memberDoc.reference.parent.parent else { continue }
                let memberData = memberDoc.data() ?? [:]
                let explicitUserId = (memberData["userId"] as? String)?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let resolvedUserId = (explicitUserId?.isEmpty == false) ? explicitUserId! : memberDoc.documentID
                guard resolvedUserId == userId else { continue }
                guard let membership = decodeMembership(
                    from: memberDoc,
                    organizationId: orgRef.documentID,
                    userId: resolvedUserId
                ) else { continue }
                guard membership.status == .active else { continue }

                activeMembershipsByOrg[orgRef.documentID] = membership
                if orgsByID[orgRef.documentID] == nil,
                   let orgDoc = try? await orgRef.getDocument(),
                   let org = decodeOrganization(from: orgDoc) {
                    orgsByID[org.id] = org
                }
            }

            if let ownerArraySnapshot = try? await db.collection("organizations")
                .whereField("ownerUserIds", arrayContains: userId)
                .getDocuments() {
                for orgDoc in ownerArraySnapshot.documents {
                    guard let org = decodeOrganization(from: orgDoc) else { continue }
                    orgsByID[org.id] = org
                    if activeMembershipsByOrg[org.id] == nil {
                        activeMembershipsByOrg[org.id] = OrgMembership(
                            organizationId: org.id,
                            userId: userId,
                            role: .owner,
                            permissionOverride: nil,
                            departmentId: nil,
                            status: .active,
                            joinedAt: dateValue(from: orgDoc.data()["createdAt"]) ?? Date(),
                            invitedBy: userId
                        )
                    }
                }
            }

            if let ownerLegacySnapshot = try? await db.collection("organizations")
                .whereField("ownerUid", isEqualTo: userId)
                .getDocuments() {
                for orgDoc in ownerLegacySnapshot.documents {
                    guard let org = decodeOrganization(from: orgDoc) else { continue }
                    orgsByID[org.id] = org
                    if activeMembershipsByOrg[org.id] == nil {
                        activeMembershipsByOrg[org.id] = OrgMembership(
                            organizationId: org.id,
                            userId: userId,
                            role: .owner,
                            permissionOverride: nil,
                            departmentId: nil,
                            status: .active,
                            joinedAt: dateValue(from: orgDoc.data()["createdAt"]) ?? Date(),
                            invitedBy: userId
                        )
                    }
                }
            }

            var preferredOrgId = defaultOrganizationId(for: userId)
            if (preferredOrgId == nil || preferredOrgId?.isEmpty == true),
               let userDoc = try? await db.collection("users").document(userId).getDocument(),
               let remoteDefaultOrgId = (userDoc.data()?["defaultOrganizationId"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
               !remoteDefaultOrgId.isEmpty {
                preferredOrgId = remoteDefaultOrgId
                setDefaultOrganization(remoteDefaultOrgId, for: userId)
            }

            if activeMembershipsByOrg.isEmpty,
               let preferredOrgId,
               !preferredOrgId.isEmpty {
                if let memberDoc = try? await db.collection("organizations")
                    .document(preferredOrgId)
                    .collection("members")
                    .document(userId)
                    .getDocument(),
                   let preferredMembership = decodeMembership(
                    from: memberDoc,
                    organizationId: preferredOrgId,
                    userId: userId
                   ),
                   preferredMembership.status == .active {
                    activeMembershipsByOrg[preferredOrgId] = preferredMembership
                } else if let repairedMembership = try await recoverOwnerMembershipIfNeeded(
                    db: db,
                    userId: userId,
                    organizationId: preferredOrgId
                ) {
                    activeMembershipsByOrg[preferredOrgId] = repairedMembership
                }

                if let orgDoc = try? await db.collection("organizations").document(preferredOrgId).getDocument(),
                   let org = decodeOrganization(from: orgDoc) {
                    orgsByID[org.id] = org
                }
            }

            let activeMemberships = Array(activeMembershipsByOrg.values)
            let orgs = Array(orgsByID.values)
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

            if !activeMemberships.isEmpty || !orgs.isEmpty {
                cacheRemoteOrganizations(orgs, memberships: activeMemberships, for: userId)
            }

            if !orgs.isEmpty {
                return orgs
            }
            let cached = cachedOrganizations(for: userId)
            if !cached.isEmpty {
                return cached
            }
            return []
        }
#endif
        return cachedOrganizations(for: userId)
    }

    func membership(userId: String, organizationId: String) async throws -> OrgMembership? {
#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let db = Firestore.firestore()
            let ref = db.collection("organizations").document(organizationId).collection("members").document(userId)
            do {
                let doc = try await ref.getDocument()
                let membership = decodeMembership(from: doc, organizationId: organizationId, userId: userId)
                if let membership {
                    cacheRemoteOrganizations([], memberships: [membership], for: userId)
                }
                return membership
            } catch {
                return loadMemberships().first { $0.userId == userId && $0.organizationId == organizationId }
            }
        }
#endif
        return loadMemberships().first { $0.userId == userId && $0.organizationId == organizationId }
    }

    func stores(for organizationId: String) async throws -> [StoreLocationRef] {
#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let db = Firestore.firestore()
            var nestedStoresByID: [String: StoreLocationRef] = [:]

            if let regionsSnapshot = try? await db.collection("organizations")
                .document(organizationId)
                .collection("regions")
                .getDocuments() {
                for regionDoc in regionsSnapshot.documents {
                    if let districtsSnapshot = try? await db.collection("organizations")
                        .document(organizationId)
                        .collection("regions")
                        .document(regionDoc.documentID)
                        .collection("districts")
                        .getDocuments() {
                        for districtDoc in districtsSnapshot.documents {
                            if let nestedStoresSnapshot = try? await db.collection("organizations")
                                .document(organizationId)
                                .collection("regions")
                                .document(regionDoc.documentID)
                                .collection("districts")
                                .document(districtDoc.documentID)
                                .collection("stores")
                                .getDocuments() {
                                for storeDoc in nestedStoresSnapshot.documents {
                                    if let store = decodeStore(from: storeDoc.data(), id: storeDoc.documentID) {
                                        nestedStoresByID[store.id] = store
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Canonical runtime path is nested regions/districts/stores.
            // Keep root /stores as one-release fallback only when no nested stores are available.
            var storesByID = nestedStoresByID
            if storesByID.isEmpty,
               let rootStoresSnapshot = try? await db.collection("organizations")
                .document(organizationId)
                .collection("stores")
                .getDocuments() {
                for storeDoc in rootStoresSnapshot.documents {
                    if let store = decodeStore(from: storeDoc.data(), id: storeDoc.documentID) {
                        storesByID[store.id] = store
                    }
                }
            }

            let stores = Array(storesByID.values)
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            if !stores.isEmpty {
                saveStoresLocal(stores, organizationId: organizationId)
                return stores
            }
        }
#endif
        return loadStoresLocal(organizationId: organizationId)
    }

    func createOrganization(
        name: String,
        owner user: SessionUser,
        initialStore: StoreLocationRef
    ) async throws -> OrganizationSummary {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw OrganizationServiceError.invalidName }
        let trimmedStoreName = initialStore.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedStoreName.isEmpty else { throw OrganizationServiceError.invalidStoreName }
        guard !initialStore.addressLine1.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !initialStore.city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !initialStore.state.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !initialStore.postalCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !initialStore.country.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw OrganizationServiceError.invalidStoreAddress
        }

        let now = Date()
        let org = OrganizationSummary(
            id: UUID().uuidString,
            name: trimmed,
            ownerUid: user.id,
            defaultStoreId: initialStore.id,
            status: "active",
            createdAt: now,
            updatedAt: now
        )
        let store = StoreLocationRef(
            id: initialStore.id,
            name: trimmedStoreName,
            addressLine1: initialStore.addressLine1.trimmingCharacters(in: .whitespacesAndNewlines),
            addressLine2: initialStore.addressLine2?.trimmingCharacters(in: .whitespacesAndNewlines),
            city: initialStore.city.trimmingCharacters(in: .whitespacesAndNewlines),
            state: initialStore.state.trimmingCharacters(in: .whitespacesAndNewlines),
            postalCode: initialStore.postalCode.trimmingCharacters(in: .whitespacesAndNewlines),
            country: initialStore.country.trimmingCharacters(in: .whitespacesAndNewlines),
            isActive: true,
            createdAt: now,
            updatedAt: now
        )
        let membership = OrgMembership(
            organizationId: org.id,
            userId: user.id,
            role: .owner,
            permissionOverride: nil,
            departmentId: nil,
            status: .active,
            joinedAt: now,
            invitedBy: user.id
        )

#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let db = Firestore.firestore()
            let batch = db.batch()
            let orgRef = db.collection("organizations").document(org.id)
            let membershipRef = orgRef.collection("members").document(user.id)
            let regionRef = orgRef.collection("regions").document("default-region")
            let districtRef = regionRef.collection("districts").document("default-district")
            let nestedStoreRef = districtRef.collection("stores").document(store.id)
            let legacyRootStoreRef = orgRef.collection("stores").document(store.id)

            let storePayload: [String: Any] = [
                "organizationId": org.id,
                "regionId": "default-region",
                "districtId": "default-district",
                "name": store.name,
                "title": store.name,
                "status": store.isActive ? "active" : "inactive",
                "addressLine1": store.addressLine1,
                "addressLine2": store.addressLine2 ?? "",
                "city": store.city,
                "state": store.state,
                "postalCode": store.postalCode,
                "country": store.country,
                "createdAt": store.createdAt,
                "updatedAt": store.updatedAt
            ]

            try batch.setData(from: org, forDocument: orgRef)
            try batch.setData(from: membership, forDocument: membershipRef)
            batch.setData(
                [
                    "organizationId": org.id,
                    "name": "Default Region",
                    "createdAt": store.createdAt,
                    "updatedAt": store.updatedAt
                ],
                forDocument: regionRef,
                merge: true
            )
            batch.setData(
                [
                    "organizationId": org.id,
                    "regionId": "default-region",
                    "name": "Default District",
                    "createdAt": store.createdAt,
                    "updatedAt": store.updatedAt
                ],
                forDocument: districtRef,
                merge: true
            )
            batch.setData(storePayload, forDocument: nestedStoreRef, merge: true)
            batch.setData(storePayload, forDocument: legacyRootStoreRef, merge: true)
            try await batch.commit()

            var organizations = loadOrganizations()
            organizations.removeAll { $0.id == org.id }
            organizations.append(org)
            saveOrganizations(organizations)

            var memberships = loadMemberships()
            memberships.removeAll { $0.organizationId == org.id && $0.userId == user.id }
            memberships.append(membership)
            saveMemberships(memberships)
            saveStoresLocal([store], organizationId: org.id)
        } else {
            var organizations = loadOrganizations()
            organizations.append(org)
            saveOrganizations(organizations)

            var memberships = loadMemberships()
            memberships.append(membership)
            saveMemberships(memberships)
            saveStoresLocal([store], organizationId: org.id)
        }
#else
        var organizations = loadOrganizations()
        organizations.append(org)
        saveOrganizations(organizations)

        var memberships = loadMemberships()
        memberships.append(membership)
        saveMemberships(memberships)
        saveStoresLocal([store], organizationId: org.id)
#endif

        setDefaultOrganization(org.id, for: user.id)
        return org
    }

    func joinOrganizationByInvite(
        code: String,
        user: SessionUser,
        inviteService: InviteService? = nil
    ) async throws -> OrganizationSummary {
        let inviteService = inviteService ?? .shared
        let invite = try await inviteService.resolveInvite(code: code)
        let now = Date()
        let membership = OrgMembership(
            organizationId: invite.organizationId,
            userId: user.id,
            role: invite.role,
            permissionOverride: invite.permissionOverride,
            departmentId: invite.departmentId,
            status: .active,
            joinedAt: now,
            invitedBy: invite.invitedBy
        )

#if canImport(FirebaseFirestore)
        let org: OrganizationSummary
        if firestoreEnabled {
            let db = Firestore.firestore()
            try db.collection("organizations")
                .document(invite.organizationId)
                .collection("members")
                .document(user.id)
                .setData(from: membership)
            try await inviteService.markAccepted(inviteID: invite.id, organizationId: invite.organizationId)
            let orgDoc = try await db.collection("organizations").document(invite.organizationId).getDocument()
            guard let fetched = decodeOrganization(from: orgDoc) else {
                throw OrganizationServiceError.missingOrganization
            }
            org = fetched

            var organizations = loadOrganizations()
            organizations.removeAll { $0.id == org.id }
            organizations.append(org)
            saveOrganizations(organizations)

            var memberships = loadMemberships()
            memberships.removeAll { $0.userId == user.id && $0.organizationId == invite.organizationId }
            memberships.append(membership)
            saveMemberships(memberships)
        } else {
            var memberships = loadMemberships()
            memberships.removeAll { $0.userId == user.id && $0.organizationId == invite.organizationId }
            memberships.append(membership)
            saveMemberships(memberships)
            try await inviteService.markAccepted(inviteID: invite.id, organizationId: invite.organizationId)
            guard let fetched = loadOrganizations().first(where: { $0.id == invite.organizationId }) else {
                throw OrganizationServiceError.missingOrganization
            }
            org = fetched
        }
#else
        var memberships = loadMemberships()
        memberships.removeAll { $0.userId == user.id && $0.organizationId == invite.organizationId }
        memberships.append(membership)
        saveMemberships(memberships)
        try await inviteService.markAccepted(inviteID: invite.id, organizationId: invite.organizationId)
        guard let org = loadOrganizations().first(where: { $0.id == invite.organizationId }) else {
            throw OrganizationServiceError.missingOrganization
        }
#endif

        setDefaultOrganization(invite.organizationId, for: user.id)
        return org
    }

    func claimOrganizationByCompanyCode(
        companyCode: String,
        employeeId: String,
        user: SessionUser
    ) async throws -> OrganizationSummary {
        let normalizedCode = companyCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let normalizedEmployeeId = employeeId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedCode.isEmpty else { throw OrganizationServiceError.invalidCompanyCode }
        guard !normalizedEmployeeId.isEmpty else { throw OrganizationServiceError.invalidEmployeeID }

#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let orgId = try await claimOrganizationByCompanyCodeRemote(
                companyCode: normalizedCode,
                employeeId: normalizedEmployeeId
            )
            let db = Firestore.firestore()
            let orgDoc = try await db.collection("organizations").document(orgId).getDocument()
            guard let org = decodeOrganization(from: orgDoc) else {
                throw OrganizationServiceError.missingOrganization
            }

            if let membership = try await membership(userId: user.id, organizationId: orgId) {
                cacheRemoteOrganizations([org], memberships: [membership], for: user.id)
            } else {
                var orgMemberships = loadMemberships()
                orgMemberships.removeAll { $0.organizationId == orgId && $0.userId == user.id }
                orgMemberships.append(
                    OrgMembership(
                        organizationId: orgId,
                        userId: user.id,
                        role: .employee,
                        permissionOverride: nil,
                        departmentId: nil,
                        status: .active,
                        joinedAt: Date(),
                        invitedBy: nil
                    )
                )
                saveMemberships(orgMemberships)
                cacheRemoteOrganizations([org], memberships: orgMemberships.filter { $0.userId == user.id }, for: user.id)
            }

            setDefaultOrganization(orgId, for: user.id)
            return org
        }
#endif
        throw OrganizationServiceError.companyCodeClaimFailed("Firebase is not configured for company-code joining.")
    }

    func setDefaultOrganization(_ organizationId: String, for userId: String) {
        UserDefaults.standard.set(organizationId, forKey: "\(fallbackDefaultOrgPrefix)\(userId)")
    }

    func defaultOrganizationId(for userId: String) -> String? {
        UserDefaults.standard.string(forKey: "\(fallbackDefaultOrgPrefix)\(userId)")
    }

    func departments(for organizationId: String) async throws -> [DepartmentRef] {
#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let configs = await departmentConfigs(for: organizationId, storeId: nil)
            let now = Date()
            return configs.enumerated().map { index, config in
                DepartmentRef(
                    id: departmentIdentifier(from: config.name, fallbackIndex: index),
                    name: config.name,
                    isActive: true,
                    updatedAt: now
                )
            }
        }
#endif
        return loadDepartmentsLocal(organizationId: organizationId)
    }

    func departmentConfigs(
        for organizationId: String,
        storeId: String?
    ) async -> [DepartmentConfig] {
#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let db = Firestore.firestore()
            let normalizedStoreId = sanitizeStoreIdentifier(storeId)

            if !normalizedStoreId.isEmpty,
               let scopedSnapshot = try? await db.collectionGroup("settings")
                .whereField("organizationId", isEqualTo: organizationId)
                .whereField("storeId", isEqualTo: normalizedStoreId)
                .limit(to: 1)
                .getDocuments(),
               let scopedDoc = scopedSnapshot.documents.first {
                let scopedConfigs = decodeDepartmentConfigsFromSettingsData(scopedDoc.data())
                if !scopedConfigs.isEmpty {
                    if shouldBackfillDepartmentConfigs(from: scopedDoc.data()) {
                        await backfillDepartmentConfigs(
                            scopedConfigs,
                            to: scopedDoc.reference,
                            organizationId: organizationId,
                            storeId: normalizedStoreId
                        )
                    }
                    return scopedConfigs
                }
            }

            if !normalizedStoreId.isEmpty {
                if let regionSnapshot = try? await db.collection("organizations")
                    .document(organizationId)
                    .collection("regions")
                    .getDocuments() {
                    for regionDoc in regionSnapshot.documents {
                        guard let districtSnapshot = try? await regionDoc.reference
                            .collection("districts")
                            .getDocuments() else {
                            continue
                        }
                        for districtDoc in districtSnapshot.documents {
                            guard let storeDoc = try? await districtDoc.reference
                                .collection("stores")
                                .document(normalizedStoreId)
                                .getDocument(),
                                  storeDoc.exists else {
                                continue
                            }
                            if let nestedSettings = try? await storeDoc.reference
                                .collection("settings")
                                .document("default")
                                .getDocument(),
                               let data = nestedSettings.data() {
                                let scopedConfigs = decodeDepartmentConfigsFromSettingsData(data)
                                if !scopedConfigs.isEmpty {
                                    if shouldBackfillDepartmentConfigs(from: data) {
                                        await backfillDepartmentConfigs(
                                            scopedConfigs,
                                            to: nestedSettings.reference,
                                            organizationId: organizationId,
                                            storeId: normalizedStoreId
                                        )
                                    }
                                    return scopedConfigs
                                }
                            }
                        }
                    }
                }

                // Legacy fallback: organizations/{orgId}/stores/{storeId}/settings/default
                if let legacySettings = try? await db.collection("organizations")
                    .document(organizationId)
                    .collection("stores")
                    .document(normalizedStoreId)
                    .collection("settings")
                    .document("default")
                    .getDocument(),
                   let data = legacySettings.data() {
                    let scopedConfigs = decodeDepartmentConfigsFromSettingsData(data)
                    if !scopedConfigs.isEmpty {
                        if shouldBackfillDepartmentConfigs(from: data) {
                            await backfillDepartmentConfigs(
                                scopedConfigs,
                                to: legacySettings.reference,
                                organizationId: organizationId,
                                storeId: normalizedStoreId
                            )
                        }
                        return scopedConfigs
                    }
                }
            }

            if let orgSettingsDoc = try? await db.collection("organizations")
                .document(organizationId)
                .collection("settings")
                .document("default")
                .getDocument(),
               let data = orgSettingsDoc.data() {
                let configs = decodeDepartmentConfigsFromSettingsData(data)
                if !configs.isEmpty {
                    if shouldBackfillDepartmentConfigs(from: data) {
                        await backfillDepartmentConfigs(
                            configs,
                            to: orgSettingsDoc.reference,
                            organizationId: organizationId,
                            storeId: nil
                        )
                    }
                    return configs
                }
            }
        }
#endif
        return []
    }

    func brandingConfig(for organizationId: String) async -> OrganizationBrandingConfig {
#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let db = Firestore.firestore()

            let orgDoc = try? await db.collection("organizations").document(organizationId).getDocument()
            let orgData = orgDoc?.data() ?? [:]
            let orgSubscription = (orgData["subscription"] as? [String: Any]) ?? [:]

            let billingDoc = try? await db.collection("organizations")
                .document(organizationId)
                .collection("billing")
                .document("default")
                .getDocument()
            let billingData = billingDoc?.data() ?? [:]

            let settingsDoc = try? await db.collection("organizations")
                .document(organizationId)
                .collection("settings")
                .document("default")
                .getDocument()
            let settingsData = settingsDoc?.data() ?? [:]

            func asString(_ value: Any?) -> String {
                (value as? String)?
                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            }

            let status = asString(billingData["subscriptionStatus"]).isEmpty
                ? asString(orgSubscription["status"])
                : asString(billingData["subscriptionStatus"])
            let normalizedStatus = status.lowercased()
            let activeSubscription = normalizedStatus == "active" || normalizedStatus == "trialing"

            let planName = asString(billingData["planName"]).isEmpty
                ? asString(orgData["planName"])
                : asString(billingData["planName"])
            let planTier = asString(billingData["planTier"]).isEmpty
                ? asString(orgData["planTier"])
                : asString(billingData["planTier"])
            let priceId = asString(billingData["priceId"]).isEmpty
                ? asString(orgData["planId"])
                : asString(billingData["priceId"])

            let normalizedPlan = "\(planName.lowercased()) \(planTier.lowercased()) \(priceId.lowercased())"
            let isProTier = normalizedPlan.contains("pro") || normalizedPlan.contains("plus") || planTier.lowercased() == "custom"

            let brandingEnabled = (settingsData["customBrandingEnabled"] as? Bool ?? false)
                && activeSubscription
                && isProTier

            return OrganizationBrandingConfig(
                enabled: brandingEnabled,
                brandDisplayName: {
                    let name = asString(settingsData["brandDisplayName"])
                    return name.isEmpty ? nil : name
                }(),
                logoLightUrl: {
                    let value = asString(settingsData["logoLightUrl"])
                    return value.isEmpty ? nil : value
                }(),
                logoDarkUrl: {
                    let value = asString(settingsData["logoDarkUrl"])
                    return value.isEmpty ? nil : value
                }(),
                appHeaderStyle: asString(settingsData["appHeaderStyle"]) == "icon_only" ? .iconOnly : .iconName,
                moduleIconStyle: asString(settingsData["moduleIconStyle"]) == "square" ? .square : .rounded,
                welcomeMessage: {
                    let value = asString(settingsData["welcomeMessage"])
                    return value.isEmpty ? nil : value
                }()
            )
        }
#endif
        return .default
    }

    func saveDepartments(_ departments: [DepartmentRef], for organizationId: String) async throws {
#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let existing = await departmentConfigs(for: organizationId, storeId: nil)
            var existingLocationsByName: [String: [String]] = [:]
            for config in existing {
                existingLocationsByName[config.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()] = config.locations
            }

            let normalizedConfigs = departments
                .map { $0.name.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .map { name in
                    DepartmentConfig(
                        name: name,
                        locations: existingLocationsByName[name.lowercased()] ?? []
                    )
                }

            try await saveDepartmentConfigsToSettings(
                normalizedConfigs,
                organizationId: organizationId
            )
            return
        }
#endif
        saveDepartmentsLocal(departments, organizationId: organizationId)
    }

    func locations(for organizationId: String, departmentId: String) async throws -> [LocationRef] {
#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let configs = await departmentConfigs(for: organizationId, storeId: nil)
            let normalizedDepartmentId = departmentId.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard !normalizedDepartmentId.isEmpty else { return [] }
            guard let matched = configs.enumerated().first(where: { index, config in
                departmentIdentifier(from: config.name, fallbackIndex: index) == normalizedDepartmentId ||
                config.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == normalizedDepartmentId
            })?.element else {
                return []
            }
            return matched.locations.enumerated().map { index, name in
                LocationRef(
                    id: locationIdentifier(from: name, fallbackIndex: index),
                    name: name,
                    sortOrder: index,
                    isActive: true
                )
            }
        }
#endif
        return loadLocationsLocal(organizationId: organizationId, departmentId: departmentId)
    }

    func saveLocations(_ locations: [LocationRef], organizationId: String, departmentId: String) async throws {
#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let allConfigs = await departmentConfigs(for: organizationId, storeId: nil)
            let normalizedDepartmentId = departmentId.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard !normalizedDepartmentId.isEmpty else { return }

            var updatedConfigs = allConfigs
            if let matchIndex = allConfigs.enumerated().first(where: { index, config in
                departmentIdentifier(from: config.name, fallbackIndex: index) == normalizedDepartmentId ||
                config.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == normalizedDepartmentId
            })?.offset {
                updatedConfigs[matchIndex] = DepartmentConfig(
                    name: allConfigs[matchIndex].name,
                    locations: locations
                        .map { $0.name.trimmingCharacters(in: .whitespacesAndNewlines) }
                        .filter { !$0.isEmpty }
                )
            } else {
                updatedConfigs.append(
                    DepartmentConfig(
                        name: departmentId.trimmingCharacters(in: .whitespacesAndNewlines),
                        locations: locations
                            .map { $0.name.trimmingCharacters(in: .whitespacesAndNewlines) }
                            .filter { !$0.isEmpty }
                    )
                )
            }
            try await saveDepartmentConfigsToSettings(
                updatedConfigs,
                organizationId: organizationId
            )
            return
        }
#endif
        saveLocationsLocal(locations, organizationId: organizationId, departmentId: departmentId)
    }

#if canImport(FirebaseFirestore)
    private func shouldBackfillDepartmentConfigs(from data: [String: Any]) -> Bool {
        if let rawConfigs = data["departmentConfigs"] as? [[String: Any]], !rawConfigs.isEmpty {
            return false
        }
        let legacyDepartments = ((data["departments"] as? [String]) ?? [])
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return !legacyDepartments.isEmpty
    }

    private func backfillDepartmentConfigs(
        _ configs: [DepartmentConfig],
        to reference: DocumentReference,
        organizationId: String,
        storeId: String?
    ) async {
        let normalized: [DepartmentConfig] = configs
            .map { config in
                let name = config.name.trimmingCharacters(in: .whitespacesAndNewlines)
                let locations = config.locations
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                return DepartmentConfig(name: name, locations: Array(Set(locations)).sorted())
            }
            .filter { !$0.name.isEmpty }
            .sorted { lhs, rhs in
                lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }

        guard !normalized.isEmpty else { return }

        var payload: [String: Any] = [
            "organizationId": organizationId,
            "departmentConfigs": normalized.map { ["name": $0.name, "locations": $0.locations] },
            "departments": normalized.map { $0.name },
            "locationTemplates": Array(Set(normalized.flatMap { $0.locations })).sorted(),
            "updatedAt": FieldValue.serverTimestamp()
        ]
        if let storeId, !storeId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["storeId"] = storeId
        }
        do {
            try await reference.setData(payload, merge: true)
        } catch {
            // Best-effort migration path; ignore write failure and keep read results.
        }
    }

    private func saveDepartmentConfigsToSettings(
        _ configs: [DepartmentConfig],
        organizationId: String
    ) async throws {
        let db = Firestore.firestore()
        let normalizedConfigs = configs
            .map { config in
                let name = config.name.trimmingCharacters(in: .whitespacesAndNewlines)
                let locations = config.locations
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                return DepartmentConfig(name: name, locations: Array(Set(locations)).sorted())
            }
            .filter { !$0.name.isEmpty }

        let payload: [String: Any] = [
            "organizationId": organizationId,
            "departmentConfigs": normalizedConfigs.map { ["name": $0.name, "locations": $0.locations] },
            "departments": normalizedConfigs.map(\.name),
            "locationTemplates": Array(Set(normalizedConfigs.flatMap(\.locations))).sorted(),
            "updatedAt": FieldValue.serverTimestamp()
        ]
        try await db.collection("organizations")
            .document(organizationId)
            .collection("settings")
            .document("default")
            .setData(payload, merge: true)
    }
#endif

    private func decodeDepartmentConfigsFromSettingsData(_ data: [String: Any]) -> [DepartmentConfig] {
        if let rawConfigs = data["departmentConfigs"] as? [[String: Any]], !rawConfigs.isEmpty {
            var seenDepartments = Set<String>()
            var configs: [DepartmentConfig] = []
            for raw in rawConfigs {
                let name = (raw["name"] as? String)?
                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                guard !name.isEmpty else { continue }
                let key = name.lowercased()
                guard !seenDepartments.contains(key) else { continue }
                seenDepartments.insert(key)

                let locations = ((raw["locations"] as? [String]) ?? [])
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                configs.append(DepartmentConfig(name: name, locations: Array(Set(locations)).sorted()))
            }
            if !configs.isEmpty {
                return configs.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            }
        }

        let legacyDepartments = ((data["departments"] as? [String]) ?? [])
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let legacyLocations = ((data["locationTemplates"] as? [String]) ?? [])
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !legacyDepartments.isEmpty else { return [] }
        return legacyDepartments.map { DepartmentConfig(name: $0, locations: legacyLocations) }
    }

    private func dateValue(from raw: Any?) -> Date? {
#if canImport(FirebaseFirestore)
        if let timestamp = raw as? Timestamp {
            return timestamp.dateValue()
        }
#endif
        if let date = raw as? Date {
            return date
        }
        return nil
    }

#if canImport(FirebaseFirestore)
    private func decodeOrganization(from doc: DocumentSnapshot) -> OrganizationSummary? {
        if let decoded = try? doc.data(as: OrganizationSummary.self) {
            return decoded
        }
        guard let data = doc.data() else { return nil }

        let name = (data["name"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let ownerUid: String = {
            if let owner = (data["ownerUid"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
               !owner.isEmpty {
                return owner
            }
            if let ownerIds = data["ownerUserIds"] as? [String],
               let first = ownerIds.first(where: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) {
                return first
            }
            return ""
        }()
        let statusRaw = (data["status"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let status = (statusRaw?.isEmpty == false) ? (statusRaw ?? "active") : "active"
        let createdAt = dateValue(from: data["createdAt"]) ?? Date()
        let updatedAt = dateValue(from: data["updatedAt"]) ?? createdAt
        let defaultStoreId = (data["defaultStoreId"] as? String) ?? (data["defaultStoreID"] as? String)

        return OrganizationSummary(
            id: doc.documentID,
            name: (name?.isEmpty == false) ? name! : "Organization",
            ownerUid: ownerUid,
            defaultStoreId: defaultStoreId,
            status: status,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }
#endif

#if canImport(FirebaseCore) && canImport(FirebaseAuth)
    private func claimOrganizationByCompanyCodeRemote(
        companyCode: String,
        employeeId: String
    ) async throws -> String {
        guard let app = FirebaseApp.app(),
              let projectId = app.options.projectID,
              let currentUser = Auth.auth().currentUser else {
            throw OrganizationServiceError.missingUser
        }

        let token = try await currentUser.getIDToken()
        guard let url = URL(string: "https://us-central1-\(projectId).cloudfunctions.net/claimOrganizationByCompanyCode") else {
            throw OrganizationServiceError.companyCodeClaimFailed("Could not build company-code endpoint URL.")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let body: [String: Any] = [
            "data": [
                "companyCode": companyCode,
                "employeeId": employeeId
            ]
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])

        let (responseData, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw OrganizationServiceError.companyCodeClaimFailed("Invalid company-code response.")
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let fallbackMessage = "Could not join organization. Contact your company IT department."
            if let message = parseCallableErrorMessage(from: responseData) {
                throw OrganizationServiceError.companyCodeClaimFailed(message)
            }
            throw OrganizationServiceError.companyCodeClaimFailed(fallbackMessage)
        }

        guard let json = try? JSONSerialization.jsonObject(with: responseData) as? [String: Any] else {
            throw OrganizationServiceError.companyCodeClaimFailed("Could not parse company-code response.")
        }
        let payload = (json["result"] as? [String: Any]) ?? (json["data"] as? [String: Any])
        guard let orgId = (payload?["orgId"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !orgId.isEmpty else {
            throw OrganizationServiceError.companyCodeClaimFailed("Organization claim response was missing orgId.")
        }
        return orgId
    }

    private func parseCallableErrorMessage(from data: Data) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        if let error = json["error"] as? [String: Any],
           let message = error["message"] as? String,
           !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return message
        }
        if let message = json["message"] as? String,
           !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return message
        }
        return nil
    }
#else
    private func claimOrganizationByCompanyCodeRemote(
        companyCode: String,
        employeeId: String
    ) async throws -> String {
        _ = companyCode
        _ = employeeId
        throw OrganizationServiceError.companyCodeClaimFailed("Company-code signup is unavailable in this build.")
    }
#endif

    private func loadOrganizations() -> [OrganizationSummary] {
        guard
            let data = UserDefaults.standard.data(forKey: fallbackOrganizationsKey),
            let decoded = try? JSONDecoder().decode([OrganizationSummary].self, from: data)
        else {
            return []
        }
        return decoded
    }

    private func saveOrganizations(_ organizations: [OrganizationSummary]) {
        guard let data = try? JSONEncoder().encode(organizations) else { return }
        UserDefaults.standard.set(data, forKey: fallbackOrganizationsKey)
    }

    private func loadMemberships() -> [OrgMembership] {
        guard
            let data = UserDefaults.standard.data(forKey: fallbackMembershipsKey),
            let decoded = try? JSONDecoder().decode([OrgMembership].self, from: data)
        else {
            return []
        }
        return decoded
    }

    private func saveMemberships(_ memberships: [OrgMembership]) {
        guard let data = try? JSONEncoder().encode(memberships) else { return }
        UserDefaults.standard.set(data, forKey: fallbackMembershipsKey)
    }

    private func cachedOrganizations(for userId: String) -> [OrganizationSummary] {
        let memberships = loadMemberships()
        let organizations = loadOrganizations()
        let orgIDs = Set(
            memberships
                .filter { $0.userId == userId && $0.status == .active }
                .map(\.organizationId)
        )
        return organizations
            .filter { orgIDs.contains($0.id) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private func cacheRemoteOrganizations(
        _ organizations: [OrganizationSummary],
        memberships: [OrgMembership],
        for userId: String
    ) {
        if !organizations.isEmpty {
            var mergedOrganizations = loadOrganizations()
            for org in organizations {
                mergedOrganizations.removeAll { $0.id == org.id }
                mergedOrganizations.append(org)
            }
            saveOrganizations(mergedOrganizations)
        }

        var mergedMemberships = loadMemberships()
        mergedMemberships.removeAll { $0.userId == userId }
        mergedMemberships.append(contentsOf: memberships)
        saveMemberships(mergedMemberships)
    }

    private func loadDepartmentsLocal(organizationId: String) -> [DepartmentRef] {
        let key = "\(fallbackDepartmentsPrefix)\(organizationId)"
        guard
            let data = UserDefaults.standard.data(forKey: key),
            let decoded = try? JSONDecoder().decode([DepartmentRef].self, from: data)
        else {
            return []
        }
        return decoded
    }

    private func saveDepartmentsLocal(_ departments: [DepartmentRef], organizationId: String) {
        let key = "\(fallbackDepartmentsPrefix)\(organizationId)"
        guard let data = try? JSONEncoder().encode(departments) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    private func loadLocationsLocal(organizationId: String, departmentId: String) -> [LocationRef] {
        let key = "\(fallbackLocationsPrefix)\(organizationId)_\(departmentId)"
        guard
            let data = UserDefaults.standard.data(forKey: key),
            let decoded = try? JSONDecoder().decode([LocationRef].self, from: data)
        else {
            return []
        }
        return decoded
    }

    private func saveLocationsLocal(_ locations: [LocationRef], organizationId: String, departmentId: String) {
        let key = "\(fallbackLocationsPrefix)\(organizationId)_\(departmentId)"
        guard let data = try? JSONEncoder().encode(locations) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    private func saveStoresLocal(_ stores: [StoreLocationRef], organizationId: String) {
        let key = "\(fallbackStoresPrefix)\(organizationId)"
        guard let data = try? JSONEncoder().encode(stores) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    private func loadStoresLocal(organizationId: String) -> [StoreLocationRef] {
        let key = "\(fallbackStoresPrefix)\(organizationId)"
        guard
            let data = UserDefaults.standard.data(forKey: key),
            let decoded = try? JSONDecoder().decode([StoreLocationRef].self, from: data)
        else {
            return []
        }
        return decoded
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private func decodeStore(from data: [String: Any], id: String) -> StoreLocationRef? {
        let normalizedID = sanitizeStoreIdentifier(id)
        guard !normalizedID.isEmpty else { return nil }
        let rawName = (data["name"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let rawTitle = (data["title"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let name: String
        if let rawName, !rawName.isEmpty {
            name = rawName
        } else if let rawTitle, !rawTitle.isEmpty {
            name = rawTitle
        } else {
            name = "Store"
        }

        let isActive: Bool = {
            if let flag = data["isActive"] as? Bool {
                return flag
            }
            let status = ((data["status"] as? String) ?? "active")
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            return status != "inactive" && status != "disabled" && status != "archived"
        }()

        let createdAt = dateValue(from: data["createdAt"]) ?? Date()
        let updatedAt = dateValue(from: data["updatedAt"]) ?? createdAt
        let storeNumber = (
            (data["storeNumber"] as? String) ??
            (data["number"] as? String) ??
            (data["storeCode"] as? String)
        )?.trimmingCharacters(in: .whitespacesAndNewlines)

        return StoreLocationRef(
            id: normalizedID,
            name: name,
            storeNumber: storeNumber?.isEmpty == true ? nil : storeNumber,
            addressLine1: (data["addressLine1"] as? String) ?? "",
            addressLine2: (data["addressLine2"] as? String),
            city: (data["city"] as? String) ?? "",
            state: (data["state"] as? String) ?? "",
            postalCode: (data["postalCode"] as? String) ?? "",
            country: (data["country"] as? String) ?? "",
            isActive: isActive,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }

#if canImport(FirebaseFirestore)
    private func recoverOwnerMembershipIfNeeded(
        db: Firestore,
        userId: String,
        organizationId: String
    ) async throws -> OrgMembership? {
        let ownerMembership = OrgMembership(
            organizationId: organizationId,
            userId: userId,
            role: .owner,
            permissionOverride: nil,
            departmentId: nil,
            status: .active,
            joinedAt: Date(),
            invitedBy: userId
        )
        do {
            try db.collection("organizations")
                .document(organizationId)
                .collection("members")
                .document(userId)
                .setData(from: ownerMembership)
            return ownerMembership
        } catch {
            return nil
        }
    }

    private func decodeMembership(
        from doc: DocumentSnapshot,
        organizationId: String,
        userId: String
    ) -> OrgMembership? {
        if let decoded = try? doc.data(as: OrgMembership.self) {
            return decoded
        }
        guard let data = doc.data() else { return nil }

        let role = UserRole.fromBackend(data["role"] as? String)
        let status = MembershipStatus(rawValue: data["status"] as? String ?? "") ?? .active
        let employeeId = data["employeeId"] as? String
        let jobTitle = (data["jobTitle"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let storeIds = (data["storeIds"] as? [String] ?? [])
            .map { sanitizeStoreIdentifier($0) }
            .filter { !$0.isEmpty }
        let departmentId = data["departmentId"] as? String
        let rawDepartmentIDs = (data["departmentIds"] as? [String] ?? [])
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let rawDepartmentNames = (
            (data["departmentNames"] as? [String]) ??
            (data["departments"] as? [String]) ??
            []
        )
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
        let invitedBy = data["invitedBy"] as? String
        let permissionOverride: PermissionOverride?
        if let overrideData = data["permissionOverride"] as? [String: Any] {
            let modules = (overrideData["modules"] as? [String] ?? []).compactMap(AppModule.init(rawValue:))
            let actions = (overrideData["actions"] as? [String] ?? []).compactMap(AppAction.init(rawValue:))
            permissionOverride = PermissionOverride(modules: modules, actions: actions)
        } else if let permissionFlags = data["permissionFlags"] as? [String: Bool] {
            permissionOverride = permissionOverrideFromFlags(permissionFlags)
        } else {
            permissionOverride = nil
        }

        let joinedAt: Date
        if let timestamp = data["joinedAt"] as? Timestamp {
            joinedAt = timestamp.dateValue()
        } else if let date = data["joinedAt"] as? Date {
            joinedAt = date
        } else {
            joinedAt = Date()
        }

        return OrgMembership(
            organizationId: organizationId,
            userId: userId,
            role: role,
            jobTitle: (jobTitle?.isEmpty == false) ? jobTitle : nil,
            permissionOverride: permissionOverride,
            storeIds: storeIds.isEmpty ? nil : storeIds,
            employeeId: employeeId,
            departmentId: departmentId,
            departmentIds: rawDepartmentIDs.isEmpty ? nil : rawDepartmentIDs,
            departmentNames: rawDepartmentNames.isEmpty ? nil : rawDepartmentNames,
            status: status,
            joinedAt: joinedAt,
            invitedBy: invitedBy
        )
    }

    private func permissionOverrideFromFlags(_ flags: [String: Bool]) -> PermissionOverride {
        var modules = Set<AppModule>([.account])
        var actions = Set<AppAction>()

        let canManageInventory = flags["manageInventory"] == true ||
            flags["editOrgInventoryMeta"] == true ||
            flags["editStoreInventory"] == true ||
            flags["adjustStoreQuantity"] == true

        let canViewInventory = flags["viewInventory"] == true || canManageInventory
        let canViewOrders = flags["viewOrders"] == true || flags["manageOrders"] == true || flags["generateOrders"] == true
        let canViewTodo = flags["viewTodo"] == true || flags["manageTodo"] == true
        let canViewInsights = flags["viewInsights"] == true
        let canViewExpiration = flags["viewExpiration"] == true || flags["appExpiration"] == true || canManageInventory
        let canViewWaste = flags["viewWaste"] == true || flags["appWaste"] == true || canManageInventory
        let canViewHealthChecks = flags["viewHealthChecks"] == true || flags["appHealthChecks"] == true || flags["manageHealthChecks"] == true
        let canViewProduction = flags["viewProduction"] == true || flags["appProductionRuns"] == true
        let canViewHowTos = flags["viewHowTos"] == true || canViewProduction
        let canUseTransfers = flags["appTransfers"] == true
        let canUseChop = flags["appChop"] == true
        let canUseSpotCheck = flags["appSpotCheck"] == true || canManageInventory
        let canUseReceive = flags["appReceive"] == true || canManageInventory
        let canRecordWaste = flags["appWaste"] == true || flags["recordWaste"] == true || canManageInventory

        if canViewInventory {
            modules.insert(.inventory)
        }

        if canUseSpotCheck {
            modules.insert(.spotCheck)
            actions.insert(.spotCheck)
        }

        if canUseReceive {
            modules.insert(.received)
            actions.insert(.receiveInventory)
        }

        if canViewExpiration {
            modules.insert(.expiration)
        }

        if canViewWaste {
            modules.insert(.waste)
        }
        if canRecordWaste {
            actions.insert(.recordWaste)
        }

        if canViewOrders {
            modules.insert(.orders)
            if flags["generateOrders"] == true || flags["manageOrders"] == true {
                actions.insert(.generateOrder)
            }
            if flags["manageOrders"] == true {
                actions.insert(.completeOrder)
            }
        }

        if canViewTodo {
            modules.insert(.toDo)
        }

        if canViewInsights {
            modules.insert(.insights)
        }

        if canViewHealthChecks {
            modules.insert(.healthChecks)
        }

        if canViewProduction {
            modules.insert(.production)
        }

        if canUseChop {
            modules.insert(.chopUp)
        }

        if canUseTransfers {
            modules.insert(.transfers)
        }

        let canManageSettings = flags["manageStoreSettings"] == true ||
            flags["manageOrgSettings"] == true ||
            flags["managePermissions"] == true ||
            flags["manageJobTitles"] == true ||
            flags["manageVendors"] == true
        if canManageSettings {
            modules.insert(.settings)
            actions.formUnion([.manageSettings, .manageDepartments])
        }

        if flags["manageUsers"] == true {
            modules.insert(.settings)
            actions.insert(.manageMembers)
        }

        if flags["manageCentralCatalog"] == true || flags["editOrgInventoryMeta"] == true || flags["editStoreInventory"] == true {
            actions.insert(.manageCatalog)
        }

        // Keep operational modules available for custom roles with at least one operational capability.
        if !canManageInventory && (flags["manageOrders"] == true || flags["generateOrders"] == true || flags["manageTodo"] == true) {
            modules.formUnion([.received, .expiration, .waste, .spotCheck])
        }

        // Keep production helpers discoverable for production-capable roles.
        if canViewHowTos {
            modules.insert(.production)
        }

        return PermissionOverride(modules: Array(modules), actions: Array(actions))
    }

    private func sanitizeStoreIdentifier(_ raw: String?) -> String {
        let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
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

    private func departmentIdentifier(from raw: String, fallbackIndex: Int) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let cleaned = trimmed
            .replacingOccurrences(of: "[^a-z0-9]+", with: "_", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "_"))
        if cleaned.isEmpty {
            return "department_\(fallbackIndex + 1)"
        }
        return cleaned
    }

    private func locationIdentifier(from raw: String, fallbackIndex: Int) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let cleaned = trimmed
            .replacingOccurrences(of: "[^a-z0-9]+", with: "_", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "_"))
        if cleaned.isEmpty {
            return "location_\(fallbackIndex + 1)"
        }
        return cleaned
    }
#endif
}
