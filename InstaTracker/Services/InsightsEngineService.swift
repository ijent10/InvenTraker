import Foundation

struct BackendOverstockedItem: Decodable, Identifiable, Hashable {
    let itemId: String
    let itemName: String
    let onHand: Double
    let minQuantity: Double

    var id: String { itemId }
}

struct BackendFinancialHealthSnapshot: Decodable, Hashable {
    let inventoryValue: Double
    let wasteCostWeek: Double
    let wasteCostMonth: Double
    let expiringSoonValue: Double
    let overstocked: [BackendOverstockedItem]
    let summary: String?
    let riskAlerts: [String]?
    let recommendedActions: [String]?
    let questionsForManager: [String]?
    let ai: Bool?
}

final class InsightsEngineService {
    static let shared = InsightsEngineService()

    private init() {}

    func computeFinancialHealth(
        organizationId: String,
        storeId: String?,
        expiringDays: Int = 7
    ) async throws -> BackendFinancialHealthSnapshot {
        var payload: [String: Any] = [
            "orgId": organizationId,
            "expiringDays": expiringDays
        ]
        if let storeId, !storeId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["storeId"] = storeId
        }
        return try await CallableClientService.shared.call(
            name: "computeFinancialHealth",
            data: payload
        )
    }
}
