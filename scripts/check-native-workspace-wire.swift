import Foundation
private struct LiveWorkspaceWire: Decodable { let catalog: WorkspaceCatalogResponse; let facts: NativeWorkspaceData }
@main struct CheckNativeWorkspaceWire {
    static func main() throws {
        let wire = try JSONDecoder().decode(LiveWorkspaceWire.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
        precondition(wire.catalog.schemaVersion == "1")
        precondition(WorkspaceGeometry.valid(wire.catalog.seedLayout) && WorkspaceGeometry.valid(wire.catalog.defaultLayout))
        precondition(Set(wire.catalog.definitions.map(\.id)).count == wire.catalog.definitions.count)
        precondition(wire.catalog.definitions.allSatisfy { !$0.supportedSizes.isEmpty && !$0.supportedShapes.isEmpty && $0.href.hasPrefix("/") && !$0.href.hasPrefix("//") })
        precondition(workspaceDate(wire.facts.generatedAt) != nil)
        for summary in wire.facts.widgets.values {
            for candidate in summary.candidates { precondition(candidate.score.isFinite) }
        }
        print("Actual native models decoded the live catalog, device seeds, widget summaries and candidates successfully.")
    }
}
