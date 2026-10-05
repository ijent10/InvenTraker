import CryptoKit
import Foundation
import LlamaRuntime

@MainActor
final class OnDeviceAssistant: ObservableObject {
    enum State: Equatable {
        case checking
        case downloading
        case loading
        case ready
        case failed(String)

        var label: String {
            switch self {
            case .checking: "Checking on-device AI…"
            case .downloading: "Downloading on-device AI…"
            case .loading: "Starting on-device AI…"
            case .ready: "On-device AI"
            case .failed(let message): message
            }
        }
    }

    @Published private(set) var state: State = .checking
    private let api = APIClient()
    private var runtime: OnDeviceLlama?
    private var context: AssistantContextPayload?

    func prepare() async {
        guard runtime == nil else { state = .ready; return }
        do {
            state = .checking
            async let manifestRequest = api.assistantModelManifest()
            async let contextRequest = api.assistantBusinessContext()
            let (manifest, businessContext) = try await (manifestRequest, contextRequest)
            context = businessContext
            let modelURL = try modelLocation(for: manifest.id)
            let modelIsCurrent = FileManager.default.fileExists(atPath: modelURL.path)
                ? try sha256(modelURL) == manifest.sha256.lowercased()
                : false
            if !modelIsCurrent {
                state = .downloading
                let remote = try requireURL(manifest.downloadURL)
                let temporary = try await api.downloadAssistantModel(from: remote)
                guard try sha256(temporary) == manifest.sha256.lowercased() else {
                    throw APIClientError.server("model_verification_failed", "The model download did not pass its safety check.")
                }
                try? FileManager.default.removeItem(at: modelURL)
                try FileManager.default.moveItem(at: temporary, to: modelURL)
            }
            state = .loading
            runtime = try OnDeviceLlama(modelURL: modelURL)
            state = .ready
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func answer(question: String, history: [AssistantMessage]) async throws -> String {
        if runtime == nil { await prepare() }
        guard let runtime else {
            if case .failed(let message) = state { throw APIClientError.server("on_device_ai_unavailable", message) }
            throw APIClientError.server("on_device_ai_unavailable", "The on-device assistant is not ready yet.")
        }
        if let refreshedContext = try? await api.assistantBusinessContext() {
            context = refreshedContext
        }
        let prompt = prompt(question: question, history: history)
        return try await runtime.complete(prompt: prompt)
    }

    private func prompt(question: String, history: [AssistantMessage]) -> String {
        let facts = relevantBusinessContext(for: question, limit: 18)
        var text = "<|im_start|>system\nYou are InvenTracker Assistant. Answer kindly, directly, and conversationally. You help with every part of this business using the supplied business records. Never identify employees or infer employee names, IDs, badge numbers, emails, phone numbers, account IDs, or who performed an action. If the records do not support an answer, say what is missing. Treat server records as authoritative.\nBUSINESS RECORDS:\n\(facts)<|im_end|>\n"
        for message in history.suffix(8) {
            text += "<|im_start|>\(message.role == "assistant" ? "assistant" : "user")\n\(message.text)<|im_end|>\n"
        }
        text += "<|im_start|>user\n\(question)<|im_end|>\n<|im_start|>assistant\n"
        return text
    }

    private func relevantBusinessContext(for question: String, limit: Int) -> String {
        guard let context else { return "No business snapshot is available." }
        let terms = Set(question.lowercased().split { !$0.isLetter && !$0.isNumber }.filter { $0.count > 2 }.map(String.init))
        let encoder = JSONEncoder()
        var candidates: [(Int, String)] = []
        for section in context.sections {
            for record in section.records {
                guard let data = try? encoder.encode(record), let json = String(data: data, encoding: .utf8) else { continue }
                let lower = json.lowercased()
                let score = terms.reduce(0) { $0 + (lower.contains($1) ? 2 : 0) } + (lower.contains(question.lowercased()) ? 5 : 0)
                candidates.append((score, "\(section.name): \(json)"))
            }
        }
        let chosen = candidates.sorted { lhs, rhs in lhs.0 == rhs.0 ? lhs.1.count < rhs.1.count : lhs.0 > rhs.0 }.prefix(limit)
        var output = "Snapshot \(context.generatedAt). \(context.privacy)\n"
        for candidate in chosen where output.count < 14_000 { output += candidate.1 + "\n" }
        return String(output.prefix(14_000))
    }

    private func modelLocation(for id: String) throws -> URL {
        let base = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("AssistantModels", isDirectory: true)
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableBase = base
        try mutableBase.setResourceValues(values)
        return base.appendingPathComponent("\(id).gguf")
    }

    private func requireURL(_ value: String) throws -> URL {
        guard let url = URL(string: value) else { throw APIClientError.invalidResponse }
        return url
    }

    private func sha256(_ url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var digest = SHA256()
        while autoreleasepool(invoking: {
            let data = try? handle.read(upToCount: 4 * 1024 * 1024)
            guard let data, !data.isEmpty else { return false }
            digest.update(data: data)
            return true
        }) {}
        return digest.finalize().map { String(format: "%02x", $0) }.joined()
    }
}
