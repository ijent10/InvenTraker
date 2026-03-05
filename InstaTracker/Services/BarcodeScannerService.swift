import AVFoundation
import SwiftUI
import UIKit
import Combine
import AudioToolbox
import AVFAudio

/// Manages barcode scanning using device camera
/// Supports standard retail and deli barcode formats
class BarcodeScannerService: NSObject, ObservableObject {
    @Published var scannedCode: String?
    @Published var isAuthorized = false
    @Published var errorMessage: String?
    
    private var captureSession: AVCaptureSession?
    private var hasHandledCurrentScan = false
    private var isSessionConfigured = false
    private let sessionQueue = DispatchQueue(label: "com.inventraker.barcode.session", qos: .userInitiated)
    private var customScanSoundID: SystemSoundID = 0
    private let fallbackScanSoundID: SystemSoundID = 1057
    private var loudScanPlayer: AVAudioPlayer?
    var previewLayer: AVCaptureVideoPreviewLayer?
    
    var onCodeScanned: ((String) -> Void)?
    
    override init() {
        super.init()
        prepareScanSound()
        checkAuthorization()
    }

    deinit {
        if customScanSoundID != 0 {
            AudioServicesDisposeSystemSoundID(customScanSoundID)
        }
    }
    
    /// Check camera authorization status
    func checkAuthorization() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            isAuthorized = true
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    self?.isAuthorized = granted
                }
            }
        case .denied, .restricted:
            isAuthorized = false
            errorMessage = "Camera access denied. Please enable in Settings."
        @unknown default:
            isAuthorized = false
        }
    }
    
    /// Start scanning for barcodes
    func startScanning() {
        guard isAuthorized else { return }
        hasHandledCurrentScan = false

        // Ensure session exists immediately so preview layer can attach.
        if captureSession == nil {
            captureSession = AVCaptureSession()
        }

        sessionQueue.async { [weak self] in
            guard let self, let session = self.captureSession else { return }

            if !self.isSessionConfigured {
                let configured = self.configureSession(session)
                self.isSessionConfigured = configured
                if !configured { return }
            }

            guard !session.isRunning else { return }
            session.startRunning()
        }
    }
    
    /// Stop scanning
    func stopScanning() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if let session = self.captureSession, session.isRunning {
                session.stopRunning()
            }
        }
        hasHandledCurrentScan = false
    }

    /// Allows the next barcode to be processed without restarting the camera session.
    /// Useful for continuous scan workflows (e.g. wrapped package spot checks).
    func allowNextScan(after delay: TimeInterval = 0) {
        if delay <= 0 {
            hasHandledCurrentScan = false
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.hasHandledCurrentScan = false
        }
    }
    
    /// Create a preview layer for the camera feed
    func makePreviewLayer() -> AVCaptureVideoPreviewLayer? {
        guard let session = captureSession else { return nil }
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        self.previewLayer = layer
        return layer
    }

    private func configureSession(_ session: AVCaptureSession) -> Bool {
        session.beginConfiguration()
        defer { session.commitConfiguration() }

        guard let videoCaptureDevice = AVCaptureDevice.default(for: .video) else {
            publishError("Unable to access camera")
            return false
        }

        do {
            let videoInput = try AVCaptureDeviceInput(device: videoCaptureDevice)
            if session.canAddInput(videoInput) {
                session.addInput(videoInput)
            } else {
                publishError("Could not add video input")
                return false
            }
        } catch {
            publishError("Error accessing camera: \(error.localizedDescription)")
            return false
        }

        let metadataOutput = AVCaptureMetadataOutput()
        if session.canAddOutput(metadataOutput) {
            session.addOutput(metadataOutput)
            metadataOutput.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)

            // Support common barcode formats
            metadataOutput.metadataObjectTypes = [
                .ean8, .ean13, .upce, .code39, .code39Mod43,
                .code93, .code128, .pdf417, .qr, .aztec,
                .interleaved2of5, .itf14, .dataMatrix
            ]
        } else {
            publishError("Could not add metadata output")
            return false
        }

        return true
    }

    private func publishError(_ message: String) {
        DispatchQueue.main.async { [weak self] in
            self?.errorMessage = message
        }
    }

    private func publishTransientError(_ message: String, clearAfter delay: TimeInterval = 1.5) {
        DispatchQueue.main.async { [weak self] in
            self?.errorMessage = message
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                guard self?.errorMessage == message else { return }
                self?.errorMessage = nil
            }
        }
    }

    private func prepareScanSound() {
        guard customScanSoundID == 0 else { return }
        if let loudURL = Bundle.main.url(forResource: "scanner_loud", withExtension: "wav")
            ?? Bundle.main.url(forResource: "scanner_loud", withExtension: "caf")
            ?? Bundle.main.url(forResource: "scanner_scan", withExtension: "wav")
            ?? Bundle.main.url(forResource: "scanner_scan", withExtension: "caf") {
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
                try session.setActive(true)
                let player = try AVAudioPlayer(contentsOf: loudURL)
                player.prepareToPlay()
                player.volume = 1.0
                loudScanPlayer = player
            } catch {
                loudScanPlayer = nil
            }
        }

        // Keep SystemSound fallback in case audio player cannot be created.
        if let url = Bundle.main.url(forResource: "scanner_scan", withExtension: "caf") {
            AudioServicesCreateSystemSoundID(url as CFURL, &customScanSoundID)
        }
    }

    private func playScanFeedback() {
        if let loudScanPlayer {
            loudScanPlayer.currentTime = 0
            loudScanPlayer.volume = 1.0
            loudScanPlayer.play()
        } else if customScanSoundID != 0 {
            AudioServicesPlaySystemSound(customScanSoundID)
        } else {
            AudioServicesPlaySystemSound(fallbackScanSoundID)
        }
        AudioServicesPlaySystemSound(SystemSoundID(kSystemSoundID_Vibrate))
    }
}

// MARK: - AVCaptureMetadataOutputObjectsDelegate

extension BarcodeScannerService: AVCaptureMetadataOutputObjectsDelegate {
    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let metadataObject = metadataObjects.first,
              let readableObject = metadataObject as? AVMetadataMachineReadableCodeObject,
              let code = readableObject.stringValue else { return }
        
        guard !hasHandledCurrentScan else { return }
        hasHandledCurrentScan = true

        if readableObject.type == .qr {
            publishTransientError("QR code detected. Cover the QR code and scan the barcode again.")
            allowNextScan(after: 1.0)
            return
        }

        // Use a scan-style click (or bundled custom scanner sound) plus haptic.
        playScanFeedback()
        scannedCode = code
        onCodeScanned?(code)
        
        // IMPORTANT: Do NOT stop the session here. The sheet will stop it on dismiss.
    }
    
    /// Validate that scanned code is a supported barcode format (optional)
    private func isValidBarcodeFormat(_ code: String, type: AVMetadataObject.ObjectType) -> Bool {
        if type == .qr && !code.allSatisfy(\.isNumber) {
            return false
        }
        let validTypes: [AVMetadataObject.ObjectType] = [
            .ean8, .ean13, .upce, .code39, .code128, .itf14
        ]
        return validTypes.contains(type)
    }
}

// MARK: - SwiftUI Camera View

/// SwiftUI wrapper for camera preview
struct CameraPreviewView: UIViewRepresentable {
    let scanner: BarcodeScannerService
    
    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.backgroundColor = .black

        if let previewLayer = scanner.makePreviewLayer() {
            previewLayer.frame = view.bounds
            view.layer.addSublayer(previewLayer)
        }
        
        return view
    }
    
    func updateUIView(_ uiView: UIView, context: Context) {
        DispatchQueue.main.async {
            // Attach preview layer lazily if the session became available after makeUIView.
            if scanner.previewLayer == nil, let previewLayer = scanner.makePreviewLayer() {
                previewLayer.frame = uiView.bounds
                uiView.layer.addSublayer(previewLayer)
            } else if let previewLayer = scanner.previewLayer {
                previewLayer.frame = uiView.bounds
            }
        }
    }
}
