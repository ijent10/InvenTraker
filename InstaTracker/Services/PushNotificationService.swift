import Foundation
@preconcurrency import UserNotifications
#if canImport(UIKit)
import UIKit
#endif
#if canImport(FirebaseCore)
import FirebaseCore
#endif
#if canImport(FirebaseAuth)
import FirebaseAuth
#endif
#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif
#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif

@MainActor
final class PushNotificationService: NSObject {
    static let shared = PushNotificationService()
    private let notificationsEnabled = true

    private let installIdKey = "push_install_installation_id"
    private var latestFCMToken: String?
    private var currentUserID: String?
    private var currentOrganizationID: String?
    private var currentStoreID: String?

    var hasRegisteredToken: Bool {
        guard let token = latestFCMToken?.trimmingCharacters(in: .whitespacesAndNewlines) else {
            return false
        }
        return !token.isEmpty
    }

    private override init() {
        super.init()
    }

    func configure() {
        guard notificationsEnabled else { return }
        UNUserNotificationCenter.current().delegate = AppNotificationDelegate.shared

        #if canImport(FirebaseMessaging)
        if FirebaseApp.app() != nil {
            Messaging.messaging().delegate = self
            if let token = Messaging.messaging().fcmToken,
               !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                latestFCMToken = token
                Task { await persistTokenIfPossible() }
            }
        }
        #endif

        requestAuthorizationAndRegister()
    }

    func requestAuthorizationAndRegister() {
        guard notificationsEnabled else { return }
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                DispatchQueue.main.async {
                    #if canImport(UIKit)
                    UIApplication.shared.registerForRemoteNotifications()
                    #endif
                }
            case .notDetermined:
                center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
                    guard granted else { return }
                    DispatchQueue.main.async {
                        #if canImport(UIKit)
                        UIApplication.shared.registerForRemoteNotifications()
                        #endif
                    }
                }
            case .denied:
                break
            @unknown default:
                break
            }
        }
    }

    func updateContext(userId: String?, organizationId: String?, storeId: String?) {
        currentUserID = userId?.trimmingCharacters(in: .whitespacesAndNewlines)
        currentOrganizationID = organizationId?.trimmingCharacters(in: .whitespacesAndNewlines)
        currentStoreID = storeId?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard notificationsEnabled else { return }
        Task { await persistTokenIfPossible() }
    }

    #if canImport(UIKit)
    func didRegisterForRemoteNotifications(deviceToken: Data) {
        guard notificationsEnabled else { return }
        #if canImport(FirebaseMessaging)
        Messaging.messaging().apnsToken = deviceToken
        #endif
    }
    #endif

    func markTokenAsReceived(_ token: String?) {
        guard notificationsEnabled else { return }
        let normalized = token?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let normalized, !normalized.isEmpty else { return }
        latestFCMToken = normalized
        Task { await persistTokenIfPossible() }
    }

    private func installationID() -> String {
        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: installIdKey), !existing.isEmpty {
            return existing
        }
        let generated = UUID().uuidString
        defaults.set(generated, forKey: installIdKey)
        return generated
    }

    private func resolveCurrentUserID() -> String? {
        if let currentUserID, !currentUserID.isEmpty {
            return currentUserID
        }
        #if canImport(FirebaseAuth)
        if let uid = Auth.auth().currentUser?.uid,
           !uid.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return uid
        }
        #endif
        return nil
    }

    private func persistTokenIfPossible() async {
        guard notificationsEnabled else { return }
        #if canImport(FirebaseFirestore) && canImport(FirebaseCore)
        guard FirebaseApp.app() != nil else { return }
        guard let uid = resolveCurrentUserID(), !uid.isEmpty else { return }
        guard let token = latestFCMToken?.trimmingCharacters(in: .whitespacesAndNewlines), !token.isEmpty else { return }

        let installID = installationID()
        let normalizedOrg = currentOrganizationID?.isEmpty == false ? currentOrganizationID : nil
        let normalizedStore = currentStoreID?.isEmpty == false ? currentStoreID : nil

        let payload: [String: Any] = [
            "fcmToken": token,
            "platform": "ios",
            "bundleId": Bundle.main.bundleIdentifier ?? "",
            "organizationId": normalizedOrg as Any,
            "storeId": normalizedStore as Any,
            "updatedAt": FieldValue.serverTimestamp(),
            "createdAt": FieldValue.serverTimestamp()
        ]

        do {
            try await Firestore.firestore()
                .collection("users")
                .document(uid)
                .collection("devices")
                .document(installID)
                .setData(payload, merge: true)
        } catch {
            print("Push token sync failed: \(error.localizedDescription)")
        }
        #endif
    }
}

#if canImport(FirebaseMessaging)
extension PushNotificationService: MessagingDelegate {
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        Task { @MainActor in
            markTokenAsReceived(fcmToken)
        }
    }
}
#endif
