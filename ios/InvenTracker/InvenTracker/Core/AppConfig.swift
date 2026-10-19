import Foundation

enum AppConfig {
    static let baseURL = URL(string: "https://www.inventraker.com")!

    static var workspaceLayoutV2Enabled: Bool { Bundle.main.object(forInfoDictionaryKey: "WorkspaceLayoutV2") as? Bool != false }

    static var firebaseAPIKey: String {
        Bundle.main.object(forInfoDictionaryKey: "FirebaseAPIKey") as? String ?? ""
    }
}
