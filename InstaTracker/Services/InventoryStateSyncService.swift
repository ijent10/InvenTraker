import Foundation
import SwiftData
#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif
#if canImport(FirebaseCore)
import FirebaseCore
#endif

protocol InventoryStateSyncing {
    var remoteSyncAvailable: Bool { get }
    func syncState(
        for action: ActionPayload,
        refs: AuditObjectRefs,
        modelContext: ModelContext
    ) async throws
    func syncFullSnapshot(organizationId: String, modelContext: ModelContext) async throws
    func syncProductionSnapshot(
        organizationId: String,
        storeId: String?,
        modelContext: ModelContext
    ) async throws
    func refreshProductionCacheFromRemote(
        organizationId: String,
        storeId: String,
        modelContext: ModelContext
    ) async -> Bool
}

@MainActor
final class InventoryStateSyncService: InventoryStateSyncing {
    static let shared = InventoryStateSyncService()

    private struct RefreshScope: OptionSet {
        let rawValue: Int
        static let inventory = RefreshScope(rawValue: 1 << 0)
        static let operational = RefreshScope(rawValue: 1 << 1)
        static let all: RefreshScope = [.inventory, .operational]
    }

    private var realtimeRefreshTask: Task<Void, Never>?
    private var pendingRealtimeRefreshScope: RefreshScope = []
    private var inFlightStoreRefreshKeys: Set<String> = []
    private var listeningOrganizationId: String?
    private var listeningStoreId: String?
    private var listeningDepartmentScope: Set<String> = []
    private var lastInventoryRefreshAt: Date = .distantPast
    private var lastOperationalRefreshAt: Date = .distantPast
    private var lastManualRefreshAtByStoreKey: [String: Date] = [:]
    private let realtimeRefreshDebounceNanoseconds: UInt64 = 900_000_000
    private let realtimeInventoryMinInterval: TimeInterval = 2.0
    private let realtimeOperationalMinInterval: TimeInterval = 3.0
    private let manualRefreshMinInterval: TimeInterval = 2.0
    #if canImport(FirebaseFirestore)
    private var realtimeItemsListener: ListenerRegistration?
    private var realtimeVendorsListener: ListenerRegistration?
    private var realtimeBatchesListener: ListenerRegistration?
    private var realtimeOrdersListener: ListenerRegistration?
    private var realtimeToDoListener: ListenerRegistration?
    private var realtimeWasteListener: ListenerRegistration?
    #endif
    private var remoteImageCache: [String: Data] = [:]
    private var remoteImageCacheOrder: [String] = []
    private let remoteImageCacheLimit = 48

    private init() {}

    var remoteSyncAvailable: Bool {
#if canImport(FirebaseFirestore) && canImport(FirebaseCore)
        return FirebaseApp.app() != nil
#else
        return false
#endif
    }

    func startRealtimeInventorySync(
        organizationId: String,
        storeId: String,
        allowedDepartments: Set<String> = [],
        modelContext: ModelContext
    ) {
#if canImport(FirebaseFirestore)
        guard remoteSyncAvailable else { return }
        let normalizedDepartments = Set(
            allowedDepartments
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
                .filter { !$0.isEmpty }
        )
        if listeningOrganizationId == organizationId, listeningStoreId == storeId,
           listeningDepartmentScope == normalizedDepartments,
           realtimeItemsListener != nil, realtimeVendorsListener != nil, realtimeBatchesListener != nil,
           realtimeOrdersListener != nil, realtimeToDoListener != nil, realtimeWasteListener != nil {
            return
        }

        stopRealtimeInventorySync()
        listeningOrganizationId = organizationId
        listeningStoreId = storeId
        listeningDepartmentScope = normalizedDepartments

        let orgRef = Firestore.firestore().collection("organizations").document(organizationId)
        realtimeItemsListener = orgRef.collection("items").addSnapshotListener { [weak self] snapshot, error in
            Task { @MainActor in
                guard self?.shouldProcessRealtimeSnapshot(snapshot: snapshot, error: error) == true else { return }
                self?.scheduleRealtimeRefresh(
                    organizationId: organizationId,
                    storeId: storeId,
                    scope: .inventory,
                    allowedDepartments: normalizedDepartments,
                    modelContext: modelContext
                )
            }
        }
        realtimeVendorsListener = orgRef.collection("vendors").addSnapshotListener { [weak self] snapshot, error in
            Task { @MainActor in
                guard self?.shouldProcessRealtimeSnapshot(snapshot: snapshot, error: error) == true else { return }
                self?.scheduleRealtimeRefresh(
                    organizationId: organizationId,
                    storeId: storeId,
                    scope: .inventory,
                    allowedDepartments: normalizedDepartments,
                    modelContext: modelContext
                )
            }
        }
        realtimeBatchesListener = Firestore.firestore()
            .collectionGroup("inventoryBatches")
            .whereField("organizationId", isEqualTo: organizationId)
            .whereField("storeId", isEqualTo: storeId)
            .addSnapshotListener { [weak self] snapshot, error in
                Task { @MainActor in
                    guard self?.shouldProcessRealtimeSnapshot(snapshot: snapshot, error: error) == true else { return }
                    self?.scheduleRealtimeRefresh(
                        organizationId: organizationId,
                        storeId: storeId,
                        scope: .inventory,
                        allowedDepartments: normalizedDepartments,
                        modelContext: modelContext
                    )
                }
            }
        realtimeOrdersListener = Firestore.firestore()
            .collectionGroup("orders")
            .whereField("organizationId", isEqualTo: organizationId)
            .whereField("storeId", isEqualTo: storeId)
            .addSnapshotListener { [weak self] snapshot, error in
                Task { @MainActor in
                    guard self?.shouldProcessRealtimeSnapshot(snapshot: snapshot, error: error) == true else { return }
                    self?.scheduleRealtimeRefresh(
                        organizationId: organizationId,
                        storeId: storeId,
                        scope: .operational,
                        allowedDepartments: normalizedDepartments,
                        modelContext: modelContext
                    )
                }
            }
        realtimeToDoListener = Firestore.firestore()
            .collectionGroup("toDo")
            .whereField("organizationId", isEqualTo: organizationId)
            .whereField("storeId", isEqualTo: storeId)
            .addSnapshotListener { [weak self] snapshot, error in
                Task { @MainActor in
                    guard self?.shouldProcessRealtimeSnapshot(snapshot: snapshot, error: error) == true else { return }
                    self?.scheduleRealtimeRefresh(
                        organizationId: organizationId,
                        storeId: storeId,
                        scope: .operational,
                        allowedDepartments: normalizedDepartments,
                        modelContext: modelContext
                    )
                }
            }
        realtimeWasteListener = Firestore.firestore()
            .collectionGroup("waste")
            .whereField("organizationId", isEqualTo: organizationId)
            .whereField("storeId", isEqualTo: storeId)
            .addSnapshotListener { [weak self] snapshot, error in
                Task { @MainActor in
                    guard self?.shouldProcessRealtimeSnapshot(snapshot: snapshot, error: error) == true else { return }
                    self?.scheduleRealtimeRefresh(
                        organizationId: organizationId,
                        storeId: storeId,
                        scope: .operational,
                        allowedDepartments: normalizedDepartments,
                        modelContext: modelContext
                    )
                }
            }
#endif
    }

    func stopRealtimeInventorySync() {
#if canImport(FirebaseFirestore)
        realtimeItemsListener?.remove()
        realtimeVendorsListener?.remove()
        realtimeBatchesListener?.remove()
        realtimeOrdersListener?.remove()
        realtimeToDoListener?.remove()
        realtimeWasteListener?.remove()
        realtimeItemsListener = nil
        realtimeVendorsListener = nil
        realtimeBatchesListener = nil
        realtimeOrdersListener = nil
        realtimeToDoListener = nil
        realtimeWasteListener = nil
        realtimeRefreshTask?.cancel()
        realtimeRefreshTask = nil
        pendingRealtimeRefreshScope = []
        listeningOrganizationId = nil
        listeningStoreId = nil
        listeningDepartmentScope = []
        inFlightStoreRefreshKeys.removeAll(keepingCapacity: false)
        lastInventoryRefreshAt = .distantPast
        lastOperationalRefreshAt = .distantPast
        lastManualRefreshAtByStoreKey.removeAll(keepingCapacity: false)
#endif
        clearRemoteImageCache()
    }

    private func scheduleRealtimeRefresh(
        organizationId: String,
        storeId: String,
        scope: RefreshScope,
        allowedDepartments: Set<String>,
        modelContext: ModelContext
    ) {
        pendingRealtimeRefreshScope.formUnion(scope)
        realtimeRefreshTask?.cancel()
        realtimeRefreshTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(nanoseconds: realtimeRefreshDebounceNanoseconds)
            let scopeToApply = self.pendingRealtimeRefreshScope
            self.pendingRealtimeRefreshScope = []
            _ = await self.refreshStoreScopeFromRemote(
                organizationId: organizationId,
                storeId: storeId,
                allowedDepartments: allowedDepartments,
                modelContext: modelContext,
                includeInventory: scopeToApply.contains(.inventory),
                includeOperational: scopeToApply.contains(.operational),
                force: false
            )
        }
    }

#if canImport(FirebaseFirestore)
    private func shouldProcessRealtimeSnapshot(
        snapshot: QuerySnapshot?,
        error: Error?
    ) -> Bool {
        guard error == nil else { return false }
        guard let snapshot else { return false }
        if snapshot.metadata.hasPendingWrites {
            return false
        }
        if snapshot.documentChanges.isEmpty {
            return false
        }
        return true
    }
#endif

    func refreshStoreScopeFromRemote(
        organizationId: String,
        storeId: String,
        allowedDepartments: Set<String>,
        modelContext: ModelContext,
        includeInventory: Bool = true,
        includeOperational: Bool = true,
        force: Bool = false
    ) async -> Bool {
        guard remoteSyncAvailable else { return false }
        let normalizedOrganizationID = organizationId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedOrganizationID.isEmpty else { return false }
        let normalizedStoreID = sanitizeStoreIdentifier(storeId)
        guard !normalizedStoreID.isEmpty else { return false }
        guard includeInventory || includeOperational else { return false }

        let storeKey = "\(normalizedOrganizationID)|\(normalizedStoreID)|\(allowedDepartments.sorted().joined(separator: ","))"
        if !force,
           let lastRefresh = lastManualRefreshAtByStoreKey[storeKey],
           Date().timeIntervalSince(lastRefresh) < manualRefreshMinInterval {
            return false
        }
        if inFlightStoreRefreshKeys.contains(storeKey) {
            return false
        }
        inFlightStoreRefreshKeys.insert(storeKey)
        defer {
            inFlightStoreRefreshKeys.remove(storeKey)
        }

        var didMerge = false
        let now = Date()
        if includeInventory, force || now.timeIntervalSince(lastInventoryRefreshAt) >= realtimeInventoryMinInterval {
            let mergedInventory = await pullInventoryCacheFromRemote(
                organizationId: normalizedOrganizationID,
                storeId: normalizedStoreID,
                allowedDepartments: allowedDepartments,
                modelContext: modelContext
            )
            didMerge = didMerge || mergedInventory
            lastInventoryRefreshAt = Date()
        }
        if includeOperational, force || now.timeIntervalSince(lastOperationalRefreshAt) >= realtimeOperationalMinInterval {
            let mergedOperational = await pullOperationalCacheFromRemote(
                organizationId: normalizedOrganizationID,
                storeId: normalizedStoreID,
                modelContext: modelContext
            )
            didMerge = didMerge || mergedOperational
            lastOperationalRefreshAt = Date()
        }
        lastManualRefreshAtByStoreKey[storeKey] = Date()
        return didMerge
    }

    func syncState(
        for action: ActionPayload,
        refs: AuditObjectRefs,
        modelContext: ModelContext
    ) async throws {
#if canImport(FirebaseFirestore)
        guard remoteSyncAvailable else { return }
        let db = Firestore.firestore()
        switch action {
        case .generateOrder(let payload):
            try await syncOrders(orderIDs: payload.orderIds, organizationId: refs.organizationId, db: db, modelContext: modelContext)
        case .completeOrder(let payload):
            try await syncOrders(orderIDs: payload.orderIds, organizationId: refs.organizationId, db: db, modelContext: modelContext)
        case .receiveOrderLine(let payload):
            try await syncOrders(orderIDs: [payload.orderId], organizationId: refs.organizationId, db: db, modelContext: modelContext)
        case .receiveInventory(let payload):
            try await syncItem(itemIDString: payload.itemId, organizationId: refs.organizationId, db: db, modelContext: modelContext)
            if let lineID = payload.fromOrderLineId, !lineID.isEmpty {
                try await syncOrders(orderIDs: [lineID], organizationId: refs.organizationId, db: db, modelContext: modelContext)
            }
        case .spotCheckSetCount(let payload):
            try await syncItem(itemIDString: payload.itemId, organizationId: refs.organizationId, db: db, modelContext: modelContext)
        case .wasteRecorded(let payload):
            try await syncItem(itemIDString: payload.itemId, organizationId: refs.organizationId, db: db, modelContext: modelContext)
            try await syncRecentWaste(forItemID: payload.itemId, organizationId: refs.organizationId, db: db, modelContext: modelContext)
        case .migrationImport:
            try await syncFullSnapshot(organizationId: refs.organizationId, modelContext: modelContext)
        }
#endif
    }

    func syncFullSnapshot(organizationId: String, modelContext: ModelContext) async throws {
#if canImport(FirebaseFirestore)
        guard remoteSyncAvailable else { return }
        let db = Firestore.firestore()

        var itemDescriptor = FetchDescriptor<InventoryItem>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        itemDescriptor.sortBy = [SortDescriptor(\.lastModified, order: .forward)]
        let items = (try? modelContext.fetch(itemDescriptor)) ?? []
        for item in items {
            try await upsert(item: item, organizationId: organizationId, db: db)
        }

        var orderDescriptor = FetchDescriptor<OrderItem>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        orderDescriptor.sortBy = [SortDescriptor(\.orderDate, order: .forward)]
        let orders = (try? modelContext.fetch(orderDescriptor)) ?? []
        for order in orders {
            try await upsert(order: order, organizationId: organizationId, db: db)
        }

        var wasteDescriptor = FetchDescriptor<WasteEntry>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        wasteDescriptor.sortBy = [SortDescriptor(\.date, order: .forward)]
        let wastes = (try? modelContext.fetch(wasteDescriptor)) ?? []
        for waste in wastes {
            try await upsert(waste: waste, organizationId: organizationId, db: db)
        }

        var todoDescriptor = FetchDescriptor<ToDoItem>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        todoDescriptor.sortBy = [SortDescriptor(\.date, order: .forward)]
        let todos = (try? modelContext.fetch(todoDescriptor)) ?? []
        for todo in todos {
            try await upsert(todo: todo, organizationId: organizationId, db: db)
        }

        try await syncProductionSnapshot(
            organizationId: organizationId,
            storeId: nil,
            modelContext: modelContext
        )
#endif
    }

#if !canImport(FirebaseFirestore)
    func syncProductionSnapshot(
        organizationId: String,
        storeId: String?,
        modelContext: ModelContext
    ) async throws {}

    func refreshProductionCacheFromRemote(
        organizationId: String,
        storeId: String,
        modelContext: ModelContext
    ) async -> Bool {
        false
    }

    func pullOperationalCacheFromRemote(
        organizationId: String,
        storeId: String,
        modelContext: ModelContext
    ) async -> Bool {
        false
    }

    func pullInventoryCacheFromRemote(
        organizationId: String,
        storeId: String,
        allowedDepartments: Set<String> = [],
        modelContext: ModelContext
    ) async -> Bool {
        false
    }
#endif

#if canImport(FirebaseFirestore)
    func syncProductionSnapshot(
        organizationId: String,
        storeId: String?,
        modelContext: ModelContext
    ) async throws {
        guard remoteSyncAvailable else { return }
        let db = Firestore.firestore()

        var productDescriptor = FetchDescriptor<ProductionProduct>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        productDescriptor.sortBy = [SortDescriptor(\.updatedAt, order: .forward)]
        let allProducts = (try? modelContext.fetch(productDescriptor)) ?? []
        let products = allProducts.filter { product in
            guard let storeId else { return true }
            return product.storeId == storeId
        }
        for product in products {
            try await upsert(productionProduct: product, organizationId: organizationId, db: db)
        }

        var ingredientDescriptor = FetchDescriptor<ProductionIngredient>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        ingredientDescriptor.sortBy = [SortDescriptor(\.updatedAt, order: .forward)]
        let allIngredients = (try? modelContext.fetch(ingredientDescriptor)) ?? []
        let ingredients = allIngredients.filter { ingredient in
            guard let storeId else { return true }
            return ingredient.storeId == storeId
        }
        for ingredient in ingredients {
            try await upsert(productionIngredient: ingredient, organizationId: organizationId, db: db)
        }

        var spotCheckDescriptor = FetchDescriptor<ProductionSpotCheckRecord>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        spotCheckDescriptor.sortBy = [SortDescriptor(\.checkedAt, order: .reverse)]
        let allSpotChecks = (try? modelContext.fetch(spotCheckDescriptor)) ?? []
        let recentSpotChecks = allSpotChecks
            .filter { record in
                guard let storeId else { return true }
                return record.storeId == storeId
            }
            .prefix(240)
        for record in recentSpotChecks {
            try await upsert(productionSpotCheck: record, organizationId: organizationId, db: db)
        }

        var runDescriptor = FetchDescriptor<ProductionRun>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        runDescriptor.sortBy = [SortDescriptor(\.madeAt, order: .reverse)]
        let allRuns = (try? modelContext.fetch(runDescriptor)) ?? []
        let recentRuns = allRuns
            .filter { run in
                guard let storeId else { return true }
                return run.storeId == storeId
            }
            .prefix(240)
        for run in recentRuns {
            try await upsert(productionRun: run, organizationId: organizationId, db: db)
        }

        var guideDescriptor = FetchDescriptor<HowToGuide>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        guideDescriptor.sortBy = [SortDescriptor(\.updatedAt, order: .forward)]
        let guides = (try? modelContext.fetch(guideDescriptor)) ?? []
        for guide in guides {
            try await upsert(howToGuide: guide, organizationId: organizationId, db: db)
        }
    }

    func refreshProductionCacheFromRemote(
        organizationId: String,
        storeId: String,
        modelContext: ModelContext
    ) async -> Bool {
        guard remoteSyncAvailable else { return false }
        let db = Firestore.firestore()
        let orgRef = db.collection("organizations").document(organizationId)

        var mergedAny = false
        let modernGuideSnapshot = try? await orgRef.collection("howtos").getDocuments()
        if let modernGuideSnapshot, !modernGuideSnapshot.documents.isEmpty {
            await mergeRemoteGuidesFromModern(
                orgRef: orgRef,
                snapshot: modernGuideSnapshot,
                organizationId: organizationId,
                modelContext: modelContext
            )
            mergedAny = true
        }

        if let legacyGuideSnapshot = try? await orgRef.collection("howToGuides").getDocuments() {
            let modernBackendIDs: Set<String> = Set(
                modernGuideSnapshot?.documents.map { doc in
                    let data = doc.data()
                    let backend = (data["backendId"] as? String) ?? doc.documentID
                    return backend.lowercased()
                } ?? []
            )
            let modernTitleKeys: Set<String> = Set(
                modernGuideSnapshot?.documents.compactMap { doc in
                    let title = (doc.data()["title"] as? String) ?? ""
                    let key = title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                    return key.isEmpty ? nil : key
                } ?? []
            )

            mergeRemoteGuides(
                from: legacyGuideSnapshot,
                organizationId: organizationId,
                modelContext: modelContext,
                skipBackendIDs: modernBackendIDs,
                skipTitleKeys: modernTitleKeys
            )
            mergedAny = mergedAny || !legacyGuideSnapshot.documents.isEmpty
        }

        deduplicateLocalGuides(
            organizationId: organizationId,
            modelContext: modelContext
        )

        if let productSnapshot = try? await orgRef.collection("productionProducts").getDocuments() {
            mergeRemoteProducts(
                from: productSnapshot,
                organizationId: organizationId,
                storeId: storeId,
                modelContext: modelContext
            )
            mergedAny = mergedAny || !productSnapshot.documents.isEmpty
        }

        if let ingredientSnapshot = try? await db.collectionGroup("ingredients")
            .whereField("organizationId", isEqualTo: organizationId)
            .getDocuments()
        {
            mergeRemoteIngredients(
                from: ingredientSnapshot,
                organizationId: organizationId,
                storeId: storeId,
                modelContext: modelContext
            )
            mergedAny = mergedAny || !ingredientSnapshot.documents.isEmpty
        }

        if let spotCheckSnapshot = try? await orgRef.collection("productionSpotChecks").getDocuments() {
            mergeRemoteSpotChecks(
                from: spotCheckSnapshot,
                organizationId: organizationId,
                storeId: storeId,
                modelContext: modelContext
            )
            mergedAny = mergedAny || !spotCheckSnapshot.documents.isEmpty
        }

        if let runSnapshot = try? await orgRef.collection("productionRuns").getDocuments() {
            mergeRemoteRuns(
                from: runSnapshot,
                organizationId: organizationId,
                storeId: storeId,
                modelContext: modelContext
            )
            mergedAny = mergedAny || !runSnapshot.documents.isEmpty
        }

        try? modelContext.save()
        return mergedAny
    }

    func pullInventoryCacheFromRemote(
        organizationId: String,
        storeId: String,
        allowedDepartments: Set<String> = [],
        modelContext: ModelContext
    ) async -> Bool {
        guard remoteSyncAvailable else { return false }
        let db = Firestore.firestore()
        let orgRef = db.collection("organizations").document(organizationId)
        // Store-scoped canonical model is now the default runtime path.
        // Legacy inventory reads remain migration-time only and are disabled in app runtime.
        let allowLegacyInventoryReads = false

        var didMerge = false
        var consumedLegacyUnscopedQuantities = false
        let normalizedRequestedStoreID = storeId.trimmingCharacters(in: .whitespacesAndNewlines)

        let vendorSnapshot = try? await orgRef.collection("vendors").getDocuments()
        let itemSnapshot = try? await orgRef.collection("items").getDocuments()

        var vendorByBackendID: [String: Vendor] = [:]
        var vendorByUUID: [UUID: Vendor] = [:]
        do {
            let existingVendors = (try? modelContext.fetch(FetchDescriptor<Vendor>())) ?? []
            for vendor in existingVendors where vendor.organizationId == organizationId {
                if let backend = vendor.backendId, !backend.isEmpty {
                    vendorByBackendID[backend] = vendor
                }
                vendorByUUID[vendor.id] = vendor
            }
        }

        if let vendorSnapshot {
            for doc in vendorSnapshot.documents {
                let data = doc.data()
                let backendId = doc.documentID
                let resolvedName = (data["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                guard !resolvedName.isEmpty else { continue }

                let resolvedID: UUID = {
                    if let idRaw = data["id"] as? String, let parsed = UUID(uuidString: idRaw) {
                        return parsed
                    }
                    if let parsed = UUID(uuidString: backendId) {
                        return parsed
                    }
                    return UUID()
                }()

                let vendor = vendorByBackendID[backendId] ?? vendorByUUID[resolvedID] ?? {
                    let created = Vendor(
                        name: resolvedName,
                        organizationId: organizationId,
                        backendId: backendId
                    )
                    created.id = resolvedID
                    created.createdAt = dateValue(data["createdAt"])
                    modelContext.insert(created)
                    vendorByUUID[created.id] = created
                    vendorByBackendID[backendId] = created
                    didMerge = true
                    return created
                }()

                var vendorChanged = false
                if vendor.name != resolvedName { vendor.name = resolvedName; vendorChanged = true }
                if vendor.organizationId != organizationId { vendor.organizationId = organizationId; vendorChanged = true }
                if vendor.backendId != backendId { vendor.backendId = backendId; vendorChanged = true }

                let remoteOrderDays = data["orderDays"] as? [Int] ?? vendor.orderDays
                if vendor.orderDays != remoteOrderDays { vendor.orderDays = remoteOrderDays; vendorChanged = true }

                let remoteTruckDays = data["truckDays"] as? [Int] ?? vendor.truckDays
                if vendor.truckDays != remoteTruckDays { vendor.truckDays = remoteTruckDays; vendorChanged = true }

                let remoteLeadDays = data["daysFromOrderToDelivery"] as? Int ?? vendor.daysFromOrderToDelivery
                if vendor.daysFromOrderToDelivery != remoteLeadDays {
                    vendor.daysFromOrderToDelivery = remoteLeadDays
                    vendorChanged = true
                }

                let remoteNotes = data["notes"] as? String
                if vendor.notes != remoteNotes { vendor.notes = remoteNotes; vendorChanged = true }

                let remoteActive = data["isActive"] as? Bool ?? vendor.isActive
                if vendor.isActive != remoteActive { vendor.isActive = remoteActive; vendorChanged = true }

                vendor.lastSyncedAt = Date()
                if vendorChanged {
                    didMerge = true
                }
                vendorByUUID[vendor.id] = vendor
                vendorByBackendID[backendId] = vendor
            }
        }

        if itemSnapshot == nil {
            let mergedFromBatchesOnly = await mergeStoreInventoryFromBatchesOnly(
                db: db,
                organizationId: organizationId,
                storeId: storeId,
                modelContext: modelContext
            )
            if mergedFromBatchesOnly {
                didMerge = true
            }
        }

        if let itemSnapshot {
            var organizationDefaultStoreID = ""
            if let orgDoc = try? await orgRef.getDocument(),
               let raw = (orgDoc.data()?["defaultStoreId"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
               !raw.isEmpty {
                organizationDefaultStoreID = raw
            }
            let normalizedStoreID = sanitizeStoreIdentifier(storeId)
            let legacyPrimaryStoreKey = "legacy_primary_store_\(organizationId)"
            let storedLegacyPrimaryStoreID = UserDefaults.standard
                .string(forKey: legacyPrimaryStoreKey)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let hasStoredLegacyPrimaryStore = !storedLegacyPrimaryStoreID.isEmpty
            var canUseLegacyUnscopedItemsForStore = false
            if allowLegacyInventoryReads {
                if !organizationDefaultStoreID.isEmpty,
                   organizationDefaultStoreID == normalizedStoreID {
                    canUseLegacyUnscopedItemsForStore = true
                } else if hasStoredLegacyPrimaryStore,
                          storedLegacyPrimaryStoreID == normalizedStoreID {
                    canUseLegacyUnscopedItemsForStore = true
                }
            }
            var itemAliasToBackendID: [String: String] = [:]
            for doc in itemSnapshot.documents {
                let itemData = doc.data()
                let backendId = doc.documentID
                itemAliasToBackendID[backendId] = backendId
                if let legacyId = (itemData["id"] as? String)?
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                   !legacyId.isEmpty {
                    itemAliasToBackendID[legacyId] = backendId
                }
                if let mirroredBackend = (itemData["backendId"] as? String)?
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                   !mirroredBackend.isEmpty {
                    itemAliasToBackendID[mirroredBackend] = backendId
                }
            }

            var canonicalBatchesByBackendID: [String: [String: (isNested: Bool, data: [String: Any])]] = [:]
            var hasAnyBatchRows = false

            func mergeBatchDocuments(_ documents: [QueryDocumentSnapshot], defaultNested: Bool? = nil) {
                guard !documents.isEmpty else { return }
                hasAnyBatchRows = true
                for batchDoc in documents {
                    var batchData = batchDoc.data()
                    let batchPath = batchDoc.reference.path
                    let isNestedBatchPath = defaultNested ?? (batchPath.contains("/regions/") && batchPath.contains("/districts/"))
                    let rawItemID = ((batchData["itemId"] as? String) ?? "")
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !rawItemID.isEmpty else { continue }
                    let resolvedItemID = itemAliasToBackendID[rawItemID] ?? rawItemID
                    batchData["id"] = batchDoc.documentID
                    if batchData["expirationDate"] == nil {
                        batchData["expirationDate"] = batchData["expiresAt"]
                    }
                    if batchData["storeId"] == nil {
                        batchData["storeId"] = normalizedStoreID
                    }
                    if batchData["organizationId"] == nil {
                        batchData["organizationId"] = organizationId
                    }
                    let backendID = ((batchData["backendId"] as? String) ?? "")
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    let dedupeKey = "\(backendID.isEmpty ? batchDoc.documentID : backendID)|\(rawItemID)"

                    var existing = canonicalBatchesByBackendID[resolvedItemID] ?? [:]
                    if let prior = existing[dedupeKey], prior.isNested, !isNestedBatchPath {
                        continue
                    }
                    existing[dedupeKey] = (isNested: isNestedBatchPath, data: batchData)
                    canonicalBatchesByBackendID[resolvedItemID] = existing
                }
            }

            if let canonicalBatchSnapshot = try? await db.collectionGroup("inventoryBatches")
                .whereField("organizationId", isEqualTo: organizationId)
                .whereField("storeId", isEqualTo: storeId)
                .getDocuments() {
                mergeBatchDocuments(canonicalBatchSnapshot.documents)
            }

            // Compatibility path: canonical nested stores path with missing organization/store fields on batches.
            // We resolve store document by ID and read its own inventoryBatches collection directly.
            if !hasAnyBatchRows,
               let canonicalStoreRef = await resolveCanonicalStoreDocumentReference(
                organizationId: organizationId,
                storeId: storeId,
                db: db
               ),
               let storeBatchSnapshot = try? await canonicalStoreRef
                .collection("inventoryBatches")
                .getDocuments() {
                mergeBatchDocuments(storeBatchSnapshot.documents)
            }

            // One-release compatibility path: legacy stores/{storeId}/inventoryBatches
            if allowLegacyInventoryReads,
               !hasAnyBatchRows,
               let legacyStoreBatchSnapshot = try? await db.collection("organizations")
                .document(organizationId)
                .collection("stores")
                .document(storeId)
                .collection("inventoryBatches")
                .getDocuments() {
                mergeBatchDocuments(legacyStoreBatchSnapshot.documents, defaultNested: false)
            }

            // One-release compatibility path: legacy org-level inventoryBatches filtered by storeId
            if allowLegacyInventoryReads,
               !hasAnyBatchRows,
               let legacyOrgBatchSnapshot = try? await db.collection("organizations")
                .document(organizationId)
                .collection("inventoryBatches")
                .whereField("storeId", isEqualTo: storeId)
                .getDocuments() {
                mergeBatchDocuments(legacyOrgBatchSnapshot.documents, defaultNested: false)
            }

            let existingItems = (try? modelContext.fetch(FetchDescriptor<InventoryItem>())) ?? []
            var itemByBackendID: [String: InventoryItem] = [:]
            var itemByUUID: [UUID: InventoryItem] = [:]
            for item in existingItems where item.organizationId == organizationId {
                let scopedStore = item.storeId.trimmingCharacters(in: .whitespacesAndNewlines)
                guard scopedStore == storeId else { continue }
                if let backend = item.backendId, !backend.isEmpty {
                    itemByBackendID["\(backend)|\(scopedStore)"] = item
                }
                itemByUUID[item.id] = item
            }

            for doc in itemSnapshot.documents {
                let data = doc.data()
                let remoteOrg = (data["organizationId"] as? String) ?? organizationId
                guard remoteOrg == organizationId else { continue }
                let backendId = doc.documentID

                let remoteStoreRaw = ((data["storeId"] as? String) ?? "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                var canonicalBatches = Array(canonicalBatchesByBackendID[backendId]?.values.map(\.data) ?? [])
                let legacyTotalQuantity: Double = {
                    if let value = data["totalQuantity"] as? Double { return value }
                    if let value = data["totalQuantity"] as? Int { return Double(value) }
                    if let value = data["totalQuantity"] as? NSNumber { return value.doubleValue }
                    if let value = data["totalQuantity"] as? String, let parsed = Double(value) { return parsed }
                    return 0
                }()

                // Legacy compatibility: older item docs may still carry embedded batches.
                // Only use embedded batches when we can safely attribute them to the active store.
                if canonicalBatches.isEmpty,
                   let embedded = data["batches"] as? [[String: Any]] {
                    let embeddedScoped = embedded.enumerated().compactMap { index, raw -> [String: Any]? in
                        let batchStore = (raw["storeId"] as? String)?
                            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                        let resolvedStoreForBatch: String = {
                            if !batchStore.isEmpty { return batchStore }
                            if !remoteStoreRaw.isEmpty { return remoteStoreRaw }
                            if canUseLegacyUnscopedItemsForStore { return storeId }
                            return ""
                        }()
                        guard !resolvedStoreForBatch.isEmpty, resolvedStoreForBatch == storeId else {
                            return nil
                        }
                        var normalized = raw
                        if normalized["id"] == nil {
                            let backend = ((raw["backendId"] as? String) ?? "")
                                .trimmingCharacters(in: .whitespacesAndNewlines)
                            normalized["id"] = backend.isEmpty ? "embedded-\(backendId)-\(index)" : backend
                        }
                        if normalized["expirationDate"] == nil {
                            normalized["expirationDate"] = normalized["expiresAt"]
                        }
                        normalized["storeId"] = resolvedStoreForBatch
                        normalized["organizationId"] = organizationId
                        return normalized
                    }
                    if !embeddedScoped.isEmpty {
                        canonicalBatches = embeddedScoped
                    }
                }

                if canonicalBatches.isEmpty,
                   canUseLegacyUnscopedItemsForStore,
                   remoteStoreRaw.isEmpty,
                   legacyTotalQuantity > 0 {
                    let legacyExpiration = Calendar.current.date(
                        byAdding: .day,
                        value: max(1, data["defaultExpiration"] as? Int ?? 7),
                        to: Date()
                    ) ?? Date()
                    canonicalBatches = [[
                        "id": "legacy-total-\(backendId)",
                        "backendId": "legacy-total-\(backendId)",
                        "quantity": legacyTotalQuantity,
                        "expirationDate": legacyExpiration,
                        "receivedDate": dateValue(data["lastModified"]),
                        "storeId": normalizedStoreID,
                        "organizationId": organizationId
                    ]]
                    consumedLegacyUnscopedQuantities = true
                }

                let hasStoreScopedQuantity = !canonicalBatches.isEmpty
                if !remoteStoreRaw.isEmpty, remoteStoreRaw != storeId {
                    continue
                }
                // Org metadata items (storeId empty) should only materialize locally for this store
                // when they actually have quantity records for this store.
                if remoteStoreRaw.isEmpty && !hasStoreScopedQuantity && !canUseLegacyUnscopedItemsForStore {
                    continue
                }
                let resolvedRemoteStore = remoteStoreRaw.isEmpty ? storeId : remoteStoreRaw

                if !allowedDepartments.isEmpty {
                    let remoteDepartmentCandidates = [
                        data["department"] as? String,
                        data["departmentId"] as? String,
                        data["departmentName"] as? String
                    ]
                    .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
                    .filter { !$0.isEmpty }
                    let hasAllowedDepartment = remoteDepartmentCandidates.contains { allowedDepartments.contains($0) }
                    guard hasAllowedDepartment else {
                        continue
                    }
                }

                let resolvedID: UUID = {
                    if let idRaw = data["id"] as? String, let parsed = UUID(uuidString: idRaw) {
                        return parsed
                    }
                    if let parsed = UUID(uuidString: backendId) {
                        return parsed
                    }
                    return UUID()
                }()

                let resolvedName = (data["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                guard !resolvedName.isEmpty else { continue }

                let backendLookupKey = "\(backendId)|\(resolvedRemoteStore)"
                let existingItem = itemByBackendID[backendLookupKey] ?? itemByUUID[resolvedID]
                let item: InventoryItem
                var itemChanged = false
                if let existingItem {
                    item = existingItem
                } else {
                    let created = InventoryItem(
                        name: resolvedName,
                        organizationId: organizationId,
                        backendId: backendId,
                        storeId: resolvedRemoteStore
                    )
                    created.id = resolvedID
                    created.createdAt = dateValue(data["createdAt"])
                    modelContext.insert(created)
                    item = created
                    itemChanged = true
                }

                let remoteRevision = data["revision"] as? Int ?? item.revision
                let remoteLastModified = dateValue(data["lastModified"])
                let hasRemoteImagePointer = data["thumbnailBase64"] != nil ||
                    data["photoUrl"] != nil ||
                    (data["pictures"] as? [Any]) != nil
                if
                    !itemChanged,
                    remoteRevision <= item.revision,
                    remoteLastModified <= item.lastModified,
                    !(item.pictures.isEmpty && hasRemoteImagePointer)
                {
                    itemByUUID[item.id] = item
                    itemByBackendID[backendLookupKey] = item
                    continue
                }

                if item.name != resolvedName { item.name = resolvedName; itemChanged = true }
                if item.organizationId != organizationId { item.organizationId = organizationId; itemChanged = true }
                let resolvedStore = resolvedRemoteStore
                if item.storeId != resolvedStore { item.storeId = resolvedStore; itemChanged = true }
                if item.backendId != backendId { item.backendId = backendId; itemChanged = true }

                let remoteUPC = data["upc"] as? String
                if item.upc != remoteUPC { item.upc = remoteUPC; itemChanged = true }
                let remoteReworkItemCode = data["reworkItemCode"] as? String
                if item.reworkItemCode != remoteReworkItemCode {
                    item.reworkItemCode = remoteReworkItemCode
                    itemChanged = true
                }

                let remoteTags = data["tags"] as? [String] ?? item.tags
                if item.tags != remoteTags { item.tags = remoteTags; itemChanged = true }

                let remoteDefaultExpiration = max(1, data["defaultExpiration"] as? Int ?? item.defaultExpiration)
                if item.defaultExpiration != remoteDefaultExpiration {
                    item.defaultExpiration = remoteDefaultExpiration
                    itemChanged = true
                }

                let remotePackedExpiration = max(
                    1,
                    data["defaultPackedExpiration"] as? Int ?? item.defaultPackedExpiration
                )
                if item.defaultPackedExpiration != remotePackedExpiration {
                    item.defaultPackedExpiration = remotePackedExpiration
                    itemChanged = true
                }

                let remoteMinimumQuantity = data["minimumQuantity"] as? Double ?? item.minimumQuantity
                if item.minimumQuantity != remoteMinimumQuantity {
                    item.minimumQuantity = remoteMinimumQuantity
                    itemChanged = true
                }

                let remoteQuantityPerBox = data["quantityPerBox"] as? Int ?? item.quantityPerBox
                if item.quantityPerBox != remoteQuantityPerBox {
                    item.quantityPerBox = remoteQuantityPerBox
                    itemChanged = true
                }

                let remoteDepartment = data["department"] as? String
                if item.department != remoteDepartment {
                    item.department = remoteDepartment
                    itemChanged = true
                }

                let remoteDepartmentLocation = data["departmentLocation"] as? String
                if item.departmentLocation != remoteDepartmentLocation {
                    item.departmentLocation = remoteDepartmentLocation
                    itemChanged = true
                }

                let remotePrepackaged = data["isPrepackaged"] as? Bool ?? item.isPrepackaged
                if item.isPrepackaged != remotePrepackaged {
                    item.isPrepackaged = remotePrepackaged
                    itemChanged = true
                }

                let remoteRewraps = data["rewrapsWithUniqueBarcode"] as? Bool ?? item.rewrapsWithUniqueBarcode
                if item.rewrapsWithUniqueBarcode != remoteRewraps {
                    item.rewrapsWithUniqueBarcode = remoteRewraps
                    itemChanged = true
                }

                let remoteCanBeReworked = data["canBeReworked"] as? Bool ?? item.canBeReworked
                if item.canBeReworked != remoteCanBeReworked {
                    item.canBeReworked = remoteCanBeReworked
                    itemChanged = true
                }

                let remoteReworkShelfLifeDays = max(1, data["reworkShelfLifeDays"] as? Int ?? item.reworkShelfLifeDays)
                if item.reworkShelfLifeDays != remoteReworkShelfLifeDays {
                    item.reworkShelfLifeDays = remoteReworkShelfLifeDays
                    itemChanged = true
                }

                let remoteMaxReworkCount = max(1, data["maxReworkCount"] as? Int ?? item.maxReworkCount)
                if item.maxReworkCount != remoteMaxReworkCount {
                    item.maxReworkCount = remoteMaxReworkCount
                    itemChanged = true
                }

                let remotePrice = data["price"] as? Double ?? item.price
                if item.price != remotePrice {
                    item.price = remotePrice
                    itemChanged = true
                }

                if let unitRaw = data["unit"] as? String,
                   let unit = MeasurementUnit(rawValue: unitRaw),
                   item.unit != unit {
                    item.unit = unit
                    itemChanged = true
                }

                let remoteArchived = data["isArchived"] as? Bool ?? item.isArchived
                if item.isArchived != remoteArchived {
                    item.isArchived = remoteArchived
                    itemChanged = true
                }

                let remoteIncludeInInsights = data["includeInInsights"] as? Bool ?? item.includeInInsights
                if item.includeInInsights != remoteIncludeInInsights {
                    item.includeInInsights = remoteIncludeInInsights
                    itemChanged = true
                }

                let remoteOnSale = data["isOnSale"] as? Bool ?? item.isOnSale
                if item.isOnSale != remoteOnSale {
                    item.isOnSale = remoteOnSale
                    itemChanged = true
                }

                let remoteSalePercentage = data["salePercentage"] as? Int ?? item.salePercentage
                if item.salePercentage != remoteSalePercentage {
                    item.salePercentage = remoteSalePercentage
                    itemChanged = true
                }

                if item.revision != remoteRevision {
                    item.revision = remoteRevision
                    itemChanged = true
                }

                let remoteUpdatedBy = data["updatedByUid"] as? String
                if item.updatedByUid != remoteUpdatedBy {
                    item.updatedByUid = remoteUpdatedBy
                    itemChanged = true
                }

                if item.lastModified != remoteLastModified {
                    item.lastModified = remoteLastModified
                    itemChanged = true
                }

                if let vendorIDString = data["vendorId"] as? String,
                   let vendorID = UUID(uuidString: vendorIDString),
                   let vendor = vendorByUUID[vendorID],
                   item.vendor?.id != vendor.id {
                    item.vendor = vendor
                    itemChanged = true
                }

                let scopedBatches: [[String: Any]] = canonicalBatches

                if batchesDiffer(local: item.batches, remote: scopedBatches) {
                    item.batches.removeAll(keepingCapacity: true)
                    for batchData in scopedBatches {
                        let quantity = batchData["quantity"] as? Double ?? 0
                        guard quantity > 0 else { continue }
                        let expiration = dateValue(batchData["expirationDate"] ?? batchData["expiresAt"])
                        let received = dateValue(batchData["receivedDate"] ?? batchData["createdAt"])
                        let batchStoreRaw = (batchData["storeId"] as? String)?
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                        let resolvedBatchStoreID: String = {
                            if let batchStoreRaw, !batchStoreRaw.isEmpty {
                                return batchStoreRaw
                            }
                            return storeId
                        }()
                        let batch = Batch(
                            quantity: quantity,
                            expirationDate: expiration,
                            receivedDate: received,
                            packageBarcode: batchData["packageBarcode"] as? String,
                            packageWeight: batchData["packageWeight"] as? Double,
                            packagePrice: batchData["packagePrice"] as? Double,
                            reworkCount: max(0, batchData["reworkCount"] as? Int ?? 0),
                            stockArea: StockArea(rawValue: batchData["stockAreaRaw"] as? String ?? "") ?? .backOfHouse,
                            organizationId: organizationId,
                            backendId: (batchData["backendId"] as? String) ?? (batchData["id"] as? String),
                            storeId: resolvedBatchStoreID
                        )
                        if let batchIDRaw = batchData["id"] as? String,
                           let batchID = UUID(uuidString: batchIDRaw) {
                            batch.id = batchID
                        }
                        batch.item = item
                        batch.revision = batchData["revision"] as? Int ?? batch.revision
                        batch.updatedByUid = batchData["updatedByUid"] as? String
                        batch.lastSyncedAt = Date()
                        item.batches.append(batch)
                    }
                    itemChanged = true
                }

                if hasRemoteImagePointer || item.pictures.isEmpty {
                    if let remoteImage = await resolveRemoteImageData(data: data, cacheKey: "\(organizationId)|\(backendId)") {
                        let optimized = ImagePipeline.optimizedPhotoData(
                            from: remoteImage,
                            maxDimension: 960,
                            maxBytes: 260_000
                        )
                        if item.pictures.first != optimized {
                            item.pictures = [optimized]
                            itemChanged = true
                        }
                    }
                }

                item.lastSyncedAt = Date()
                if itemChanged {
                    didMerge = true
                }
                itemByUUID[item.id] = item
                itemByBackendID["\(backendId)|\(resolvedRemoteStore)"] = item
            }

            if !allowLegacyInventoryReads {
                let remoteBackendIDs = Set(itemSnapshot.documents.map(\.documentID))
                let storeBackendsWithQuantity = Set(
                    canonicalBatchesByBackendID.compactMap { backendId, rows in
                        let hasPositiveQuantity = rows.values.contains { row in
                            doubleValue(row.data["quantity"]) > 0
                        }
                        return hasPositiveQuantity ? backendId : nil
                    }
                )
                let scopedExistingItems = existingItems.filter { item in
                    item.organizationId == organizationId &&
                    item.storeId.trimmingCharacters(in: .whitespacesAndNewlines) == storeId
                }
                for item in scopedExistingItems {
                    let backendId = (item.backendId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                    let hasQuantity = item.batches.contains { $0.quantity > 0 }
                    if !backendId.isEmpty {
                        if !remoteBackendIDs.contains(backendId) {
                            modelContext.delete(item)
                            didMerge = true
                            continue
                        }
                        // If metadata exists but no quantity rows for this store, remove stale local materialization.
                        if !storeBackendsWithQuantity.contains(backendId), item.lastSyncedAt != nil {
                            modelContext.delete(item)
                            didMerge = true
                            continue
                        }
                        continue
                    }
                    if !hasQuantity && item.totalQuantity <= 0 {
                        modelContext.delete(item)
                        didMerge = true
                    }
                }
            }
        }

        if !normalizedRequestedStoreID.isEmpty,
           consumedLegacyUnscopedQuantities {
            let legacyPrimaryStoreKey = "legacy_primary_store_\(organizationId)"
            let storedLegacyPrimaryStoreID = UserDefaults.standard
                .string(forKey: legacyPrimaryStoreKey)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if storedLegacyPrimaryStoreID.isEmpty {
                UserDefaults.standard.set(normalizedRequestedStoreID, forKey: legacyPrimaryStoreKey)
            }
        }

        if didMerge {
            try? modelContext.save()
        }
        let mergedOperational = await pullOperationalCacheFromRemote(
            organizationId: organizationId,
            storeId: storeId,
            modelContext: modelContext
        )
        if mergedOperational {
            didMerge = true
        }
        return didMerge
    }

    private func mergeStoreInventoryFromBatchesOnly(
        db: Firestore,
        organizationId: String,
        storeId: String,
        modelContext: ModelContext
    ) async -> Bool {
        let normalizedStoreId = sanitizeStoreIdentifier(storeId)
        let normalizedScopedStoreId = normalizedStoreId
        guard !normalizedScopedStoreId.isEmpty else { return false }
        let allowLegacyInventoryReads = false

        var mergedBatchDocs: [QueryDocumentSnapshot] = []

        if let scopedBatches = try? await db.collectionGroup("inventoryBatches")
            .whereField("organizationId", isEqualTo: organizationId)
            .whereField("storeId", isEqualTo: normalizedScopedStoreId)
            .getDocuments() {
            mergedBatchDocs.append(contentsOf: scopedBatches.documents)
        }

        if mergedBatchDocs.isEmpty,
           let canonicalStoreRef = await resolveCanonicalStoreDocumentReference(
            organizationId: organizationId,
            storeId: normalizedScopedStoreId,
            db: db
           ),
           let nestedStoreBatches = try? await canonicalStoreRef
            .collection("inventoryBatches")
            .getDocuments() {
            mergedBatchDocs.append(contentsOf: nestedStoreBatches.documents)
        }

        if allowLegacyInventoryReads,
           mergedBatchDocs.isEmpty,
           let legacyStoreBatches = try? await db.collection("organizations")
            .document(organizationId)
            .collection("stores")
            .document(normalizedScopedStoreId)
            .collection("inventoryBatches")
            .getDocuments() {
            mergedBatchDocs.append(contentsOf: legacyStoreBatches.documents)
        }

        if allowLegacyInventoryReads,
           mergedBatchDocs.isEmpty,
           let legacyOrgBatches = try? await db.collection("organizations")
            .document(organizationId)
            .collection("inventoryBatches")
            .whereField("storeId", isEqualTo: normalizedScopedStoreId)
            .getDocuments() {
            mergedBatchDocs.append(contentsOf: legacyOrgBatches.documents)
        }

        guard !mergedBatchDocs.isEmpty else { return false }

        let existingItems = (try? modelContext.fetch(FetchDescriptor<InventoryItem>())) ?? []
        var itemsByBackendId: [String: InventoryItem] = [:]
        var itemsByUUID: [UUID: InventoryItem] = [:]
        for item in existingItems where item.organizationId == organizationId {
            let itemStore = item.storeId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard sanitizeStoreIdentifier(itemStore) == normalizedScopedStoreId else { continue }
            if let backendId = item.backendId?.trimmingCharacters(in: .whitespacesAndNewlines),
               !backendId.isEmpty {
                itemsByBackendId[backendId] = item
            }
            itemsByUUID[item.id] = item
        }

        var batchesByItemId: [String: [[String: Any]]] = [:]
        for batchDoc in mergedBatchDocs {
            var data = batchDoc.data()
            let rawItemID = ((data["itemId"] as? String) ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !rawItemID.isEmpty else { continue }

            data["id"] = (data["id"] as? String) ?? batchDoc.documentID
            data["organizationId"] = (data["organizationId"] as? String) ?? organizationId
            data["storeId"] = ((data["storeId"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false)
                ? data["storeId"]
                : normalizedScopedStoreId
            if data["expirationDate"] == nil {
                data["expirationDate"] = data["expiresAt"]
            }
            batchesByItemId[rawItemID, default: []].append(data)
        }

        var didMerge = false
        for (itemId, remoteBatches) in batchesByItemId {
            let resolvedId = UUID(uuidString: itemId)
            let localItem = itemsByBackendId[itemId] ?? (resolvedId.flatMap { itemsByUUID[$0] })

            let item: InventoryItem
            if let localItem {
                item = localItem
            } else {
                let fallbackName = remoteBatches.first?["itemName"] as? String
                let created = InventoryItem(
                    name: fallbackName?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                        ? fallbackName!
                        : "Inventory Item",
                    organizationId: organizationId,
                    backendId: itemId,
                    storeId: normalizedScopedStoreId
                )
                if let resolvedId {
                    created.id = resolvedId
                }
                modelContext.insert(created)
                item = created
                didMerge = true
            }

            if item.organizationId != organizationId {
                item.organizationId = organizationId
                didMerge = true
            }
            if sanitizeStoreIdentifier(item.storeId) != normalizedScopedStoreId {
                item.storeId = normalizedScopedStoreId
                didMerge = true
            }
            if item.backendId != itemId {
                item.backendId = itemId
                didMerge = true
            }

            if let batchUnitRaw = remoteBatches.first?["unit"] as? String,
               let unit = MeasurementUnit(rawValue: batchUnitRaw),
               item.unit != unit {
                item.unit = unit
                didMerge = true
            }

            if let remoteName = (remoteBatches.first?["itemName"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
               !remoteName.isEmpty,
               item.name != remoteName {
                item.name = remoteName
                didMerge = true
            }

            if batchesDiffer(local: item.batches, remote: remoteBatches) {
                item.batches.removeAll(keepingCapacity: true)
                for batchData in remoteBatches {
                    let quantity = batchData["quantity"] as? Double ?? 0
                    guard quantity > 0 else { continue }
                    let expiration = dateValue(batchData["expirationDate"] ?? batchData["expiresAt"])
                    let received = dateValue(batchData["receivedDate"] ?? batchData["createdAt"])
                    let batchStore = ((batchData["storeId"] as? String) ?? normalizedScopedStoreId)
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    let resolvedBatchStore = sanitizeStoreIdentifier(batchStore.isEmpty ? normalizedScopedStoreId : batchStore)
                    let batch = Batch(
                        quantity: quantity,
                        expirationDate: expiration,
                        receivedDate: received,
                        packageBarcode: batchData["packageBarcode"] as? String,
                        packageWeight: batchData["packageWeight"] as? Double,
                        packagePrice: batchData["packagePrice"] as? Double,
                        reworkCount: max(0, batchData["reworkCount"] as? Int ?? 0),
                        stockArea: StockArea(rawValue: batchData["stockAreaRaw"] as? String ?? "") ?? .backOfHouse,
                        organizationId: organizationId,
                        backendId: (batchData["backendId"] as? String) ?? (batchData["id"] as? String),
                        storeId: resolvedBatchStore
                    )
                    if let batchIDRaw = batchData["id"] as? String,
                       let batchID = UUID(uuidString: batchIDRaw) {
                        batch.id = batchID
                    }
                    batch.item = item
                    batch.lastSyncedAt = Date()
                    item.batches.append(batch)
                }
                didMerge = true
            }

            item.lastSyncedAt = Date()
        }

        if didMerge {
            try? modelContext.save()
        }
        return didMerge
    }

    func pullOperationalCacheFromRemote(
        organizationId: String,
        storeId: String,
        modelContext: ModelContext
    ) async -> Bool {
        guard remoteSyncAvailable else { return false }
        let normalizedStoreID = sanitizeStoreIdentifier(storeId)
        guard !normalizedStoreID.isEmpty else { return false }

        let db = Firestore.firestore()
        var didMerge = false

        let orderDocuments = await fetchStoreScopedDocuments(
            collectionNames: ["orders"],
            organizationId: organizationId,
            storeId: normalizedStoreID,
            db: db
        )
        if mergeRemoteOrders(
            from: orderDocuments,
            organizationId: organizationId,
            storeId: normalizedStoreID,
            modelContext: modelContext
        ) {
            didMerge = true
        }

        let todoDocuments = await fetchStoreScopedDocuments(
            collectionNames: ["toDo", "todo"],
            organizationId: organizationId,
            storeId: normalizedStoreID,
            db: db
        )
        if mergeRemoteToDos(
            from: todoDocuments,
            organizationId: organizationId,
            storeId: normalizedStoreID,
            modelContext: modelContext
        ) {
            didMerge = true
        }

        let wasteDocuments = await fetchStoreScopedDocuments(
            collectionNames: ["waste", "wasteRecords"],
            organizationId: organizationId,
            storeId: normalizedStoreID,
            db: db
        )
        if mergeRemoteWaste(
            from: wasteDocuments,
            organizationId: organizationId,
            storeId: normalizedStoreID,
            modelContext: modelContext
        ) {
            didMerge = true
        }

        if didMerge {
            try? modelContext.save()
        }
        return didMerge
    }

    private func fetchStoreScopedDocuments(
        collectionNames: [String],
        organizationId: String,
        storeId: String,
        db: Firestore
    ) async -> [QueryDocumentSnapshot] {
        let normalizedStoreID = sanitizeStoreIdentifier(storeId)
        guard !normalizedStoreID.isEmpty else { return [] }

        var documentsByID: [String: (priority: Int, document: QueryDocumentSnapshot)] = [:]

        func mergeDocuments(_ docs: [QueryDocumentSnapshot], priority: Int) {
            for doc in docs {
                if let existing = documentsByID[doc.documentID], existing.priority >= priority {
                    continue
                }
                documentsByID[doc.documentID] = (priority, doc)
            }
        }

        let orgRef = db.collection("organizations").document(organizationId)

        for collectionName in collectionNames {
            if let storeRef = await resolveCanonicalStoreDocumentReference(
                organizationId: organizationId,
                storeId: normalizedStoreID,
                db: db
            ),
               let nestedSnapshot = try? await storeRef
                .collection(collectionName)
                .getDocuments() {
                mergeDocuments(nestedSnapshot.documents, priority: 3)
            }

            if let orgScopedSnapshot = try? await orgRef
                .collection(collectionName)
                .whereField("storeId", isEqualTo: normalizedStoreID)
                .getDocuments() {
                mergeDocuments(orgScopedSnapshot.documents, priority: 2)
            }

            if let groupedSnapshot = try? await db.collectionGroup(collectionName)
                .whereField("organizationId", isEqualTo: organizationId)
                .whereField("storeId", isEqualTo: normalizedStoreID)
                .getDocuments() {
                mergeDocuments(groupedSnapshot.documents, priority: 1)
            }
        }

        return documentsByID.values.map(\.document)
    }

    private func mergeRemoteOrders(
        from documents: [QueryDocumentSnapshot],
        organizationId: String,
        storeId: String,
        modelContext: ModelContext
    ) -> Bool {
        guard !documents.isEmpty else { return false }
        let descriptor = FetchDescriptor<OrderItem>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        let existing = (try? modelContext.fetch(descriptor)) ?? []
        var byBackendAndStore: [String: OrderItem] = [:]
        var byID: [UUID: OrderItem] = [:]
        for order in existing {
            let scopedStore = order.storeId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !scopedStore.isEmpty, scopedStore != storeId { continue }
            if let backendId = order.backendId?.trimmingCharacters(in: .whitespacesAndNewlines), !backendId.isEmpty {
                byBackendAndStore["\(backendId)|\(scopedStore)"] = order
            }
            byID[order.id] = order
        }

        var didMerge = false
        for doc in documents {
            let data = doc.data()
            let remoteOrg = (data["organizationId"] as? String) ?? organizationId
            guard remoteOrg == organizationId else { continue }

            let remoteStore = ((data["storeId"] as? String) ?? storeId)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !remoteStore.isEmpty, remoteStore == storeId else { continue }

            let idRaw = ((data["id"] as? String) ?? doc.documentID)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let parsedID = UUID(uuidString: idRaw)
            let backendId = ((data["backendId"] as? String) ?? doc.documentID)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let lookupKey = "\(backendId)|\(remoteStore)"

            let order = byBackendAndStore[lookupKey] ?? (parsedID.flatMap { byID[$0] }) ?? {
                let created = OrderItem(
                    item: nil,
                    recommendedQuantity: max(0, intValue(data["recommendedQuantity"])),
                    orderDate: dateValue(data["orderDate"]),
                    expectedDeliveryDate: optionalDateValue(data["expectedDeliveryDate"]),
                    organizationId: organizationId,
                    storeId: remoteStore,
                    backendId: backendId
                )
                if let parsedID {
                    created.id = parsedID
                }
                modelContext.insert(created)
                didMerge = true
                return created
            }()

            order.organizationId = organizationId
            order.storeId = remoteStore
            order.backendId = backendId.isEmpty ? doc.documentID : backendId
            order.itemIDSnapshot = UUID(uuidString: stringValue(data["itemId"]) ?? "")
            order.itemNameSnapshot = stringValue(data["itemName"])
            order.itemUnitSnapshot = stringValue(data["itemUnit"])
            if let itemQtyPerBox = optionalIntValue(data["itemQuantityPerBox"]) {
                order.itemQuantityPerBoxSnapshot = itemQtyPerBox
            }
            order.vendorIDSnapshot = UUID(uuidString: stringValue(data["vendorId"]) ?? "")
            order.vendorNameSnapshot = stringValue(data["vendorName"])
            order.recommendedQuantity = max(0, intValue(data["recommendedQuantity"]))
            order.orderedQuantity = optionalIntValue(data["orderedQuantity"])
            order.isChecked = boolValue(data["isChecked"])
            order.orderDate = dateValue(data["orderDate"])
            order.expectedDeliveryDate = optionalDateValue(data["expectedDeliveryDate"])
            order.wasReceived = boolValue(data["wasReceived"])
            order.receivedDate = optionalDateValue(data["receivedDate"])
            order.revision = intValue(data["revision"], fallback: order.revision)
            order.updatedByUid = stringValue(data["updatedByUid"])
            order.lastSyncedAt = Date()
            didMerge = true

            byBackendAndStore[lookupKey] = order
            byID[order.id] = order
        }

        return didMerge
    }

    private func mergeRemoteToDos(
        from documents: [QueryDocumentSnapshot],
        organizationId: String,
        storeId: String,
        modelContext: ModelContext
    ) -> Bool {
        guard !documents.isEmpty else { return false }
        let descriptor = FetchDescriptor<ToDoItem>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        let existing = (try? modelContext.fetch(descriptor)) ?? []
        var byBackendAndStore: [String: ToDoItem] = [:]
        var byID: [UUID: ToDoItem] = [:]
        for todo in existing {
            let scopedStore = todo.storeId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !scopedStore.isEmpty, scopedStore != storeId { continue }
            if let backendId = todo.backendId?.trimmingCharacters(in: .whitespacesAndNewlines), !backendId.isEmpty {
                byBackendAndStore["\(backendId)|\(scopedStore)"] = todo
            }
            byID[todo.id] = todo
        }

        var didMerge = false
        for doc in documents {
            let data = doc.data()
            let remoteOrg = (data["organizationId"] as? String) ?? organizationId
            guard remoteOrg == organizationId else { continue }

            let remoteStore = ((data["storeId"] as? String) ?? storeId)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !remoteStore.isEmpty, remoteStore == storeId else { continue }

            let idRaw = ((data["id"] as? String) ?? doc.documentID)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let parsedID = UUID(uuidString: idRaw)
            let backendId = ((data["backendId"] as? String) ?? doc.documentID)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let lookupKey = "\(backendId)|\(remoteStore)"

            let statusRaw = stringValue(data["status"])?.lowercased()
            let isCompleted = boolValue(data["isCompleted"], fallback: statusRaw == "completed" || statusRaw == "done")
            let dueDate = optionalDateValue(data["dueAt"]) ?? dateValue(data["date"])
            let recurrenceRaw = stringValue(data["recurrenceRule"]) ?? ToDoRecurrence.none.rawValue
            let recurrence = ToDoRecurrence(rawValue: recurrenceRaw) ?? .none
            let taskTypeRaw = stringValue(data["taskType"]) ?? stringValue(data["type"])
            let taskType = taskTypeRaw.flatMap { TaskType(rawValue: $0) }
            let isAuto = boolValue(data["isAutoGenerated"], fallback: (stringValue(data["type"])?.lowercased() == "auto"))
            let title = stringValue(data["title"]) ?? "Task"

            let todo = byBackendAndStore[lookupKey] ?? (parsedID.flatMap { byID[$0] }) ?? {
                let created = ToDoItem(
                    title: title,
                    taskType: taskType,
                    isAutoGenerated: isAuto,
                    isRecurring: boolValue(data["isRecurring"]),
                    isPersistent: boolValue(data["isPersistent"]),
                    recurrenceRule: recurrence,
                    recurrenceWeekday: optionalIntValue(data["recurrenceWeekday"]),
                    autoTaskKey: stringValue(data["autoTaskKey"]),
                    date: dueDate,
                    relatedItem: nil,
                    relatedVendor: nil,
                    organizationId: organizationId,
                    storeId: remoteStore,
                    backendId: backendId
                )
                if let parsedID {
                    created.id = parsedID
                }
                created.isCompleted = isCompleted
                created.completedAt = optionalDateValue(data["completedAt"])
                modelContext.insert(created)
                didMerge = true
                return created
            }()

            todo.title = title
            todo.taskType = taskType
            todo.isAutoGenerated = isAuto
            todo.isRecurring = boolValue(data["isRecurring"])
            todo.isPersistent = boolValue(data["isPersistent"])
            todo.recurrenceRule = recurrence
            todo.recurrenceWeekday = optionalIntValue(data["recurrenceWeekday"])
            todo.autoTaskKey = stringValue(data["autoTaskKey"])
            todo.date = dueDate
            todo.isCompleted = isCompleted
            todo.completedAt = optionalDateValue(data["completedAt"])
            todo.organizationId = organizationId
            todo.storeId = remoteStore
            todo.backendId = backendId.isEmpty ? doc.documentID : backendId
            todo.revision = intValue(data["revision"], fallback: todo.revision)
            todo.updatedByUid = stringValue(data["updatedByUid"])
            todo.lastSyncedAt = Date()
            didMerge = true

            byBackendAndStore[lookupKey] = todo
            byID[todo.id] = todo
        }

        return didMerge
    }

    private func mergeRemoteWaste(
        from documents: [QueryDocumentSnapshot],
        organizationId: String,
        storeId: String,
        modelContext: ModelContext
    ) -> Bool {
        guard !documents.isEmpty else { return false }
        let descriptor = FetchDescriptor<WasteEntry>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        let existing = (try? modelContext.fetch(descriptor)) ?? []
        var byBackendAndStore: [String: WasteEntry] = [:]
        var byID: [UUID: WasteEntry] = [:]
        for waste in existing {
            let scopedStore = waste.storeId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !scopedStore.isEmpty, scopedStore != storeId { continue }
            if let backendId = waste.backendId?.trimmingCharacters(in: .whitespacesAndNewlines), !backendId.isEmpty {
                byBackendAndStore["\(backendId)|\(scopedStore)"] = waste
            }
            byID[waste.id] = waste
        }

        var didMerge = false
        for doc in documents {
            let data = doc.data()
            let remoteOrg = (data["organizationId"] as? String) ?? organizationId
            guard remoteOrg == organizationId else { continue }

            let remoteStore = ((data["storeId"] as? String) ?? storeId)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !remoteStore.isEmpty, remoteStore == storeId else { continue }

            let idRaw = ((data["id"] as? String) ?? doc.documentID)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let parsedID = UUID(uuidString: idRaw)
            let backendId = ((data["backendId"] as? String) ?? doc.documentID)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let lookupKey = "\(backendId)|\(remoteStore)"
            let wasteType = resolveWasteType(from: data)
            let quantity = max(0, doubleValue(data["quantity"]))

            let entry = byBackendAndStore[lookupKey] ?? (parsedID.flatMap { byID[$0] }) ?? {
                let created = WasteEntry(
                    item: nil,
                    quantity: quantity,
                    wasteType: wasteType,
                    customTypeName: stringValue(data["customTypeName"]),
                    notes: stringValue(data["notes"]) ?? "",
                    organizationId: organizationId,
                    storeId: remoteStore,
                    backendId: backendId
                )
                if let parsedID {
                    created.id = parsedID
                }
                modelContext.insert(created)
                didMerge = true
                return created
            }()

            entry.organizationId = organizationId
            entry.storeId = remoteStore
            entry.backendId = backendId.isEmpty ? doc.documentID : backendId
            entry.itemIDSnapshot = UUID(uuidString: stringValue(data["itemId"]) ?? "")
            entry.itemNameSnapshot = stringValue(data["itemName"])
            entry.quantity = quantity
            entry.wasteType = wasteType
            entry.customTypeName = stringValue(data["customTypeName"])
            entry.date = optionalDateValue(data["date"]) ?? optionalDateValue(data["createdAt"]) ?? Date()
            entry.notes = stringValue(data["notes"]) ?? ""
            entry.itemPriceSnapshot = optionalDoubleValue(data["itemPriceSnapshot"])
            entry.includeInInsights = optionalBoolValue(data["includeInInsights"])
            entry.revision = intValue(data["revision"], fallback: entry.revision)
            entry.updatedByUid = stringValue(data["updatedByUid"])
            entry.lastSyncedAt = Date()
            didMerge = true

            byBackendAndStore[lookupKey] = entry
            byID[entry.id] = entry
        }

        return didMerge
    }

    private func syncItem(
        itemIDString: String,
        organizationId: String,
        db: Firestore,
        modelContext: ModelContext
    ) async throws {
        guard let itemID = UUID(uuidString: itemIDString) else { return }
        var descriptor = FetchDescriptor<InventoryItem>(
            predicate: #Predicate { $0.id == itemID && $0.organizationId == organizationId }
        )
        descriptor.fetchLimit = 1
        guard let item = try? modelContext.fetch(descriptor).first else { return }
        try await upsert(item: item, organizationId: organizationId, db: db)
    }

    private func syncOrders(
        orderIDs: [String],
        organizationId: String,
        db: Firestore,
        modelContext: ModelContext
    ) async throws {
        let orderUUIDs = Set(orderIDs.compactMap { UUID(uuidString: $0) })
        guard !orderUUIDs.isEmpty else { return }

        let descriptor = FetchDescriptor<OrderItem>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        let orders = (try? modelContext.fetch(descriptor)) ?? []
        for order in orders where orderUUIDs.contains(order.id) {
            try await upsert(order: order, organizationId: organizationId, db: db)
        }
    }

    private func syncRecentWaste(
        forItemID itemIDString: String,
        organizationId: String,
        db: Firestore,
        modelContext: ModelContext
    ) async throws {
        guard let itemID = UUID(uuidString: itemIDString) else { return }
        var descriptor = FetchDescriptor<WasteEntry>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        descriptor.sortBy = [SortDescriptor(\.date, order: .reverse)]
        let wasteEntries = (try? modelContext.fetch(descriptor)) ?? []
        guard let latest = wasteEntries.first(where: { $0.itemIDSnapshot == itemID }) else { return }
        try await upsert(waste: latest, organizationId: organizationId, db: db)
    }

    private func upsert(item: InventoryItem, organizationId: String, db: Firestore) async throws {
        let ref = db.collection("organizations")
            .document(organizationId)
            .collection("items")
            .document(item.id.uuidString)

        var data: [String: Any] = [
            "id": item.id.uuidString,
            "organizationId": item.organizationId,
            "name": item.name,
            "tags": item.tags,
            "defaultExpiration": item.defaultExpiration,
            "defaultPackedExpiration": item.defaultPackedExpiration,
            "minimumQuantity": item.minimumQuantity,
            "quantityPerBox": item.quantityPerBox,
            "isPrepackaged": item.isPrepackaged,
            "rewrapsWithUniqueBarcode": item.rewrapsWithUniqueBarcode,
            "canBeReworked": item.canBeReworked,
            "reworkShelfLifeDays": item.effectiveReworkShelfLifeDays,
            "maxReworkCount": item.effectiveMaxReworkCount,
            "price": item.price,
            "unit": item.unit.rawValue,
            "isArchived": item.isArchived,
            "includeInInsights": item.includeInInsights,
            "isOnSale": item.isOnSale,
            "salePercentage": item.salePercentage,
            "createdAt": item.createdAt,
            "lastModified": item.lastModified,
            "revision": item.revision,
            "lastSyncedAt": Date()
        ]

        // Keep org-level item docs metadata-only; quantities/batches are store-owned.
        data["storeId"] = FieldValue.delete()
        data["totalQuantity"] = FieldValue.delete()
        data["batches"] = FieldValue.delete()

        if let firstPicture = item.pictures.first {
            let optimized = ImagePipeline.optimizedPhotoData(
                from: firstPicture,
                maxDimension: 960,
                maxBytes: 260_000
            )
            data["thumbnailBase64"] = optimized.base64EncodedString()
        }

        data["upc"] = item.upc
        data["reworkItemCode"] = item.reworkItemCode
        data["department"] = item.department
        data["departmentLocation"] = item.departmentLocation
        data["updatedByUid"] = item.updatedByUid
        data["backendId"] = item.backendId
        data["vendorId"] = item.vendor?.id.uuidString
        data["vendorName"] = item.vendor?.name

        try await ref.setData(data, merge: true)

        let scopedStoreId = item.storeId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !scopedStoreId.isEmpty else { return }
        try await upsertStoreBatches(
            for: item,
            organizationId: organizationId,
            storeId: scopedStoreId,
            db: db
        )
    }

    private func resolveCanonicalStoreDocumentReference(
        organizationId: String,
        storeId: String,
        db: Firestore
    ) async -> DocumentReference? {
        let normalizedStoreID = sanitizeStoreIdentifier(storeId)
        guard !normalizedStoreID.isEmpty else { return nil }

        // Fallback: explicitly walk regions -> districts to find canonical store placement.
        let orgRef = db.collection("organizations").document(organizationId)
        if let regionsSnapshot = try? await orgRef.collection("regions").getDocuments() {
            for regionDoc in regionsSnapshot.documents {
                if let districtsSnapshot = try? await regionDoc.reference.collection("districts").getDocuments() {
                    for districtDoc in districtsSnapshot.documents {
                        let storeRef = districtDoc.reference.collection("stores").document(normalizedStoreID)
                        if let storeDoc = try? await storeRef.getDocument(), storeDoc.exists {
                            return storeRef
                        }
                    }
                }
            }
        }

        // One-release compatibility path: allow legacy root /stores store document.
        let legacyStoreRef = db.collection("organizations")
            .document(organizationId)
            .collection("stores")
            .document(normalizedStoreID)
        if let legacyStoreDoc = try? await legacyStoreRef.getDocument(), legacyStoreDoc.exists {
            return legacyStoreRef
        }

        return nil
    }

    private func inventoryBatchesCollectionReference(
        organizationId: String,
        storeId: String,
        db: Firestore
    ) async -> CollectionReference? {
        if let nestedStoreRef = await resolveCanonicalStoreDocumentReference(
            organizationId: organizationId,
            storeId: storeId,
            db: db
        ) {
            return nestedStoreRef.collection("inventoryBatches")
        }
        return nil
    }

    private func sanitizeStoreIdentifier(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        if trimmed.contains("/") {
            return trimmed
                .split(separator: "/")
                .map(String.init)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .last(where: { !$0.isEmpty }) ?? ""
        }
        return trimmed
    }

    private func upsertStoreBatches(
        for item: InventoryItem,
        organizationId: String,
        storeId: String,
        db: Firestore
    ) async throws {
        guard let baseRef = await inventoryBatchesCollectionReference(
            organizationId: organizationId,
            storeId: storeId,
            db: db
        ) else {
            return
        }

        let existingSnapshot = try await baseRef
            .whereField("itemId", isEqualTo: item.id.uuidString)
            .limit(to: 1000)
            .getDocuments()
        let existingById = Dictionary(uniqueKeysWithValues: existingSnapshot.documents.map { ($0.documentID, $0) })

        var keepIDs = Set<String>()
        for batch in item.batches {
            let batchStore = batch.storeId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !batchStore.isEmpty && batchStore != storeId { continue }

            let quantity = max(0, batch.quantity)
            guard quantity > 0 else { continue }

            let normalizedBackendID = batch.backendId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let backendID = normalizedBackendID.isEmpty ? batch.id.uuidString : normalizedBackendID
            keepIDs.insert(backendID)

            let payload = compact([
                "organizationId": organizationId,
                "storeId": storeId,
                "itemId": item.id.uuidString,
                "itemName": item.name,
                "quantity": quantity,
                "unit": item.unit.rawValue,
                "expiresAt": batch.expirationDate,
                "expirationDate": batch.expirationDate,
                "receivedDate": batch.receivedDate,
                "packageBarcode": batch.packageBarcode,
                "packageWeight": batch.packageWeight,
                "packagePrice": batch.packagePrice,
                "reworkCount": batch.reworkCount,
                "stockAreaRaw": batch.stockAreaRaw,
                "source": "spotcheck",
                "lot": batch.id.uuidString,
                "backendId": backendID,
                "revision": batch.revision,
                "updatedByUid": batch.updatedByUid ?? item.updatedByUid,
                "updatedAt": Date(),
                "lastSyncedAt": Date()
            ])

            try await baseRef.document(backendID).setData(payload, merge: true)
            if batch.backendId != backendID {
                batch.backendId = backendID
            }
            if batch.storeId.trimmingCharacters(in: .whitespacesAndNewlines) != storeId {
                batch.storeId = storeId
            }
        }

        for doc in existingById.values where !keepIDs.contains(doc.documentID) {
            try await doc.reference.delete()
        }
    }

    private func upsert(order: OrderItem, organizationId: String, db: Firestore) async throws {
        let ref = db.collection("organizations")
            .document(organizationId)
            .collection("orders")
            .document(order.id.uuidString)

        let data = compact([
            "id": order.id.uuidString,
            "organizationId": order.organizationId,
            "storeId": order.storeId,
            "itemId": order.itemIDSnapshot?.uuidString,
            "itemName": order.itemNameSnapshot,
            "itemUnit": order.itemUnitSnapshot,
            "itemQuantityPerBox": order.itemQuantityPerBoxSnapshot,
            "vendorId": order.vendorIDSnapshot?.uuidString,
            "vendorName": order.vendorNameSnapshot,
            "recommendedQuantity": order.recommendedQuantity,
            "orderedQuantity": order.orderedQuantity,
            "isChecked": order.isChecked,
            "orderDate": order.orderDate,
            "expectedDeliveryDate": order.expectedDeliveryDate,
            "wasReceived": order.wasReceived,
            "receivedDate": order.receivedDate,
            "backendId": order.backendId,
            "revision": order.revision,
            "updatedByUid": order.updatedByUid,
            "lastSyncedAt": Date()
        ])

        try await ref.setData(data, merge: true)
    }

    private func upsert(todo: ToDoItem, organizationId: String, db: Firestore) async throws {
        let ref = db.collection("organizations")
            .document(organizationId)
            .collection("toDo")
            .document(todo.id.uuidString)

        let data = compact([
            "id": todo.id.uuidString,
            "organizationId": todo.organizationId,
            "storeId": todo.storeId,
            "title": todo.title,
            "taskType": todo.taskType?.rawValue,
            "type": todo.isAutoGenerated ? "auto" : "manual",
            "isCompleted": todo.isCompleted,
            "status": todo.isCompleted ? "completed" : "pending",
            "completedAt": todo.completedAt,
            "isAutoGenerated": todo.isAutoGenerated,
            "isRecurring": todo.isRecurring,
            "isPersistent": todo.isPersistent,
            "date": todo.date,
            "dueAt": todo.date,
            "recurrenceRule": todo.recurrenceRule.rawValue,
            "recurrenceWeekday": todo.recurrenceWeekday,
            "autoTaskKey": todo.autoTaskKey,
            "relatedItemId": todo.relatedItem?.id.uuidString,
            "relatedVendorId": todo.relatedVendor?.id.uuidString,
            "backendId": todo.backendId,
            "revision": todo.revision,
            "updatedByUid": todo.updatedByUid,
            "lastSyncedAt": Date()
        ])

        try await ref.setData(data, merge: true)
    }

    private func upsert(waste: WasteEntry, organizationId: String, db: Firestore) async throws {
        let ref = db.collection("organizations")
            .document(organizationId)
            .collection("waste")
            .document(waste.id.uuidString)

        let data = compact([
            "id": waste.id.uuidString,
            "organizationId": waste.organizationId,
            "storeId": waste.storeId,
            "itemId": waste.itemIDSnapshot?.uuidString,
            "itemName": waste.itemNameSnapshot,
            "quantity": waste.quantity,
            "wasteType": waste.wasteType.rawValue,
            "displayWasteType": waste.displayWasteType,
            "customTypeName": waste.customTypeName,
            "date": waste.date,
            "notes": waste.notes,
            "itemPriceSnapshot": waste.itemPriceSnapshot,
            "includeInInsights": waste.includeInInsights,
            "wasteTypeAffectsOrders": waste.wasteTypeAffectsOrders,
            "backendId": waste.backendId,
            "revision": waste.revision,
            "updatedByUid": waste.updatedByUid,
            "lastSyncedAt": Date()
        ])

        try await ref.setData(data, merge: true)
    }

    private func upsert(
        productionProduct product: ProductionProduct,
        organizationId: String,
        db: Firestore
    ) async throws {
        let ref = db.collection("organizations")
            .document(organizationId)
            .collection("productionProducts")
            .document(product.id.uuidString)

        let data = compact([
            "id": product.id.uuidString,
            "organizationId": product.organizationId,
            "storeId": product.storeId,
            "name": product.name,
            "outputItemID": product.outputItemID?.uuidString,
            "outputItemNameSnapshot": product.outputItemNameSnapshot,
            "outputUnitRaw": product.outputUnitRaw,
            "howToGuideID": product.howToGuideID?.uuidString,
            "defaultBatchYield": product.defaultBatchYield,
            "targetDaysOnHand": product.targetDaysOnHand,
            "instructions": product.instructions,
            "isActive": product.isActive,
            "lastSpotCheckQuantity": product.lastSpotCheckQuantity,
            "lastSpotCheckDate": product.lastSpotCheckDate,
            "createdAt": product.createdAt,
            "updatedAt": product.updatedAt,
            "backendId": product.backendId,
            "revision": product.revision,
            "updatedByUid": product.updatedByUid,
            "lastSyncedAt": Date()
        ])
        try await ref.setData(data, merge: true)
    }

    private func upsert(
        productionIngredient ingredient: ProductionIngredient,
        organizationId: String,
        db: Firestore
    ) async throws {
        let ref = db.collection("organizations")
            .document(organizationId)
            .collection("productionIngredients")
            .document(ingredient.id.uuidString)

        let data = compact([
            "id": ingredient.id.uuidString,
            "organizationId": ingredient.organizationId,
            "storeId": ingredient.storeId,
            "productionProductID": ingredient.productionProductID.uuidString,
            "inventoryItemID": ingredient.inventoryItemID?.uuidString,
            "inventoryItemNameSnapshot": ingredient.inventoryItemNameSnapshot,
            "quantityPerBatch": ingredient.quantityPerBatch,
            "unitRaw": ingredient.unitRaw,
            "createdAt": ingredient.createdAt,
            "updatedAt": ingredient.updatedAt,
            "backendId": ingredient.backendId,
            "revision": ingredient.revision,
            "updatedByUid": ingredient.updatedByUid,
            "lastSyncedAt": Date()
        ])
        try await ref.setData(data, merge: true)
    }

    private func upsert(
        productionSpotCheck record: ProductionSpotCheckRecord,
        organizationId: String,
        db: Firestore
    ) async throws {
        let ref = db.collection("organizations")
            .document(organizationId)
            .collection("productionSpotChecks")
            .document(record.id.uuidString)

        let data = compact([
            "id": record.id.uuidString,
            "organizationId": record.organizationId,
            "storeId": record.storeId,
            "productionProductID": record.productionProductID.uuidString,
            "countedQuantity": record.countedQuantity,
            "previousQuantity": record.previousQuantity,
            "quantityProducedSinceLast": record.quantityProducedSinceLast,
            "usageObserved": record.usageObserved,
            "checkedAt": record.checkedAt,
            "backendId": record.backendId,
            "revision": record.revision,
            "updatedByUid": record.updatedByUid,
            "lastSyncedAt": Date()
        ])
        try await ref.setData(data, merge: true)
    }

    private func upsert(
        productionRun run: ProductionRun,
        organizationId: String,
        db: Firestore
    ) async throws {
        let ref = db.collection("organizations")
            .document(organizationId)
            .collection("productionRuns")
            .document(run.id.uuidString)

        let data = compact([
            "id": run.id.uuidString,
            "organizationId": run.organizationId,
            "storeId": run.storeId,
            "productionProductID": run.productionProductID.uuidString,
            "outputItemID": run.outputItemID?.uuidString,
            "outputBatchID": run.outputBatchID?.uuidString,
            "quantityMade": run.quantityMade,
            "packageBarcode": run.packageBarcode,
            "expirationDate": run.expirationDate,
            "madeAt": run.madeAt,
            "backendId": run.backendId,
            "revision": run.revision,
            "updatedByUid": run.updatedByUid,
            "lastSyncedAt": Date()
        ])
        try await ref.setData(data, merge: true)
    }

    private func upsert(
        howToGuide guide: HowToGuide,
        organizationId: String,
        db: Firestore
    ) async throws {
        let remoteGuideID = guide.backendId?.trimmingCharacters(in: .whitespacesAndNewlines)
        let canonicalGuideID = (remoteGuideID?.isEmpty == false ? remoteGuideID! : guide.id.uuidString)
        let ref = db.collection("organizations")
            .document(organizationId)
            .collection("howToGuides")
            .document(canonicalGuideID)

        let data = compact([
            "id": canonicalGuideID,
            "organizationId": guide.organizationId,
            "title": guide.title,
            "keywords": guide.keywords,
            "steps": guide.steps,
            "notes": guide.notes,
            "isActive": guide.isActive,
            "createdAt": guide.createdAt,
            "updatedAt": guide.updatedAt,
            "backendId": canonicalGuideID,
            "revision": guide.revision,
            "updatedByUid": guide.updatedByUid,
            "lastSyncedAt": Date()
        ])
        try await ref.setData(data, merge: true)
    }

    private func mergeRemoteProducts(
        from snapshot: QuerySnapshot,
        organizationId: String,
        storeId: String,
        modelContext: ModelContext
    ) {
        let descriptor = FetchDescriptor<ProductionProduct>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        let existing = (try? modelContext.fetch(descriptor)) ?? []
        var byID = Dictionary(uniqueKeysWithValues: existing.map { ($0.id, $0) })

        for doc in snapshot.documents {
            let data = doc.data()
            guard (data["organizationId"] as? String ?? organizationId) == organizationId else { continue }
            let remoteStore = (data["storeId"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !remoteStore.isEmpty, remoteStore == storeId else { continue }

            let idString = (data["id"] as? String) ?? doc.documentID
            guard let id = UUID(uuidString: idString) else { continue }

            if let local = byID[id] {
                applyRemoteProduct(data: data, to: local)
            } else {
                let created = ProductionProduct(
                    name: data["name"] as? String ?? "Untitled",
                    outputItemID: UUID(uuidString: data["outputItemID"] as? String ?? ""),
                    outputItemNameSnapshot: data["outputItemNameSnapshot"] as? String,
                    outputUnitRaw: data["outputUnitRaw"] as? String ?? MeasurementUnit.pieces.rawValue,
                    howToGuideID: UUID(uuidString: data["howToGuideID"] as? String ?? ""),
                    defaultBatchYield: max(0.001, data["defaultBatchYield"] as? Double ?? 1),
                    targetDaysOnHand: max(0.25, data["targetDaysOnHand"] as? Double ?? 1.5),
                    instructions: data["instructions"] as? [String] ?? [],
                    isActive: data["isActive"] as? Bool ?? true,
                    lastSpotCheckQuantity: max(0, data["lastSpotCheckQuantity"] as? Double ?? 0),
                    lastSpotCheckDate: dateValue(data["lastSpotCheckDate"]),
                    organizationId: organizationId,
                    storeId: storeId,
                    backendId: data["backendId"] as? String
                )
                created.id = id
                created.createdAt = dateValue(data["createdAt"])
                created.updatedAt = dateValue(data["updatedAt"])
                created.revision = data["revision"] as? Int ?? 0
                created.updatedByUid = data["updatedByUid"] as? String
                created.lastSyncedAt = Date()
                modelContext.insert(created)
                byID[id] = created
            }
        }
    }

    private func applyRemoteProduct(data: [String: Any], to local: ProductionProduct) {
        local.name = data["name"] as? String ?? local.name
        local.outputItemID = UUID(uuidString: data["outputItemID"] as? String ?? "")
        local.outputItemNameSnapshot = data["outputItemNameSnapshot"] as? String
        local.outputUnitRaw = data["outputUnitRaw"] as? String ?? local.outputUnitRaw
        local.howToGuideID = UUID(uuidString: data["howToGuideID"] as? String ?? "")
        local.defaultBatchYield = max(0.001, data["defaultBatchYield"] as? Double ?? local.defaultBatchYield)
        local.targetDaysOnHand = max(0.25, data["targetDaysOnHand"] as? Double ?? local.targetDaysOnHand)
        local.instructions = data["instructions"] as? [String] ?? local.instructions
        local.isActive = data["isActive"] as? Bool ?? local.isActive
        local.lastSpotCheckQuantity = max(0, data["lastSpotCheckQuantity"] as? Double ?? local.lastSpotCheckQuantity)
        local.lastSpotCheckDate = dateValue(data["lastSpotCheckDate"])
        local.storeId = data["storeId"] as? String ?? local.storeId
        local.backendId = data["backendId"] as? String
        local.createdAt = dateValue(data["createdAt"])
        local.updatedAt = dateValue(data["updatedAt"])
        local.revision = data["revision"] as? Int ?? local.revision
        local.updatedByUid = data["updatedByUid"] as? String
        local.lastSyncedAt = Date()
    }

    private func mergeRemoteIngredients(
        from snapshot: QuerySnapshot,
        organizationId: String,
        storeId: String,
        modelContext: ModelContext
    ) {
        let descriptor = FetchDescriptor<ProductionIngredient>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        let existing = (try? modelContext.fetch(descriptor)) ?? []
        var byID = Dictionary(uniqueKeysWithValues: existing.map { ($0.id, $0) })

        for doc in snapshot.documents {
            let data = doc.data()
            guard (data["organizationId"] as? String ?? organizationId) == organizationId else { continue }
            let remoteStore = (data["storeId"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !remoteStore.isEmpty, remoteStore == storeId else { continue }

            let idString = (data["id"] as? String) ?? doc.documentID
            guard let id = UUID(uuidString: idString) else { continue }

            if let local = byID[id] {
                local.productionProductID = UUID(uuidString: data["productionProductID"] as? String ?? "") ?? local.productionProductID
                local.inventoryItemID = UUID(uuidString: data["inventoryItemID"] as? String ?? "")
                local.inventoryItemNameSnapshot = data["inventoryItemNameSnapshot"] as? String ?? local.inventoryItemNameSnapshot
                local.quantityPerBatch = max(0, data["quantityPerBatch"] as? Double ?? local.quantityPerBatch)
                local.unitRaw = data["unitRaw"] as? String ?? local.unitRaw
                local.storeId = data["storeId"] as? String ?? local.storeId
                local.backendId = data["backendId"] as? String
                local.createdAt = dateValue(data["createdAt"])
                local.updatedAt = dateValue(data["updatedAt"])
                local.revision = data["revision"] as? Int ?? local.revision
                local.updatedByUid = data["updatedByUid"] as? String
                local.lastSyncedAt = Date()
            } else {
                let created = ProductionIngredient(
                    productionProductID: UUID(uuidString: data["productionProductID"] as? String ?? "") ?? UUID(),
                    inventoryItemID: UUID(uuidString: data["inventoryItemID"] as? String ?? ""),
                    inventoryItemNameSnapshot: data["inventoryItemNameSnapshot"] as? String ?? "",
                    quantityPerBatch: max(0, data["quantityPerBatch"] as? Double ?? 0),
                    unitRaw: data["unitRaw"] as? String ?? MeasurementUnit.pieces.rawValue,
                    organizationId: organizationId,
                    storeId: storeId,
                    backendId: data["backendId"] as? String
                )
                created.id = id
                created.createdAt = dateValue(data["createdAt"])
                created.updatedAt = dateValue(data["updatedAt"])
                created.revision = data["revision"] as? Int ?? 0
                created.updatedByUid = data["updatedByUid"] as? String
                created.lastSyncedAt = Date()
                modelContext.insert(created)
                byID[id] = created
            }
        }
    }

    private func mergeRemoteSpotChecks(
        from snapshot: QuerySnapshot,
        organizationId: String,
        storeId: String,
        modelContext: ModelContext
    ) {
        let descriptor = FetchDescriptor<ProductionSpotCheckRecord>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        let existing = (try? modelContext.fetch(descriptor)) ?? []
        var byID = Dictionary(uniqueKeysWithValues: existing.map { ($0.id, $0) })

        for doc in snapshot.documents {
            let data = doc.data()
            guard (data["organizationId"] as? String ?? organizationId) == organizationId else { continue }
            let remoteStore = (data["storeId"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !remoteStore.isEmpty, remoteStore == storeId else { continue }

            let idString = (data["id"] as? String) ?? doc.documentID
            guard let id = UUID(uuidString: idString) else { continue }

            if let local = byID[id] {
                local.productionProductID = UUID(uuidString: data["productionProductID"] as? String ?? "") ?? local.productionProductID
                local.countedQuantity = max(0, data["countedQuantity"] as? Double ?? local.countedQuantity)
                local.previousQuantity = max(0, data["previousQuantity"] as? Double ?? local.previousQuantity)
                local.quantityProducedSinceLast = max(0, data["quantityProducedSinceLast"] as? Double ?? local.quantityProducedSinceLast)
                local.usageObserved = max(0, data["usageObserved"] as? Double ?? local.usageObserved)
                local.checkedAt = dateValue(data["checkedAt"])
                local.storeId = data["storeId"] as? String ?? local.storeId
                local.backendId = data["backendId"] as? String
                local.revision = data["revision"] as? Int ?? local.revision
                local.updatedByUid = data["updatedByUid"] as? String
                local.lastSyncedAt = Date()
            } else {
                let created = ProductionSpotCheckRecord(
                    productionProductID: UUID(uuidString: data["productionProductID"] as? String ?? "") ?? UUID(),
                    countedQuantity: max(0, data["countedQuantity"] as? Double ?? 0),
                    previousQuantity: max(0, data["previousQuantity"] as? Double ?? 0),
                    quantityProducedSinceLast: max(0, data["quantityProducedSinceLast"] as? Double ?? 0),
                    usageObserved: max(0, data["usageObserved"] as? Double ?? 0),
                    checkedAt: dateValue(data["checkedAt"]),
                    organizationId: organizationId,
                    storeId: storeId,
                    backendId: data["backendId"] as? String
                )
                created.id = id
                created.revision = data["revision"] as? Int ?? 0
                created.updatedByUid = data["updatedByUid"] as? String
                created.lastSyncedAt = Date()
                modelContext.insert(created)
                byID[id] = created
            }
        }
    }

    private func mergeRemoteRuns(
        from snapshot: QuerySnapshot,
        organizationId: String,
        storeId: String,
        modelContext: ModelContext
    ) {
        let descriptor = FetchDescriptor<ProductionRun>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        let existing = (try? modelContext.fetch(descriptor)) ?? []
        var byID = Dictionary(uniqueKeysWithValues: existing.map { ($0.id, $0) })

        for doc in snapshot.documents {
            let data = doc.data()
            guard (data["organizationId"] as? String ?? organizationId) == organizationId else { continue }
            let remoteStore = (data["storeId"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !remoteStore.isEmpty, remoteStore == storeId else { continue }

            let idString = (data["id"] as? String) ?? doc.documentID
            guard let id = UUID(uuidString: idString) else { continue }

            if let local = byID[id] {
                local.productionProductID = UUID(uuidString: data["productionProductID"] as? String ?? "") ?? local.productionProductID
                local.outputItemID = UUID(uuidString: data["outputItemID"] as? String ?? "")
                local.outputBatchID = UUID(uuidString: data["outputBatchID"] as? String ?? "")
                local.quantityMade = max(0, data["quantityMade"] as? Double ?? local.quantityMade)
                local.packageBarcode = data["packageBarcode"] as? String
                local.expirationDate = dateValue(data["expirationDate"])
                local.madeAt = dateValue(data["madeAt"])
                local.storeId = data["storeId"] as? String ?? local.storeId
                local.backendId = data["backendId"] as? String
                local.revision = data["revision"] as? Int ?? local.revision
                local.updatedByUid = data["updatedByUid"] as? String
                local.lastSyncedAt = Date()
            } else {
                let created = ProductionRun(
                    productionProductID: UUID(uuidString: data["productionProductID"] as? String ?? "") ?? UUID(),
                    outputItemID: UUID(uuidString: data["outputItemID"] as? String ?? ""),
                    outputBatchID: UUID(uuidString: data["outputBatchID"] as? String ?? ""),
                    quantityMade: max(0, data["quantityMade"] as? Double ?? 0),
                    packageBarcode: data["packageBarcode"] as? String,
                    expirationDate: dateValue(data["expirationDate"]),
                    madeAt: dateValue(data["madeAt"]),
                    organizationId: organizationId,
                    storeId: storeId,
                    backendId: data["backendId"] as? String
                )
                created.id = id
                created.revision = data["revision"] as? Int ?? 0
                created.updatedByUid = data["updatedByUid"] as? String
                created.lastSyncedAt = Date()
                modelContext.insert(created)
                byID[id] = created
            }
        }
    }

    private func mergeRemoteGuides(
        from snapshot: QuerySnapshot,
        organizationId: String,
        modelContext: ModelContext,
        skipBackendIDs: Set<String> = [],
        skipTitleKeys: Set<String> = []
    ) {
        let descriptor = FetchDescriptor<HowToGuide>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        let existing = (try? modelContext.fetch(descriptor)) ?? []
        var byID = Dictionary(uniqueKeysWithValues: existing.map { ($0.id, $0) })
        var byBackendId: [String: HowToGuide] = [:]
        for guide in existing {
            if let backendId = guide.backendId, !backendId.isEmpty {
                byBackendId[backendId] = guide
            }
        }

        for doc in snapshot.documents {
            let data = doc.data()
            guard (data["organizationId"] as? String ?? organizationId) == organizationId else { continue }

            let idString = (data["id"] as? String) ?? doc.documentID
            let parsedID = UUID(uuidString: idString)
            let backendKey = (data["backendId"] as? String) ?? idString
            let normalizedBackend = backendKey.lowercased()
            if skipBackendIDs.contains(normalizedBackend) { continue }

            let title = (data["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let titleKey = title.lowercased()
            if !titleKey.isEmpty, skipTitleKeys.contains(titleKey) { continue }

            if let id = parsedID, let local = byID[id] {
                local.title = data["title"] as? String ?? local.title
                local.keywords = data["keywords"] as? [String] ?? local.keywords
                local.steps = data["steps"] as? [String] ?? local.steps
                local.notes = data["notes"] as? String ?? local.notes
                local.isActive = data["isActive"] as? Bool ?? local.isActive
                local.backendId = backendKey
                local.createdAt = dateValue(data["createdAt"])
                local.updatedAt = dateValue(data["updatedAt"])
                local.revision = data["revision"] as? Int ?? local.revision
                local.updatedByUid = data["updatedByUid"] as? String
                local.lastSyncedAt = Date()
                byBackendId[backendKey] = local
            } else if let local = byBackendId[backendKey] {
                local.title = data["title"] as? String ?? local.title
                local.keywords = data["keywords"] as? [String] ?? local.keywords
                local.steps = data["steps"] as? [String] ?? local.steps
                local.notes = data["notes"] as? String ?? local.notes
                local.isActive = data["isActive"] as? Bool ?? local.isActive
                local.backendId = backendKey
                local.createdAt = dateValue(data["createdAt"])
                local.updatedAt = dateValue(data["updatedAt"])
                local.revision = data["revision"] as? Int ?? local.revision
                local.updatedByUid = data["updatedByUid"] as? String
                local.lastSyncedAt = Date()
            } else {
                let created = HowToGuide(
                    title: data["title"] as? String ?? "Untitled Guide",
                    keywords: data["keywords"] as? [String] ?? [],
                    steps: data["steps"] as? [String] ?? [],
                    notes: data["notes"] as? String ?? "",
                    isActive: data["isActive"] as? Bool ?? true,
                    organizationId: organizationId,
                    backendId: backendKey
                )
                created.id = parsedID ?? UUID()
                created.createdAt = dateValue(data["createdAt"])
                created.updatedAt = dateValue(data["updatedAt"])
                created.revision = data["revision"] as? Int ?? 0
                created.updatedByUid = data["updatedByUid"] as? String
                created.lastSyncedAt = Date()
                modelContext.insert(created)
                byID[created.id] = created
                byBackendId[backendKey] = created
            }
        }
    }

    private func mergeRemoteGuidesFromModern(
        orgRef: DocumentReference,
        snapshot: QuerySnapshot,
        organizationId: String,
        modelContext: ModelContext
    ) async {
        let descriptor = FetchDescriptor<HowToGuide>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        let existing = (try? modelContext.fetch(descriptor)) ?? []
        var byID = Dictionary(uniqueKeysWithValues: existing.map { ($0.id, $0) })
        var byBackendId: [String: HowToGuide] = [:]
        for guide in existing {
            if let backendId = guide.backendId, !backendId.isEmpty {
                byBackendId[backendId] = guide
            }
        }

        for doc in snapshot.documents {
            let data = doc.data()
            guard (data["organizationId"] as? String ?? organizationId) == organizationId else { continue }

            let backendKey = (data["backendId"] as? String) ?? doc.documentID
            let parsedID = UUID(uuidString: backendKey)
            let title = data["title"] as? String ?? "Untitled Guide"
            let description = data["description"] as? String ?? ""
            let tags = data["tags"] as? [String] ?? []
            let fallbackKeywords = tags.isEmpty
                ? title
                    .split(separator: " ")
                    .map { String($0) }
                    .filter { $0.count > 2 }
                : tags

            var stepsText: [String] = []
            if let stepsSnapshot = try? await orgRef
                .collection("howtos")
                .document(doc.documentID)
                .collection("steps")
                .order(by: "stepNumber", descending: false)
                .getDocuments()
            {
                for stepDoc in stepsSnapshot.documents {
                    let stepData = stepDoc.data()
                    let stepTitle = stepData["title"] as? String ?? ""
                    if let blocksSnapshot = try? await orgRef
                        .collection("howtos")
                        .document(doc.documentID)
                        .collection("steps")
                        .document(stepDoc.documentID)
                        .collection("blocks")
                        .order(by: "orderIndex", descending: false)
                        .getDocuments()
                    {
                        let textBlocks = blocksSnapshot.documents.compactMap { blockDoc -> String? in
                            let blockData = blockDoc.data()
                            let blockType = blockData["type"] as? String ?? "text"
                            guard blockType == "text" else { return nil }
                            let text = (blockData["text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                            return text.isEmpty ? nil : text
                        }
                        if !textBlocks.isEmpty {
                            stepsText.append(textBlocks.joined(separator: " "))
                        } else if !stepTitle.isEmpty {
                            stepsText.append(stepTitle)
                        }
                    } else if !stepTitle.isEmpty {
                        stepsText.append(stepTitle)
                    }
                }
            }

            if stepsText.isEmpty {
                stepsText = [description].filter { !$0.isEmpty }
            }

            if let id = parsedID, let local = byID[id] {
                local.title = title
                local.keywords = fallbackKeywords
                local.steps = stepsText
                local.notes = description
                local.isActive = data["isActive"] as? Bool ?? true
                local.backendId = backendKey
                local.createdAt = dateValue(data["createdAt"])
                local.updatedAt = dateValue(data["updatedAt"])
                local.revision = data["version"] as? Int ?? data["revision"] as? Int ?? local.revision
                local.updatedByUid = (data["updatedBy"] as? String) ?? (data["updatedByUid"] as? String)
                local.lastSyncedAt = Date()
                byBackendId[backendKey] = local
            } else if let local = byBackendId[backendKey] {
                local.title = title
                local.keywords = fallbackKeywords
                local.steps = stepsText
                local.notes = description
                local.isActive = data["isActive"] as? Bool ?? true
                local.backendId = backendKey
                local.createdAt = dateValue(data["createdAt"])
                local.updatedAt = dateValue(data["updatedAt"])
                local.revision = data["version"] as? Int ?? data["revision"] as? Int ?? local.revision
                local.updatedByUid = (data["updatedBy"] as? String) ?? (data["updatedByUid"] as? String)
                local.lastSyncedAt = Date()
            } else {
                let created = HowToGuide(
                    title: title,
                    keywords: fallbackKeywords,
                    steps: stepsText,
                    notes: description,
                    isActive: data["isActive"] as? Bool ?? true,
                    organizationId: organizationId,
                    backendId: backendKey
                )
                created.id = parsedID ?? UUID()
                created.createdAt = dateValue(data["createdAt"])
                created.updatedAt = dateValue(data["updatedAt"])
                created.revision = data["version"] as? Int ?? data["revision"] as? Int ?? 0
                created.updatedByUid = (data["updatedBy"] as? String) ?? (data["updatedByUid"] as? String)
                created.lastSyncedAt = Date()
                modelContext.insert(created)
                byID[created.id] = created
                byBackendId[backendKey] = created
            }
        }
    }

    private func deduplicateLocalGuides(
        organizationId: String,
        modelContext: ModelContext
    ) {
        let descriptor = FetchDescriptor<HowToGuide>(
            predicate: #Predicate { $0.organizationId == organizationId }
        )
        let guides = (try? modelContext.fetch(descriptor)) ?? []
        guard guides.count > 1 else { return }

        var keepByBackend: [String: HowToGuide] = [:]
        var keepByContent: [String: HowToGuide] = [:]
        var toDelete: [HowToGuide] = []

        for guide in guides {
            let backendKey = guide.backendId?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased() ?? ""

            if !backendKey.isEmpty {
                if let current = keepByBackend[backendKey] {
                    let winner = preferredGuide(current, guide)
                    let loser = (winner === current) ? guide : current
                    keepByBackend[backendKey] = winner
                    toDelete.append(loser)
                    continue
                } else {
                    keepByBackend[backendKey] = guide
                }
            }

            let contentKey = guideContentKey(guide)
            if let current = keepByContent[contentKey] {
                let winner = preferredGuide(current, guide)
                let loser = (winner === current) ? guide : current
                keepByContent[contentKey] = winner
                toDelete.append(loser)
            } else {
                keepByContent[contentKey] = guide
            }
        }

        for duplicate in Set(toDelete.map(\.id)).compactMap({ id in guides.first(where: { $0.id == id }) }) {
            modelContext.delete(duplicate)
        }
    }

    private func guideContentKey(_ guide: HowToGuide) -> String {
        let title = guide.title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let steps = guide.steps
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .joined(separator: "|")
        let notes = guide.notes.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return "\(title)#\(steps)#\(notes)"
    }

    private func preferredGuide(_ left: HowToGuide, _ right: HowToGuide) -> HowToGuide {
        if left.revision != right.revision {
            return left.revision > right.revision ? left : right
        }
        if left.updatedAt != right.updatedAt {
            return left.updatedAt > right.updatedAt ? left : right
        }
        if left.steps.count != right.steps.count {
            return left.steps.count > right.steps.count ? left : right
        }
        if left.notes.count != right.notes.count {
            return left.notes.count > right.notes.count ? left : right
        }
        return left
    }

    private func stringValue(_ value: Any?) -> String? {
        guard let value else { return nil }
        if let string = value as? String {
            let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        if let number = value as? NSNumber {
            return number.stringValue
        }
        return nil
    }

    private func intValue(_ value: Any?, fallback: Int = 0) -> Int {
        guard let value else { return fallback }
        if let intValue = value as? Int { return intValue }
        if let number = value as? NSNumber { return number.intValue }
        if let string = value as? String, let parsed = Int(string.trimmingCharacters(in: .whitespacesAndNewlines)) {
            return parsed
        }
        return fallback
    }

    private func optionalIntValue(_ value: Any?) -> Int? {
        guard let value else { return nil }
        if let intValue = value as? Int { return intValue }
        if let number = value as? NSNumber { return number.intValue }
        if let string = value as? String, let parsed = Int(string.trimmingCharacters(in: .whitespacesAndNewlines)) {
            return parsed
        }
        return nil
    }

    private func doubleValue(_ value: Any?, fallback: Double = 0) -> Double {
        guard let value else { return fallback }
        if let doubleValue = value as? Double { return doubleValue }
        if let intValue = value as? Int { return Double(intValue) }
        if let number = value as? NSNumber { return number.doubleValue }
        if let string = value as? String, let parsed = Double(string.trimmingCharacters(in: .whitespacesAndNewlines)) {
            return parsed
        }
        return fallback
    }

    private func optionalDoubleValue(_ value: Any?) -> Double? {
        guard let value else { return nil }
        if let doubleValue = value as? Double { return doubleValue }
        if let intValue = value as? Int { return Double(intValue) }
        if let number = value as? NSNumber { return number.doubleValue }
        if let string = value as? String, let parsed = Double(string.trimmingCharacters(in: .whitespacesAndNewlines)) {
            return parsed
        }
        return nil
    }

    private func boolValue(_ value: Any?, fallback: Bool = false) -> Bool {
        guard let value else { return fallback }
        if let boolValue = value as? Bool { return boolValue }
        if let number = value as? NSNumber { return number.boolValue }
        if let string = value as? String {
            switch string.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            case "1", "true", "yes", "y", "on":
                return true
            case "0", "false", "no", "n", "off":
                return false
            default:
                return fallback
            }
        }
        return fallback
    }

    private func optionalBoolValue(_ value: Any?) -> Bool? {
        guard let value else { return nil }
        if let boolValue = value as? Bool { return boolValue }
        if let number = value as? NSNumber { return number.boolValue }
        if let string = value as? String {
            switch string.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            case "1", "true", "yes", "y", "on":
                return true
            case "0", "false", "no", "n", "off":
                return false
            default:
                return nil
            }
        }
        return nil
    }

    private func optionalDateValue(_ value: Any?) -> Date? {
        guard let value else { return nil }
        if let timestamp = value as? Timestamp {
            return timestamp.dateValue()
        }
        if let date = value as? Date {
            return date
        }
        if let number = value as? NSNumber {
            return Date(timeIntervalSince1970: number.doubleValue)
        }
        if let string = value as? String {
            let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
            if let interval = Double(trimmed) {
                return Date(timeIntervalSince1970: interval)
            }
            if let isoDate = ISO8601DateFormatter().date(from: trimmed) {
                return isoDate
            }
        }
        return nil
    }

    private func resolveWasteType(from data: [String: Any]) -> WasteType {
        let candidates: [String] = [
            stringValue(data["wasteType"]),
            stringValue(data["displayWasteType"]),
            stringValue(data["customTypeName"])
        ]
        .compactMap { $0 }

        for raw in candidates {
            if let exact = WasteType(rawValue: raw) {
                return exact
            }
            let normalized = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            switch normalized {
            case "expired":
                return .expired
            case "moldy":
                return .moldy
            case "temped wrong", "temped_wrong", "tempedwrong", "temperature":
                return .tempedWrong
            case "sampling":
                return .sampling
            case "other":
                return .other
            default:
                continue
            }
        }
        return .custom
    }

    private func dateValue(_ value: Any?) -> Date {
        if let timestamp = value as? Timestamp {
            return timestamp.dateValue()
        }
        if let date = value as? Date {
            return date
        }
        if let number = value as? NSNumber {
            return Date(timeIntervalSince1970: number.doubleValue)
        }
        return Date()
    }

    private func batchesDiffer(local: [Batch], remote: [[String: Any]]) -> Bool {
        if local.count != remote.count { return true }

        let localSignature = local
            .map { batch in
                [
                    batch.id.uuidString,
                    String(format: "%.4f", batch.quantity),
                    String(Int(batch.expirationDate.timeIntervalSince1970)),
                    String(Int(batch.receivedDate.timeIntervalSince1970)),
                    batch.packageBarcode ?? "",
                    batch.stockAreaRaw,
                    "\(batch.reworkCount)"
                ].joined(separator: "|")
            }
            .sorted()

        let remoteSignature = remote
            .compactMap { batchData -> String? in
                let quantity = batchData["quantity"] as? Double ?? 0
                guard quantity > 0 else { return nil }
                let id = (batchData["id"] as? String) ?? ""
                let expiration = dateValue(batchData["expirationDate"])
                let received = dateValue(batchData["receivedDate"])
                let barcode = batchData["packageBarcode"] as? String ?? ""
                let stockAreaRaw = batchData["stockAreaRaw"] as? String ?? ""
                let reworkCount = batchData["reworkCount"] as? Int ?? 0
                return [
                    id,
                    String(format: "%.4f", quantity),
                    String(Int(expiration.timeIntervalSince1970)),
                    String(Int(received.timeIntervalSince1970)),
                    barcode,
                    stockAreaRaw,
                    "\(reworkCount)"
                ].joined(separator: "|")
            }
            .sorted()

        return localSignature != remoteSignature
    }

    private func resolveRemoteImageData(data: [String: Any], cacheKey: String) async -> Data? {
        if let cached = imageFromRemoteCache(for: cacheKey) {
            return cached
        }
        if let thumbnailBase64 = data["thumbnailBase64"] as? String,
           let decoded = decodeBase64Data(thumbnailBase64) {
            return cacheRemoteImage(decoded, for: cacheKey)
        }

        if let urls = data["pictures"] as? [String],
           let firstURL = urls.first,
           let downloaded = await downloadRemoteImage(urlString: firstURL) {
            return cacheRemoteImage(downloaded, for: cacheKey)
        }

        if let photoUrl = data["photoUrl"] as? String,
           let downloaded = await downloadRemoteImage(urlString: photoUrl) {
            return cacheRemoteImage(downloaded, for: cacheKey)
        }

        return nil
    }

    private func imageFromRemoteCache(for key: String) -> Data? {
        remoteImageCache[key]
    }

    @discardableResult
    private func cacheRemoteImage(_ data: Data, for key: String) -> Data {
        let optimized = ImagePipeline.optimizedPhotoData(
            from: data,
            maxDimension: 840,
            maxBytes: 220_000
        )
        let stored = optimized.isEmpty ? data : optimized

        if remoteImageCache[key] == nil {
            remoteImageCacheOrder.append(key)
        } else {
            remoteImageCacheOrder.removeAll { $0 == key }
            remoteImageCacheOrder.append(key)
        }
        remoteImageCache[key] = stored

        if remoteImageCacheOrder.count > remoteImageCacheLimit {
            let removeCount = remoteImageCacheOrder.count - remoteImageCacheLimit
            for _ in 0..<removeCount {
                let evictedKey = remoteImageCacheOrder.removeFirst()
                remoteImageCache.removeValue(forKey: evictedKey)
            }
        }

        return stored
    }

    private func clearRemoteImageCache() {
        remoteImageCache.removeAll(keepingCapacity: false)
        remoteImageCacheOrder.removeAll(keepingCapacity: false)
    }

    private func decodeBase64Data(_ raw: String) -> Data? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if let commaIndex = trimmed.firstIndex(of: ","),
           trimmed[..<commaIndex].contains("base64") {
            let payload = String(trimmed[trimmed.index(after: commaIndex)...])
            return Data(base64Encoded: payload)
        }
        return Data(base64Encoded: trimmed)
    }

    private func downloadRemoteImage(urlString: String) async -> Data? {
        guard let url = URL(string: urlString) else { return nil }
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse,
                  200..<300 ~= http.statusCode,
                  !data.isEmpty else {
                return nil
            }
            return data
        } catch {
            return nil
        }
    }
#endif

    private func compact(_ source: [String: Any?]) -> [String: Any] {
        var result: [String: Any] = [:]
        result.reserveCapacity(source.count)
        for (key, value) in source {
            guard let value else { continue }
            result[key] = value
        }
        return result
    }
}
