import Foundation

enum AppConfig {
    static let baseURL = URL(string: "https://www.inventraker.com")!

    static var firebaseAPIKey: String {
        Bundle.main.object(forInfoDictionaryKey: "FirebaseAPIKey") as? String ?? ""
    }
}
