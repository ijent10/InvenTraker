import SwiftUI
import SwiftData

struct AccountRootView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    @StateObject private var settings = AppSettings.shared
    @State private var hasStarted = false

    private var accountHeaderTitle: String {
        let brandName = settings.organizationBranding.brandDisplayName?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard settings.organizationBranding.enabled, !brandName.isEmpty else {
            return "Account"
        }
        return "\(brandName) Account"
    }

    var body: some View {
        Group {
            if session.firebaseUser == nil {
                AuthLandingView()
            } else if session.organizations.isEmpty {
                OrganizationOnboardingView()
            } else if session.activeOrganizationId == nil {
                OrganizationPickerView()
            } else {
                AccountDashboardView()
            }
        }
        .navigationTitle(accountHeaderTitle)
        .navigationBarTitleDisplayMode(.inline)
        .overlay(alignment: .top) {
            if let error = session.errorMessage, !error.isEmpty {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(.red.opacity(0.85), in: Capsule())
                    .padding(.top, 8)
            }
        }
        .task {
            if !hasStarted {
                hasStarted = true
                session.start()
            }
            if let userId = session.firebaseUser?.id, let organizationId = session.activeOrganizationId {
                await MigrationCoordinator.shared.runFirstAuthMigrationIfNeeded(
                    userId: userId,
                    organizationId: organizationId,
                    modelContext: modelContext
                )
            }
        }
    }
}

private struct AuthLandingView: View {
    @EnvironmentObject private var session: AccountSessionStore
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        Form {
            Section {
                ContextTipCard(context: .account)
            }

            Section("Sign In") {
                TextField("Email", text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                SecureField("Password", text: $password)
            }

            Section {
                Button {
                    Task { await session.signIn(email: email, password: password) }
                } label: {
                    if session.isLoading {
                        ProgressView()
                    } else {
                        Text("Sign In")
                    }
                }
                .disabled(session.isLoading || email.isEmpty || password.isEmpty)

                Button("Create Account") {
                    Task { await session.createAccount(email: email, password: password) }
                }
                .disabled(session.isLoading || email.isEmpty || password.isEmpty)
            }

            Section("Recovery") {
                Button("Send Password Reset") {
                    Task { await session.resetPassword(email: email) }
                }
                .disabled(session.isLoading || email.isEmpty)
            }

            Section("Authentication Provider") {
                Text("Firebase Auth is the recommended provider for multi-tenant role and invite controls.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct OrganizationOnboardingView: View {
    @EnvironmentObject private var session: AccountSessionStore
    @State private var organizationName = ""
    @State private var inviteCode = ""
    @State private var companyCode = ""
    @State private var employeeId = ""
    @State private var storeName = ""
    @State private var addressLine1 = ""
    @State private var addressLine2 = ""
    @State private var city = ""
    @State private var state = ""
    @State private var postalCode = ""
    @State private var country = "US"

    private var canCreateOrganization: Bool {
        !organizationName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !storeName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !addressLine1.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !state.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !postalCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !country.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        Form {
            Section {
                ContextTipCard(context: .account)
            }

            Section("Create Organization") {
                TextField("Organization name", text: $organizationName)
                TextField("Store name", text: $storeName)
                TextField("Address line 1", text: $addressLine1)
                TextField("Address line 2 (optional)", text: $addressLine2)
                TextField("City", text: $city)
                TextField("State", text: $state)
                TextField("ZIP / Postal code", text: $postalCode)
                    .keyboardType(.numbersAndPunctuation)
                TextField("Country", text: $country)
                Button("Create and Continue") {
                    let store = StoreLocationRef(
                        id: UUID().uuidString,
                        name: storeName,
                        addressLine1: addressLine1,
                        addressLine2: addressLine2,
                        city: city,
                        state: state,
                        postalCode: postalCode,
                        country: country,
                        isActive: true,
                        createdAt: Date(),
                        updatedAt: Date()
                    )
                    Task { await session.createOrganization(named: organizationName, initialStore: store) }
                }
                .disabled(session.isLoading || !canCreateOrganization)
            }

            Section("Join via Invite") {
                TextField("Invite code", text: $inviteCode)
                    .textInputAutocapitalization(.characters)
                Button("Join Organization") {
                    Task { await session.joinOrganization(inviteCode: inviteCode) }
                }
                .disabled(session.isLoading || inviteCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            Section("Join via Company Code") {
                TextField("Company code", text: $companyCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                TextField("Employee ID", text: $employeeId)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Claim Organization Access") {
                    Task {
                        await session.joinOrganization(
                            companyCode: companyCode,
                            employeeId: employeeId
                        )
                    }
                }
                .disabled(
                    session.isLoading ||
                    companyCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                    employeeId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                )
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    session.signOut()
                } label: {
                    Label("Back", systemImage: "chevron.left")
                }
            }
        }
    }
}

private struct OrganizationPickerView: View {
    @EnvironmentObject private var session: AccountSessionStore

    var body: some View {
        List {
            Section("Your Organizations") {
                ForEach(session.organizations) { org in
                    Button {
                        Task { await session.switchOrganization(org.id) }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(org.name)
                                    .foregroundStyle(.primary)
                                Text(org.status.capitalized)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if session.activeOrganizationId == org.id {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.green)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private struct AccountDashboardView: View {
    @EnvironmentObject private var session: AccountSessionStore
    @StateObject private var settings = AppSettings.shared
    @State private var pendingEmail = ""
    @State private var currentPasswordInput = ""
    @State private var newPasswordInput = ""
    @State private var confirmPasswordInput = ""
    @State private var showingCurrentPasswordPrompt = false
    @State private var showingNewPasswordPrompt = false
    @State private var showingConfirmPasswordPrompt = false
    @State private var statusMessage: String?
    @State private var localErrorMessage: String?

    private var activeOrganization: OrganizationSummary? {
        guard let activeID = session.activeOrganizationId else { return nil }
        return session.organizations.first(where: { $0.id == activeID })
    }

    var body: some View {
        Form {
            Section {
                ContextTipCard(context: .account, accentColor: settings.accentColor)
            }

            Section("Profile") {
                LabeledContent("Employee ID", value: session.activeMembership?.employeeId ?? "Not set")
                LabeledContent("Email", value: session.firebaseUser?.email ?? "Unavailable")
                LabeledContent("Role", value: session.activeMembership?.role.displayName ?? "Viewer")
            }

            Section("Organization") {
                LabeledContent("Active", value: activeOrganization?.name ?? "None")
                if session.organizations.count > 1 {
                    Picker("Switch", selection: Binding(
                        get: { session.activeOrganizationId ?? "" },
                        set: { newValue in
                            Task { await session.switchOrganization(newValue) }
                        }
                    )) {
                        ForEach(session.organizations) { org in
                            Text(org.name).tag(org.id)
                        }
                    }
                }
                if !session.stores.isEmpty {
                    Picker("Store", selection: Binding(
                        get: { settings.normalizedActiveStoreID },
                        set: { newValue in
                            session.switchStore(newValue)
                        }
                    )) {
                        ForEach(session.stores) { store in
                            let cityState = [store.city, store.state]
                                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                                .filter { !$0.isEmpty }
                                .joined(separator: ", ")
                            let label = cityState.isEmpty ? store.name : "\(store.name) • \(cityState)"
                            Text(label).tag(store.id)
                        }
                    }
                }
            }

            Section("Appearance") {
                Picker("Color Scheme", selection: $settings.preferredColorScheme) {
                    Text("System").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }

                Picker("Accent Color", selection: $settings.colorScheme) {
                    ForEach(AppColorScheme.allCases) { color in
                        Text(color.rawValue).tag(color.rawValue)
                    }
                }

                HStack {
                    Text("Preview")
                    Spacer()
                    Circle()
                        .fill(settings.accentColor.gradient)
                        .frame(width: 24, height: 24)
                }
            }

            Section("Security") {
                TextField("Update Email", text: $pendingEmail)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                Button("Save Email") {
                    Task {
                        await saveEmail()
                    }
                }
                .disabled(session.isLoading || pendingEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                Button("Change Password") {
                    beginPasswordFlow()
                }
                .disabled(session.isLoading)
            }

            Section {
                Button("Sign Out", role: .destructive) {
                    session.signOut()
                }
            }

            if let statusMessage {
                Section {
                    Text(statusMessage)
                        .font(.caption)
                        .foregroundStyle(.green)
                }
            }

            if let localErrorMessage {
                Section {
                    Text(localErrorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
        }
        .onAppear {
            pendingEmail = session.firebaseUser?.email ?? ""
            syncAppearancePreference()
        }
        .onChange(of: settings.colorScheme) { _, _ in
            syncAppearancePreference()
        }
        .onChange(of: settings.preferredColorScheme) { _, _ in
            syncAppearancePreference()
        }
        .sheet(isPresented: $showingCurrentPasswordPrompt) {
            PasswordPromptSheet(
                title: "Current Password",
                subtitle: "Enter your current password to continue.",
                placeholder: "Current password",
                accentColor: settings.accentColor,
                value: $currentPasswordInput,
                confirmTitle: "Continue",
                onConfirm: proceedFromCurrentPassword
            )
        }
        .sheet(isPresented: $showingNewPasswordPrompt) {
            PasswordPromptSheet(
                title: "New Password",
                subtitle: "Use at least 8 characters.",
                placeholder: "New password",
                accentColor: settings.accentColor,
                value: $newPasswordInput,
                confirmTitle: "Continue",
                onConfirm: proceedFromNewPassword
            )
        }
        .sheet(isPresented: $showingConfirmPasswordPrompt) {
            PasswordPromptSheet(
                title: "Confirm Password",
                subtitle: "Re-enter the new password.",
                placeholder: "Confirm password",
                accentColor: settings.accentColor,
                value: $confirmPasswordInput,
                confirmTitle: "Update Password"
            ) {
                Task {
                    await completePasswordChange()
                }
            }
        }
    }

    private func saveEmail() async {
        let cleaned = pendingEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return }
        statusMessage = nil
        localErrorMessage = nil
        await session.updateEmail(cleaned)
        if let error = session.errorMessage, !error.isEmpty {
            localErrorMessage = error
        } else {
            statusMessage = "Email updated."
        }
    }

    private func beginPasswordFlow() {
        statusMessage = nil
        localErrorMessage = nil
        currentPasswordInput = ""
        newPasswordInput = ""
        confirmPasswordInput = ""
        showingCurrentPasswordPrompt = true
    }

    private func proceedFromCurrentPassword() {
        let cleaned = currentPasswordInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else {
            localErrorMessage = "Enter your current password."
            return
        }
        currentPasswordInput = cleaned
        showingCurrentPasswordPrompt = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
            showingNewPasswordPrompt = true
        }
    }

    private func proceedFromNewPassword() {
        let cleaned = newPasswordInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard cleaned.count >= 8 else {
            localErrorMessage = "New password must be at least 8 characters."
            return
        }
        newPasswordInput = cleaned
        showingNewPasswordPrompt = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
            showingConfirmPasswordPrompt = true
        }
    }

    private func completePasswordChange() async {
        statusMessage = nil
        localErrorMessage = nil
        guard !currentPasswordInput.isEmpty else {
            localErrorMessage = "Current password is required."
            return
        }
        guard newPasswordInput == confirmPasswordInput else {
            localErrorMessage = "Passwords do not match."
            return
        }
        guard newPasswordInput.count >= 8 else {
            localErrorMessage = "Password must be at least 8 characters."
            return
        }
        showingConfirmPasswordPrompt = false
        await session.updatePassword(currentPassword: currentPasswordInput, newPassword: newPasswordInput)
        if let error = session.errorMessage, !error.isEmpty {
            localErrorMessage = normalizedPasswordError(error)
            return
        }
        currentPasswordInput = ""
        newPasswordInput = ""
        confirmPasswordInput = ""
        statusMessage = "Password updated."
    }

    private func normalizedPasswordError(_ raw: String) -> String {
        let lowered = raw.lowercased()
        if lowered.contains("wrong-password") || lowered.contains("invalid credential") {
            return "Current password is incorrect."
        }
        if lowered.contains("weak-password") {
            return "New password is too weak."
        }
        return raw
    }

    private func syncAppearancePreference() {
        UserPreferenceSyncService.shared.syncAppearancePreference(settings: settings, user: session.firebaseUser)
    }
}

private struct PasswordPromptSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let subtitle: String
    let placeholder: String
    let accentColor: Color
    @Binding var value: String
    let confirmTitle: String
    let onConfirm: () -> Void

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text(title)
                    .font(.title3.weight(.semibold))
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                SecureField(placeholder, text: $value)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color(.secondarySystemGroupedBackground))
                    )
                Spacer(minLength: 0)
            }
            .padding()
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(confirmTitle) {
                        onConfirm()
                    }
                    .foregroundStyle(accentColor)
                    .disabled(value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.fraction(0.3)])
        .presentationDragIndicator(.visible)
        .tint(accentColor)
    }
}
