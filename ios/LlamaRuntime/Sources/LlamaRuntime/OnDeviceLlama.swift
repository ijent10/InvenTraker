import Foundation
import llama

public enum OnDeviceLlamaError: LocalizedError {
    case modelLoadFailed
    case contextCreationFailed
    case promptTooLong
    case decodeFailed

    public var errorDescription: String? {
        switch self {
        case .modelLoadFailed: "The on-device model could not be loaded."
        case .contextCreationFailed: "The on-device model could not start."
        case .promptTooLong: "This conversation is too long for the on-device model. Start a new chat or ask a shorter question."
        case .decodeFailed: "The on-device model stopped while forming its answer."
        }
    }
}

private func clearBatch(_ batch: inout llama_batch) { batch.n_tokens = 0 }
private func addToken(_ batch: inout llama_batch, token: llama_token, position: llama_pos, logits: Bool) {
    let index = Int(batch.n_tokens)
    batch.token[index] = token
    batch.pos[index] = position
    batch.n_seq_id[index] = 1
    batch.seq_id[index]![0] = 0
    batch.logits[index] = logits ? 1 : 0
    batch.n_tokens += 1
}

public actor OnDeviceLlama {
    private let model: OpaquePointer
    private let context: OpaquePointer
    private let vocab: OpaquePointer
    private let sampler: UnsafeMutablePointer<llama_sampler>
    private var batch: llama_batch

    public init(modelURL: URL, contextSize: UInt32 = 4096) throws {
        llama_backend_init()
        var modelParameters = llama_model_default_params()
        #if targetEnvironment(simulator)
        modelParameters.n_gpu_layers = 0
        #else
        modelParameters.n_gpu_layers = 99
        #endif
        guard let model = llama_model_load_from_file(modelURL.path, modelParameters) else {
            llama_backend_free()
            throw OnDeviceLlamaError.modelLoadFailed
        }
        let threads = Int32(max(2, min(6, ProcessInfo.processInfo.processorCount - 2)))
        var contextParameters = llama_context_default_params()
        contextParameters.n_ctx = contextSize
        contextParameters.n_batch = min(contextSize, 1024)
        contextParameters.n_threads = threads
        contextParameters.n_threads_batch = threads
        guard let context = llama_init_from_model(model, contextParameters) else {
            llama_model_free(model)
            llama_backend_free()
            throw OnDeviceLlamaError.contextCreationFailed
        }
        self.model = model
        self.context = context
        self.vocab = llama_model_get_vocab(model)
        self.batch = llama_batch_init(Int32(contextParameters.n_batch), 0, 1)
        let chain = llama_sampler_chain_init(llama_sampler_chain_default_params())!
        llama_sampler_chain_add(chain, llama_sampler_init_temp(0.35))
        llama_sampler_chain_add(chain, llama_sampler_init_top_p(0.9, 1))
        llama_sampler_chain_add(chain, llama_sampler_init_dist(UInt32.random(in: 1...UInt32.max)))
        self.sampler = chain
    }

    deinit {
        llama_sampler_free(sampler)
        llama_batch_free(batch)
        llama_free(context)
        llama_model_free(model)
        llama_backend_free()
    }

    public func complete(prompt: String, maximumTokens: Int32 = 420) throws -> String {
        llama_memory_clear(llama_get_memory(context), true)
        llama_sampler_reset(sampler)
        let promptTokens = tokenize(prompt)
        guard !promptTokens.isEmpty, promptTokens.count + Int(maximumTokens) < Int(llama_n_ctx(context)) else {
            throw OnDeviceLlamaError.promptTooLong
        }

        clearBatch(&batch)
        for (index, token) in promptTokens.enumerated() {
            addToken(&batch, token: token, position: Int32(index), logits: index == promptTokens.count - 1)
        }
        guard llama_decode(context, batch) == 0 else { throw OnDeviceLlamaError.decodeFailed }

        var position = Int32(promptTokens.count)
        var answer = ""
        var pending: [CChar] = []
        for _ in 0..<maximumTokens {
            let token = llama_sampler_sample(sampler, context, batch.n_tokens - 1)
            if llama_vocab_is_eog(vocab, token) { break }
            pending.append(contentsOf: piece(token))
            if let fragment = String(validatingUTF8: pending + [0]) {
                answer += fragment
                pending.removeAll(keepingCapacity: true)
            }
            clearBatch(&batch)
            addToken(&batch, token: token, position: position, logits: true)
            guard llama_decode(context, batch) == 0 else { throw OnDeviceLlamaError.decodeFailed }
            position += 1
        }
        if !pending.isEmpty { answer += String(decoding: pending.map(UInt8.init(bitPattern:)), as: UTF8.self) }
        return answer.replacingOccurrences(of: "<think>", with: "")
            .replacingOccurrences(of: "</think>", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func tokenize(_ text: String) -> [llama_token] {
        let capacity = max(32, text.utf8.count + 8)
        let pointer = UnsafeMutablePointer<llama_token>.allocate(capacity: capacity)
        defer { pointer.deallocate() }
        let count = llama_tokenize(vocab, text, Int32(text.utf8.count), pointer, Int32(capacity), true, true)
        guard count > 0 else { return [] }
        return (0..<Int(count)).map { pointer[$0] }
    }

    private func piece(_ token: llama_token) -> [CChar] {
        var small = [CChar](repeating: 0, count: 16)
        let count = small.withUnsafeMutableBufferPointer {
            llama_token_to_piece(vocab, token, $0.baseAddress, Int32($0.count), 0, false)
        }
        if count >= 0 { return Array(small.prefix(Int(count))) }
        var large = [CChar](repeating: 0, count: Int(-count))
        let actual = large.withUnsafeMutableBufferPointer {
            llama_token_to_piece(vocab, token, $0.baseAddress, Int32($0.count), 0, false)
        }
        return Array(large.prefix(max(0, Int(actual))))
    }
}
