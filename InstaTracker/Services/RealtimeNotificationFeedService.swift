import Foundation
@preconcurrency import UserNotifications
import Combine
#if canImport(UIKit)
import UIKit
#endif
#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif
#if canImport(FirebaseCore)
import FirebaseCore
#endif

struct RemoteOrgNotification: Identifiable, Hashable {
    let id: String
    let title: String
    let body: String
    let roleTargets: [String]
    let storeId: String?
    let createdAt: Date
    let tintHex: String?
    let dispatchMode: String
    let status: String
    let scheduledFor: Date?

    var isScheduled: Bool {
        dispatchMode == "scheduled" || scheduledFor != nil
    }

    var canRemove: Bool {
        guard isScheduled else { return false }
        if status == "queued" || status == "scheduled" {
            return true
        }
        if let scheduledFor {
            return scheduledFor > Date()
        }
        return false
    }
}

@MainActor
final class RealtimeNotificationFeedService: ObservableObject {
    static let shared = RealtimeNotificationFeedService()

    @Published private(set) var notifications: [RemoteOrgNotification] = []
    @Published private(set) var unreadCount: Int = 0

    #if canImport(FirebaseFirestore)
    private var listener: ListenerRegistration?
    #endif
    private var listeningOrgId: String?
    private var listeningStoreId: String = ""
    private var listeningUserId: String?
    private var listeningRole: UserRole = .viewer
    private var listeningRoleTitle: String?
    private var deliveredIds: Set<String> = []
    private var dismissedIds: Set<String> = []

    private let seenPrefix = "org_notifications_seen_"
    private let deliveredPrefix = "org_notifications_delivered_"
    private let dismissedPrefix = "org_notifications_dismissed_"

    private init() {}

    func start(
        organizationId: String?,
        storeId: String,
        user: SessionUser?,
        role: UserRole,
        roleTitle: String? = nil
    ) {
        guard let organizationId, !organizationId.isEmpty, let user else {
            stop()
            return
        }
        let normalizedStoreId = storeId.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedRoleTitle = roleTitle?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        if
            listeningOrgId == organizationId,
            listeningStoreId == normalizedStoreId,
            listeningUserId == user.id,
            listeningRole == role,
            listeningRoleTitle == normalizedRoleTitle,
            !notifications.isEmpty
        {
            refreshUnreadCount()
            return
        }

        listeningOrgId = organizationId
        listeningStoreId = normalizedStoreId
        listeningUserId = user.id
        listeningRole = role
        listeningRoleTitle = normalizedRoleTitle
        deliveredIds = Set(
            UserDefaults.standard.stringArray(
                forKey: deliveredKey(userId: user.id, organizationId: organizationId)
            ) ?? []
        )
        dismissedIds = Set(
            UserDefaults.standard.stringArray(
                forKey: dismissedKey(userId: user.id, organizationId: organizationId)
            ) ?? []
        )
        requestSystemNotificationPermissionIfNeeded()

        #if canImport(FirebaseFirestore) && canImport(FirebaseCore)
        guard FirebaseApp.app() != nil else {
            notifications = []
            unreadCount = 0
            return
        }

        listener?.remove()
        listener = Firestore.firestore()
            .collection("organizations")
            .document(organizationId)
            .collection("notifications")
            .order(by: "createdAt", descending: true)
            .limit(to: 120)
            .addSnapshotListener { [weak self] snapshot, _ in
                guard let self else { return }
                Task { @MainActor in
                    self.merge(snapshot: snapshot)
                }
            }
        #else
        notifications = []
        unreadCount = 0
        #endif
    }

    func stop() {
        #if canImport(FirebaseFirestore)
        listener?.remove()
        listener = nil
        #endif
        listeningOrgId = nil
        listeningStoreId = ""
        listeningUserId = nil
        listeningRole = .viewer
        listeningRoleTitle = nil
        dismissedIds = []
        notifications = []
        unreadCount = 0
    }

    func markAllRead() {
        guard let userId = listeningUserId, let orgId = listeningOrgId else { return }
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: seenKey(userId: userId, organizationId: orgId))
        refreshUnreadCount()
    }

    func dismiss(notificationID: String) {
        guard !notificationID.isEmpty else { return }
        guard let userId = listeningUserId, let orgId = listeningOrgId else { return }
        dismissedIds.insert(notificationID)
        persistDismissed(userId: userId, organizationId: orgId)
        notifications.removeAll { $0.id == notificationID }
        refreshUnreadCount()
    }

    func remove(notificationID: String) async {
        guard !notificationID.isEmpty else { return }
        guard let orgId = listeningOrgId else {
            dismiss(notificationID: notificationID)
            return
        }

        let row = notifications.first { $0.id == notificationID }
#if canImport(FirebaseFirestore) && canImport(FirebaseCore)
        if let row, row.canRemove, FirebaseApp.app() != nil {
            let ref = Firestore.firestore()
                .collection("organizations")
                .document(orgId)
                .collection("notifications")
                .document(notificationID)
            _ = try? await ref.delete()
        }
#else
        _ = row
#endif
        dismiss(notificationID: notificationID)
    }

    func dismissAllVisible() {
        guard let userId = listeningUserId, let orgId = listeningOrgId else { return }
        for row in notifications {
            dismissedIds.insert(row.id)
        }
        persistDismissed(userId: userId, organizationId: orgId)
        notifications = []
        refreshUnreadCount()
    }

    private func refreshUnreadCount() {
        guard let userId = listeningUserId, let orgId = listeningOrgId else {
            unreadCount = 0
            return
        }
        let seenSeconds = UserDefaults.standard.double(forKey: seenKey(userId: userId, organizationId: orgId))
        let seenAt = seenSeconds > 0 ? Date(timeIntervalSince1970: seenSeconds) : .distantPast
        unreadCount = notifications.filter { $0.createdAt > seenAt }.count
    }

    #if canImport(FirebaseFirestore)
    private func merge(snapshot: QuerySnapshot?) {
        guard let orgId = listeningOrgId else { return }
        let storeId = listeningStoreId
        let role = listeningRole
        let roleTitle = listeningRoleTitle
        let hasOrgWideRoleTitle = {
            guard let roleTitle else { return false }
            if roleTitle == "owner" { return true }
            if roleTitle.contains("manager") { return true }
            return false
        }()
        let now = Date()

        var rows: [RemoteOrgNotification] = []
        for doc in snapshot?.documents ?? [] {
            let data = doc.data()
            if dismissedIds.contains(doc.documentID) {
                continue
            }
            let rawStore = (data["storeId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            if let rawStore, !rawStore.isEmpty, rawStore != storeId, role != .owner, !hasOrgWideRoleTitle {
                continue
            }

            let roleTargets = (data["roleTargets"] as? [String] ?? [])
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
                .filter { !$0.isEmpty }
            if !roleTargets.isEmpty,
               !roleMatchesTargets(role: role, roleTitle: roleTitle, targets: roleTargets) {
                continue
            }

            let status = ((data["status"] as? String) ?? "sent").lowercased()
            let dispatchMode = ((data["dispatchMode"] as? String) ?? "immediate").lowercased()
            let scheduledAt = timestamp(from: data["scheduledFor"])

            let title = (data["name"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let content = (data["content"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let text = (data["text"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let message = [content, text].compactMap { value -> String? in
                guard let value, !value.isEmpty else { return nil }
                return value
            }.joined(separator: " ")

            let createdAt = timestamp(from: data["createdAt"]) ?? now
            rows.append(
                RemoteOrgNotification(
                    id: doc.documentID,
                    title: (title?.isEmpty == false) ? (title ?? "Notification") : "Notification",
                    body: message.isEmpty ? "Open to view details." : message,
                    roleTargets: roleTargets,
                    storeId: rawStore,
                    createdAt: createdAt,
                    tintHex: data["accentColor"] as? String,
                    dispatchMode: dispatchMode,
                    status: status,
                    scheduledFor: scheduledAt
                )
            )
        }

        rows.sort { $0.createdAt > $1.createdAt }
        notifications = rows
        scheduleLocalAlertsIfNeeded(newRows: rows, organizationId: orgId)
        refreshUnreadCount()
    }
    #endif

    private func roleMatchesTargets(role: UserRole, roleTitle: String?, targets: [String]) -> Bool {
        let normalizedRole = role.rawValue.lowercased()
        let normalizedTargets = Set(targets.map { $0.lowercased() })
        if !normalizedTargets.isDisjoint(with: ["all", "everyone", "team"]) {
            return true
        }

        var aliases = Set<String>([normalizedRole])
        switch role {
        case .owner:
            aliases.formUnion(["admin"])
        case .manager:
            aliases.formUnion(["lead"])
        case .employee:
            aliases.formUnion(["staff", "employee", "team"])
        case .viewer:
            aliases.formUnion(["viewer", "read-only"])
        }

        if let roleTitle = roleTitle?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
           !roleTitle.isEmpty {
            aliases.insert(roleTitle)
            let compact = roleTitle.replacingOccurrences(of: " ", with: "")
            aliases.insert(compact)
        }

        return !aliases.isDisjoint(with: normalizedTargets)
    }

    private func scheduleLocalAlertsIfNeeded(newRows: [RemoteOrgNotification], organizationId: String) {
        // If remote push registration exists, let APNs/FCM delivery handle alerts to avoid duplicate banners.
        if PushNotificationService.shared.hasRegisteredToken {
            return
        }
        guard let userId = listeningUserId else { return }
        var ids = deliveredIds
        for row in newRows.prefix(40) where !ids.contains(row.id) {
            if row.isScheduled, let scheduledFor = row.scheduledFor, scheduledFor > Date() {
                continue
            }
            if row.status == "queued" || row.status == "scheduled" {
                continue
            }
            postLocalAlert(for: row)
            ids.insert(row.id)
        }
        deliveredIds = ids
        UserDefaults.standard.set(
            Array(ids),
            forKey: deliveredKey(userId: userId, organizationId: organizationId)
        )
    }

    private func postLocalAlert(for row: RemoteOrgNotification) {
        #if canImport(UIKit)
        guard UIApplication.shared.applicationState == .active else {
            return
        }
        #endif
        let content = UNMutableNotificationContent()
        content.title = row.title
        content.body = row.body
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: "orgfeed.\(row.id)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }

    private func requestSystemNotificationPermissionIfNeeded() {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .notDetermined else { return }
            center.requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
        }
    }

    private func seenKey(userId: String, organizationId: String) -> String {
        "\(seenPrefix)\(userId)_\(organizationId)"
    }

    private func deliveredKey(userId: String, organizationId: String) -> String {
        "\(deliveredPrefix)\(userId)_\(organizationId)"
    }

    private func dismissedKey(userId: String, organizationId: String) -> String {
        "\(dismissedPrefix)\(userId)_\(organizationId)"
    }

    private func persistDismissed(userId: String, organizationId: String) {
        UserDefaults.standard.set(
            Array(dismissedIds),
            forKey: dismissedKey(userId: userId, organizationId: organizationId)
        )
    }

    private func timestamp(from value: Any?) -> Date? {
        #if canImport(FirebaseFirestore)
        if let timestamp = value as? Timestamp {
            return timestamp.dateValue()
        }
        #endif
        if let date = value as? Date { return date }
        if let number = value as? NSNumber {
            return Date(timeIntervalSince1970: number.doubleValue)
        }
        return nil
    }
}
