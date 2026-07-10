import SwiftUI

struct AccountView: View {
    @EnvironmentObject private var session: AppSession

    var body: some View {
        List {
            if let member = session.workspace?.session.member {
                Section {
                    HStack(spacing: 14) {
                        Image(systemName: "person.crop.circle.fill").font(.system(size: 46)).foregroundStyle(AppTheme.accent)
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
                    .foregroundStyle(AppTheme.mint)
            }
            Section { Button("Sign out", role: .destructive) { Task { await session.signOut() } } }
        }
        .navigationTitle("Account")
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
                                if !notification.read { Circle().fill(AppTheme.accent).frame(width: 7, height: 7) }
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
