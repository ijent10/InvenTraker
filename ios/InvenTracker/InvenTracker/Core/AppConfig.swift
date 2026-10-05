import Foundation

enum AppConfig {
    static let baseURL = URL(string: "https://inventracker-f1229.web.app")!

    static var firebaseAPIKey: String {
        Bundle.main.object(forInfoDictionaryKey: "FirebaseAPIKey") as? String ?? ""
    }
}
