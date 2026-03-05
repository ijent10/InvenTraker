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

private struct PendingFeatureRequest: Codable, Identifiable {
    var id: String
    var title: String
    var details: String
    var category: String
    var createdAt: Date
    var createdByUid: String
    var createdByEmail: String?
    var organizationId: String?
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

    func submit(
        title rawTitle: String,
        details rawDetails: String,
        category rawCategory: String,
        user: SessionUser?,
        organizationId: String?
    ) async throws {
        guard let user, !user.id.isEmpty else { throw FeatureRequestServiceError.missingUser }

        let title = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { throw FeatureRequestServiceError.invalidTitle }

        let details = rawDetails.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !details.isEmpty else { throw FeatureRequestServiceError.invalidDetails }

        let category = rawCategory.trimmingCharacters(in: .whitespacesAndNewlines)
        let id = UUID().uuidString
        let now = Date()

        let request = PendingFeatureRequest(
            id: id,
            title: title,
            details: details,
            category: category.isEmpty ? "workflow" : category,
            createdAt: now,
            createdByUid: user.id,
            createdByEmail: user.email,
            organizationId: organizationId,
            source: "ios"
        )

#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let payload: [String: Any] = [
                "id": request.id,
                "title": request.title,
                "details": request.details,
                "category": request.category,
                "status": "open",
                "createdByUid": request.createdByUid,
                "createdByEmail": request.createdByEmail as Any,
                "organizationId": request.organizationId as Any,
                "source": request.source,
                "createdAt": Timestamp(date: request.createdAt)
            ]

            do {
                try await Firestore.firestore()
                    .collection("featureRequests")
                    .document(request.id)
                    .setData(payload)
                return
            } catch {
                // Fall through to pending queue so users don't lose requests while offline/rules update.
            }
        }
#endif
        enqueueFallback(request)
    }

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
