import SwiftUI

struct AppEntryView: View {
    @EnvironmentObject private var session: AppSession

    var body: some View {
        Group {
            switch session.phase {
            case .launching, .loadingWorkspace:
                LaunchView(message: "Connecting to your workspace")
            case .authenticating:
                LaunchView(message: "Signing in")
            case .signedOut:
                SignInView()
            case .ready:
                WorkspaceView()
            case .noAccess(let message):
                StatusView(title: "No store access", message: message, icon: "building.2.crop.circle")
            case .failed(let message):
                StatusView(title: "Couldn’t load InvenTracker", message: message, icon: "wifi.exclamationmark")
            }
        }
        .animation(.easeInOut(duration: 0.22), value: session.phase)
        .overlay(alignment: .top) {
            if let toast = session.toast {
                ToastView(message: toast)
                    .padding(.top, 10)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task {
                        try? await Task.sleep(for: .seconds(3))
                        withAnimation { session.toast = nil }
                    }
            }
        }
    }
}

private struct LaunchView: View {
    let message: String

    var body: some View {
        ZStack {
            Color(.systemGroupedBackground).ignoresSafeArea()
            VStack(spacing: 22) {
                BrandMark(size: 84)
                VStack(spacing: 6) {
                    Text("InvenTracker").font(.title2.bold())
                    Text(message).font(.subheadline).foregroundStyle(.secondary)
                }
                ProgressView().controlSize(.regular).padding(.top, 4)
            }
        }
    }
}

private struct StatusView: View {
    @EnvironmentObject private var session: AppSession
    let title: String
    let message: String
    let icon: String

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: icon)
        } description: {
            Text(message)
        } actions: {
            Button("Try again") { Task { await session.loadWorkspace() } }
                .buttonStyle(.borderedProminent)
            Button("Sign out") { Task { await session.signOut() } }
                .buttonStyle(.bordered)
        }
    }
}

private struct ToastView: View {
    let message: String
    var body: some View {
        Label(message, systemImage: "checkmark.circle.fill")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .background(AppTheme.navy, in: Capsule())
            .shadow(color: .black.opacity(0.18), radius: 12, y: 5)
    }
}
