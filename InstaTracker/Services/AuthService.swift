import Foundation
import Combine
#if canImport(FirebaseAuth)
import FirebaseAuth
#endif
#if canImport(FirebaseCore)
import FirebaseCore
#endif

enum AuthServiceError: LocalizedError {
    case missingAuthProvider
    case invalidCredentials
    case unsupported
    case userUnavailable
    case missingEmail

    var errorDescription: String? {
        switch self {
        case .missingAuthProvider:
            return "Authentication provider is not configured."
        case .invalidCredentials:
            return "Invalid email or password."
        case .unsupported:
            return "This sign-in method is not available in the current build."
        case .userUnavailable:
            return "No authenticated user session is available."
        case .missingEmail:
            return "The signed-in account is missing an email address."
        }
    }
}

@MainActor
final class AuthService: ObservableObject {
    static let shared = AuthService()

    @Published private(set) var currentUser: SessionUser?

    private let fallbackUserKey = "account_auth_fallback_user"
#if canImport(FirebaseAuth)
    private var authListenerHandle: AuthStateDidChangeListenerHandle?
#endif

    private init() {}

    private var firebaseEnabled: Bool {
#if canImport(FirebaseAuth) && canImport(FirebaseCore)
        return FirebaseApp.app() != nil
#else
        return false
#endif
    }

    func start() {
        guard firebaseEnabled else {
            loadFallbackUser()
            return
        }
#if canImport(FirebaseAuth)
        if authListenerHandle != nil { return }
        authListenerHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                self?.currentUser = user.map {
                    SessionUser(id: $0.uid, email: $0.email, displayName: $0.displayName)
                }
            }
        }
#else
        loadFallbackUser()
#endif
    }

    func stop() {
#if canImport(FirebaseAuth)
        if let authListenerHandle {
            Auth.auth().removeStateDidChangeListener(authListenerHandle)
            self.authListenerHandle = nil
        }
#endif
    }

    func signIn(email: String, password: String) async throws {
        let normalized = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty, !password.isEmpty else { throw AuthServiceError.invalidCredentials }

#if canImport(FirebaseAuth)
        if firebaseEnabled {
            let result = try await Auth.auth().signIn(withEmail: normalized, password: password)
            currentUser = SessionUser(id: result.user.uid, email: result.user.email, displayName: result.user.displayName)
            return
        }
#endif
        let user = SessionUser(id: stableID(for: normalized), email: normalized, displayName: nil)
        currentUser = user
        saveFallbackUser(user)
    }

    func createAccount(email: String, password: String) async throws {
        let normalized = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty, !password.isEmpty else { throw AuthServiceError.invalidCredentials }

#if canImport(FirebaseAuth)
        if firebaseEnabled {
            let result = try await Auth.auth().createUser(withEmail: normalized, password: password)
            currentUser = SessionUser(id: result.user.uid, email: result.user.email, displayName: result.user.displayName)
            return
        }
#endif
        let user = SessionUser(id: stableID(for: normalized), email: normalized, displayName: nil)
        currentUser = user
        saveFallbackUser(user)
    }

    func sendPasswordReset(email: String) async throws {
        let normalized = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty else { throw AuthServiceError.invalidCredentials }
#if canImport(FirebaseAuth)
        if firebaseEnabled {
            try await Auth.auth().sendPasswordReset(withEmail: normalized)
            return
        }
#endif
        throw AuthServiceError.unsupported
    }

    func signOut() throws {
#if canImport(FirebaseAuth)
        if firebaseEnabled {
            try Auth.auth().signOut()
            currentUser = nil
            return
        }
#endif
        UserDefaults.standard.removeObject(forKey: fallbackUserKey)
        currentUser = nil
    }

    func updateEmail(to newEmail: String) async throws {
        let normalized = newEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty else { throw AuthServiceError.invalidCredentials }

#if canImport(FirebaseAuth)
        if firebaseEnabled {
            guard let user = Auth.auth().currentUser else { throw AuthServiceError.userUnavailable }
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                user.sendEmailVerification(beforeUpdatingEmail: normalized) { error in
                    if let error {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume(returning: ())
                    }
                }
            }
            currentUser = SessionUser(id: user.uid, email: user.email, displayName: user.displayName)
            return
        }
#endif
        throw AuthServiceError.unsupported
    }

    func updatePassword(to newPassword: String) async throws {
        guard !newPassword.isEmpty else { throw AuthServiceError.invalidCredentials }

#if canImport(FirebaseAuth)
        if firebaseEnabled {
            guard let user = Auth.auth().currentUser else { throw AuthServiceError.userUnavailable }
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                user.updatePassword(to: newPassword) { error in
                    if let error {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume(returning: ())
                    }
                }
            }
            currentUser = SessionUser(id: user.uid, email: user.email, displayName: user.displayName)
            return
        }
#endif
        throw AuthServiceError.unsupported
    }

    func updatePassword(currentPassword: String, newPassword: String) async throws {
        let current = currentPassword.trimmingCharacters(in: .whitespacesAndNewlines)
        let next = newPassword.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !current.isEmpty, !next.isEmpty else {
            throw AuthServiceError.invalidCredentials
        }

#if canImport(FirebaseAuth)
        if firebaseEnabled {
            guard let user = Auth.auth().currentUser else { throw AuthServiceError.userUnavailable }
            guard let email = user.email?.trimmingCharacters(in: .whitespacesAndNewlines), !email.isEmpty else {
                throw AuthServiceError.missingEmail
            }
            let credential = EmailAuthProvider.credential(withEmail: email, password: current)
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                user.reauthenticate(with: credential) { _, error in
                    if let error {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume(returning: ())
                    }
                }
            }
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                user.updatePassword(to: next) { error in
                    if let error {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume(returning: ())
                    }
                }
            }
            currentUser = SessionUser(id: user.uid, email: user.email, displayName: user.displayName)
            return
        }
#endif
        throw AuthServiceError.unsupported
    }

    private func stableID(for email: String) -> String {
        "local-\(email.replacingOccurrences(of: "@", with: "_at_"))"
    }

    private func loadFallbackUser() {
        guard
            let data = UserDefaults.standard.data(forKey: fallbackUserKey),
            let decoded = try? JSONDecoder().decode(SessionUser.self, from: data)
        else {
            currentUser = nil
            return
        }
        currentUser = decoded
    }

    private func saveFallbackUser(_ user: SessionUser) {
        guard let data = try? JSONEncoder().encode(user) else { return }
        UserDefaults.standard.set(data, forKey: fallbackUserKey)
    }
}
