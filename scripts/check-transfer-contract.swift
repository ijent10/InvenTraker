import Foundation

@main
struct CheckTransferContract {
    struct Fixture: Decodable {
        let response: EngineResult<TransferResult>
        let mobileResponse: APIEnvelope<TransferResult>
    }
    static func main() throws {
        let path = CommandLine.arguments.dropFirst().first ?? "fixtures/engine-contracts/transfer-v1.json"
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: path)))
        precondition(fixture.response.schemaVersion == "1")
        precondition(fixture.response.data.itemId == fixture.mobileResponse.data.itemId)
        precondition(fixture.response.data.onHand == fixture.mobileResponse.data.onHand)
        precondition(fixture.response.data.frontStock + fixture.response.data.backStock == fixture.response.data.onHand)
        print("Swift transfer contracts decoded both API versions using the app's actual models.")
    }
}
