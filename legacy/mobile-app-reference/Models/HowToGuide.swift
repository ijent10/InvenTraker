import Foundation
import SwiftData

@Model
final class HowToGuide {
    var id: UUID
    var title: String
    var keywords: [String]
    var steps: [String]
    var notes: String
    var isActive: Bool
    var organizationId: String = "local-default"
    var backendId: String?
    var revision: Int = 0
    var updatedByUid: String?
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        title: String,
        keywords: [String] = [],
        steps: [String] = [],
        notes: String = "",
        isActive: Bool = true,
        organizationId: String = "local-default",
        backendId: String? = nil
    ) {
        self.id = UUID()
        self.title = title
        self.keywords = keywords
        self.steps = steps
        self.notes = notes
        self.isActive = isActive
        self.organizationId = organizationId
        self.backendId = backendId
        self.revision = 0
        self.updatedByUid = nil
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    var searchableBlob: String {
        [
            title,
            keywords.joined(separator: " "),
            steps.joined(separator: " "),
            notes
        ]
        .joined(separator: " ")
        .lowercased()
    }
}
