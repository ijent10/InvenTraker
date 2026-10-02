import SwiftUI
import VisionKit

struct ScanEntryView: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    let onSubmit: (String) -> Void
    @State private var code = ""
    @State private var showingCamera = DataScannerViewController.isSupported && DataScannerViewController.isAvailable

    var body: some View {
        NavigationStack {
            VStack(spacing: 22) {
                if showingCamera {
                    BarcodeScannerView { value in
                        onSubmit(value)
                    }
                    .frame(height: 370)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(session.theme.buttonTextColor.opacity(0.9), lineWidth: 2)
                            .padding(42)
                    }
                    VStack(spacing: 4) {
                        Text("Ready to scan")
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
                    Text("Camera scanning is unavailable here. Enter the SKU or barcode instead.")
                        .multilineTextAlignment(.center).foregroundStyle(session.theme.mutedColor)
                }

                HStack {
                    TextField("SKU or barcode", text: $code)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.asciiCapable)
                        .textInputAutocapitalization(.never)
                    Button("Use code") { onSubmit(code.trimmingCharacters(in: .whitespacesAndNewlines)) }
                        .buttonStyle(.borderedProminent)
                        .disabled(code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(24)
            .background(session.theme.backgroundColor)
            .navigationTitle("Scan item")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
        .presentationDetents(showingCamera ? [.large] : [.medium])
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
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 13) {
                Image(systemName: "barcode.viewfinder")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(session.theme.buttonTextColor)
                    .frame(width: 48, height: 48)
                    .background(session.theme.accentColor, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(session.theme.textColor)
                    Text(detail)
                        .font(.subheadline)
                        .foregroundStyle(session.theme.mutedColor)
                }
            }

            Button(action: onScan) {
                Label(scanTitle, systemImage: "camera.fill")
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
            }
            .buttonStyle(.plain)
            .foregroundStyle(session.theme.buttonTextColor)
            .background(session.theme.accentColor, in: RoundedRectangle(cornerRadius: 12, style: .continuous))

            Button(action: onManual) {
                Label("Choose from inventory", systemImage: "magnifyingglass")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
            .buttonStyle(.plain)
            .foregroundStyle(session.theme.textColor)
            .background(session.theme.controlBackgroundColor, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(session.theme.controlBorderColor, lineWidth: 1)
            }
        }
        .padding(16)
        .background(session.theme.backgroundSoftColor, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(session.theme.controlBorderColor, lineWidth: 1)
        }
    }
}

private struct BarcodeScannerView: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode()],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        try? scanner.startScanning()
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        if !scanner.isScanning { try? scanner.startScanning() }
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void
        private var delivered = false

        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !delivered else { return }
            for item in addedItems {
                guard case .barcode(let barcode) = item,
                      let value = barcode.payloadStringValue,
                      !value.isEmpty else { continue }
                delivered = true
                dataScanner.stopScanning()
                onCode(value)
                return
            }
        }
    }
}

extension Double {
    var formattedQuantity: String {
        formatted(.number.precision(.fractionLength(0...2)))
    }
}
