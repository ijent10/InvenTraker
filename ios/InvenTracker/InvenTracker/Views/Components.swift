import SwiftUI
import UIKit

struct ScanEntryView: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    let onSubmit: (String) -> Void
    @State private var code = ""
    @StateObject private var scanner = BarcodeScannerService()

    var body: some View {
        NavigationStack {
            VStack(spacing: 22) {
                if scanner.isAuthorized {
                    ZStack {
                        CameraPreviewView(scanner: scanner)
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(.white.opacity(0.9), lineWidth: 2)
                            .padding(42)
                        if !scanner.isRunning {
                            ProgressView("Starting camera…")
                                .padding(14)
                                .background(.ultraThinMaterial, in: Capsule())
                        }
                    }
                    .frame(height: 370)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    VStack(spacing: 4) {
                        Text(scanner.isRunning ? "Ready to scan" : "Camera is starting")
                            .font(.headline)
                            .foregroundStyle(session.theme.textColor)
                        Text("Hold the barcode inside the frame.")
                            .font(.subheadline)
                            .foregroundStyle(session.theme.mutedColor)
                    }
                } else {
                    Image(systemName: "barcode.viewfinder")
                        .font(.system(size: 64, weight: .light))
                        .foregroundStyle(session.theme.accentColor)
                    Text(scanner.errorMessage ?? "Allow camera access to scan, or enter the SKU or barcode below.")
                        .multilineTextAlignment(.center).foregroundStyle(session.theme.mutedColor)
                    if scanner.permissionDenied {
                        Button("Open Camera Settings") {
                            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                            UIApplication.shared.open(url)
                        }
                        .buttonStyle(.borderedProminent)
                    } else {
                        Button("Request Camera Access") { scanner.checkAuthorization() }
                            .buttonStyle(.borderedProminent)
                    }
                }

                if let error = scanner.errorMessage, scanner.isAuthorized {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption).foregroundStyle(AppTheme.danger).multilineTextAlignment(.center)
                }

                HStack {
                    TextField("SKU or barcode", text: $code)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.asciiCapable)
                        .textInputAutocapitalization(.never)
                    Button("Use code") { submit(code) }
                        .buttonStyle(.borderedProminent)
                        .disabled(code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(24)
            .background(session.theme.backgroundColor)
            .navigationTitle("Scan item")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .onAppear {
                scanner.onCodeScanned = { submit($0) }
                scanner.checkAuthorization()
                scanner.startScanning()
            }
            .onChange(of: scanner.isAuthorized) { _, allowed in if allowed { scanner.startScanning() } }
            .onDisappear { scanner.stopScanning(); scanner.onCodeScanned = nil }
        }
        .presentationDetents([.large])
    }

    private func submit(_ raw: String) {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        scanner.stopScanning()
        onSubmit(value)
        dismiss()
    }
}

struct TaskCameraPrompt: View {
    @EnvironmentObject private var session: AppSession
    let title: String
    let detail: String
    let scanTitle: String
    let onScan: () -> Void
    let onManual: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 13) {
                Image(systemName: "barcode.viewfinder")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(session.theme.buttonTextColor)
                    .frame(width: 42, height: 42)
                    .background(session.theme.accentColor, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(session.theme.textColor)
                    Text(detail)
                        .font(.subheadline)
                        .foregroundStyle(session.theme.mutedColor)
                }
            }

            HStack(spacing: 10) {
                Button(action: onScan) {
                    Label(scanTitle, systemImage: "camera.fill").frame(maxWidth: .infinity).padding(.vertical, 11)
                }
                .buttonStyle(.plain).font(.subheadline.weight(.semibold))
                .foregroundStyle(session.theme.buttonTextColor)
                .background(session.theme.accentColor, in: RoundedRectangle(cornerRadius: 10, style: .continuous))

                Button(action: onManual) {
                    Label("Find item", systemImage: "magnifyingglass").frame(maxWidth: .infinity).padding(.vertical, 11)
                }
                .buttonStyle(.plain).font(.subheadline.weight(.semibold))
                .foregroundStyle(session.theme.textColor)
                .background(session.theme.controlBackgroundColor, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 10).stroke(session.theme.controlBorderColor) }
            }
        }
        .padding(13)
        .background(session.theme.backgroundSoftColor, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 14).stroke(session.theme.controlBorderColor) }
    }
}

extension Double {
    var formattedQuantity: String {
        formatted(.number.precision(.fractionLength(0...2)))
    }
}
