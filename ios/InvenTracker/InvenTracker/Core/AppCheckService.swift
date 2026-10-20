import FirebaseAppCheck
import Foundation

enum AppCheckService {
    static func token() async throws -> String {
        try await AppCheck.appCheck().token(forcingRefresh: false).token
    }

    static func authorize(_ request: inout URLRequest) async throws {
        request.setValue(try await token(), forHTTPHeaderField: "X-Firebase-AppCheck")
    }
}
