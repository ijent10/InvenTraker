import SwiftUI

@main
struct InvenTrackerApp: App {
    @StateObject private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            AppEntryView()
                .environmentObject(session)
                .tint(AppTheme.accent)
        }
    }
}
