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
        print("Swift transfer, count and receiving fixtures passed with the app's actual models and receiving request.")
    }
}
