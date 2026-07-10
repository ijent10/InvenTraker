import Foundation

enum APIClientError: LocalizedError {
    case configuration(String)
    case server(String, String)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .configuration(let message), .server(_, let message): message
        case .invalidResponse: "InvenTracker returned an unreadable response."
        }
    }

    var code: String {
        if case .server(let code, _) = self { return code }
        return "client_error"
    }
}

actor APIClient {
    private let credentials = CredentialStore()
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private var activeSession: FirebaseSession?

    init() {
        activeSession = credentials.load()
    }

    func storedSession() -> FirebaseSession? {
        if let activeSession { return activeSession }
        let restored = credentials.load()
        activeSession = restored
        return restored
    }

    func signIn(email: String, password: String) async throws -> FirebaseSession {
        guard !AppConfig.firebaseAPIKey.isEmpty else {
            throw APIClientError.configuration("The Firebase API key is missing from the app build settings.")
        }
        let endpoint = URL(string: "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=\(AppConfig.firebaseAPIKey)")!
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(FirebaseSignInRequest(email: email, password: password, returnSecureToken: true))
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIClientError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])
                .flatMap { $0["error"] as? [String: Any] }?["message"] as? String
            throw APIClientError.server("firebase_auth", friendlyAuthMessage(message))
        }
        let result = try decoder.decode(FirebaseSignInResponse.self, from: data)
        let session = FirebaseSession(
            idToken: result.idToken,
            refreshToken: result.refreshToken,
            localId: result.localId,
            email: result.email,
            expiresAt: Date().addingTimeInterval(Double(result.expiresIn) ?? 3600)
        )
        activeSession = session
        credentials.save(session)
        return session
    }

    func signOut() {
        activeSession = nil
        credentials.clear()
    }

    func bootstrap(storeId: String? = nil) async throws -> WorkspaceBootstrap {
        var path = "/api/mobile/v1/bootstrap"
        if let storeId, !storeId.isEmpty { path += "?storeId=\(storeId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? storeId)" }
        let envelope: APIEnvelope<WorkspaceBootstrap> = try await send(path: path)
        return envelope.data
    }

    func submitSpotCheck(storeId: String, lines: [SpotCheckLine]) async throws {
        let body = SpotCheckRequest(storeId: storeId, lines: lines)
        let _: APIEnvelope<EmptyResponse> = try await send(path: "/api/mobile/v1/actions/spot-check", method: "POST", body: body)
    }

    func restock(storeId: String, lines: [RestockLine], commit: Bool) async throws -> RestockResult {
        let body = RestockRequest(storeId: storeId, commit: commit, lines: lines)
        let envelope: APIEnvelope<RestockResult> = try await send(path: "/api/mobile/v1/actions/restock", method: "POST", body: body)
        return envelope.data
    }

    func recordWaste(storeId: String, lines: [WasteLine]) async throws {
        let _: APIEnvelope<EmptyResponse> = try await send(path: "/api/mobile/v1/actions/waste", method: "POST", body: WasteRequest(storeId: storeId, lines: lines))
    }

    func submitOrder(id: String) async throws {
        let _: APIEnvelope<EmptyResponse> = try await send(path: "/api/mobile/v1/orders/\(id)/submit", method: "POST", body: EmptyRequest())
    }

    func markNotificationsRead(ids: [String]) async throws {
        let _: APIEnvelope<EmptyResponse> = try await send(path: "/api/mobile/v1/notifications/read", method: "POST", body: NotificationReadRequest(ids: ids))
    }

    private func send<Response: Decodable>(path: String, method: String = "GET") async throws -> Response {
        try await send(path: path, method: method, body: Optional<EmptyRequest>.none)
    }

    private func send<Response: Decodable, Body: Encodable>(path: String, method: String, body: Body?) async throws -> Response {
        var session = try await validSession()
        do {
            return try await perform(path: path, method: method, body: body, token: session.idToken)
        } catch let error as APIClientError where error.code == "invalid_session" || error.code == "unauthenticated" {
            session = try await refresh(session)
            return try await perform(path: path, method: method, body: body, token: session.idToken)
        }
    }

    private func perform<Response: Decodable, Body: Encodable>(path: String, method: String, body: Body?, token: String) async throws -> Response {
        guard let url = URL(string: path, relativeTo: AppConfig.baseURL)?.absoluteURL else { throw APIClientError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIClientError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            if let payload = try? decoder.decode(APIErrorEnvelope.self, from: data) {
                throw APIClientError.server(payload.error.code, payload.error.message)
            }
            throw APIClientError.server("http_\(http.statusCode)", "The InvenTracker service could not complete the request.")
        }
        return try decoder.decode(Response.self, from: data)
    }

    private func validSession() async throws -> FirebaseSession {
        guard let session = activeSession ?? credentials.load() else {
            throw APIClientError.server("unauthenticated", "Sign in is required.")
        }
        activeSession = session
        return session.expiresAt.timeIntervalSinceNow < 90 ? try await refresh(session) : session
    }

    private func refresh(_ session: FirebaseSession) async throws -> FirebaseSession {
        let endpoint = URL(string: "https://securetoken.googleapis.com/v1/token?key=\(AppConfig.firebaseAPIKey)")!
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let refreshValue = session.refreshToken.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? session.refreshToken
        request.httpBody = "grant_type=refresh_token&refresh_token=\(refreshValue)".data(using: .utf8)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            activeSession = nil
            credentials.clear()
            throw APIClientError.server("invalid_session", "Your session expired. Sign in again.")
        }
        let result = try decoder.decode(FirebaseRefreshResponse.self, from: data)
        let refreshed = FirebaseSession(
            idToken: result.idToken,
            refreshToken: result.refreshToken,
            localId: result.userId,
            email: session.email,
            expiresAt: Date().addingTimeInterval(Double(result.expiresIn) ?? 3600)
        )
        activeSession = refreshed
        credentials.save(refreshed)
        return refreshed
    }

    private func friendlyAuthMessage(_ code: String?) -> String {
        switch code {
        case "INVALID_LOGIN_CREDENTIALS", "EMAIL_NOT_FOUND", "INVALID_PASSWORD": "The email or password is incorrect."
        case "USER_DISABLED": "This account has been disabled."
        case "TOO_MANY_ATTEMPTS_TRY_LATER": "Too many attempts. Please wait and try again."
        default: "Sign in could not be completed."
        }
    }
}

private struct SpotCheckRequest: Encodable { let storeId: String; let lines: [SpotCheckLine] }
private struct RestockRequest: Encodable { let storeId: String; let commit: Bool; let lines: [RestockLine] }
private struct WasteRequest: Encodable { let storeId: String; let lines: [WasteLine] }
private struct NotificationReadRequest: Encodable { let ids: [String] }
private struct FirebaseSignInRequest: Encodable { let email: String; let password: String; let returnSecureToken: Bool }
private struct EmptyRequest: Encodable {}
private struct EmptyResponse: Decodable {}
