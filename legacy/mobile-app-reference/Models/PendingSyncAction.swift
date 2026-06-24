import Foundation
import SwiftData

enum SyncActionStatus: String, Codable {
    case pending
    case synced
    case conflict
    case failed
}

@Model
final class PendingSyncAction {
    var id: UUID
    var organizationId: String
    var actionTypeRaw: String
    var payloadData: Data
    var refsData: Data
    var actorUid: String
    var actorRoleRaw: String
    var baseRevision: Int?
    var createdAt: Date
    var statusRaw: String
    var retryCount: Int
    var lastError: String?

    init(
        id: UUID = UUID(),
        organizationId: String,
        actionType: AuditActionType,
        payloadData: Data,
        refsData: Data,
        actorUid: String,
        actorRole: UserRole,
        baseRevision: Int?,
        createdAt: Date = Date(),
        status: SyncActionStatus = .pending,
        retryCount: Int = 0,
        lastError: String? = nil
    ) {
        self.id = id
        self.organizationId = organizationId
        self.actionTypeRaw = actionType.rawValue
        self.payloadData = payloadData
        self.refsData = refsData
        self.actorUid = actorUid
        self.actorRoleRaw = actorRole.rawValue
        self.baseRevision = baseRevision
        self.createdAt = createdAt
        self.statusRaw = status.rawValue
        self.retryCount = retryCount
        self.lastError = lastError
    }

    var actionType: AuditActionType {
        AuditActionType(rawValue: actionTypeRaw) ?? .migrationImport
    }

    var actorRole: UserRole {
        UserRole.fromBackend(actorRoleRaw)
    }

    var status: SyncActionStatus {
        get { SyncActionStatus(rawValue: statusRaw) ?? .pending }
        set { statusRaw = newValue.rawValue }
    }
}
