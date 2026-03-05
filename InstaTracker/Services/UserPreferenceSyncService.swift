import Foundation
#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif
#if canImport(FirebaseCore)
import FirebaseCore
#endif

final class UserPreferenceSyncService {
    static let shared = UserPreferenceSyncService()
    private var hydratedUserIDs: Set<String> = []

    private init() {}

    private var firestoreEnabled: Bool {
#if canImport(FirebaseFirestore) && canImport(FirebaseCore)
        return FirebaseApp.app() != nil
#else
        return false
#endif
    }

    func syncAppearancePreference(settings: AppSettings, user: SessionUser?) {
        guard let user, !user.id.isEmpty else { return }
#if canImport(FirebaseFirestore)
        guard firestoreEnabled else { return }

        let payload: [String: Any] = [
            "preferences": [
                "appearanceMode": normalizedAppearanceMode(settings.preferredColorScheme),
                "accentColor": accentHex(for: settings.colorScheme),
                "homeSectionOrder": settings.homeSectionOrder.map(\.rawValue),
                "primaryQuickAction": settings.primaryQuickAction.rawValue,
                "insightCardOrder": settings.insightCardOrder.map(\.rawValue),
                "enabledInsightCards": Array(settings.enabledInsightCards.map(\.rawValue)),
                "updatedFrom": "ios"
            ],
            "updatedAt": Timestamp(date: Date())
        ]

        Firestore.firestore()
            .collection("users")
            .document(user.id)
            .setData(payload, merge: true)
#endif
    }

    func hydratePreferencesIfNeeded(settings: AppSettings, user: SessionUser?) async {
        guard let user, !user.id.isEmpty else { return }
        if hydratedUserIDs.contains(user.id) { return }
#if canImport(FirebaseFirestore)
        guard firestoreEnabled else {
            hydratedUserIDs.insert(user.id)
            return
        }
        do {
            let snapshot = try await Firestore.firestore()
                .collection("users")
                .document(user.id)
                .getDocument()
            guard let data = snapshot.data(),
                  let preferences = data["preferences"] as? [String: Any] else {
                hydratedUserIDs.insert(user.id)
                return
            }

            if let appearanceRaw = preferences["appearanceMode"] as? String {
                settings.preferredColorScheme = normalizedAppearanceMode(appearanceRaw)
            }

            if let accentHex = preferences["accentColor"] as? String {
                settings.colorScheme = appColorSchemeRaw(from: accentHex)
            }

            if let homeSectionNames = preferences["homeSectionOrder"] as? [String] {
                let decoded = homeSectionNames.compactMap(HomeSection.init(rawValue:))
                if !decoded.isEmpty {
                    settings.homeSectionOrder = decoded
                }
            }

            if let quickActionRaw = preferences["primaryQuickAction"] as? String,
               let quickAction = HomeSection(rawValue: quickActionRaw) {
                settings.primaryQuickAction = quickAction
            }

            if let insightCardOrderRaw = preferences["insightCardOrder"] as? [String] {
                let decoded = insightCardOrderRaw.compactMap(InsightCardKind.init(rawValue:))
                if !decoded.isEmpty {
                    settings.insightCardOrder = decoded
                }
            }

            if let enabledInsightCardsRaw = preferences["enabledInsightCards"] as? [String] {
                let decoded = Set(enabledInsightCardsRaw.compactMap(InsightCardKind.init(rawValue:)))
                if !decoded.isEmpty {
                    settings.enabledInsightCards = decoded
                }
            }
        } catch {
            // Keep local values if remote preference read fails.
        }
#endif
        hydratedUserIDs.insert(user.id)
    }

    func resetHydration(for userId: String?) {
        guard let userId, !userId.isEmpty else { return }
        hydratedUserIDs.remove(userId)
    }

    private func normalizedAppearanceMode(_ raw: String) -> String {
        switch raw.lowercased() {
        case "light": return "light"
        case "dark": return "dark"
        default: return "dark"
        }
    }

    private func accentHex(for rawScheme: String) -> String {
        switch AppColorScheme(rawValue: rawScheme) ?? .blue {
        case .blue: return "#4f9cff"
        case .purple: return "#7f6bff"
        case .green: return "#31d0aa"
        case .orange: return "#ff9f43"
        case .red: return "#ff6b6b"
        case .pink: return "#ff6fb5"
        case .teal: return "#2ec4c7"
        case .indigo: return "#4c65d8"
        }
    }

    private func appColorSchemeRaw(from rawHex: String) -> String {
        let normalized = rawHex.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let map: [String: AppColorScheme] = [
            "#4f9cff": .blue,
            "#7f6bff": .purple,
            "#31d0aa": .green,
            "#ff9f43": .orange,
            "#ff6b6b": .red,
            "#ff6fb5": .pink,
            "#2ec4c7": .teal,
            "#4c65d8": .indigo
        ]
        return (map[normalized] ?? .blue).rawValue
    }
}
