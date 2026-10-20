import SwiftUI
import FirebaseCore
import FirebaseAppCheck

private final class InvenTrackerAppCheckProviderFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
#if targetEnvironment(simulator)
        AppCheckDebugProvider(app: app)
#else
        AppAttestProvider(app: app)
#endif
    }
}

@main
struct InvenTrackerApp: App {
    @StateObject private var session = AppSession()

    init() {
        AppCheck.setAppCheckProviderFactory(InvenTrackerAppCheckProviderFactory())
        FirebaseApp.configure()
        AppCheck.appCheck().isTokenAutoRefreshEnabled = true
    }

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
