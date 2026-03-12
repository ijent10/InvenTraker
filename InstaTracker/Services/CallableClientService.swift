import Foundation
#if canImport(FirebaseCore)
import FirebaseCore
#endif
#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

enum CallableClientError: LocalizedError {
    case missingFirebaseConfiguration
    case missingAuthenticatedUser
    case invalidEndpoint
    case invalidResponse
    case failedRequest(String)
    case decodeFailed

    var errorDescription: String? {
        switch self {
        case .missingFirebaseConfiguration:
            return "Firebase is not configured for callable requests."
        case .missingAuthenticatedUser:
            return "You must be signed in to perform this action."
        case .invalidEndpoint:
            return "Could not construct callable endpoint URL."
        case .invalidResponse:
            return "Received an invalid callable response."
        case .failedRequest(let message):
            return message
        case .decodeFailed:
            return "Could not decode callable response payload."
        }
    }
}

final class CallableClientService {
    static let shared = CallableClientService()

    private init() {}

    func call<Result: Decodable>(name: String, data: [String: Any]) async throws -> Result {
#if canImport(FirebaseCore) && canImport(FirebaseAuth)
        guard let app = FirebaseApp.app(),
              let projectID = app.options.projectID else {
            throw CallableClientError.missingFirebaseConfiguration
        }

        guard let user = Auth.auth().currentUser else {
            throw CallableClientError.missingAuthenticatedUser
        }

        let token = try await user.getIDToken()
        guard let url = URL(string: "https://us-central1-\(projectID).cloudfunctions.net/\(name)") else {
            throw CallableClientError.invalidEndpoint
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["data": data], options: [])

        let (responseData, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw CallableClientError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            if let message = parseCallableErrorMessage(data: responseData) {
                throw CallableClientError.failedRequest(message)
            }
            throw CallableClientError.failedRequest("Callable request failed with status \(httpResponse.statusCode).")
        }

        guard let json = try? JSONSerialization.jsonObject(with: responseData) as? [String: Any] else {
            throw CallableClientError.invalidResponse
        }

        let payload = (json["result"] as? [String: Any]) ?? (json["data"] as? [String: Any])
        guard let payload else {
            throw CallableClientError.invalidResponse
        }

        let payloadData = try JSONSerialization.data(withJSONObject: payload, options: [])
        guard let decoded = try? JSONDecoder().decode(Result.self, from: payloadData) else {
            throw CallableClientError.decodeFailed
        }
        return decoded
#else
        _ = name
        _ = data
        throw CallableClientError.missingFirebaseConfiguration
#endif
    }

    private func parseCallableErrorMessage(data: Data) -> String? {
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
}
