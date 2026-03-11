import Foundation
#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif
#if canImport(FirebaseCore)
import FirebaseCore
#endif

struct CatalogProductRecord: Identifiable, Codable, Hashable {
    var id: String { upc }
    var upc: String
    var title: String
    var tags: [String]
    var price: Double
    var casePack: Int
    var defaultExpiration: Int
    var defaultPackedExpiration: Int
    var vendorName: String?
    var department: String?
    var departmentLocation: String?
    var unitRaw: String
    var minimumQuantity: Double
    var isPrepackaged: Bool
    var rewrapsWithUniqueBarcode: Bool
    var canBeReworked: Bool
    var reworkShelfLifeDays: Int
    var maxReworkCount: Int
    var thumbnailBase64: String?
    var createdByUid: String
    var updatedByUid: String
    var editorOrganizationId: String
    var storeId: String
    var createdAt: Date
    var updatedAt: Date

    var thumbnailData: Data? {
        guard let thumbnailBase64 else { return nil }
        return Data(base64Encoded: thumbnailBase64)
    }
}

private struct GlobalCatalogDocument: Codable {
    var upc: String
    var title: String
    var thumbnailBase64: String?
    var editorOrganizationId: String
    var createdByUid: String
    var updatedByUid: String
    var createdAt: Date
    var updatedAt: Date
}

private struct CompanyCatalogDocument: Codable {
    var upc: String
    var tags: [String]
    var price: Double
    var casePack: Int
    var defaultExpiration: Int
    var defaultPackedExpiration: Int?
    var vendorName: String?
    var department: String?
    var departmentLocation: String?
    var unitRaw: String
    var isPrepackaged: Bool
    var rewrapsWithUniqueBarcode: Bool
    var canBeReworked: Bool?
    var reworkShelfLifeDays: Int?
    var maxReworkCount: Int?
    var updatedByUid: String
    var updatedAt: Date
}

private struct StoreCatalogDocument: Codable {
    var upc: String
    var storeId: String
    var minimumQuantity: Double
    var department: String?
    var departmentLocation: String?
    var updatedByUid: String
    var updatedAt: Date
}

private struct CompanyNoUPCCatalogDocument: Codable {
    var key: String
    var title: String
    var tags: [String]
    var price: Double
    var casePack: Int
    var defaultExpiration: Int
    var defaultPackedExpiration: Int
    var vendorName: String?
    var department: String?
    var departmentLocation: String?
    var unitRaw: String
    var minimumQuantity: Double
    var isPrepackaged: Bool
    var rewrapsWithUniqueBarcode: Bool
    var canBeReworked: Bool?
    var reworkShelfLifeDays: Int?
    var maxReworkCount: Int?
    var thumbnailBase64: String?
    var updatedByUid: String
    var updatedAt: Date
    var storeId: String
}

enum CentralCatalogError: LocalizedError {
    case invalidUPC
    case missingUser
    case missingOrganization
    case missingPermission

    var errorDescription: String? {
        switch self {
        case .invalidUPC:
            return "A valid UPC is required to update the catalog."
        case .missingUser:
            return "A signed-in user is required."
        case .missingOrganization:
            return "An active organization is required."
        case .missingPermission:
            return "You do not have permission to update catalog records."
        }
    }
}

final class CentralCatalogService {
    static let shared = CentralCatalogService()

    private let globalFallbackKey = "catalog_global_fallback_v3"
    private let companyFallbackPrefix = "catalog_company_fallback_"
    private let storeFallbackPrefix = "catalog_store_fallback_"
    private let companyNoUPCFallbackPrefix = "catalog_company_noupc_fallback_"

    private init() {}

    private var firestoreEnabled: Bool {
#if canImport(FirebaseFirestore) && canImport(FirebaseCore)
        return FirebaseApp.app() != nil
#else
        return false
#endif
    }

    func product(
        forUPC rawUPC: String,
        organizationId: String? = nil,
        storeId: String? = nil
    ) async throws -> CatalogProductRecord? {
        let upc = normalizeUPC(rawUPC)
        guard !upc.isEmpty else { return nil }

        do {
#if canImport(FirebaseFirestore)
            if firestoreEnabled {
                let db = Firestore.firestore()
                async let globalTask = db.collection("centralCatalog")
                    .document("global")
                    .collection("items")
                    .document(upc)
                    .getDocument()

                var companySnapshot: DocumentSnapshot?
                var storeSnapshot: DocumentSnapshot?
                if let organizationId, !organizationId.isEmpty {
                    companySnapshot = try? await db.collection("organizations")
                        .document(organizationId)
                        .collection("companyCatalog")
                        .document(upc)
                        .getDocument()
                    if let storeId, !storeId.isEmpty {
                        storeSnapshot = try? await db.collection("organizations")
                            .document(organizationId)
                            .collection("stores")
                            .document(storeId)
                            .collection("catalog")
                            .document(upc)
                            .getDocument()
                    }
                }

                let globalSnapshot = try await globalTask
                let global = decodeGlobal(from: globalSnapshot, upc: upc)
                let company = companySnapshot.flatMap { decodeCompany(from: $0, upc: upc) }
                let store = storeSnapshot.flatMap { decodeStore(from: $0, upc: upc) }

                if global == nil && company == nil && store == nil { return nil }
                return mergeCatalog(
                    upc: upc,
                    global: global,
                    company: company,
                    store: store,
                    organizationId: organizationId,
                    storeId: storeId
                )
            }
#endif
        } catch {
            // Fall back to local cache.
        }

        let global = loadGlobalFallback()[upc]
        let company = organizationId.flatMap { loadCompanyFallback(organizationId: $0)[upc] }
        let store = organizationId.flatMap { org in
            storeId.flatMap { store in
                loadStoreFallback(organizationId: org, storeId: store)[upc]
            }
        }
        if global == nil && company == nil && store == nil { return nil }
        return mergeCatalog(
            upc: upc,
            global: global,
            company: company,
            store: store,
            organizationId: organizationId,
            storeId: storeId
        )
    }

    @discardableResult
    func submitItemDraftForVerification(
        organizationId: String,
        storeId: String,
        submittedByUid: String,
        scannedUPC: String,
        draftItem: InventoryItem?,
        note: String? = nil
    ) async -> String? {
#if canImport(FirebaseFirestore)
        guard firestoreEnabled else { return nil }
        let normalizedOrgID = organizationId.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedStoreID = storeId.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedUID = submittedByUid.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedOrgID.isEmpty, !normalizedStoreID.isEmpty, !normalizedUID.isEmpty else { return nil }

        let normalizedUPC = normalizeUPC(scannedUPC)
        let submittedName: String = {
            if let draftItem {
                let trimmed = draftItem.name.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { return trimmed }
            }
            if !normalizedUPC.isEmpty { return "Draft Item \(String(normalizedUPC.suffix(6)))" }
            return "Draft Item"
        }()

        let tags = draftItem?.tags ?? []
        let payloadDraft: [String: Any] = [
            "backendItemId": draftItem?.backendId as Any,
            "name": submittedName,
            "upc": normalizedUPC.isEmpty ? (draftItem?.upc as Any) : normalizedUPC,
            "unit": draftItem?.unit.rawValue ?? MeasurementUnit.pieces.rawValue,
            "price": draftItem?.price ?? 0,
            "defaultExpirationDays": draftItem?.effectiveDefaultExpiration ?? 7,
            "defaultPackedExpiration": draftItem?.effectiveDefaultPackedExpiration ?? 7,
            "minQuantity": draftItem?.minimumQuantity ?? 0,
            "qtyPerCase": draftItem?.quantityPerBox ?? 1,
            "caseSize": max(1, Double(draftItem?.quantityPerBox ?? 1)),
            "vendorId": draftItem?.vendor?.backendId as Any,
            "vendorName": draftItem?.vendor?.name as Any,
            "department": draftItem?.department as Any,
            "departmentLocation": draftItem?.departmentLocation as Any,
            "tags": tags,
            "photoUrl": NSNull(),
            "photoAssetId": NSNull(),
            "reworkItemCode": draftItem?.reworkItemCode as Any,
            "canBeReworked": draftItem?.canBeReworked ?? false,
            "reworkShelfLifeDays": draftItem?.effectiveReworkShelfLifeDays ?? 1,
            "maxReworkCount": draftItem?.effectiveMaxReworkCount ?? 1
        ]

        let db = Firestore.firestore()
        let ref = db.collection("organizations")
            .document(normalizedOrgID)
            .collection("itemSubmissions")
            .document()
        do {
            try await ref.setData([
                "organizationId": normalizedOrgID,
                "storeId": normalizedStoreID,
                "submittedByUid": normalizedUID,
                "status": "pending",
                "scannedUpc": normalizedUPC.isEmpty ? NSNull() : normalizedUPC,
                "note": (note?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false) ? note as Any : NSNull(),
                "itemDraft": payloadDraft,
                "createdAt": FieldValue.serverTimestamp(),
                "updatedAt": FieldValue.serverTimestamp(),
                "reviewedAt": NSNull(),
                "reviewedByUid": NSNull(),
                "reviewNote": NSNull()
            ])
            return ref.documentID
        } catch {
            return nil
        }
#else
        _ = organizationId
        _ = storeId
        _ = submittedByUid
        _ = scannedUPC
        _ = draftItem
        _ = note
        return nil
#endif
    }

    @discardableResult
    func upsertCompanyProductWithoutUPC(
        title rawTitle: String,
        tags rawTags: [String],
        price: Double,
        casePack: Int,
        defaultExpiration: Int,
        defaultPackedExpiration: Int,
        vendorName: String?,
        department: String?,
        departmentLocation: String?,
        unitRaw: String,
        minimumQuantity: Double,
        isPrepackaged: Bool,
        rewrapsWithUniqueBarcode: Bool,
        canBeReworked: Bool = false,
        reworkShelfLifeDays: Int = 1,
        maxReworkCount: Int = 1,
        thumbnailData: Data?,
        editorUid: String?,
        editorOrganizationId: String?,
        storeId: String,
        hasPermission: Bool
    ) async throws -> String {
        guard let editorUid, !editorUid.isEmpty else { throw CentralCatalogError.missingUser }
        guard let editorOrganizationId, !editorOrganizationId.isEmpty else {
            throw CentralCatalogError.missingOrganization
        }
        guard hasPermission else { throw CentralCatalogError.missingPermission }

        let title = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = noUPCKey(forTitle: title)
        let normalizedTags = Array(
            Set(
                rawTags
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
            )
        ).sorted()
        let doc = CompanyNoUPCCatalogDocument(
            key: key,
            title: title.isEmpty ? "Untitled Item" : title,
            tags: normalizedTags,
            price: max(0, price),
            casePack: max(1, casePack),
            defaultExpiration: max(1, defaultExpiration),
            defaultPackedExpiration: max(1, defaultPackedExpiration),
            vendorName: cleaned(vendorName),
            department: cleaned(department),
            departmentLocation: cleaned(departmentLocation),
            unitRaw: unitRaw,
            minimumQuantity: max(0, minimumQuantity),
            isPrepackaged: isPrepackaged,
            rewrapsWithUniqueBarcode: rewrapsWithUniqueBarcode,
            canBeReworked: canBeReworked,
            reworkShelfLifeDays: max(1, reworkShelfLifeDays),
            maxReworkCount: max(1, maxReworkCount),
            thumbnailBase64: optimizedThumbnailBase64(from: thumbnailData),
            updatedByUid: editorUid,
            updatedAt: Date(),
            storeId: storeId
        )

#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let db = Firestore.firestore()
            let ref = db.collection("organizations")
                .document(editorOrganizationId)
                .collection("companyCatalogNoUPC")
                .document(key)
            let batch = db.batch()
            try batch.setData(from: doc, forDocument: ref)
            try await batch.commit()
        } else {
            persistNoUPCFallback(document: doc, organizationId: editorOrganizationId)
        }
#else
        persistNoUPCFallback(document: doc, organizationId: editorOrganizationId)
#endif
        return key
    }

    @discardableResult
    func upsertProduct(
        upc rawUPC: String,
        title rawTitle: String,
        tags rawTags: [String],
        price: Double,
        casePack: Int,
        thumbnailData: Data?,
        editorUid: String?,
        editorOrganizationId: String?,
        hasPermission: Bool,
        defaultExpiration: Int = 7,
        defaultPackedExpiration: Int? = nil,
        vendorName: String? = nil,
        department: String? = nil,
        departmentLocation: String? = nil,
        unitRaw: String = MeasurementUnit.pieces.rawValue,
        minimumQuantity: Double = 0,
        storeDepartment: String? = nil,
        storeDepartmentLocation: String? = nil,
        storeId: String = "",
        isPrepackaged: Bool = false,
        rewrapsWithUniqueBarcode: Bool = false,
        canBeReworked: Bool = false,
        reworkShelfLifeDays: Int = 1,
        maxReworkCount: Int = 1,
        updateGlobalCatalog: Bool = true
    ) async throws -> CatalogProductRecord {
        let upc = normalizeUPC(rawUPC)
        guard !upc.isEmpty else { throw CentralCatalogError.invalidUPC }
        guard let editorUid, !editorUid.isEmpty else { throw CentralCatalogError.missingUser }
        guard let editorOrganizationId, !editorOrganizationId.isEmpty else {
            throw CentralCatalogError.missingOrganization
        }
        guard hasPermission else { throw CentralCatalogError.missingPermission }

        let trimmedTitle = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedTags = Array(
            Set(
                rawTags
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
            )
        ).sorted()
        let now = Date()
        let existing = try await product(
            forUPC: upc,
            organizationId: editorOrganizationId,
            storeId: storeId
        )
        let thumbnailBase64 = optimizedThumbnailBase64(from: thumbnailData) ?? existing?.thumbnailBase64

        let preservedCreator = existing?.createdByUid.trimmingCharacters(in: .whitespacesAndNewlines)
        let createdByUidValue = (preservedCreator?.isEmpty == false) ? (preservedCreator ?? editorUid) : editorUid
        let global = GlobalCatalogDocument(
            upc: upc,
            title: trimmedTitle.isEmpty ? (existing?.title ?? upc) : trimmedTitle,
            thumbnailBase64: thumbnailBase64,
            editorOrganizationId: editorOrganizationId,
            createdByUid: createdByUidValue,
            updatedByUid: editorUid,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now
        )
        let company = CompanyCatalogDocument(
            upc: upc,
            tags: normalizedTags.isEmpty ? (existing?.tags ?? []) : normalizedTags,
            price: max(0, price),
            casePack: max(1, casePack),
            defaultExpiration: max(1, defaultExpiration),
            defaultPackedExpiration: max(1, defaultPackedExpiration ?? defaultExpiration),
            vendorName: cleaned(vendorName),
            department: cleaned(department),
            departmentLocation: cleaned(departmentLocation),
            unitRaw: unitRaw,
            isPrepackaged: isPrepackaged,
            rewrapsWithUniqueBarcode: rewrapsWithUniqueBarcode,
            canBeReworked: canBeReworked,
            reworkShelfLifeDays: max(1, reworkShelfLifeDays),
            maxReworkCount: max(1, maxReworkCount),
            updatedByUid: editorUid,
            updatedAt: now
        )
        let store = StoreCatalogDocument(
            upc: upc,
            storeId: storeId,
            minimumQuantity: max(0, minimumQuantity),
            department: cleaned(storeDepartment),
            departmentLocation: cleaned(storeDepartmentLocation),
            updatedByUid: editorUid,
            updatedAt: now
        )

#if canImport(FirebaseFirestore)
        if firestoreEnabled {
            let db = Firestore.firestore()
            let batch = db.batch()

            if updateGlobalCatalog {
                let globalRef = db.collection("centralCatalog")
                    .document("global")
                    .collection("items")
                    .document(upc)
                try batch.setData(from: global, forDocument: globalRef)
            }

            let companyRef = db.collection("organizations")
                .document(editorOrganizationId)
                .collection("companyCatalog")
                .document(upc)
            try batch.setData(from: company, forDocument: companyRef)

            let storeRef = db.collection("organizations")
                .document(editorOrganizationId)
                .collection("stores")
                .document(storeId)
                .collection("catalog")
                .document(upc)
            try batch.setData(from: store, forDocument: storeRef)

            try await batch.commit()
        } else {
            persistFallback(global: global, company: company, store: store, organizationId: editorOrganizationId, updateGlobalCatalog: updateGlobalCatalog)
        }
#else
        persistFallback(global: global, company: company, store: store, organizationId: editorOrganizationId, updateGlobalCatalog: updateGlobalCatalog)
#endif

        return mergeCatalog(
            upc: upc,
            global: updateGlobalCatalog ? global : (loadGlobalFallback()[upc] ?? global),
            company: company,
            store: store,
            organizationId: editorOrganizationId,
            storeId: storeId
        )
    }

    func normalizeUPC(_ rawUPC: String) -> String {
        let compact = rawUPC
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: " ", with: "")
        let digitsOnly = compact.replacingOccurrences(
            of: "[^0-9]",
            with: "",
            options: .regularExpression
        )
        guard !digitsOnly.isEmpty else { return compact }
        return digitsOnly.hasPrefix("0") ? digitsOnly : "0\(digitsOnly)"
    }

    private func mergeCatalog(
        upc: String,
        global: GlobalCatalogDocument?,
        company: CompanyCatalogDocument?,
        store: StoreCatalogDocument?,
        organizationId: String?,
        storeId: String?
    ) -> CatalogProductRecord {
        let createdAt = [global?.createdAt, company?.updatedAt, store?.updatedAt]
            .compactMap { $0 }
            .min() ?? Date()
        let updatedAt = [global?.updatedAt, company?.updatedAt, store?.updatedAt]
            .compactMap { $0 }
            .max() ?? Date()

        let createdBy = global?.createdByUid ?? company?.updatedByUid ?? store?.updatedByUid ?? ""
        let updatedBy = store?.updatedByUid ?? company?.updatedByUid ?? global?.updatedByUid ?? ""

        return CatalogProductRecord(
            upc: upc,
            title: global?.title ?? upc,
            tags: company?.tags ?? [],
            price: max(0, company?.price ?? 0),
            casePack: max(1, company?.casePack ?? 1),
            defaultExpiration: max(1, company?.defaultExpiration ?? 7),
            defaultPackedExpiration: max(1, company?.defaultPackedExpiration ?? company?.defaultExpiration ?? 7),
            vendorName: company?.vendorName,
            department: store?.department ?? company?.department,
            departmentLocation: store?.departmentLocation ?? company?.departmentLocation,
            unitRaw: company?.unitRaw ?? MeasurementUnit.pieces.rawValue,
            minimumQuantity: max(0, store?.minimumQuantity ?? 0),
            isPrepackaged: company?.isPrepackaged ?? false,
            rewrapsWithUniqueBarcode: company?.rewrapsWithUniqueBarcode ?? false,
            canBeReworked: company?.canBeReworked ?? false,
            reworkShelfLifeDays: max(1, company?.reworkShelfLifeDays ?? 1),
            maxReworkCount: max(1, company?.maxReworkCount ?? 1),
            thumbnailBase64: global?.thumbnailBase64,
            createdByUid: createdBy,
            updatedByUid: updatedBy,
            editorOrganizationId: organizationId ?? global?.editorOrganizationId ?? "",
            storeId: store?.storeId ?? storeId ?? "",
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }

    private func persistFallback(
        global: GlobalCatalogDocument,
        company: CompanyCatalogDocument,
        store: StoreCatalogDocument,
        organizationId: String,
        updateGlobalCatalog: Bool
    ) {
        if updateGlobalCatalog {
            var globalMap = loadGlobalFallback()
            globalMap[global.upc] = global
            saveGlobalFallback(globalMap)
        }

        var companyMap = loadCompanyFallback(organizationId: organizationId)
        companyMap[company.upc] = company
        saveCompanyFallback(companyMap, organizationId: organizationId)

        var storeMap = loadStoreFallback(organizationId: organizationId, storeId: store.storeId)
        storeMap[store.upc] = store
        saveStoreFallback(storeMap, organizationId: organizationId, storeId: store.storeId)
    }

    private func cleaned(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private func loadGlobalFallback() -> [String: GlobalCatalogDocument] {
        guard
            let data = UserDefaults.standard.data(forKey: globalFallbackKey),
            let decoded = try? JSONDecoder().decode([GlobalCatalogDocument].self, from: data)
        else {
            return [:]
        }
        return Dictionary(uniqueKeysWithValues: decoded.map { ($0.upc, $0) })
    }

    private func saveGlobalFallback(_ records: [String: GlobalCatalogDocument]) {
        let values = Array(records.values)
        guard let data = try? JSONEncoder().encode(values) else { return }
        UserDefaults.standard.set(data, forKey: globalFallbackKey)
    }

    private func loadCompanyFallback(organizationId: String) -> [String: CompanyCatalogDocument] {
        let key = "\(companyFallbackPrefix)\(organizationId)"
        guard
            let data = UserDefaults.standard.data(forKey: key),
            let decoded = try? JSONDecoder().decode([CompanyCatalogDocument].self, from: data)
        else {
            return [:]
        }
        return Dictionary(uniqueKeysWithValues: decoded.map { ($0.upc, $0) })
    }

    private func saveCompanyFallback(_ records: [String: CompanyCatalogDocument], organizationId: String) {
        let key = "\(companyFallbackPrefix)\(organizationId)"
        let values = Array(records.values)
        guard let data = try? JSONEncoder().encode(values) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    private func loadStoreFallback(organizationId: String, storeId: String) -> [String: StoreCatalogDocument] {
        let key = "\(storeFallbackPrefix)\(organizationId)_\(storeId)"
        guard
            let data = UserDefaults.standard.data(forKey: key),
            let decoded = try? JSONDecoder().decode([StoreCatalogDocument].self, from: data)
        else {
            return [:]
        }
        return Dictionary(uniqueKeysWithValues: decoded.map { ($0.upc, $0) })
    }

    private func saveStoreFallback(
        _ records: [String: StoreCatalogDocument],
        organizationId: String,
        storeId: String
    ) {
        let key = "\(storeFallbackPrefix)\(organizationId)_\(storeId)"
        let values = Array(records.values)
        guard let data = try? JSONEncoder().encode(values) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    private func persistNoUPCFallback(document: CompanyNoUPCCatalogDocument, organizationId: String) {
        var map = loadNoUPCFallback(organizationId: organizationId)
        map[document.key] = document
        saveNoUPCFallback(map, organizationId: organizationId)
    }

    private func loadNoUPCFallback(organizationId: String) -> [String: CompanyNoUPCCatalogDocument] {
        let key = "\(companyNoUPCFallbackPrefix)\(organizationId)"
        guard
            let data = UserDefaults.standard.data(forKey: key),
            let decoded = try? JSONDecoder().decode([CompanyNoUPCCatalogDocument].self, from: data)
        else {
            return [:]
        }
        return Dictionary(uniqueKeysWithValues: decoded.map { ($0.key, $0) })
    }

    private func saveNoUPCFallback(_ records: [String: CompanyNoUPCCatalogDocument], organizationId: String) {
        let key = "\(companyNoUPCFallbackPrefix)\(organizationId)"
        let values = Array(records.values)
        guard let data = try? JSONEncoder().encode(values) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    private func noUPCKey(forTitle rawTitle: String) -> String {
        let lowered = rawTitle.lowercased()
        let folded = lowered.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
        let normalized = folded
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return normalized.isEmpty ? "no-upc-\(UUID().uuidString.lowercased())" : "no-upc-\(normalized)"
    }

#if canImport(FirebaseFirestore)
    private func decodeGlobal(from doc: DocumentSnapshot, upc: String) -> GlobalCatalogDocument? {
        guard doc.exists, let data = doc.data() else { return nil }
        return GlobalCatalogDocument(
            upc: upc,
            title: (data["title"] as? String) ?? upc,
            thumbnailBase64: data["thumbnailBase64"] as? String,
            editorOrganizationId: (data["editorOrganizationId"] as? String) ?? "",
            createdByUid: (data["createdByUid"] as? String) ?? "",
            updatedByUid: (data["updatedByUid"] as? String) ?? "",
            createdAt: dateValue(data["createdAt"]),
            updatedAt: dateValue(data["updatedAt"])
        )
    }

    private func decodeCompany(from doc: DocumentSnapshot, upc: String) -> CompanyCatalogDocument? {
        guard doc.exists, let data = doc.data() else { return nil }
        return CompanyCatalogDocument(
            upc: upc,
            tags: data["tags"] as? [String] ?? [],
            price: data["price"] as? Double ?? 0,
            casePack: data["casePack"] as? Int ?? 1,
            defaultExpiration: data["defaultExpiration"] as? Int ?? 7,
            defaultPackedExpiration: data["defaultPackedExpiration"] as? Int,
            vendorName: data["vendorName"] as? String,
            department: data["department"] as? String,
            departmentLocation: data["departmentLocation"] as? String,
            unitRaw: data["unitRaw"] as? String ?? MeasurementUnit.pieces.rawValue,
            isPrepackaged: data["isPrepackaged"] as? Bool ?? false,
            rewrapsWithUniqueBarcode: data["rewrapsWithUniqueBarcode"] as? Bool ?? false,
            canBeReworked: data["canBeReworked"] as? Bool ?? false,
            reworkShelfLifeDays: max(1, data["reworkShelfLifeDays"] as? Int ?? 1),
            maxReworkCount: max(1, data["maxReworkCount"] as? Int ?? 1),
            updatedByUid: (data["updatedByUid"] as? String) ?? "",
            updatedAt: dateValue(data["updatedAt"])
        )
    }

    private func decodeStore(from doc: DocumentSnapshot, upc: String) -> StoreCatalogDocument? {
        guard doc.exists, let data = doc.data() else { return nil }
        return StoreCatalogDocument(
            upc: upc,
            storeId: (data["storeId"] as? String) ?? "",
            minimumQuantity: data["minimumQuantity"] as? Double ?? 0,
            department: data["department"] as? String,
            departmentLocation: data["departmentLocation"] as? String,
            updatedByUid: (data["updatedByUid"] as? String) ?? "",
            updatedAt: dateValue(data["updatedAt"])
        )
    }

    private func dateValue(_ raw: Any?) -> Date {
        if let timestamp = raw as? Timestamp {
            return timestamp.dateValue()
        }
        if let date = raw as? Date {
            return date
        }
        return Date()
    }
#endif

    private func optimizedThumbnailBase64(from data: Data?) -> String? {
        guard let data else { return nil }
        let optimized = ImagePipeline.optimizedPhotoData(
            from: data,
            maxDimension: 640,
            maxBytes: 220_000
        )
        return optimized.base64EncodedString()
    }
}
