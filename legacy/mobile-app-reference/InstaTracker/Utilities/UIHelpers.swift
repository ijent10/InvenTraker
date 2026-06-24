import SwiftUI

private enum QuantityFormatterCache {
    private static var cache: [Int: NumberFormatter] = [:]
    private static let lock = NSLock()

    static func formatter(maximumFractionDigits: Int) -> NumberFormatter {
        let digits = max(0, maximumFractionDigits)
        lock.lock()
        defer { lock.unlock() }
        if let formatter = cache[digits] {
            return formatter
        }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = digits
        cache[digits] = formatter
        return formatter
    }
}

extension Double {
    func formattedQuantity(maximumFractionDigits: Int = 3) -> String {
        let formatter = QuantityFormatterCache.formatter(maximumFractionDigits: maximumFractionDigits)
        return formatter.string(from: NSNumber(value: self)) ?? "0"
    }
}

extension InventoryItem {
    func belongsToStore(_ activeStoreID: String) -> Bool {
        let normalizedActive = activeStoreID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedActive.isEmpty else { return false }

        let normalizedItemStore = storeId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedItemStore.isEmpty {
            return normalizedItemStore == normalizedActive
        }

        // Legacy compatibility: item storeId may be blank while batches are already scoped.
        let batchStoreIDs = batches
            .map { $0.storeId.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        if !batchStoreIDs.isEmpty {
            return batchStoreIDs.contains(normalizedActive)
        }
        return false
    }

    var backStockQuantity: Double {
        batches
            .filter { $0.stockArea == .backOfHouse }
            .reduce(0) { $0 + $1.quantity }
    }

    var frontStockQuantity: Double {
        batches
            .filter { $0.stockArea == .frontOfHouse }
            .reduce(0) { $0 + $1.quantity }
    }
}

protocol StoreScopedEntity {
    var storeId: String { get }
}

extension StoreScopedEntity {
    func belongsToStore(_ activeStoreID: String) -> Bool {
        let normalizedActive = activeStoreID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedActive.isEmpty else { return false }
        return storeId.trimmingCharacters(in: .whitespacesAndNewlines) == normalizedActive
    }
}

extension OrderItem: StoreScopedEntity {}
extension WasteEntry: StoreScopedEntity {}
extension ToDoItem: StoreScopedEntity {}
extension TransferRecord: StoreScopedEntity {}
extension ProductionProduct: StoreScopedEntity {}
extension ProductionIngredient: StoreScopedEntity {}
extension ProductionSpotCheckRecord: StoreScopedEntity {}
extension ProductionRun: StoreScopedEntity {}
extension SpotCheckInsightAction: StoreScopedEntity {}

struct RoundedInputFieldModifier: ViewModifier {
    var tint: Color
    
    func body(content: Content) -> some View {
        content
            .font(.title3.weight(.semibold).monospacedDigit())
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color(.secondarySystemGroupedBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(tint.opacity(0.2), lineWidth: 1)
            )
    }
}

extension View {
    func roundedInputField(tint: Color) -> some View {
        modifier(RoundedInputFieldModifier(tint: tint))
    }
}

extension Array where Element == Int {
    var daySummary: String {
        let names = Calendar.current.shortWeekdaySymbols
        let normalized = self.filter { $0 >= 0 && $0 < names.count }.sorted()
        return normalized.map { names[$0] }.joined(separator: ", ")
    }
}

func storeMatches(_ candidateStoreID: String?, _ activeStoreID: String) -> Bool {
    let normalizedActive = activeStoreID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedActive.isEmpty else { return false }
    let normalizedCandidate = candidateStoreID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return !normalizedCandidate.isEmpty && normalizedCandidate == normalizedActive
}

enum TagSuggestionEngine {
    static func cleanedTag(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func canonicalTags(from tags: [String]) -> [String] {
        var canonicalByKey: [String: String] = [:]
        for raw in tags {
            let cleaned = cleanedTag(raw)
            guard !cleaned.isEmpty else { continue }
            let key = cleaned.lowercased()

            if let existing = canonicalByKey[key] {
                // Prefer fully lowercase representation when present.
                if existing != key, cleaned == key {
                    canonicalByKey[key] = cleaned
                }
            } else {
                canonicalByKey[key] = cleaned
            }
        }

        return canonicalByKey.values.sorted {
            $0.localizedCaseInsensitiveCompare($1) == .orderedAscending
        }
    }

    static func exactCanonicalMatch(for input: String, existingTags: [String]) -> String? {
        let cleaned = cleanedTag(input)
        guard !cleaned.isEmpty else { return nil }
        let key = cleaned.lowercased()
        return canonicalTags(from: existingTags).first { $0.lowercased() == key }
    }

    static func prefixSuggestion(for input: String, existingTags: [String]) -> String? {
        let cleaned = cleanedTag(input)
        guard !cleaned.isEmpty else { return nil }
        let key = cleaned.lowercased()

        return canonicalTags(from: existingTags).first {
            let candidate = $0.lowercased()
            return candidate.hasPrefix(key) && candidate != key
        }
    }

    static func fuzzySuggestion(
        for input: String,
        existingTags: [String],
        maxDistance: Int = 2
    ) -> String? {
        let cleaned = cleanedTag(input)
        guard !cleaned.isEmpty else { return nil }
        let key = cleaned.lowercased()

        let candidates = canonicalTags(from: existingTags)
        var bestTag: String?
        var bestDistance = Int.max

        for candidate in candidates {
            let candidateKey = candidate.lowercased()
            guard candidateKey != key else { continue }
            let distance = levenshteinDistance(key, candidateKey)
            guard distance <= maxDistance else { continue }

            if distance < bestDistance ||
                (distance == bestDistance && candidate.count < (bestTag?.count ?? Int.max)) {
                bestTag = candidate
                bestDistance = distance
            }
        }

        return bestTag
    }

    private static func levenshteinDistance(_ lhs: String, _ rhs: String) -> Int {
        let lhsChars = Array(lhs)
        let rhsChars = Array(rhs)

        var matrix = Array(
            repeating: Array(repeating: 0, count: rhsChars.count + 1),
            count: lhsChars.count + 1
        )

        for i in 0...lhsChars.count { matrix[i][0] = i }
        for j in 0...rhsChars.count { matrix[0][j] = j }

        if lhsChars.isEmpty { return rhsChars.count }
        if rhsChars.isEmpty { return lhsChars.count }

        for i in 1...lhsChars.count {
            for j in 1...rhsChars.count {
                let cost = lhsChars[i - 1] == rhsChars[j - 1] ? 0 : 1
                matrix[i][j] = min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                )
            }
        }

        return matrix[lhsChars.count][rhsChars.count]
    }
}

enum TipContext: String {
    case home
    case inventory
    case production
    case healthChecks
    case addItem
    case orders
    case received
    case spotCheck
    case expiration
    case waste
    case toDo
    case transfers
    case insights
    case settings
    case account
}

struct AppTipContent: Identifiable {
    let id: String
    let symbol: String
    let message: String
}

enum InvenTipLibrary {
    static func tip(for context: TipContext, date: Date = Date()) -> AppTipContent? {
        guard let tips = tipsByContext[context], !tips.isEmpty else { return nil }
        let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: date) ?? 1
        let seed = context.rawValue.unicodeScalars.reduce(0) { partial, scalar in
            partial + Int(scalar.value)
        }
        let index = (dayOfYear + seed) % tips.count
        return tips[index]
    }
    
    private static let tipsByContext: [TipContext: [AppTipContent]] = [
        .home: [
            AppTipContent(
                id: "home-reorder-sections",
                symbol: "rectangle.3.group.bubble.left",
                message: "Use Rearrange Sections to keep your highest-priority workflows at the top."
            ),
            AppTipContent(
                id: "home-quick-scan",
                symbol: "barcode.viewfinder",
                message: "Spot Check, Received, and Waste are the fastest entry points for barcode workflows."
            )
        ],
        .inventory: [
            AppTipContent(
                id: "inventory-upc-search",
                symbol: "magnifyingglass",
                message: "You can search by UPC, tag, or item name to jump to products quickly."
            ),
            AppTipContent(
                id: "inventory-tags",
                symbol: "tag",
                message: "Consistent tags make order reviews and waste analysis much easier later."
            )
        ],
        .production: [
            AppTipContent(
                id: "production-morning-check",
                symbol: "sunrise.fill",
                message: "Run morning production spot check first so make suggestions use fresh on-hand counts."
            ),
            AppTipContent(
                id: "production-howto-search",
                symbol: "questionmark.circle",
                message: "Use searchable How-To guides so team members can follow consistent prep steps."
            )
        ],
        .healthChecks: [
            AppTipContent(
                id: "health-checks-daily",
                symbol: "checklist.checked",
                message: "Assign health checks by role and department so each team gets only relevant tasks."
            ),
            AppTipContent(
                id: "health-checks-import-metrics",
                symbol: "chart.bar.doc.horizontal",
                message: "Use imported metrics for waste, expiration, and transfers to reduce manual entry."
            )
        ],
        .addItem: [
            AppTipContent(
                id: "add-item-catalog",
                symbol: "shippingbox",
                message: "If UPC matches the central catalog, title and photo can auto-fill."
            ),
            AppTipContent(
                id: "add-item-box-size",
                symbol: "square.stack.3d.up",
                message: "Set quantity per box correctly since order recommendations use case size."
            )
        ],
        .orders: [
            AppTipContent(
                id: "orders-incoming-aware",
                symbol: "truck.box",
                message: "Recommendations account for upcoming deliveries to avoid over-ordering."
            ),
            AppTipContent(
                id: "orders-review",
                symbol: "checklist",
                message: "Open each truck order to verify lines before receiving starts."
            )
        ],
        .received: [
            AppTipContent(
                id: "received-truck-first",
                symbol: "truck.box",
                message: "Select a truck first to auto-match scans to open order lines."
            ),
            AppTipContent(
                id: "received-missing-lines",
                symbol: "exclamationmark.triangle",
                message: "If prompted about missing lines, scan them now to keep past-order history clean."
            )
        ],
        .spotCheck: [
            AppTipContent(
                id: "spot-check-replace",
                symbol: "arrow.triangle.2.circlepath",
                message: "Spot check replaces system quantity with your counted total."
            ),
            AppTipContent(
                id: "spot-check-expiration",
                symbol: "calendar.badge.clock",
                message: "Add counted batches with real expiration dates to keep FIFO accurate."
            )
        ],
        .expiration: [
            AppTipContent(
                id: "expiration-sale-first",
                symbol: "tag",
                message: "Try sale adjustments before wasting to recover margin on near-dated stock."
            ),
            AppTipContent(
                id: "expiration-swipe-actions",
                symbol: "hand.draw",
                message: "Swipe right to waste; swipe left to remove bad batch data without recording waste."
            )
        ],
        .waste: [
            AppTipContent(
                id: "waste-accurate-reason",
                symbol: "list.bullet.rectangle",
                message: "Use accurate waste reasons so demand and order logic learn from real losses."
            ),
            AppTipContent(
                id: "waste-fast-entry",
                symbol: "clock.arrow.circlepath",
                message: "Record waste in real time for better stock alerts and cleaner reporting."
            )
        ],
        .toDo: [
            AppTipContent(
                id: "todo-recurring",
                symbol: "repeat",
                message: "Use recurring tasks for routines like pre-order spot checks."
            ),
            AppTipContent(
                id: "todo-auto",
                symbol: "sparkles",
                message: "Auto-generated tasks come from low stock, order schedules, and expiration windows."
            )
        ],
        .transfers: [
            AppTipContent(
                id: "transfers-department-flow",
                symbol: "arrow.left.arrow.right",
                message: "Use transfers to move product between departments without changing total store quantity."
            ),
            AppTipContent(
                id: "transfers-export",
                symbol: "barcode.viewfinder",
                message: "Export transfer logs with scannable barcodes to verify placement on the floor."
            )
        ],
        .insights: [
            AppTipContent(
                id: "insights-weekly",
                symbol: "chart.bar",
                message: "Review insights weekly and tune minimum quantities from observed trends."
            ),
            AppTipContent(
                id: "insights-waste-order",
                symbol: "arrow.left.and.right.circle",
                message: "High waste plus high ordering often indicates case size or par level mismatch."
            )
        ],
        .settings: [
            AppTipContent(
                id: "settings-notifications",
                symbol: "bell.badge",
                message: "Changing notification settings refreshes reminder schedules immediately."
            ),
            AppTipContent(
                id: "settings-rewrap-pricing",
                symbol: "scalemass",
                message: "Use Rewrap Pricing to set default price-by-weight and override specific rewrapped items."
            )
        ],
        .account: [
            AppTipContent(
                id: "account-owner-permissions",
                symbol: "person.crop.circle.badge.checkmark",
                message: "Owners can invite staff and set role-based module and action permissions."
            ),
            AppTipContent(
                id: "account-invite-code",
                symbol: "person.badge.plus",
                message: "Invite codes let teammates join your organization without sharing passwords."
            )
        ]
    ]
}

struct ContextTipCard: View {
    let context: TipContext
    var accentColor: Color = .blue
    var label: String = "Tip"
    @StateObject private var settings = AppSettings.shared
    
    private var tip: AppTipContent? {
        guard settings.showTips else { return nil }
        return InvenTipLibrary.tip(for: context)
    }
    
    var body: some View {
        Group {
            if let tip {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: tip.symbol)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(accentColor)
                        .frame(width: 22, height: 22)
                        .background(accentColor.opacity(0.12), in: Circle())
                    
                    VStack(alignment: .leading, spacing: 4) {
                        Text(label)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(tip.message)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(accentColor.opacity(0.08))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(accentColor.opacity(0.18), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .padding(.horizontal, 2)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(label): \(tip.message)")
            }
        }
    }
}
