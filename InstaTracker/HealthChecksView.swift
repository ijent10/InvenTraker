import SwiftUI
import SwiftData
import Combine
#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif
#if canImport(FirebaseCore)
import FirebaseCore
#endif

private enum HealthCheckInputType: String, Codable, Hashable {
    case text
    case number
    case trueFalse = "true_false"
    case multipleChoice = "multiple_choice"
    case multipleSelect = "multiple_select"
    case insightsMetric = "insights_metric"
    case expirationMetric = "expiration_metric"
    case transferMetric = "transfer_metric"

    init(rawValue: String) {
        switch rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "number": self = .number
        case "true_false", "truefalse", "boolean": self = .trueFalse
        case "multiple_choice", "single_select": self = .multipleChoice
        case "multiple_select", "multiselect": self = .multipleSelect
        case "insights_metric", "insights": self = .insightsMetric
        case "expiration_metric", "expiration": self = .expirationMetric
        case "transfer_metric", "transfer": self = .transferMetric
        default: self = .text
        }
    }

    var label: String {
        switch self {
        case .text: return "Text"
        case .number: return "Number"
        case .trueFalse: return "True/False"
        case .multipleChoice: return "Multiple Choice"
        case .multipleSelect: return "Multiple Select"
        case .insightsMetric: return "Insights Metric"
        case .expirationMetric: return "Expiration Metric"
        case .transferMetric: return "Transfer Metric"
        }
    }
}

private struct HealthCheckQuestion: Identifiable, Hashable {
    let id: String
    var prompt: String
    var inputType: HealthCheckInputType
    var required: Bool
    var options: [String]
    var metricKey: String?
}

private struct HealthCheckForm: Identifiable, Hashable {
    let id: String
    var title: String
    var description: String?
    var scope: String
    var storeId: String?
    var roleTargets: [String]
    var departmentTargets: [String]
    var questions: [HealthCheckQuestion]
    var isActive: Bool
}

private enum HealthAnswerValue: Hashable {
    case text(String)
    case number(String)
    case bool(Bool)
    case single(String)
    case multiple(Set<String>)

    var asSerializable: Any {
        switch self {
        case .text(let value):
            return value
        case .number(let value):
            if let parsed = Double(value.trimmingCharacters(in: .whitespacesAndNewlines)) {
                return parsed
            }
            return value
        case .bool(let value):
            return value
        case .single(let value):
            return value
        case .multiple(let values):
            return values.sorted()
        }
    }
}

@MainActor
private final class HealthChecksViewModel: ObservableObject {
    @Published private(set) var forms: [HealthCheckForm] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isSubmitting = false
    @Published var statusMessage: String?
    @Published var errorMessage: String?

    func loadAssignedForms(
        organizationId: String,
        storeId: String,
        membership: OrgMembership?
    ) async {
        guard !organizationId.isEmpty else {
            forms = []
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let fetched = try await HealthChecksRemoteService.fetchForms(organizationId: organizationId)
            let filtered = fetched.filter { form in
                guard form.isActive else { return false }
                if form.scope == "store" {
                    let scopedStore = form.storeId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                    if !scopedStore.isEmpty && scopedStore != storeId {
                        return false
                    }
                }
                return HealthChecksRemoteService.formMatchesAssignment(form, membership: membership)
            }
            forms = filtered.sorted { lhs, rhs in
                lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            }
            errorMessage = nil
        } catch {
            forms = []
            errorMessage = "Could not load health checks."
        }
    }

    func prefilledAnswers(for form: HealthCheckForm, metrics: [String: String]) -> [String: HealthAnswerValue] {
        var values: [String: HealthAnswerValue] = [:]
        for question in form.questions {
            switch question.inputType {
            case .text:
                values[question.id] = .text("")
            case .number:
                values[question.id] = .number("")
            case .trueFalse:
                values[question.id] = .bool(false)
            case .multipleChoice:
                values[question.id] = .single(question.options.first ?? "")
            case .multipleSelect:
                values[question.id] = .multiple([])
            case .insightsMetric, .expirationMetric, .transferMetric:
                let resolvedKey = resolvedMetricKey(for: question)
                values[question.id] = .text(metrics[resolvedKey] ?? "")
            }
        }
        return values
    }

    func submit(
        organizationId: String,
        storeId: String,
        form: HealthCheckForm,
        answers: [String: HealthAnswerValue],
        actor: SessionUser?,
        membership: OrgMembership?
    ) async {
        guard !organizationId.isEmpty, !storeId.isEmpty else { return }
        isSubmitting = true
        defer { isSubmitting = false }

        let serializedAnswers: [String: Any] = Dictionary(uniqueKeysWithValues: form.questions.map { question in
            let value = answers[question.id] ?? .text("")
            return (question.prompt, value.asSerializable)
        })

        let departmentNames = (membership?.departmentNames ?? [])
            + (membership?.departmentIds ?? [])
            + [membership?.departmentId].compactMap { $0 }
        do {
            try await HealthChecksRemoteService.submitResponse(
                organizationId: organizationId,
                storeId: storeId,
                form: form,
                answers: serializedAnswers,
                actor: actor,
                membership: membership,
                departmentNames: departmentNames
            )
            statusMessage = "Health check submitted."
            errorMessage = nil
        } catch {
            errorMessage = "Could not submit health check."
        }
    }

    func clearStatus() {
        statusMessage = nil
        errorMessage = nil
    }

    private func resolvedMetricKey(for question: HealthCheckQuestion) -> String {
        let explicit = question.metricKey?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !explicit.isEmpty { return explicit }
        switch question.inputType {
        case .insightsMetric: return "inventory_value"
        case .expirationMetric: return "expired_not_marked_waste_count"
        case .transferMetric: return "transfer_count_7d"
        default: return ""
        }
    }
}

struct HealthChecksView: View {
    @EnvironmentObject private var session: AccountSessionStore
    @Query(filter: #Predicate<InventoryItem> { !$0.isArchived }) private var items: [InventoryItem]
    @Query private var wasteEntries: [WasteEntry]
    @Query private var transfers: [TransferRecord]
    @StateObject private var settings = AppSettings.shared
    @StateObject private var viewModel = HealthChecksViewModel()

    @State private var activeForm: HealthCheckForm?
    @State private var draftAnswers: [String: HealthAnswerValue] = [:]

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? "local-default"
    }

    private var activeStoreId: String {
        settings.normalizedActiveStoreID
    }

    private var scopedItems: [InventoryItem] {
        items.filter {
            $0.organizationId == activeOrganizationId && $0.belongsToStore(activeStoreId)
        }
    }

    private var scopedWasteEntries: [WasteEntry] {
        wasteEntries.filter {
            $0.organizationId == activeOrganizationId && $0.belongsToStore(activeStoreId)
        }
    }

    private var scopedTransfers: [TransferRecord] {
        transfers.filter {
            $0.organizationId == activeOrganizationId && $0.belongsToStore(activeStoreId)
        }
    }

    private var metricValues: [String: String] {
        let now = Date()
        let calendar = Calendar.current
        let sevenDaysAgo = calendar.date(byAdding: .day, value: -7, to: now) ?? now

        let expiredBatchCount = scopedItems.reduce(0) { partial, item in
            partial + item.batches.filter { $0.expirationDate < now && $0.quantity > 0.0001 }.count
        }

        let expiringSoonItems = scopedItems.filter { item in
            item.batches.contains { batch in
                let days = calendar.dateComponents([.day], from: now, to: batch.expirationDate).day ?? 999
                return days >= 0 && days <= 3 && batch.quantity > 0.0001
            }
        }

        let sortedExpiringForMold = expiringSoonItems
            .sorted { lhs, rhs in
                let lhsDate = lhs.batches.map(\.expirationDate).min() ?? .distantFuture
                let rhsDate = rhs.batches.map(\.expirationDate).min() ?? .distantFuture
                return lhsDate < rhsDate
            }
        let moldCandidates = Array(sortedExpiringForMold.prefix(4)).map(\.name).joined(separator: ", ")

        let wasteLast7d = scopedWasteEntries.filter { $0.date >= sevenDaysAgo }
        let wasteTotalQuantity = wasteLast7d.reduce(0) { $0 + $1.quantity }
        let wasteTotalValue = wasteLast7d.reduce(0) { partial, row in
            let price = row.itemPriceSnapshot ?? row.item?.price ?? 0
            return partial + (row.quantity * price)
        }
        let tempFailureCount = wasteLast7d.filter { $0.wasteType == .tempedWrong }.count

        let inventoryValue = scopedItems.reduce(0) { partial, item in
            partial + (item.totalQuantity * item.price)
        }

        let transferLast7d = scopedTransfers.filter { $0.createdAt >= sevenDaysAgo }
        let transferCount = transferLast7d.count
        let transferQuantity = transferLast7d.reduce(0) { $0 + $1.quantity }

        return [
            "expired_not_marked_waste_count": "\(expiredBatchCount)",
            "waste_total_quantity_7d": wasteTotalQuantity.formattedQuantity(maximumFractionDigits: 3),
            "waste_total_value_7d": NumberFormatter.currency.string(from: NSNumber(value: wasteTotalValue)) ?? "$0.00",
            "inventory_value": NumberFormatter.currency.string(from: NSNumber(value: inventoryValue)) ?? "$0.00",
            "expiring_soon_count": "\(expiringSoonItems.count)",
            "mold_check_random_4": moldCandidates.isEmpty ? "No near-expiring items." : moldCandidates,
            "transfer_count_7d": "\(transferCount)",
            "transfer_quantity_7d": transferQuantity.formattedQuantity(maximumFractionDigits: 3),
            "temp_check_failures_7d": "\(tempFailureCount)"
        ]
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                ContextTipCard(context: .healthChecks, accentColor: settings.accentColor)

                AppMetricStrip(metrics: metricValues)

                if viewModel.isLoading {
                    ProgressView("Loading health checks…")
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 40)
                } else if viewModel.forms.isEmpty {
                    ContentUnavailableView(
                        "No Health Checks Assigned",
                        systemImage: "checklist.checked",
                        description: Text("Create a health check form on web and assign it to your role or department.")
                    )
                } else {
                    VStack(spacing: 10) {
                        ForEach(viewModel.forms) { form in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(form.title)
                                    .font(.headline)
                                if let description = form.description, !description.isEmpty {
                                    Text(description)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                                Text("\(form.questions.count) question(s)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                if !form.roleTargets.isEmpty {
                                    Text("Roles: \(form.roleTargets.joined(separator: ", "))")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                if !form.departmentTargets.isEmpty {
                                    Text("Departments: \(form.departmentTargets.joined(separator: ", "))")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                Button {
                                    draftAnswers = viewModel.prefilledAnswers(for: form, metrics: metricValues)
                                    activeForm = form
                                } label: {
                                    Label("Start Health Check", systemImage: "play.circle.fill")
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.borderedProminent)
                                .tint(settings.accentColor)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                    }
                }

                if let status = viewModel.statusMessage {
                    Text(status)
                        .font(.caption)
                        .foregroundStyle(.green)
                }
                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
            .padding()
            .padding(.bottom, 80)
        }
        .navigationTitle("Health Checks")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(activeOrganizationId)|\(activeStoreId)|\(session.activeMembership?.id ?? "")") {
            await refresh()
        }
        .refreshable {
            await refresh()
        }
        .sheet(item: $activeForm) { form in
            NavigationStack {
                HealthCheckRunSheet(
                    form: form,
                    answers: $draftAnswers,
                    metrics: metricValues,
                    accentColor: settings.accentColor,
                    isSubmitting: viewModel.isSubmitting
                ) {
                    Task {
                        await viewModel.submit(
                            organizationId: activeOrganizationId,
                            storeId: activeStoreId,
                            form: form,
                            answers: draftAnswers,
                            actor: session.firebaseUser,
                            membership: session.activeMembership
                        )
                        if viewModel.errorMessage == nil {
                            activeForm = nil
                        }
                    }
                }
            }
        }
    }

    private func refresh() async {
        viewModel.clearStatus()
        await viewModel.loadAssignedForms(
            organizationId: activeOrganizationId,
            storeId: activeStoreId,
            membership: session.activeMembership
        )
    }
}

private struct AppMetricStrip: View {
    let metrics: [String: String]

    private var rows: [(label: String, value: String)] {
        [
            ("Expired not wasted", metrics["expired_not_marked_waste_count"] ?? "0"),
            ("Waste (7d)", metrics["waste_total_value_7d"] ?? "$0.00"),
            ("Inventory value", metrics["inventory_value"] ?? "$0.00"),
            ("Mold check picks", metrics["mold_check_random_4"] ?? "None")
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Quick Health Snapshot")
                .font(.headline)
            ForEach(rows, id: \.label) { row in
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.label)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(row.value)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 2)
            }
        }
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct HealthCheckRunSheet: View {
    @Environment(\.dismiss) private var dismiss
    let form: HealthCheckForm
    @Binding var answers: [String: HealthAnswerValue]
    let metrics: [String: String]
    let accentColor: Color
    let isSubmitting: Bool
    let onSubmit: () -> Void

    var body: some View {
        Form {
            Section("Form") {
                Text(form.title)
                    .font(.headline)
                if let description = form.description, !description.isEmpty {
                    Text(description)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            ForEach(form.questions) { question in
                Section(question.prompt) {
                    questionInput(question)
                    if question.inputType == .insightsMetric || question.inputType == .expirationMetric || question.inputType == .transferMetric {
                        Text("Prefilled metric key: \(resolvedMetricKey(for: question))")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    if question.required {
                        Text("Required")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Complete Check")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Cancel") {
                    dismiss()
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button(isSubmitting ? "Sending..." : "Submit") {
                    onSubmit()
                }
                .disabled(isSubmitting || !canSubmit)
                .tint(accentColor)
            }
        }
    }

    private var canSubmit: Bool {
        for question in form.questions where question.required {
            guard let value = answers[question.id] else { return false }
            switch value {
            case .text(let text):
                if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return false }
            case .number(let value):
                if value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return false }
            case .bool:
                continue
            case .single(let value):
                if value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return false }
            case .multiple(let values):
                if values.isEmpty { return false }
            }
        }
        return true
    }

    @ViewBuilder
    private func questionInput(_ question: HealthCheckQuestion) -> some View {
        switch question.inputType {
        case .text, .insightsMetric, .expirationMetric, .transferMetric:
            TextEditor(text: textBinding(for: question.id))
                .frame(minHeight: 88)
        case .number:
            TextField("Enter number", text: numberBinding(for: question.id))
                .keyboardType(.decimalPad)
        case .trueFalse:
            Picker("Select", selection: boolBinding(for: question.id)) {
                Text("True").tag(true)
                Text("False").tag(false)
            }
            .pickerStyle(.segmented)
        case .multipleChoice:
            if question.options.isEmpty {
                Text("No choices configured on web.")
                    .foregroundStyle(.secondary)
            } else {
                Picker("Select", selection: singleBinding(for: question.id, fallback: question.options.first ?? "")) {
                    ForEach(question.options, id: \.self) { option in
                        Text(option).tag(option)
                    }
                }
                .pickerStyle(.menu)
            }
        case .multipleSelect:
            if question.options.isEmpty {
                Text("No choices configured on web.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(question.options, id: \.self) { option in
                    Toggle(option, isOn: multipleContainsBinding(for: question.id, option: option))
                }
            }
        }
    }

    private func textBinding(for key: String) -> Binding<String> {
        Binding(
            get: {
                if let value = answers[key] {
                    switch value {
                    case .text(let text): return text
                    case .number(let number): return number
                    case .single(let single): return single
                    case .multiple(let values): return values.sorted().joined(separator: ", ")
                    case .bool(let value): return value ? "true" : "false"
                    }
                }
                return ""
            },
            set: { newValue in
                answers[key] = .text(newValue)
            }
        )
    }

    private func numberBinding(for key: String) -> Binding<String> {
        Binding(
            get: {
                if case let .number(value) = answers[key] { return value }
                if case let .text(value) = answers[key] { return value }
                return ""
            },
            set: { newValue in
                answers[key] = .number(newValue)
            }
        )
    }

    private func boolBinding(for key: String) -> Binding<Bool> {
        Binding(
            get: {
                if case let .bool(value) = answers[key] { return value }
                return false
            },
            set: { newValue in
                answers[key] = .bool(newValue)
            }
        )
    }

    private func singleBinding(for key: String, fallback: String) -> Binding<String> {
        Binding(
            get: {
                if case let .single(value) = answers[key] { return value }
                if case let .text(value) = answers[key] { return value }
                return fallback
            },
            set: { newValue in
                answers[key] = .single(newValue)
            }
        )
    }

    private func multipleContainsBinding(for key: String, option: String) -> Binding<Bool> {
        Binding(
            get: {
                if case let .multiple(values) = answers[key] {
                    return values.contains(option)
                }
                return false
            },
            set: { include in
                var values: Set<String>
                if case let .multiple(existing) = answers[key] {
                    values = existing
                } else {
                    values = []
                }
                if include {
                    values.insert(option)
                } else {
                    values.remove(option)
                }
                answers[key] = .multiple(values)
            }
        )
    }

    private func resolvedMetricKey(for question: HealthCheckQuestion) -> String {
        let explicit = question.metricKey?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !explicit.isEmpty { return explicit }
        switch question.inputType {
        case .insightsMetric:
            return "inventory_value"
        case .expirationMetric:
            return "expired_not_marked_waste_count"
        case .transferMetric:
            return "transfer_count_7d"
        default:
            return ""
        }
    }
}

private enum HealthChecksRemoteService {
    static func fetchForms(organizationId: String) async throws -> [HealthCheckForm] {
        #if canImport(FirebaseFirestore) && canImport(FirebaseCore)
        guard FirebaseApp.app() != nil else { return [] }
        let orgRef = Firestore.firestore().collection("organizations").document(organizationId)
        let snap = try await orgRef.collection("healthChecks").getDocuments()
        return snap.documents.compactMap { doc in
            decodeForm(id: doc.documentID, data: doc.data())
        }
        #else
        _ = organizationId
        return []
        #endif
    }

    static func submitResponse(
        organizationId: String,
        storeId: String,
        form: HealthCheckForm,
        answers: [String: Any],
        actor: SessionUser?,
        membership: OrgMembership?,
        departmentNames: [String]
    ) async throws {
        #if canImport(FirebaseFirestore) && canImport(FirebaseCore)
        guard FirebaseApp.app() != nil else { return }
        let db = Firestore.firestore()
        let storeRef = await resolveStoreReference(db: db, organizationId: organizationId, storeId: storeId)
        let responseRef: CollectionReference
        if let storeRef {
            responseRef = storeRef.collection("healthCheckResponses")
        } else {
            responseRef = db.collection("organizations")
                .document(organizationId)
                .collection("stores")
                .document(storeId)
                .collection("healthCheckResponses")
        }

        var payload: [String: Any] = [
            "organizationId": organizationId,
            "storeId": storeId,
            "healthCheckId": form.id,
            "healthCheckTitle": form.title,
            "answers": answers,
            "submittedByUid": actor?.id ?? "",
            "submittedByName": actor?.displayName ?? "",
            "roleTitle": membership?.jobTitle ?? membership?.role.displayName ?? "",
            "departmentNames": departmentNames,
            "submittedAt": FieldValue.serverTimestamp(),
            "createdAt": FieldValue.serverTimestamp(),
            "updatedAt": FieldValue.serverTimestamp()
        ]
        if let role = membership?.role.rawValue {
            payload["role"] = role
        }

        _ = try await responseRef.addDocument(data: payload)
        #else
        _ = organizationId
        _ = storeId
        _ = form
        _ = answers
        _ = actor
        _ = membership
        _ = departmentNames
        #endif
    }

    static func formMatchesAssignment(_ form: HealthCheckForm, membership: OrgMembership?) -> Bool {
        guard let membership else { return false }
        if membership.role == .owner {
            return true
        }

        let normalizedRoleTargets = Set(
            form.roleTargets
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
                .filter { !$0.isEmpty }
        )

        if !normalizedRoleTargets.isEmpty {
            var roleAliases = Set<String>([membership.role.rawValue.lowercased()])
            switch membership.role {
            case .owner:
                roleAliases.formUnion(["owner", "admin"])
            case .manager:
                roleAliases.formUnion(["manager", "lead"])
            case .employee:
                roleAliases.formUnion(["employee", "staff", "assistant"])
            case .viewer:
                roleAliases.formUnion(["viewer"])
            }
            if let roleTitle = membership.jobTitle?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased(),
               !roleTitle.isEmpty {
                roleAliases.insert(roleTitle)
                roleAliases.insert(roleTitle.replacingOccurrences(of: " ", with: ""))
            }
            if roleAliases.isDisjoint(with: normalizedRoleTargets) {
                return false
            }
        }

        let normalizedDeptTargets = Set(
            form.departmentTargets
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
                .filter { !$0.isEmpty }
        )
        if normalizedDeptTargets.isEmpty {
            return true
        }
        let membershipDepartments = Set(
            (membership.departmentNames ?? [])
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
                .filter { !$0.isEmpty }
                + (membership.departmentIds ?? [])
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
                    .filter { !$0.isEmpty }
                + [membership.departmentId?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()]
                    .compactMap { $0 }
                    .filter { !$0.isEmpty }
        )
        if membershipDepartments.isEmpty {
            return false
        }
        return !membershipDepartments.isDisjoint(with: normalizedDeptTargets)
    }

    private static func decodeForm(id: String, data: [String: Any]) -> HealthCheckForm? {
        let title = (data["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !title.isEmpty else { return nil }
        let scope = ((data["scope"] as? String) ?? "organization").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let roleTargets = (data["roleTargets"] as? [String] ?? [])
        let departmentTargets = (data["departmentTargets"] as? [String] ?? [])
        let storeId = (data["storeId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let isActive = data["isActive"] as? Bool ?? true
        let rawQuestions = data["questions"] as? [[String: Any]] ?? []
        let questions = rawQuestions.enumerated().map { index, row in
            let prompt = (row["prompt"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let inputType = HealthCheckInputType(rawValue: (row["inputType"] as? String) ?? "text")
            let required = row["required"] as? Bool ?? true
            let options = (row["options"] as? [String] ?? [])
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            let metricKey = (row["metricKey"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            return HealthCheckQuestion(
                id: ((row["id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false)
                    ? ((row["id"] as? String) ?? "")
                    : "q_\(index + 1)",
                prompt: prompt.isEmpty ? "Question \(index + 1)" : prompt,
                inputType: inputType,
                required: required,
                options: options,
                metricKey: metricKey
            )
        }
        guard !questions.isEmpty else { return nil }
        return HealthCheckForm(
            id: id,
            title: title,
            description: (data["description"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
            scope: scope == "store" ? "store" : "organization",
            storeId: storeId,
            roleTargets: roleTargets,
            departmentTargets: departmentTargets,
            questions: questions,
            isActive: isActive
        )
    }

    #if canImport(FirebaseFirestore)
    private static func resolveStoreReference(
        db: Firestore,
        organizationId: String,
        storeId: String
    ) async -> DocumentReference? {
        let orgRef = db.collection("organizations").document(organizationId)
        if let regionsSnapshot = try? await orgRef.collection("regions").getDocuments() {
            for regionDoc in regionsSnapshot.documents {
                if let districtsSnapshot = try? await regionDoc.reference.collection("districts").getDocuments() {
                    for districtDoc in districtsSnapshot.documents {
                        let nestedStoreRef = districtDoc.reference.collection("stores").document(storeId)
                        if let nestedStoreDoc = try? await nestedStoreRef.getDocument(), nestedStoreDoc.exists {
                            return nestedStoreRef
                        }
                    }
                }
            }
        }
        let legacyStoreRef = orgRef.collection("stores").document(storeId)
        if let legacyStoreDoc = try? await legacyStoreRef.getDocument(), legacyStoreDoc.exists {
            return legacyStoreRef
        }
        return nil
    }
    #endif
}

private extension NumberFormatter {
    static let currency: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.maximumFractionDigits = 2
        formatter.minimumFractionDigits = 2
        return formatter
    }()
}
