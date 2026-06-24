import Foundation
#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif
#if canImport(FirebaseCore)
import FirebaseCore
#endif

protocol AuditLogging {
    func log(_ record: AuditActionRecord) async throws
}

enum AuditLoggerError: LocalizedError {
    case invalidRecord

    var errorDescription: String? {
        switch self {
        case .invalidRecord:
            return "Could not encode audit record."
        }
    }
}

@MainActor
final class AuditLogger: AuditLogging {
    static let shared = AuditLogger()

    private let fallbackKeyPrefix = "audit_records_"

    private init() {}

    private var firestoreEnabled: Bool {
#if canImport(FirebaseFirestore) && canImport(FirebaseCore)
        return FirebaseApp.app() != nil
#else
        return false
#endif
    }

    func log(_ record: AuditActionRecord) async throws {
#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let db = Firestore.firestore()
            try db.collection("organizations")
                .document(record.objectRefs.organizationId)
                .collection("actions")
                .document(record.id)
                .setData(from: record)
            return
        }
#endif
        let key = "\(fallbackKeyPrefix)\(record.objectRefs.organizationId)"
        var existing = loadRecords(for: record.objectRefs.organizationId)
        existing.append(record)
        guard let data = try? JSONEncoder().encode(existing) else {
            throw AuditLoggerError.invalidRecord
        }
        UserDefaults.standard.set(data, forKey: key)
    }

    func recentRecords(organizationId: String, limit: Int = 100) -> [AuditActionRecord] {
        let records = loadRecords(for: organizationId).sorted { $0.createdAt > $1.createdAt }
        return Array(records.prefix(max(limit, 1)))
    }

    private func loadRecords(for organizationId: String) -> [AuditActionRecord] {
        let key = "\(fallbackKeyPrefix)\(organizationId)"
        guard
            let data = UserDefaults.standard.data(forKey: key),
            let decoded = try? JSONDecoder().decode([AuditActionRecord].self, from: data)
        else {
            return []
        }
        return decoded
    }
}
