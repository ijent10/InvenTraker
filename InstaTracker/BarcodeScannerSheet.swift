import SwiftUI
import AVFoundation

struct BarcodeScannerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var scannerService: BarcodeScannerService
    var onScanned: (String) -> Void
    
    var body: some View {
        NavigationStack {
            ZStack {
                if scannerService.isAuthorized {
                    CameraPreviewView(scanner: scannerService)
                        .ignoresSafeArea()
                } else {
                    VStack(spacing: 12) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(.secondary)
                        Text("Camera Access Needed")
                            .font(.title3)
                            .fontWeight(.semibold)
                        Text(scannerService.errorMessage ?? "Enable camera access in Settings to scan barcodes.")
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal)
                    }
                    .padding()
                }
                
                VStack {
                    if let scannerError = scannerService.errorMessage, !scannerError.isEmpty {
                        Text(scannerError)
                            .font(.caption.weight(.semibold))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(.ultraThinMaterial, in: Capsule())
                            .padding(.top, 8)
                            .padding(.horizontal)
                    }
                    Spacer()
                    Text("Align the barcode within the frame")
                        .font(.headline)
                        .padding()
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(.bottom, 30)
                }
            }
            .navigationTitle("Scan Barcode")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") {
                        scannerService.stopScanning()
                        scannerService.onCodeScanned = nil
                        dismiss()
                    }
                }
            }
            .onAppear {
                scannerService.onCodeScanned = { code in
                    onScanned(code)
                    dismiss()
                }
                scannerService.checkAuthorization()
                if scannerService.isAuthorized {
                    scannerService.startScanning()
                }
            }
            .onChange(of: scannerService.isAuthorized) { _, authorized in
                if authorized {
                    scannerService.startScanning()
                }
            }
            .onDisappear {
                scannerService.stopScanning()
                scannerService.onCodeScanned = nil
            }
        }
    }
}
