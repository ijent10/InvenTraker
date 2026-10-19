import Foundation

enum WorkspaceDevice: String, Codable, CaseIterable { case phone, tablet, desktop
    var columns: Int { self == .phone ? 4 : self == .tablet ? 8 : 12 }
}
enum WorkspaceSize: String, Codable, CaseIterable { case small, medium, large; case extraLarge = "extra-large"
    var title: String { rawValue.replacingOccurrences(of: "-", with: " ").capitalized }
    func footprint(_ device: WorkspaceDevice) -> (width: Int, height: Int) {
        let width = device == .phone ? (self == .small ? 2 : 4) : (self == .small ? device.columns / 4 : self == .extraLarge ? device.columns : device.columns / 2)
        return (width, device == .phone && self == .extraLarge ? 6 : self == .small || self == .medium ? 2 : 4)
    }
}
enum WorkspaceShape: String, Codable, CaseIterable { case circle, square; case roundedSquare = "rounded-square"
    var title: String { rawValue.replacingOccurrences(of: "-", with: " ").capitalized }
}
enum WorkspaceContentMode: String, Codable, CaseIterable { case automatic, pinned, fixed }
struct WorkspaceWidget: Identifiable, Codable, Equatable {
    var id: String
    var engineId: String
    var widgetDefinitionId: String
    var gridX: Int
    var gridY: Int
    var gridWidth: Int
    var gridHeight: Int
    var size: WorkspaceSize
    var shapeOverride: WorkspaceShape?
    var pinnedContentId: String?
    var mode: WorkspaceContentMode
    var preferences: [String: JSONValue]
}
struct WorkspaceLayout: Codable, Equatable {
    var id: String
    var userId: String
    var organizationId: String
    var deviceClass: WorkspaceDevice
    var revision: Int
    var shapePreference: WorkspaceShape
    var widgets: [WorkspaceWidget]
    var updatedAt: String
}
struct NativeWidgetDefinition: Identifiable, Decodable {
    let id: String
    let engineId: String
    let title: String
    let description: String
    let supportedSizes: [WorkspaceSize]
    let supportedShapes: [WorkspaceShape]
    let dataSource: String
    let href: String
}
struct WorkspaceCatalogResponse: Decodable {
    let schemaVersion: String
    let definitions: [NativeWidgetDefinition]
    let seedLayout: WorkspaceLayout
    let defaultLayout: WorkspaceLayout
    let unresolvedIds: [String]
}
struct WorkspaceLayoutResponse: Decodable { let layout: WorkspaceLayout? }
struct WorkspaceLayoutUpdate: Encodable { let expectedRevision: Int; let layout: WorkspaceLayout }
struct WorkspaceLayoutCommit: Decodable { let status: String; let layout: WorkspaceLayout?; let current: WorkspaceLayout? }
struct NativeWidgetCandidate: Identifiable, Codable {
    struct Factors: Codable { let urgency: Double; let operationalImpact: Double; let userRelevance: Double; let actionability: Double; let recency: Double }
    let id: String
    let engineId: String
    let title: String
    let summary: String
    let severity: String
    let expiration: String?
    let supportedSizes: [WorkspaceSize]
    let factors: Factors
    var score: Double { factors.urgency * 0.3 + factors.operationalImpact * 0.25 + factors.userRelevance * 0.2 + factors.actionability * 0.15 + factors.recency * 0.1 }
}
struct NativeWidgetSummary: Decodable {
    let state: String
    let value: String
    let detail: String
    let partial: Bool?
    let candidates: [NativeWidgetCandidate]
}
struct NativeWorkspaceData: Decodable {
    let storeId: String
    let generatedAt: String
    let stockRevision: Int?
    let widgets: [String: NativeWidgetSummary]
}
struct NativeWorkspaceInvalidation: Decodable { let stockRevision: Int }
struct NativeWorkspaceDraft: Codable { let layout: WorkspaceLayout; let expectedRevision: Int }

enum WorkspaceGeometry {
    static func overlaps(_ a: WorkspaceWidget, _ b: WorkspaceWidget) -> Bool {
        a.gridX < b.gridX + b.gridWidth && a.gridX + a.gridWidth > b.gridX && a.gridY < b.gridY + b.gridHeight && a.gridY + a.gridHeight > b.gridY
    }
    static func pack(_ widgets: [WorkspaceWidget], device: WorkspaceDevice, active: String? = nil) -> [WorkspaceWidget] {
        let ordered = active.map { id in widgets.filter { $0.id == id } + widgets.filter { $0.id != id } } ?? widgets
        var placed: [WorkspaceWidget] = []
        for var widget in ordered {
            let footprint = widget.size.footprint(device)
            widget.gridWidth = footprint.width; widget.gridHeight = footprint.height
            widget.gridX = max(0, min(device.columns - widget.gridWidth, widget.gridX)); widget.gridY = max(0, widget.gridY)
            if placed.contains(where: { overlaps(widget, $0) }) {
                let lastRow = placed.reduce(widget.gridY) { max($0, $1.gridY + $1.gridHeight) }
                search: for y in widget.gridY...lastRow {
                    for x in 0...(device.columns - widget.gridWidth) {
                        widget.gridX = x; widget.gridY = y
                        if !placed.contains(where: { overlaps(widget, $0) }) { break search }
                    }
                }
            }
            placed.append(widget)
        }
        return widgets.compactMap { item in placed.first { $0.id == item.id } }
    }
    static func compact(_ widgets: [WorkspaceWidget], device: WorkspaceDevice) -> [WorkspaceWidget] {
        let ordered = widgets.sorted { $0.gridY == $1.gridY ? $0.gridX < $1.gridX : $0.gridY < $1.gridY }.map { item in var item = item; item.gridY = 0; return item }
        let packed = pack(ordered, device: device)
        return widgets.compactMap { item in packed.first { $0.id == item.id } }
    }
    static func snap(width: Double, height: Double, supported: [WorkspaceSize], device: WorkspaceDevice) -> WorkspaceSize {
        let sizes = WorkspaceSize.allCases.filter { supported.contains($0) }
        var best = sizes.first ?? .medium
        for size in sizes.dropFirst() {
            let a = best.footprint(device), b = size.footprint(device)
            let distance: ((width: Int, height: Int)) -> Double = { f in ((pow(Double(f.width) - width, 2) + pow(Double(f.height) - height, 2)) * 1e9).rounded() }
            if distance(b) < distance(a) { best = size }
        }
        return best
    }
    static func valid(_ layout: WorkspaceLayout) -> Bool {
        guard layout.revision > 0, layout.widgets.count <= 60, Set(layout.widgets.map(\.id)).count == layout.widgets.count else { return false }
        // Validate every rectangle before overlap arithmetic, including corrupted local drafts.
        for item in layout.widgets {
            let f = item.size.footprint(layout.deviceClass)
            guard item.gridX >= 0, item.gridX <= layout.deviceClass.columns, item.gridY >= 0, item.gridY <= 1000, item.gridWidth == f.width, item.gridHeight == f.height, item.gridX + f.width <= layout.deviceClass.columns else { return false }
        }
        for (index, item) in layout.widgets.enumerated() {
            if layout.widgets.dropFirst(index + 1).contains(where: { overlaps(item, $0) }) { return false }
        }
        return true
    }
    static func candidates(_ values: [NativeWidgetCandidate], widget: WorkspaceWidget, now: Date = Date()) -> [NativeWidgetCandidate] {
        guard widget.mode != .fixed else { return [] }
        let eligible = values.filter { candidate in candidate.engineId == widget.engineId && candidate.supportedSizes.contains(widget.size) && (candidate.expiration == nil || (workspaceDate(candidate.expiration!) ?? .distantPast) > now) }.sorted {
            if ($0.severity == "critical") != ($1.severity == "critical") { return $0.severity == "critical" }
            return $0.score == $1.score ? $0.id < $1.id : $0.score > $1.score
        }
        if widget.mode == .pinned { return eligible.filter { $0.id == widget.pinnedContentId } }
        return Array(eligible.prefix(widget.size == .extraLarge ? 4 : widget.size == .large ? 2 : 1))
    }
}
func workspaceDate(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
}
