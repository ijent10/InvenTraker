import Foundation
#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif
#if canImport(FirebaseCore)
import FirebaseCore
#endif

enum FeatureRequestServiceError: LocalizedError {
    case missingUser
    case invalidTitle
    case invalidDetails

    var errorDescription: String? {
        switch self {
        case .missingUser:
            return "You need to sign in before submitting a feature request."
        case .invalidTitle:
            return "Feature request title is required."
        case .invalidDetails:
            return "Feature request details are required."
        }
    }
}

enum FeatureRequestSubmitResult: Equatable {
    case sent
    case queued
}

private struct PendingFeatureRequest: Codable, Identifiable {
    var id: String
    var title: String
    var details: String
    var category: String
    var createdAt: Date
    var createdByUid: String
    var createdByEmail: String?
    var createdByName: String?
    var createdByRole: String?
    var createdByJobTitle: String?
    var createdByEmployeeId: String?
    var createdByIsOwner: Bool
    var organizationId: String?
    var organizationName: String?
    var storeId: String?
    var source: String
}

final class FeatureRequestService {
    static let shared = FeatureRequestService()

    private let fallbackKey = "feature_requests_pending_queue"

    private init() {}

    private var firestoreEnabled: Bool {
#if canImport(FirebaseFirestore) && canImport(FirebaseCore)
        return FirebaseApp.app() != nil
#else
        return false
#endif
    }

    func flushPendingRequestsIfPossible() async {
#if canImport(FirebaseFirestore)
        do {
            try await flushFallbackQueueIfPossible()
        } catch {
            // Keep queue for later retries.
        }
#endif
    }

    func submit(
        title rawTitle: String,
        details rawDetails: String,
        category rawCategory: String,
        user: SessionUser?,
        membership: OrgMembership?,
        organizationId: String?,
        organizationName: String?,
        storeId: String?
    ) async throws -> FeatureRequestSubmitResult {
        guard let user, !user.id.isEmpty else { throw FeatureRequestServiceError.missingUser }

        let title = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { throw FeatureRequestServiceError.invalidTitle }

        let details = rawDetails.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !details.isEmpty else { throw FeatureRequestServiceError.invalidDetails }

        let category = rawCategory.trimmingCharacters(in: .whitespacesAndNewlines)
        let id = UUID().uuidString
        let now = Date()

        let normalizedRole = membership?.role.displayName
        let normalizedJobTitle = membership?.jobTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedEmployeeId = membership?.employeeId?.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedStoreId = storeId?.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedOrgName = organizationName?.trimmingCharacters(in: .whitespacesAndNewlines)

        let request = PendingFeatureRequest(
            id: id,
            title: title,
            details: details,
            category: category.isEmpty ? "workflow" : category,
            createdAt: now,
            createdByUid: user.id,
            createdByEmail: user.email,
            createdByName: user.displayName,
            createdByRole: normalizedRole,
            createdByJobTitle: (normalizedJobTitle?.isEmpty == false) ? normalizedJobTitle : nil,
            createdByEmployeeId: (normalizedEmployeeId?.isEmpty == false) ? normalizedEmployeeId : nil,
            createdByIsOwner: membership?.role == .owner,
            organizationId: organizationId,
            organizationName: (normalizedOrgName?.isEmpty == false) ? normalizedOrgName : nil,
            storeId: (normalizedStoreId?.isEmpty == false) ? normalizedStoreId : nil,
            source: "ios"
        )

#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let payload: [String: Any] = [
                "id": request.id,
                "title": request.title,
                // Canonical web/rules fields
                "content": request.details,
                "uid": request.createdByUid,
                "email": request.createdByEmail as Any,
                "createdByName": request.createdByName as Any,
                "createdByRole": request.createdByRole as Any,
                "createdByJobTitle": request.createdByJobTitle as Any,
                "createdByEmployeeId": request.createdByEmployeeId as Any,
                "createdByIsOwner": request.createdByIsOwner,
                // Backward-compatible iOS fields
                "details": request.details,
                "category": request.category,
                "status": "new",
                "createdByUid": request.createdByUid,
                "createdByEmail": request.createdByEmail as Any,
                "organizationId": request.organizationId as Any,
                "organizationName": request.organizationName as Any,
                "storeId": request.storeId as Any,
                "source": request.source,
                "createdAt": Timestamp(date: request.createdAt),
                "updatedAt": Timestamp(date: request.createdAt)
            ]

            do {
                try await flushFallbackQueueIfPossible()
                try await Firestore.firestore()
                    .collection("featureRequests")
                    .document(request.id)
                    .setData(payload)
                return .sent
            } catch {
                // Fall through to pending queue so users don't lose requests while offline/rules update.
            }
        }
#endif
        enqueueFallback(request)
        return .queued
    }

#if canImport(FirebaseFirestore)
    private func flushFallbackQueueIfPossible() async throws {
        guard firestoreEnabled else { return }

        let queue = loadFallbackQueue()
        guard !queue.isEmpty else { return }

        var remaining: [PendingFeatureRequest] = []
        for pending in queue {
            let payload: [String: Any] = [
                "id": pending.id,
                "title": pending.title,
                "content": pending.details,
                "uid": pending.createdByUid,
                "email": pending.createdByEmail as Any,
                "createdByName": pending.createdByName as Any,
                "createdByRole": pending.createdByRole as Any,
                "createdByJobTitle": pending.createdByJobTitle as Any,
                "createdByEmployeeId": pending.createdByEmployeeId as Any,
                "createdByIsOwner": pending.createdByIsOwner,
                "details": pending.details,
                "category": pending.category,
                "status": "new",
                "createdByUid": pending.createdByUid,
                "createdByEmail": pending.createdByEmail as Any,
                "organizationId": pending.organizationId as Any,
                "organizationName": pending.organizationName as Any,
                "storeId": pending.storeId as Any,
                "source": pending.source,
                "createdAt": Timestamp(date: pending.createdAt),
                "updatedAt": Timestamp(date: pending.createdAt)
            ]
            do {
                try await Firestore.firestore()
                    .collection("featureRequests")
                    .document(pending.id)
                    .setData(payload, merge: true)
            } catch {
                remaining.append(pending)
            }
        }

        if remaining.count != queue.count {
            saveFallbackQueue(remaining)
        }
    }
#endif

    private func enqueueFallback(_ request: PendingFeatureRequest) {
        var queue = loadFallbackQueue()
        queue.append(request)
        saveFallbackQueue(queue)
    }

    private func loadFallbackQueue() -> [PendingFeatureRequest] {
        guard
            let data = UserDefaults.standard.data(forKey: fallbackKey),
            let decoded = try? JSONDecoder().decode([PendingFeatureRequest].self, from: data)
        else {
            return []
        }
        return decoded
    }

    private func saveFallbackQueue(_ queue: [PendingFeatureRequest]) {
        guard let data = try? JSONEncoder().encode(queue) else { return }
        UserDefaults.standard.set(data, forKey: fallbackKey)
    }
}
