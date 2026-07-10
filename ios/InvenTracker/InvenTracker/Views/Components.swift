import SwiftUI
import VisionKit

struct ScanEntryView: View {
    @Environment(\.dismiss) private var dismiss
    let onSubmit: (String) -> Void
    @State private var code = ""
    @State private var showingCamera = DataScannerViewController.isSupported && DataScannerViewController.isAvailable

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                if showingCamera {
                    BarcodeScannerView { value in
                        onSubmit(value)
                    }
                    .frame(height: 280)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(.white.opacity(0.7), lineWidth: 2)
                            .padding(36)
                    }
                    Text("Center the barcode inside the frame.")
                        .font(.subheadline).foregroundStyle(.secondary)
                } else {
                    Image(systemName: "barcode.viewfinder")
                        .font(.system(size: 64, weight: .light))
                        .foregroundStyle(AppTheme.accent)
                    Text("Camera scanning is unavailable here. Enter the SKU or barcode instead.")
                        .multilineTextAlignment(.center).foregroundStyle(.secondary)
                }

                HStack {
                    TextField("SKU or barcode", text: $code)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.asciiCapable)
                        .textInputAutocapitalization(.never)
                    Button("Find") { onSubmit(code.trimmingCharacters(in: .whitespacesAndNewlines)) }
                        .buttonStyle(.borderedProminent)
                        .disabled(code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(24)
            .navigationTitle("Scan item")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
        .presentationDetents(showingCamera ? [.large] : [.medium])
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
