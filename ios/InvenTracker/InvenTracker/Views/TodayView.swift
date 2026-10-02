import SwiftUI

struct TodayView: View {
    @EnvironmentObject private var session: AppSession
    let openIssue: (WorkShortcut) -> Void

    var body: some View {
        Group {
            if let today = session.workspace?.today {
                if today.issues.isEmpty {
                    ContentUnavailableView("Nothing needs attention", systemImage: "checkmark.circle.fill", description: Text("Current inventory, expiry, and order signals are clear."))
                } else {
                    List(today.issues) { issue in
                        Button { open(issue) } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: issue.severity == "critical" ? "exclamationmark.octagon.fill" : "exclamationmark.triangle.fill")
                                    .foregroundStyle(issue.severity == "critical" ? AppTheme.danger : AppTheme.amber)
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(issue.title).font(.headline).foregroundStyle(session.theme.textColor)
                                    Text(issue.detail).font(.subheadline).foregroundStyle(session.theme.mutedColor)
                                    Text(issue.suggestedAction).font(.caption.weight(.semibold)).foregroundStyle(session.theme.accentColor)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(session.theme.subtleColor)
                            }
                            .padding(.vertical, 5)
                        }
                        .buttonStyle(.plain)
                    }
                    .listStyle(.plain)
                }
            } else {
                ContentUnavailableView("Today is unavailable", systemImage: "clock.badge.questionmark", description: Text("Pull to refresh after the server is updated."))
            }
        }
        .background(session.theme.backgroundColor)
        .navigationTitle("Today")
        .refreshable { await session.loadWorkspace(storeId: session.selectedStoreId, quiet: true) }
    }

    private func open(_ issue: MobileTodayIssue) {
        switch issue.action.kind {
        case "orders": openIssue(.orders)
        case "spot_check": openIssue(.spotCheck)
        case "waste": openIssue(.waste)
        default: openIssue(.inventory)
        }
    }
}
