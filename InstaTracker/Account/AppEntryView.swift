import SwiftUI
import Combine

struct AppEntryView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject private var session: AccountSessionStore
    @StateObject private var settings = AppSettings.shared
    @StateObject private var notificationFeed = RealtimeNotificationFeedService.shared
    @State private var hydratedPreferenceUserId: String?
    private let periodicSyncTimer = Timer.publish(every: 900, on: .main, in: .common).autoconnect()
    private var departmentScopeToken: String {
        session.inventoryDepartmentScope.sorted().joined(separator: "|")
    }

    var body: some View {
        Group {
            if !session.didInitialize {
                loadingView
            } else if session.firebaseUser == nil {
                AuthenticationSplashView()
            } else if session.isLoading && (session.activeOrganizationId == nil || session.organizations.isEmpty) {
                loadingView
            } else if session.activeOrganizationId == nil || session.organizations.isEmpty {
                NavigationStack {
                    AccountRootView()
                }
            } else if session.needsTutorial {
                QuickStartTutorialView()
            } else if settings.normalizedActiveStoreID.isEmpty || session.stores.isEmpty {
                NavigationStack {
                    NoStoreAccessView()
                        .environmentObject(session)
                }
            } else {
                ContentView()
            }
        }
        .task {
            session.start()
            await hydrateUserPreferencesIfNeeded()
            await FeatureRequestService.shared.flushPendingRequestsIfPossible()
            await syncDepartmentConfigs()
            await syncBrandingSettings()
            ActionSyncService.shared.configureAutoSync(
                organizationId: session.activeOrganizationId,
                modelContext: modelContext
            )
            configureRealtimeInventorySync()
            configureRealtimeNotifications()
            syncPushContext()
            syncUserAppearancePreference()
        }
        .task(id: "\(session.firebaseUser?.id ?? "signed-out")|\(session.activeOrganizationId ?? "no-org")") {
            await session.recoverLegacyLocalDataIfNeeded(modelContext: modelContext)
            await FeatureRequestService.shared.flushPendingRequestsIfPossible()
            await syncDepartmentConfigs()
            await syncBrandingSettings()
            configureRealtimeInventorySync()
            configureRealtimeNotifications()
            syncPushContext()
            requestRemoteScopeRefresh(force: true)
        }
        .onChange(of: session.activeOrganizationId) { _, organizationId in
            Task {
                await syncDepartmentConfigs()
                await syncBrandingSettings()
            }
            ActionSyncService.shared.configureAutoSync(
                organizationId: organizationId,
                modelContext: modelContext
            )
            configureRealtimeInventorySync()
            configureRealtimeNotifications()
            syncPushContext()
        }
        .onChange(of: settings.activeStoreID) { _, _ in
            Task { await syncDepartmentConfigs() }
            configureRealtimeInventorySync()
            configureRealtimeNotifications()
            syncPushContext()
            requestRemoteScopeRefresh(force: true)
        }
        .onReceive(NotificationCenter.default.publisher(for: .activeStoreDidChange)) { _ in
            Task { await syncDepartmentConfigs() }
            configureRealtimeInventorySync()
            configureRealtimeNotifications()
            syncPushContext()
            requestRemoteScopeRefresh(force: true)
        }
        .onChange(of: departmentScopeToken) { _, _ in
            configureRealtimeInventorySync()
            configureRealtimeNotifications()
            syncPushContext()
            requestRemoteScopeRefresh(force: true)
        }
        .onChange(of: session.firebaseUser?.id) { _, _ in
            Task {
                await hydrateUserPreferencesIfNeeded()
                syncUserAppearancePreference()
                await syncDepartmentConfigs()
                await syncBrandingSettings()
                configureRealtimeInventorySync()
                configureRealtimeNotifications()
                syncPushContext()
            }
        }
        .onChange(of: session.activeMembership?.role) { _, _ in
            configureRealtimeNotifications()
        }
        .onChange(of: session.activeMembership?.jobTitle) { _, _ in
            configureRealtimeNotifications()
        }
        .onChange(of: settings.colorScheme) { _, _ in
            syncUserAppearancePreference()
        }
        .onChange(of: settings.preferredColorScheme) { _, _ in
            syncUserAppearancePreference()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else {
                InventoryStateSyncService.shared.stopRealtimeInventorySync()
                return
            }
            Task {
                await ActionSyncService.shared.appDidBecomeActive(
                    organizationId: session.activeOrganizationId,
                    modelContext: modelContext,
                    allowSnapshot: true
                )
            }
            configureRealtimeInventorySync()
            configureRealtimeNotifications()
            syncPushContext()
            syncUserAppearancePreference()
            Task {
                await FeatureRequestService.shared.flushPendingRequestsIfPossible()
            }
            requestRemoteScopeRefresh(force: false)
        }
        .onReceive(periodicSyncTimer) { _ in
            guard scenePhase == .active else { return }
            Task {
                await ActionSyncService.shared.appDidBecomeActive(
                    organizationId: session.activeOrganizationId,
                    modelContext: modelContext,
                    allowSnapshot: false
                )
                _ = await InventoryStateSyncService.shared.refreshStoreScopeFromRemote(
                    organizationId: session.activeOrganizationId ?? "",
                    storeId: settings.normalizedActiveStoreID,
                    allowedDepartments: session.inventoryDepartmentScope,
                    modelContext: modelContext,
                    includeInventory: true,
                    includeOperational: false,
                    force: false
                )
                await MainActor.run {
                    syncUserAppearancePreference()
                }
            }
        }
    }

    private func syncPushContext() {
        PushNotificationService.shared.updateContext(
            userId: session.firebaseUser?.id,
            organizationId: session.activeOrganizationId,
            storeId: settings.normalizedActiveStoreID
        )
    }

    private func syncUserAppearancePreference() {
        guard session.firebaseUser != nil else { return }
        guard hydratedPreferenceUserId == session.firebaseUser?.id else { return }
        UserPreferenceSyncService.shared.syncAppearancePreference(settings: settings, user: session.firebaseUser)
    }

    private func hydrateUserPreferencesIfNeeded() async {
        guard let user = session.firebaseUser else {
            if let hydratedPreferenceUserId {
                UserPreferenceSyncService.shared.resetHydration(for: hydratedPreferenceUserId)
            }
            hydratedPreferenceUserId = nil
            return
        }
        if hydratedPreferenceUserId == user.id { return }
        await UserPreferenceSyncService.shared.hydratePreferencesIfNeeded(settings: settings, user: user)
        hydratedPreferenceUserId = user.id
    }

    private func configureRealtimeInventorySync() {
        guard let organizationId = session.activeOrganizationId, !organizationId.isEmpty else {
            InventoryStateSyncService.shared.stopRealtimeInventorySync()
            return
        }
        let scopedStoreID = settings.normalizedActiveStoreID
        guard !scopedStoreID.isEmpty else {
            InventoryStateSyncService.shared.stopRealtimeInventorySync()
            return
        }
        InventoryStateSyncService.shared.startRealtimeInventorySync(
            organizationId: organizationId,
            storeId: scopedStoreID,
            allowedDepartments: session.inventoryDepartmentScope,
            modelContext: modelContext
        )
    }

    private func configureRealtimeNotifications() {
        guard let organizationId = session.activeOrganizationId, !organizationId.isEmpty else {
            notificationFeed.stop()
            return
        }
        let scopedStoreID = settings.normalizedActiveStoreID
        guard !scopedStoreID.isEmpty else {
            notificationFeed.stop()
            return
        }
        notificationFeed.start(
            organizationId: organizationId,
            storeId: scopedStoreID,
            user: session.firebaseUser,
            role: session.activeMembership?.role ?? .viewer,
            roleTitle: session.activeMembership?.jobTitle
        )
    }

    private func requestRemoteScopeRefresh(force: Bool) {
        Task {
            guard let organizationId = session.activeOrganizationId, !organizationId.isEmpty else { return }
            let scopedStoreID = settings.normalizedActiveStoreID
            guard !scopedStoreID.isEmpty else { return }
            _ = await InventoryStateSyncService.shared.refreshStoreScopeFromRemote(
                organizationId: organizationId,
                storeId: scopedStoreID,
                allowedDepartments: session.inventoryDepartmentScope,
                modelContext: modelContext,
                includeInventory: true,
                includeOperational: true,
                force: force
            )
        }
    }

    private func syncDepartmentConfigs() async {
        guard let organizationId = session.activeOrganizationId,
              !organizationId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return
        }
        let scopedStoreID = settings.normalizedActiveStoreID
        let configs = await OrganizationService.shared.departmentConfigs(
            for: organizationId,
            storeId: scopedStoreID.isEmpty ? nil : scopedStoreID
        )
        await MainActor.run {
            settings.departmentConfigs = configs
        }
    }

    private func syncBrandingSettings() async {
        guard let organizationId = session.activeOrganizationId,
              !organizationId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            await MainActor.run {
                settings.applyOrganizationBranding(nil)
            }
            return
        }

        let branding = await OrganizationService.shared.brandingConfig(for: organizationId)
        await MainActor.run {
            settings.applyOrganizationBranding(branding)
        }
    }

    private var loadingView: some View {
        ZStack {
            LinearGradient(
                colors: [Color.blue.opacity(0.18), Color.green.opacity(0.14), Color.white],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 14) {
                Image(systemName: "shippingbox.fill")
                    .font(.system(size: 54, weight: .semibold))
                    .foregroundStyle(.blue)
                Text("InvenTraker")
                    .font(.title.weight(.bold))
                ProgressView()
                    .progressViewStyle(.circular)
            }
        }
    }
}

private struct NoStoreAccessView: View {
    @EnvironmentObject private var session: AccountSessionStore

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "building.2.crop.circle")
                .font(.system(size: 52, weight: .semibold))
                .foregroundStyle(.secondary)
            Text("No Store Access")
                .font(.title3.weight(.semibold))
            Text("You are signed in, but this profile is not assigned to a store yet. Ask a manager or owner to grant store access.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
            NavigationLink {
                AccountRootView()
            } label: {
                Text("Open Account")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal, 24)
            Spacer()
        }
        .navigationTitle("Store Access")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private enum AuthMode: String, CaseIterable, Identifiable {
    case login = "Log In"
    case signup = "Sign Up"

    var id: String { rawValue }
}

private struct AuthenticationSplashView: View {
    @EnvironmentObject private var session: AccountSessionStore

    @State private var mode: AuthMode = .login
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var companyCode = ""
    @State private var employeeId = ""
    @State private var localError: String?

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.blue.opacity(0.2), Color.green.opacity(0.15), Color(.systemBackground)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 18) {
                Spacer(minLength: 24)

                Image(systemName: "person.crop.circle.badge.checkmark")
                    .font(.system(size: 56))
                    .foregroundStyle(.blue)

                Text("Welcome to InvenTraker")
                    .font(.title2.weight(.bold))

                Text("Please log in or create an account to continue.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Picker("Mode", selection: $mode) {
                    ForEach(AuthMode.allCases) { option in
                        Text(option.rawValue).tag(option)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.top, 6)

                VStack(spacing: 10) {
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                        .padding(12)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))

                    SecureField("Password", text: $password)
                        .padding(12)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))

                    if mode == .signup {
                        SecureField("Confirm Password", text: $confirmPassword)
                            .padding(12)
                            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))

                        TextField("Company code (optional)", text: $companyCode)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            .padding(12)
                            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))

                        TextField("Employee ID (required with company code)", text: $employeeId)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding(12)
                            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
                    }
                }

                if let message = localError ?? session.errorMessage, !message.isEmpty {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }

                Button(action: submit) {
                    if session.isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    } else {
                        Text(mode == .login ? "Log In" : "Create Account")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canSubmit || session.isLoading)

                if mode == .login {
                    Button("Forgot Password?") {
                        Task {
                            await session.resetPassword(email: email)
                        }
                    }
                    .disabled(email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || session.isLoading)
                }

                Spacer(minLength: 24)
            }
            .padding(.horizontal, 24)
            .onChange(of: mode) { _, _ in
                localError = nil
            }
        }
    }

    private var canSubmit: Bool {
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanEmail.isEmpty, !password.isEmpty else { return false }
        if mode == .signup {
            let normalizedCode = companyCode.trimmingCharacters(in: .whitespacesAndNewlines)
            let normalizedEmployeeId = employeeId.trimmingCharacters(in: .whitespacesAndNewlines)
            let companyCodeReady = normalizedCode.isEmpty || !normalizedEmployeeId.isEmpty
            return !confirmPassword.isEmpty && companyCodeReady
        }
        return true
    }

    private func submit() {
        localError = nil
        if mode == .signup && password != confirmPassword {
            localError = "Passwords do not match."
            return
        }
        Task {
            if mode == .login {
                await session.signIn(email: email, password: password)
            } else {
                await session.createAccount(
                    email: email,
                    password: password,
                    companyCode: companyCode,
                    employeeId: employeeId
                )
            }
        }
    }
}
