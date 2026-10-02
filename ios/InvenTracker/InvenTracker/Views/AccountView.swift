import SwiftUI

struct AccountView: View {
    @EnvironmentObject private var session: AppSession

    var body: some View {
        List {
            if let member = session.workspace?.session.member {
                Section {
                    HStack(spacing: 14) {
                        Image(systemName: "person.crop.circle.fill").font(.system(size: 46)).foregroundStyle(session.theme.accentColor)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(member.name).font(.headline)
                            Text(member.jobTitle).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 6)
                }
                Section("Employee") {
                    LabeledContent("Employee ID", value: member.employeeId)
                    LabeledContent("Department", value: member.department)
                    LabeledContent("Location", value: member.location)
                    LabeledContent("Email", value: member.email)
                }
            }
            Section("System") {
                Label("Connected to InvenTracker", systemImage: "checkmark.icloud.fill")
                    .foregroundStyle(session.theme.secondaryColor)
            }
            Section {
                if session.canViewInventory {
                    Label(session.canUpdateInventory ? "Inventory counts and stock updates" : "Inventory viewing", systemImage: "shippingbox.fill")
                }
                if session.canViewOrders {
                    Label(session.canSubmitOrders ? "Order viewing and submission" : "Order viewing", systemImage: "cart.fill")
                }
                if session.canViewHealthChecks {
                    Label("Health check viewing", systemImage: "checklist")
                }
                if !session.canViewInventory && !session.canViewOrders && !session.canViewHealthChecks {
                    Text("No operational modules are enabled for this account.")
                        .foregroundStyle(.secondary)
                }
            } header: {
                Text("Mobile access")
            } footer: {
                Text("Access is controlled in the web portal. Pull to refresh or reopen the app after a permission change.")
            }
            Section("App") {
                if session.hasWorkAccess {
                    NavigationLink { WorkTabSettingsView() } label: {
                        HStack(spacing: 12) {
                            Image(systemName: session.workShortcut.icon)
                                .foregroundStyle(session.theme.accentColor)
                                .frame(width: 24)
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Quick work")
                                Text("Opens \(session.workShortcut.title)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                NavigationLink { AppearanceSettingsView() } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "paintpalette.fill")
                            .foregroundStyle(session.theme.secondaryColor)
                            .frame(width: 24)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Appearance")
                            Text(session.theme.name ?? "Personal theme")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            Section { Button("Sign out", role: .destructive) { Task { await session.signOut() } } }
        }
        .navigationTitle("Account")
    }
}

struct AppearanceSettingsView: View {
    @EnvironmentObject private var session: AppSession

    var body: some View {
        List {
            Section {
                ForEach(Array(session.availableThemes.enumerated()), id: \.offset) { _, theme in
                    Button {
                        Task { await session.updateTheme(theme) }
                    } label: {
                        ThemeChoiceRow(theme: theme, selected: theme == session.theme)
                    }
                    .buttonStyle(.plain)
                    .disabled(session.isWorking)
                }
            } header: {
                Text("Themes")
            } footer: {
                Text("Your saved themes stay in sync with the website and other signed-in devices.")
            }
            Section {
                NavigationLink {
                    CreateThemeView()
                } label: {
                    Label("Create new theme", systemImage: "plus.circle.fill")
                        .foregroundStyle(session.theme.accentColor)
                }
            }
        }
        .navigationTitle("Themes")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct ThemeChoiceRow: View {
    @EnvironmentObject private var session: AppSession
    let theme: MobileTheme
    let selected: Bool

    var body: some View {
        HStack(spacing: 13) {
            HStack(spacing: 0) {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(theme.accentColor)
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(theme.secondaryColor)
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(theme.panelColor)
            }
            .frame(width: 54, height: 42)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(theme.controlBorderColor, lineWidth: 1)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(theme.name ?? "Personal theme")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(session.theme.textColor)
                Text(theme.mode)
                    .font(.caption)
                    .foregroundStyle(session.theme.mutedColor)
            }
            Spacer(minLength: 8)
            if selected {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(session.theme.accentColor)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct CreateThemeView: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var accent = Color(hex: "#2563eb")
    @State private var secondary = Color(hex: "#14b8a6")
    @State private var background = Color(hex: "#eff6ff")

    private var draft: MobileTheme {
        MobileTheme.newTheme(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            accent: accent.hexString,
            secondary: secondary.hexString,
            background: background.hexString
        )
    }

    var body: some View {
        Form {
            Section("New theme") {
                TextField("Theme name", text: $name)
                    .textInputAutocapitalization(.words)
                ColorPicker("Primary color", selection: $accent, supportsOpacity: false)
                ColorPicker("Secondary color", selection: $secondary, supportsOpacity: false)
                ColorPicker("Background color", selection: $background, supportsOpacity: false)
            }

            Section("Preview") {
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(draft.backgroundColor)
                        .frame(height: 62)
                        .overlay(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(draft.accentColor)
                                .frame(width: 96, height: 36)
                                .padding(.leading, 12)
                        }
                    Circle()
                        .fill(draft.secondaryColor)
                        .frame(width: 38, height: 38)
                }
            }

            Section {
                Button("Create theme") {
                    Task {
                        if await session.createTheme(draft) {
                            dismiss()
                        }
                    }
                }
                .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || session.isWorking)
            } footer: {
                Text("InvenTracker creates the matching control, panel, text, and dark-compatible colors automatically, then saves the full theme to your account.")
            }
        }
        .navigationTitle("Create theme")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct NotificationsView: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                let notifications = session.workspace?.notifications ?? []
                if notifications.isEmpty {
                    ContentUnavailableView("Nothing to show", systemImage: "bell.slash")
                } else {
                    List(notifications) { notification in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(notification.title).font(.body.weight(.semibold))
                                if !notification.read { Circle().fill(session.theme.accentColor).frame(width: 7, height: 7) }
                            }
                            Text(notification.detail).font(.subheadline).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                        .contentShape(Rectangle())
                        .onTapGesture { Task { await session.readNotifications([notification.id]) } }
                    }
                }
            }
            .navigationTitle("Notifications")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
