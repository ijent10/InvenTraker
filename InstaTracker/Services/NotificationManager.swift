import Foundation
import UserNotifications

final class NotificationManager {
    static let shared = NotificationManager()
    private let center = UNUserNotificationCenter.current()
    private let idPrefix = "inventracker."
    private var lastPayloadFingerprint: Int?
    
    private init() {}
    
    func syncNotifications(settings: AppSettings, items: [InventoryItem], vendors: [Vendor]) {
        let payload = buildPayload(settings: settings, items: items, vendors: vendors)

        if !payload.notificationsEnabled {
            if lastPayloadFingerprint != nil {
                clearManagedNotifications()
            }
            lastPayloadFingerprint = nil
            return
        }

        let fingerprint = payload.fingerprint
        if lastPayloadFingerprint == fingerprint {
            return
        }
        lastPayloadFingerprint = fingerprint

        center.getNotificationSettings { [weak self] notificationSettings in
            guard let self else { return }
            switch notificationSettings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                self.scheduleManagedNotifications(payload: payload)
            case .notDetermined:
                self.center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
                    if granted {
                        self.scheduleManagedNotifications(payload: payload)
                    }
                }
            case .denied:
                break
            @unknown default:
                break
            }
        }
    }
    
    private func buildPayload(settings: AppSettings, items: [InventoryItem], vendors: [Vendor]) -> NotificationPayload {
        let lowStockCount = items.filter { $0.totalQuantity < $0.minimumQuantity }.count
        let expiringCount = items.filter { item in
            item.batches.contains { batch in
                let days = Calendar.current.dateComponents([.day], from: Date(), to: batch.expirationDate).day ?? 999
                return days >= 0 && days <= settings.expirationNotificationDays
            }
        }.count
        
        let reminders: [VendorReminderSnapshot] = vendors.compactMap { vendor in
            guard vendor.isActive, !vendor.orderDays.isEmpty else { return nil }
            let start = vendor.orderWindowStart ?? Self.defaultTime(hour: 6, minute: 0)
            return VendorReminderSnapshot(
                id: vendor.id.uuidString,
                name: vendor.name,
                orderDays: vendor.orderDays.filter { $0 >= 0 && $0 <= 6 },
                startHour: Calendar.current.component(.hour, from: start),
                startMinute: Calendar.current.component(.minute, from: start),
                orderWindowEndText: vendor.orderWindowEnd?.formatted(date: .omitted, time: .shortened)
            )
        }
        
        return NotificationPayload(
            notificationsEnabled: settings.notificationsEnabled,
            expirationNotificationDays: settings.expirationNotificationDays,
            lowStockNotifications: settings.lowStockNotifications,
            orderDayReminders: settings.orderDayReminders,
            lowStockCount: lowStockCount,
            expiringCount: expiringCount,
            vendorReminders: reminders
        )
    }
    
    private func scheduleManagedNotifications(payload: NotificationPayload) {
        clearManagedNotifications { [weak self] in
            guard let self else { return }
            
            if payload.lowStockNotifications && payload.lowStockCount > 0 {
                    let content = UNMutableNotificationContent()
                    content.title = "Low Stock Alert"
                    content.body = "\(payload.lowStockCount) item(s) are below minimum stock."
                    content.sound = .default
                    
                    let trigger = Self.dailyTrigger(hour: 9, minute: 10)
                    let request = UNNotificationRequest(
                        identifier: "\(self.idPrefix)lowstock",
                        content: content,
                        trigger: trigger
                    )
                    self.center.add(request)
            }
            
            if payload.expiringCount > 0 {
                let content = UNMutableNotificationContent()
                content.title = "Expiration Reminder"
                content.body = "\(payload.expiringCount) item(s) expire within \(payload.expirationNotificationDays) day(s)."
                content.sound = .default
                
                let trigger = Self.dailyTrigger(hour: 9, minute: 0)
                let request = UNNotificationRequest(
                    identifier: "\(self.idPrefix)expiration",
                    content: content,
                    trigger: trigger
                )
                self.center.add(request)
            }
            
            if payload.orderDayReminders {
                for vendor in payload.vendorReminders {
                    for day in vendor.orderDays {
                        var components = DateComponents()
                        components.weekday = day + 1 // convert to Calendar weekday
                        components.hour = vendor.startHour
                        components.minute = vendor.startMinute
                        
                        let content = UNMutableNotificationContent()
                        content.title = "Order Window: \(vendor.name)"
                        if let endText = vendor.orderWindowEndText {
                            content.body = "Place your order before \(endText)."
                        } else {
                            content.body = "Order day reminder for \(vendor.name)."
                        }
                        content.sound = .default
                        
                        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
                        let request = UNNotificationRequest(
                            identifier: "\(self.idPrefix)order.\(vendor.id).\(day)",
                            content: content,
                            trigger: trigger
                        )
                        self.center.add(request)
                    }
                }
            }
        }
    }
    
    private func clearManagedNotifications(completion: (() -> Void)? = nil) {
        center.getPendingNotificationRequests { [weak self] requests in
            guard let self else {
                completion?()
                return
            }
            let ids = requests.map(\.identifier).filter { $0.hasPrefix(self.idPrefix) }
            self.center.removePendingNotificationRequests(withIdentifiers: ids)
            completion?()
        }
    }
    
    private static func dailyTrigger(hour: Int, minute: Int) -> UNCalendarNotificationTrigger {
        var components = DateComponents()
        components.hour = hour
        components.minute = minute
        return UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
    }
    
    private static func defaultTime(hour: Int, minute: Int) -> Date {
        let now = Date()
        return Calendar.current.date(bySettingHour: hour, minute: minute, second: 0, of: now) ?? now
    }
}

private struct NotificationPayload: Sendable {
    let notificationsEnabled: Bool
    let expirationNotificationDays: Int
    let lowStockNotifications: Bool
    let orderDayReminders: Bool
    let lowStockCount: Int
    let expiringCount: Int
    let vendorReminders: [VendorReminderSnapshot]

    var fingerprint: Int {
        var hasher = Hasher()
        hasher.combine(notificationsEnabled)
        hasher.combine(expirationNotificationDays)
        hasher.combine(lowStockNotifications)
        hasher.combine(orderDayReminders)
        hasher.combine(lowStockCount)
        hasher.combine(expiringCount)
        for reminder in vendorReminders.sorted(by: { $0.id < $1.id }) {
            hasher.combine(reminder.id)
            hasher.combine(reminder.name)
            hasher.combine(reminder.orderDays)
            hasher.combine(reminder.startHour)
            hasher.combine(reminder.startMinute)
            hasher.combine(reminder.orderWindowEndText ?? "")
        }
        return hasher.finalize()
    }
}

private struct VendorReminderSnapshot: Sendable {
    let id: String
    let name: String
    let orderDays: [Int]
    let startHour: Int
    let startMinute: Int
    let orderWindowEndText: String?
}
