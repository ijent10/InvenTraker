import Foundation
import CryptoKit
#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif
#if canImport(FirebaseCore)
import FirebaseCore
#endif

enum InviteServiceError: LocalizedError {
    case invalidCode
    case inviteExpired
    case inviteInactive
    case inviteNotFound

    var errorDescription: String? {
        switch self {
        case .invalidCode:
            return "Invite code is invalid."
        case .inviteExpired:
            return "This invite has expired."
        case .inviteInactive:
            return "This invite is no longer active."
        case .inviteNotFound:
            return "Invite not found."
        }
    }
}

@MainActor
final class InviteService {
    static let shared = InviteService()

    private let fallbackInvitesPrefix = "account_invites_"

    private init() {}

    private var firestoreEnabled: Bool {
#if canImport(FirebaseFirestore) && canImport(FirebaseCore)
        return FirebaseApp.app() != nil
#else
        return false
#endif
    }

    func createInvite(
        organizationId: String,
        email: String,
        role: UserRole,
        permissionOverride: PermissionOverride? = nil,
        departmentId: String?,
        invitedBy: String,
        expiresInDays: Int = 7
    ) async throws -> String {
        let code = generateInviteCode()
        let invite = OrgInvite(
            id: UUID().uuidString,
            organizationId: organizationId,
            email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            role: role,
            permissionOverride: permissionOverride,
            departmentId: departmentId,
            codeHash: hashCode(code),
            expiresAt: Calendar.current.date(byAdding: .day, value: max(expiresInDays, 1), to: Date()) ?? Date().addingTimeInterval(604_800),
            status: .invited,
            invitedBy: invitedBy
        )

#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let db = Firestore.firestore()
            try db.collection("organizations")
                .document(organizationId)
                .collection("invites")
                .document(invite.id)
                .setData(from: invite)
        } else {
            var invites = loadInvites(organizationId: organizationId)
            invites.append(invite)
            saveInvites(invites, organizationId: organizationId)
        }
#else
        var invites = loadInvites(organizationId: organizationId)
        invites.append(invite)
        saveInvites(invites, organizationId: organizationId)
#endif

        return code
    }

    func listInvites(organizationId: String) async throws -> [OrgInvite] {
#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let db = Firestore.firestore()
            let snapshot = try await db.collection("organizations")
                .document(organizationId)
                .collection("invites")
                .order(by: "expiresAt", descending: false)
                .getDocuments()
            return snapshot.documents.compactMap { try? $0.data(as: OrgInvite.self) }
        }
#endif
        return loadInvites(organizationId: organizationId).sorted { $0.expiresAt < $1.expiresAt }
    }

    func resolveInvite(code: String) async throws -> OrgInvite {
        let codeHash = hashCode(code)

#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let db = Firestore.firestore()
            let organizations = try await db.collection("organizations").getDocuments()
            for orgDoc in organizations.documents {
                let inviteSnapshot = try await orgDoc.reference.collection("invites")
                    .whereField("codeHash", isEqualTo: codeHash)
                    .limit(to: 1)
                    .getDocuments()
                if let doc = inviteSnapshot.documents.first, let invite = try? doc.data(as: OrgInvite.self) {
                    try validate(invite: invite)
                    return invite
                }
            }
            throw InviteServiceError.inviteNotFound
        }
#endif
        let defaults = UserDefaults.standard.dictionaryRepresentation()
        for (key, value) in defaults where key.hasPrefix(fallbackInvitesPrefix) {
            guard let data = value as? Data else { continue }
            guard let invites = try? JSONDecoder().decode([OrgInvite].self, from: data) else { continue }
            if let invite = invites.first(where: { $0.codeHash == codeHash }) {
                try validate(invite: invite)
                return invite
            }
        }
        throw InviteServiceError.inviteNotFound
    }

    func markAccepted(inviteID: String, organizationId: String) async throws {
#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let db = Firestore.firestore()
            try await db.collection("organizations")
                .document(organizationId)
                .collection("invites")
                .document(inviteID)
                .updateData(["status": MembershipStatus.active.rawValue])
            return
        }
#endif
        var invites = loadInvites(organizationId: organizationId)
        guard let idx = invites.firstIndex(where: { $0.id == inviteID }) else {
            throw InviteServiceError.inviteNotFound
        }
        invites[idx].status = .active
        saveInvites(invites, organizationId: organizationId)
    }

    private func validate(invite: OrgInvite) throws {
        guard invite.status == .invited else { throw InviteServiceError.inviteInactive }
        guard invite.expiresAt >= Date() else { throw InviteServiceError.inviteExpired }
    }

    private func generateInviteCode() -> String {
        let chars = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        var output: [Character] = []
        while output.count < 8 {
            if let char = chars.randomElement() {
                output.append(char)
            }
        }
        return String(output)
    }

    private func hashCode(_ code: String) -> String {
        let normalized = code
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
        let digest = SHA256.hash(data: Data(normalized.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private func invitesKey(organizationId: String) -> String {
        "\(fallbackInvitesPrefix)\(organizationId)"
    }

    private func loadInvites(organizationId: String) -> [OrgInvite] {
        let key = invitesKey(organizationId: organizationId)
        guard
            let data = UserDefaults.standard.data(forKey: key),
            let decoded = try? JSONDecoder().decode([OrgInvite].self, from: data)
        else {
            return []
        }
        return decoded
    }

    private func saveInvites(_ invites: [OrgInvite], organizationId: String) {
        let key = invitesKey(organizationId: organizationId)
        guard let data = try? JSONEncoder().encode(invites) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}
