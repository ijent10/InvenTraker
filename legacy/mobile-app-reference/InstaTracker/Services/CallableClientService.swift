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
        let callableRegions = resolveCallableRegions()
        let requestBody = try JSONSerialization.data(withJSONObject: ["data": data], options: [])

        var lastError: Error?
        var lastStatusCode: Int?
        for region in callableRegions {
            guard let url = URL(string: "https://\(region)-\(projectID).cloudfunctions.net/\(name)") else {
                continue
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.httpBody = requestBody

            do {
                let (responseData, response) = try await URLSession.shared.data(for: request)
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw CallableClientError.invalidResponse
                }

                if (200..<300).contains(httpResponse.statusCode) {
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
                }

                lastStatusCode = httpResponse.statusCode
                if httpResponse.statusCode == 404 {
                    // Try the next candidate region before failing.
                    continue
                }
                if let message = parseCallableErrorMessage(data: responseData) {
                    throw CallableClientError.failedRequest(message)
                }
                throw CallableClientError.failedRequest("Callable request failed with status \(httpResponse.statusCode).")
            } catch {
                lastError = error
            }
        }

        if let lastError {
            throw lastError
        }
        if let lastStatusCode {
            throw CallableClientError.failedRequest("Callable request failed with status \(lastStatusCode).")
        }
        throw CallableClientError.invalidEndpoint
#else
        _ = name
        _ = data
        throw CallableClientError.missingFirebaseConfiguration
#endif
    }

    private func resolveCallableRegions() -> [String] {
        var regions: [String] = []
        if let configured = UserDefaults.standard.string(forKey: "callable_function_region")?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !configured.isEmpty {
            regions.append(configured)
        }
        regions.append(contentsOf: ["us-central1", "us-east1", "us-east4"])
        var deduped: [String] = []
        var seen: Set<String> = []
        for region in regions {
            let normalized = region.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !normalized.isEmpty else { continue }
            guard !seen.contains(normalized) else { continue }
            seen.insert(normalized)
            deduped.append(normalized)
        }
        return deduped
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
