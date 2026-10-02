import SwiftUI

@main
struct InvenTrackerApp: App {
    @StateObject private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            AppEntryView()
                .environmentObject(session)
                .tint(session.theme.accentColor)
                .preferredColorScheme(session.theme.preferredColorScheme)
                .toolbarBackground(session.theme.panelStrongColor, for: .tabBar)
                .toolbarBackground(.visible, for: .tabBar)
        }
    }
}
