import Foundation
#if canImport(FirebaseCore)
import FirebaseCore
#endif

enum FirebaseBootstrap {
    static func configureIfNeeded() {
#if canImport(FirebaseCore)
        if FirebaseApp.app() == nil {
            if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
               let options = FirebaseOptions(contentsOfFile: path) {
                FirebaseApp.configure(options: options)
            } else {
                // Keep local/offline fallback active when Firebase plist is not present yet.
                print("Firebase not configured: missing GoogleService-Info.plist")
            }
        }
#endif
    }
}
