import SwiftUI
import SwiftData

@main
struct InvenTrackerApp: App {
    @StateObject private var accountSession = AccountSessionStore()
    #if canImport(UIKit)
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    #endif

    init() {
        FirebaseBootstrap.configureIfNeeded()
    }

    var body: some Scene {
        WindowGroup {
            AppEntryView()
                .environmentObject(accountSession)
        }
        .modelContainer(sharedContainer)
    }
}

private var sharedContainer: ModelContainer = {
    let schema = Schema([
        InventoryItem.self,
        Batch.self,
        WasteEntry.self,
        OrderItem.self,
        ToDoItem.self,
        ProductionProduct.self,
        ProductionIngredient.self,
        ProductionSpotCheckRecord.self,
        ProductionRun.self,
        HowToGuide.self,
        Vendor.self,
        SaleAdjustment.self,
        SpotCheckInsightAction.self,
        PendingSyncAction.self,
        TransferRecord.self
    ])

    // Recover from incompatible local schema changes without hard-crashing.
    // We keep the chosen store name stable across launches.
    let primaryStoreName = "InvenTrackerStore"
    let fallbackStoreName = "InvenTrackerStoreV2"
    let activeStoreNameKey = "swiftdata_active_store_name"
    let defaults = UserDefaults.standard

    func makeContainer(named storeName: String) throws -> ModelContainer {
        let config = ModelConfiguration(storeName)
        return try ModelContainer(for: schema, configurations: [config])
    }

    let preferredStore = defaults.string(forKey: activeStoreNameKey) ?? primaryStoreName
    let candidates: [String] = {
        // Recovery rule:
        // If we were previously switched to fallback, always try the original
        // primary store first so historical data can be recovered automatically.
        if preferredStore == fallbackStoreName {
            return [primaryStoreName, fallbackStoreName]
        }
        if preferredStore == primaryStoreName {
            return [primaryStoreName, fallbackStoreName]
        }
        return [preferredStore, primaryStoreName, fallbackStoreName]
    }()

    for candidate in candidates {
        do {
            let container = try makeContainer(named: candidate)
            defaults.set(candidate, forKey: activeStoreNameKey)
            if candidate != preferredStore {
                print("SwiftData: recovered by opening store '\(candidate)' instead of '\(preferredStore)'.")
            }
            return container
        } catch {
            print("SwiftData: failed to open store '\(candidate)': \(error)")
        }
    }

    do {
        let inMemoryConfig = ModelConfiguration(isStoredInMemoryOnly: true)
        print("SwiftData: using in-memory store as last-resort recovery.")
        return try ModelContainer(for: schema, configurations: [inMemoryConfig])
    } catch {
        fatalError("Failed to create ModelContainer for primary, fallback, and in-memory stores: \(error)")
    }
}()
