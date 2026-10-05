import Foundation
import CryptoKit

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
    private var pendingOperationIds: [String: String]
    private static let pendingOperationDefaultsKey = "inventracker.pending-stock-operations"

    init() {
        activeSession = credentials.load()
        if let data = UserDefaults.standard.data(forKey: Self.pendingOperationDefaultsKey),
           let saved = try? JSONDecoder().decode([String: String].self, from: data) {
            pendingOperationIds = saved
        } else {
            pendingOperationIds = [:]
        }
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
        let payload = SpotCheckPayload(storeId: storeId, lines: lines)
        let key = try operationKey(kind: "spot-check", payload: payload)
        let body = SpotCheckRequest(operationId: operationId(for: key), storeId: storeId, lines: lines)
        let _: APIEnvelope<EmptyResponse> = try await send(path: "/api/mobile/v1/actions/spot-check", method: "POST", body: body)
        completeOperation(key)
    }

    func restock(storeId: String, lines: [RestockLine], commit: Bool) async throws -> RestockResult {
        let payload = RestockPayload(storeId: storeId, commit: commit, lines: lines)
        let key = try operationKey(kind: "restock", payload: payload)
        let body = RestockRequest(operationId: operationId(for: key), storeId: storeId, commit: commit, lines: lines)
        let envelope: APIEnvelope<RestockResult> = try await send(path: "/api/mobile/v1/actions/restock", method: "POST", body: body)
        completeOperation(key)
        return envelope.data
    }

    func recordWaste(storeId: String, lines: [WasteLine]) async throws {
        let payload = WastePayload(storeId: storeId, lines: lines)
        let key = try operationKey(kind: "waste", payload: payload)
        let _: APIEnvelope<EmptyResponse> = try await send(path: "/api/mobile/v1/actions/waste", method: "POST", body: WasteRequest(operationId: operationId(for: key), storeId: storeId, lines: lines))
        completeOperation(key)
    }

    func receive(storeId: String, lines: [ReceivingLine]) async throws {
        let payload = ReceivingPayload(storeId: storeId, lines: lines)
        let key = try operationKey(kind: "receive", payload: payload)
        let _: APIEnvelope<EmptyResponse> = try await send(path: "/api/mobile/v1/actions/receive", method: "POST", body: ReceivingRequest(operationId: operationId(for: key), storeId: storeId, lines: lines))
        completeOperation(key)
    }

    func transfer(storeId: String, line: TransferLine) async throws -> TransferResult {
        let payload = TransferPayload(storeId: storeId, itemId: line.itemId, quantity: line.quantity, source: line.source, destination: line.destination, batchId: line.batchId)
        let key = try operationKey(kind: "transfer", payload: payload)
        let envelope: APIEnvelope<TransferResult> = try await send(
            path: "/api/mobile/v1/actions/transfer",
            method: "POST",
            body: TransferRequest(
                operationId: operationId(for: key),
                storeId: storeId,
                itemId: line.itemId,
                quantity: line.quantity,
                source: line.source,
                destination: line.destination,
                batchId: line.batchId
            )
        )
        completeOperation(key)
        return envelope.data
    }

    func portion(storeId: String, request: PortionRequest) async throws -> PortionResult {
        let payload = PortionPayload(storeId: storeId, request: request)
        let key = try operationKey(kind: "portion", payload: payload)
        let envelope: APIEnvelope<PortionResult> = try await send(
            path: "/api/mobile/v1/actions/portion",
            method: "POST",
            body: PortionAPIRequest(
                operationId: operationId(for: key),
                storeId: storeId,
                itemId: request.itemId,
                sourceArea: request.sourceArea,
                sourceBatchId: request.sourceBatchId,
                portionWeight: request.portionWeight,
                portionCount: request.portionCount,
                expirationDate: request.expirationDate,
                packageBarcodePrefix: request.packageBarcodePrefix
            )
        )
        completeOperation(key)
        return envelope.data
    }

    func insights(storeId: String) async throws -> MobileInsights {
        let escapedStoreId = storeId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? storeId
        let envelope: APIEnvelope<MobileInsights> = try await send(path: "/api/mobile/v1/insights?storeId=\(escapedStoreId)")
        return envelope.data
    }

    func transitionOrder(id: String, storeId: String, action: String, reason: String? = nil, sentMethod: String? = nil) async throws {
        let payload = OrderTransitionPayload(orderId: id, storeId: storeId, action: action, reason: reason, sentMethod: sentMethod)
        let key = try operationKey(kind: "order-\(action)", payload: payload)
        let body = OrderTransitionRequest(operationId: operationId(for: key), storeId: storeId, action: action, reason: reason, sentMethod: sentMethod)
        let _: APIEnvelope<EmptyResponse> = try await send(path: "/api/mobile/v1/orders/\(id)/transition", method: "POST", body: body)
        completeOperation(key)
    }

    func recommendOrder(storeId: String, vendorId: String) async throws -> MobileOrderRecommendation {
        let envelope: APIEnvelope<MobileOrderRecommendation> = try await send(
            path: "/api/mobile/v1/orders/recommend",
            method: "POST",
            body: OrderRecommendationRequest(storeId: storeId, vendorId: vendorId)
        )
        return envelope.data
    }

    func markNotificationsRead(ids: [String]) async throws {
        let _: APIEnvelope<EmptyResponse> = try await send(path: "/api/mobile/v1/notifications/read", method: "POST", body: NotificationReadRequest(ids: ids))
    }

    func updatePreferences(workShortcut: WorkShortcut) async throws -> MobilePreferences {
        let envelope: APIEnvelope<MobilePreferences> = try await send(
            path: "/api/mobile/v1/preferences",
            method: "PATCH",
            body: MobilePreferencesRequest(workShortcut: workShortcut.rawValue, theme: nil, savedThemes: nil)
        )
        return envelope.data
    }

    func updatePreferences(theme: MobileTheme, savedThemes: [MobileTheme]? = nil) async throws -> MobilePreferences {
        let envelope: APIEnvelope<MobilePreferences> = try await send(
            path: "/api/mobile/v1/preferences",
            method: "PATCH",
            body: MobilePreferencesRequest(workShortcut: nil, theme: theme, savedThemes: savedThemes)
        )
        return envelope.data
    }

    func assistantChats() async throws -> [AssistantChat] {
        let envelope: APIEnvelope<AssistantChatsPayload> = try await send(path: "/api/mobile/v1/assistant/chats")
        return envelope.data.chats
    }

    func askAssistant(question: String, history: [AssistantHistoryLine]) async throws -> AssistantAnswer {
        try await send(path: "/api/ai/ask", method: "POST", body: AssistantAskRequest(question: question, history: history))
    }

    func saveAssistantChat(_ chat: AssistantChat) async throws {
        let _: APIEnvelope<AssistantChat> = try await send(path: "/api/mobile/v1/assistant/chats", method: "PUT", body: chat)
    }

    func deleteAssistantChat(_ id: String) async throws {
        let _: APIEnvelope<AssistantDeleteResult> = try await send(path: "/api/mobile/v1/assistant/chats/\(id)", method: "DELETE", body: Optional<EmptyRequest>.none)
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
            if http.statusCode == 404, path.hasPrefix("/api/mobile/v1/preferences") {
                throw APIClientError.server(
                    "mobile_preferences_unavailable",
                    "Your InvenTracker server needs the latest mobile settings update."
                )
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

    private func operationKey<Payload: Encodable>(kind: String, payload: Payload) throws -> String {
        let digest = SHA256.hash(data: try encoder.encode(payload))
        return "\(activeSession?.localId ?? "unknown-user"):\(kind):\(digest.map { String(format: "%02x", $0) }.joined())"
    }

    private func operationId(for key: String) -> String {
        if let existing = pendingOperationIds[key] { return existing }
        let created = UUID().uuidString.lowercased()
        pendingOperationIds[key] = created
        persistPendingOperations()
        return created
    }

    private func completeOperation(_ key: String) {
        pendingOperationIds.removeValue(forKey: key)
        persistPendingOperations()
    }

    private func persistPendingOperations() {
        guard let data = try? encoder.encode(pendingOperationIds) else { return }
        UserDefaults.standard.set(data, forKey: Self.pendingOperationDefaultsKey)
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

private struct SpotCheckPayload: Encodable { let storeId: String; let lines: [SpotCheckLine] }
private struct RestockPayload: Encodable { let storeId: String; let commit: Bool; let lines: [RestockLine] }
private struct WastePayload: Encodable { let storeId: String; let lines: [WasteLine] }
private struct ReceivingPayload: Encodable { let storeId: String; let lines: [ReceivingLine] }
private struct TransferPayload: Encodable { let storeId: String; let itemId: String; let quantity: Double; let source: String; let destination: String; let batchId: String? }
private struct PortionPayload: Encodable { let storeId: String; let request: PortionRequest }
private struct OrderTransitionPayload: Encodable { let orderId: String; let storeId: String; let action: String; let reason: String?; let sentMethod: String? }
private struct SpotCheckRequest: Encodable { let operationId: String; let storeId: String; let lines: [SpotCheckLine] }
private struct RestockRequest: Encodable { let operationId: String; let storeId: String; let commit: Bool; let lines: [RestockLine] }
private struct WasteRequest: Encodable { let operationId: String; let storeId: String; let lines: [WasteLine] }
private struct ReceivingRequest: Encodable { let operationId: String; let storeId: String; let lines: [ReceivingLine] }
private struct TransferRequest: Encodable {
    let operationId: String
    let storeId: String
    let itemId: String
    let quantity: Double
    let source: String
    let destination: String
    let batchId: String?
}
private struct PortionAPIRequest: Encodable {
    let operationId: String
    let storeId: String
    let itemId: String
    let sourceArea: String
    let sourceBatchId: String?
    let portionWeight: Double
    let portionCount: Int
    let expirationDate: String?
    let packageBarcodePrefix: String?
}
private struct OrderTransitionRequest: Encodable { let operationId: String; let storeId: String; let action: String; let reason: String?; let sentMethod: String? }
private struct OrderRecommendationRequest: Encodable { let storeId: String; let vendorId: String }
private struct NotificationReadRequest: Encodable { let ids: [String] }
private struct MobilePreferencesRequest: Encodable {
    let workShortcut: String?
    let theme: MobileTheme?
    let savedThemes: [MobileTheme]?
}
private struct FirebaseSignInRequest: Encodable { let email: String; let password: String; let returnSecureToken: Bool }
private struct EmptyRequest: Encodable {}
private struct EmptyResponse: Decodable {}
