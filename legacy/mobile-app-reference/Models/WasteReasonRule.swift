import Foundation

struct WasteReasonRule: Codable, Identifiable, Hashable {
    var id: UUID
    var name: String
    var affectsOrders: Bool
    
    init(id: UUID = UUID(), name: String, affectsOrders: Bool) {
        self.id = id
        self.name = name
        self.affectsOrders = affectsOrders
    }
}

enum WasteReasonRuleStore {
    static let storageKey = "waste_reason_rules"
    static let legacyCustomReasonsKey = "custom_waste_reasons"
    
    static let defaultRules: [WasteReasonRule] = [
        WasteReasonRule(name: "Expired", affectsOrders: true),
        WasteReasonRule(name: "Moldy", affectsOrders: true),
        WasteReasonRule(name: "Temped Wrong", affectsOrders: false),
        WasteReasonRule(name: "Sampling", affectsOrders: false)
    ]
    
    static func load(from defaults: UserDefaults = .standard) -> [WasteReasonRule] {
        if let data = defaults.data(forKey: storageKey),
           let decoded = try? JSONDecoder().decode([WasteReasonRule].self, from: data) {
            return normalize(decoded)
        }
        
        var initial = defaultRules
        if let legacy = defaults.data(forKey: legacyCustomReasonsKey),
           let names = try? JSONDecoder().decode([String].self, from: legacy) {
            for name in names {
                let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }
                initial.append(WasteReasonRule(name: trimmed, affectsOrders: false))
            }
        }
        
        let normalized = normalize(initial)
        save(normalized, to: defaults)
        return normalized
    }
    
    static func save(_ rules: [WasteReasonRule], to defaults: UserDefaults = .standard) {
        let normalized = normalize(rules)
        guard let data = try? JSONEncoder().encode(normalized) else { return }
        defaults.set(data, forKey: storageKey)
    }
    
    static func affectsOrders(for reason: String, defaults: UserDefaults = .standard) -> Bool? {
        let key = reason.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !key.isEmpty else { return nil }
        return load(from: defaults).first(where: { $0.name.lowercased() == key })?.affectsOrders
    }
    
    static func normalize(_ rules: [WasteReasonRule]) -> [WasteReasonRule] {
        var seen = Set<String>()
        var cleaned: [WasteReasonRule] = []
        
        for value in rules {
            let trimmed = value.name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            let key = trimmed.lowercased()
            guard !seen.contains(key) else { continue }
            seen.insert(key)
            cleaned.append(WasteReasonRule(id: value.id, name: trimmed, affectsOrders: value.affectsOrders))
        }
        
        return cleaned
    }
}
