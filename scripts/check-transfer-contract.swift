import Foundation

@main
struct CheckTransferContract {
    struct Fixture: Decodable {
        let response: EngineResult<TransferResult>
        let mobileResponse: APIEnvelope<TransferResult>
    }
    struct CountResult: Decodable { let updated: [InventoryItem]; let historyId: String }
    struct CountFixture: Decodable { let response: EngineResult<CountResult>; let mobileResponse: APIEnvelope<CountResult> }
    struct ReceiptResult: Decodable { let receivedIds: [String] }
    struct ReceiptFixture: Decodable { let response: EngineResult<ReceiptResult>; let mobileResponse: APIEnvelope<ReceiptResult> }
    struct RestockFixture: Decodable { let response: EngineResult<RestockResult>; let mobileResponse: APIEnvelope<RestockResult> }
    struct DiscardResult: Decodable { let wasteIds: [String]; let humanOverrideCount: Int }
    struct DiscardFixture: Decodable { let response: EngineResult<DiscardResult>; let mobileResponse: APIEnvelope<DiscardResult> }
    struct PortionFixture: Decodable { let response: EngineResult<PortionResult>; let mobileResponse: APIEnvelope<PortionResult> }
    static func main() throws {
        let path = CommandLine.arguments.dropFirst().first ?? "fixtures/engine-contracts/transfer-v1.json"
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: path)))
        precondition(fixture.response.schemaVersion == "1")
        precondition(fixture.response.data.itemId == fixture.mobileResponse.data.itemId)
        precondition(fixture.response.data.onHand == fixture.mobileResponse.data.onHand)
        precondition(fixture.response.data.frontStock + fixture.response.data.backStock == fixture.response.data.onHand)
        let countData = try Data(contentsOf: URL(fileURLWithPath: "fixtures/engine-contracts/spot-check-v1.json"))
        let count = try JSONDecoder().decode(CountFixture.self, from: countData)
        precondition(count.response.data.updated[0].id == count.mobileResponse.data.updated[0].id)
        precondition(count.response.data.updated[0].onHand == 12)
        let receipt = try JSONDecoder().decode(ReceiptFixture.self, from: Data(contentsOf: URL(fileURLWithPath: "fixtures/engine-contracts/receiving-v1.json")))
        precondition(receipt.response.data.receivedIds == receipt.mobileResponse.data.receivedIds)
        let encoded = try JSONEncoder().encode(ReceivingLine(itemId: "cheese", quantity: 1, expirationDate: nil))
        let payload = try JSONSerialization.jsonObject(with: encoded) as! [String: Any]
        precondition(payload["itemId"] as? String == "cheese")
        let restock = try JSONDecoder().decode(RestockFixture.self, from: Data(contentsOf: URL(fileURLWithPath: "fixtures/engine-contracts/restock-v1.json")))
        precondition(restock.response.data.recommendations[0].pullQuantity == restock.mobileResponse.data.recommendations[0].pullQuantity)
        precondition(restock.response.data.recommendations[0].expectedRevision == 3)
        let restockLine = try JSONSerialization.jsonObject(with: JSONEncoder().encode(RestockLine(itemId: "cheese", countedFrontStock: 2, expectedRevision: 3))) as! [String: Any]
        precondition(restockLine["expectedRevision"] as? Int == 3)
        let discard = try JSONDecoder().decode(DiscardFixture.self, from: Data(contentsOf: URL(fileURLWithPath: "fixtures/engine-contracts/discard-v1.json")))
        precondition(discard.response.data.wasteIds == discard.mobileResponse.data.wasteIds)
        let wasteLine = try JSONSerialization.jsonObject(with: JSONEncoder().encode(WasteLine(itemId: "cheese", quantity: 1.25, area: "front", reason: "Damaged", batchId: nil))) as! [String: Any]
        precondition(wasteLine["quantity"] as? Double == 1.25)
        let portion = try JSONDecoder().decode(PortionFixture.self, from: Data(contentsOf: URL(fileURLWithPath: "fixtures/engine-contracts/portion-v1.json")))
        precondition(portion.response.data.portionIds == portion.mobileResponse.data.portionIds)
        precondition(portion.response.data.totalWeight == 3)
        let portionRequest = try JSONSerialization.jsonObject(with: JSONEncoder().encode(PortionRequest(itemId: "cheese", sourceArea: "back", sourceBatchId: nil, portionWeight: 0.75, portionCount: 4, expirationDate: nil, packageBarcodePrefix: nil))) as! [String: Any]
        precondition(portionRequest["portionWeight"] as? Double == 0.75)
        print("Swift transfer, count, receiving, restock, discard and portion fixtures passed using the app's actual models.")
    }
}
