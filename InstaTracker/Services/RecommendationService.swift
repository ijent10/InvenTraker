import Foundation

enum RecommendationDomainDTO: String, Codable {
    case orders
    case production
}

struct RecommendationMetaDTO: Decodable {
    let runId: String
    let engineVersion: String
    let schemaVersion: String
    let generatedAt: String
    let domains: [String]
    let rulePathUsed: String
    let sourceRefs: [String]
    let degraded: Bool
    let fallbackUsed: Bool
    let fallbackReason: String?
    let fallbackSource: String?
    let fallbackTrigger: String?
    let inputHash: String
}

struct DemandPredictionDTO: Decodable {
    let value: Double
    let unit: String
    let horizonHours: Int
}

struct WasteRiskPredictionDTO: Decodable {
    let probability: Double
    let expectedLossValue: Double
}

struct RecommendationDriverDTO: Decodable {
    let key: String
    let label: String
    let value: String?
    let impact: Double
    let direction: String
}

struct OrderRecommendationDTO: Decodable {
    let itemId: String
    let itemName: String?
    let unit: String
    let qtyPerCase: Double
    let caseInterpretation: String
    let recommendedQuantity: Double
    let onHand: Double
    let minQuantity: Double
    let predictedDemand: DemandPredictionDTO
    let predictedWasteRisk: WasteRiskPredictionDTO
    let confidence: Double
    let topContributingFactors: [RecommendationDriverDTO]
    let rationaleSummary: String
    let degraded: Bool
    let fallbackUsed: Bool
    let fallbackReason: String?
    let questions: [String]
}

struct ProductionRecommendationDTO: Decodable {
    let productId: String
    let productName: String
    let outputUnitRaw: String
    let recommendedMakeQuantity: Double
    let expectedUsageToday: Double
    let onHandQuantity: Double
    let predictedDemand: DemandPredictionDTO
    let predictedWasteRisk: WasteRiskPredictionDTO
    let confidence: Double
    let topContributingFactors: [RecommendationDriverDTO]
    let rationaleSummary: String
    let degraded: Bool
    let fallbackUsed: Bool
    let fallbackReason: String?
    let questions: [String]
}

struct StoreRecommendationsResponseDTO: Decodable {
    let meta: RecommendationMetaDTO
    let orderRecommendations: [OrderRecommendationDTO]
    let productionRecommendations: [ProductionRecommendationDTO]
    let productionPlan: ProductionPlanDTO
    let questions: [String]
}

struct ProductionPlanDTO: Decodable {
    let ingredientDemandRows: [IngredientDemandRowDTO]
    let frozenPullForecastRows: [FrozenPullForecastRowDTO]
    let factors: ProductionPullFactorSummaryDTO
}

struct IngredientDemandRowDTO: Decodable {
    let itemId: String
    let itemName: String
    let unitRaw: String
    let requiredQuantity: Double
}

struct FrozenPullForecastRowDTO: Decodable {
    let itemId: String
    let itemName: String
    let unitRaw: String
    let requiredQuantity: Double
    let recommendedPullQuantity: Double
    let onHandQuantity: Double
    let rationale: String
}

struct ProductionPullFactorSummaryDTO: Decodable {
    let businessFactor: Double
    let weatherFactor: Double
    let holidayFactor: Double
    let trendFactor: Double
    let holidayName: String?
}

struct CommitOrderRecommendationsResponseDTO: Decodable {
    let orderId: String
    let lineCount: Int
    let todosCreated: Int
    let runId: String
    let engineVersion: String
    let appliedFromRun: Bool?
}

struct CommitSelectedOrderLineDTO {
    let itemId: String
    let finalQuantity: Double
    let unit: String?
    let rationaleSummary: String?

    func asDictionary() -> [String: Any] {
        var output: [String: Any] = [
            "itemId": itemId,
            "finalQuantity": finalQuantity
        ]
        if let unit {
            output["unit"] = unit
        }
        if let rationaleSummary {
            output["rationaleSummary"] = rationaleSummary
        }
        return output
    }
}

final class RecommendationService {
    static let shared = RecommendationService()

    private let client = CallableClientService.shared

    private init() {}

    func fetchStoreRecommendations(
        orgId: String,
        storeId: String,
        vendorId: String?,
        domains: [RecommendationDomainDTO],
        forceRefresh: Bool,
        productionPlanBusinessFactor: Double? = nil,
        includeNonFrozenPull: Bool? = nil
    ) async throws -> StoreRecommendationsResponseDTO {
        var payload: [String: Any] = [
            "orgId": orgId,
            "storeId": storeId,
            "domains": domains.map(\.rawValue),
            "forceRefresh": forceRefresh
        ]
        if productionPlanBusinessFactor != nil || includeNonFrozenPull != nil {
            var options: [String: Any] = [:]
            if let productionPlanBusinessFactor {
                options["businessFactor"] = productionPlanBusinessFactor
            }
            if let includeNonFrozenPull {
                options["includeNonFrozen"] = includeNonFrozenPull
            }
            payload["productionPlanOptions"] = options
        }
        if let vendorId, !vendorId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["vendorId"] = vendorId
        }

        let response: StoreRecommendationsResponseDTO = try await client.call(
            name: "getStoreRecommendations",
            data: payload
        )
        return response
    }

    func commitOrderRecommendations(
        orgId: String,
        storeId: String,
        vendorId: String?,
        runId: String,
        selectedLines: [CommitSelectedOrderLineDTO]
    ) async throws -> CommitOrderRecommendationsResponseDTO {
        var payload: [String: Any] = [
            "orgId": orgId,
            "storeId": storeId,
            "runId": runId,
            "selectedLines": selectedLines.map { $0.asDictionary() }
        ]
        if let vendorId, !vendorId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["vendorId"] = vendorId
        }

        let response: CommitOrderRecommendationsResponseDTO = try await client.call(
            name: "commitOrderRecommendations",
            data: payload
        )
        return response
    }
}
