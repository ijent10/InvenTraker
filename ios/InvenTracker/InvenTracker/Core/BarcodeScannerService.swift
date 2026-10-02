import AVFoundation
import SwiftUI
import UIKit
import AudioToolbox

final class BarcodeScannerService: NSObject, ObservableObject, AVCaptureMetadataOutputObjectsDelegate {
    @Published var isAuthorized = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
    @Published var isRunning = false
    @Published var permissionDenied = AVCaptureDevice.authorizationStatus(for: .video) == .denied
    @Published var errorMessage: String?
    var onCodeScanned: ((String) -> Void)?
    var previewLayer: AVCaptureVideoPreviewLayer?

    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "com.inventraker.barcode-session", qos: .userInitiated)
    private var configured = false
    private var delivered = false
    private var shouldRun = false

    func checkAuthorization() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            isAuthorized = true
            permissionDenied = false
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    self?.isAuthorized = granted
                    self?.permissionDenied = !granted
                    self?.errorMessage = granted ? nil : "Camera access was denied. Enable it in Settings to scan barcodes."
                }
            }
        case .denied, .restricted:
            isAuthorized = false
            permissionDenied = true
            errorMessage = "Camera access is off. Enable Camera for InvenTracker in Settings, or enter a code below."
        @unknown default:
            isAuthorized = false
            permissionDenied = false
            errorMessage = "Camera scanning is unavailable on this device."
        }
    }

    func startScanning() {
        guard isAuthorized else { return }
        delivered = false
        queue.async { [weak self] in
            guard let self else { return }
            self.shouldRun = true
            if !self.configured { self.configured = self.configure() }
            guard self.configured, self.shouldRun else { return }
            if !self.session.isRunning { self.session.startRunning() }
            if !self.shouldRun, self.session.isRunning { self.session.stopRunning() }
            DispatchQueue.main.async {
                self.isRunning = self.session.isRunning && self.shouldRun
                if !self.isRunning { self.errorMessage = "The camera session could not start. Close the scanner and try again." }
            }
        }
    }

    func stopScanning() {
        queue.async { [weak self] in
            guard let self else { return }
            self.shouldRun = false
            if self.session.isRunning { self.session.stopRunning() }
            DispatchQueue.main.async { self.isRunning = false }
        }
    }

    deinit {
        if session.isRunning { session.stopRunning() }
    }

    func makePreviewLayer() -> AVCaptureVideoPreviewLayer {
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        previewLayer = layer
        return layer
    }

    private func configure() -> Bool {
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .high
        guard let camera = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: camera), session.canAddInput(input) else {
            publish("The camera could not be opened."); return false
        }
        session.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { publish("Barcode scanning could not start."); return false }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.ean8, .ean13, .upce, .code39, .code39Mod43, .code93, .code128, .pdf417, .aztec, .interleaved2of5, .itf14, .dataMatrix]
        return true
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !delivered, let object = objects.compactMap({ $0 as? AVMetadataMachineReadableCodeObject }).first,
              let value = object.stringValue, !value.isEmpty else { return }
        delivered = true
        AudioServicesPlaySystemSound(SystemSoundID(kSystemSoundID_Vibrate))
        onCodeScanned?(value)
    }

    private func publish(_ message: String) { DispatchQueue.main.async { self.errorMessage = message; self.isRunning = false } }
}

struct CameraPreviewView: UIViewRepresentable {
    let scanner: BarcodeScannerService
    func makeUIView(context: Context) -> UIView {
        let view = UIView(); view.backgroundColor = .black
        let layer = scanner.makePreviewLayer(); layer.frame = view.bounds; view.layer.addSublayer(layer)
        return view
    }
    func updateUIView(_ view: UIView, context: Context) {
        DispatchQueue.main.async { scanner.previewLayer?.frame = view.bounds }
    }
}
