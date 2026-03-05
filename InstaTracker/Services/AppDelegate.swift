import Foundation
#if canImport(UIKit)
import UIKit
#endif

#if canImport(UIKit)
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil
    ) -> Bool {
        // Push notifications are intentionally disabled until Apple Push capability is enabled.
        // Keep app launch path compiling/running without APNs provisioning.
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // Push disabled.
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Push disabled.
    }
}
#endif
