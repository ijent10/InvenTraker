import SwiftUI
import SwiftData

/// Comprehensive settings view
/// Includes waste settings, appearance, and notifications.
/// Vendor management is web-only.
struct SettingsView: View {
    @StateObject private var settings = AppSettings.shared
    @EnvironmentObject private var session: AccountSessionStore
    @Query private var vendors: [Vendor]
    @Query(filter: #Predicate<InventoryItem> { !$0.isArchived }) private var items: [InventoryItem]
    
    @State private var showingCustomWasteReasons = false
    @State private var showingDepartmentManagement = false
    @State private var showingRewrapPricingManagement = false
    @State private var showingFeatureRequestComposer = false

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? "local-default"
    }

    private var scopedVendors: [Vendor] {
        vendors.filter { $0.organizationId == activeOrganizationId }
    }

    private var scopedItems: [InventoryItem] {
        items.filter { $0.organizationId == activeOrganizationId }
    }

    private var rewrapOverrideCount: Int {
        settings.rewrapPricingOverrideCount(for: activeOrganizationId)
    }
    
    var body: some View {
        List {
            Section {
                ContextTipCard(context: .settings, accentColor: settings.accentColor)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)
            }

            Section("App") {
                HStack {
                    Text("Version")
                    Spacer()
                    Text("1.0.0")
                        .foregroundStyle(.secondary)
                }
                Toggle("Show Tips", isOn: $settings.showTips)
            }
            
            Section("Waste Types") {
                Button(action: { showingCustomWasteReasons = true }) {
                    HStack {
                        Text("Manage Waste Types")
                        Spacer()
                        Text("\(settings.wasteReasonRules.count)")
                            .foregroundStyle(.secondary)
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section("Departments") {
                Button(action: { showingDepartmentManagement = true }) {
                    HStack {
                        Text("Manage Departments")
                            .foregroundStyle(settings.accentColor)
                        Spacer()
                        Text("\(settings.departmentConfigs.count)")
                            .foregroundStyle(.secondary)
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(settings.accentColor)
                    }
                }
            }

            Section("Rewrap Pricing") {
                Button(action: { showingRewrapPricingManagement = true }) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Manage Rewrap Pricing")
                                .foregroundStyle(settings.accentColor)
                            Text("Default: \(settings.rewrapPricingDefaultMode.title)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if rewrapOverrideCount > 0 {
                            Text("\(rewrapOverrideCount)")
                                .foregroundStyle(.secondary)
                        }
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(settings.accentColor)
                    }
                }
            }

            Section("Quantity Display") {
                Picker("Show Quantity As", selection: $settings.quantityDisplayMode) {
                    ForEach(QuantityDisplayMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.segmented)

                Text(settings.quantityDisplayMode.summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            
            Section("Vendors") {
                HStack {
                    Text("Vendor records")
                    Spacer()
                    Text("\(scopedVendors.count)")
                        .foregroundStyle(.secondary)
                }
                Text("Manage vendors from the web dashboard.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            
            Section("Notifications") {
                Toggle("Enable Notifications", isOn: $settings.notificationsEnabled)
                Stepper(
                    "Spot Check Before Order: \(settings.spotCheckDaysBeforeOrder) day(s)",
                    value: $settings.spotCheckDaysBeforeOrder,
                    in: 0...6
                )
                
                if settings.notificationsEnabled {
                    Stepper("Expiration Alerts: \(settings.expirationNotificationDays) days",
                            value: $settings.expirationNotificationDays, in: 1...7)
                    Toggle("Low Stock Alerts", isOn: $settings.lowStockNotifications)
                    Toggle("Order Day Reminders", isOn: $settings.orderDayReminders)
                    
                    Button("Refresh Notification Schedule") {
                        syncNotifications()
                    }
                    .foregroundStyle(settings.accentColor)
                }
            }

            Section("Feedback") {
                Button(action: { showingFeatureRequestComposer = true }) {
                    HStack {
                        Text("Request a Feature")
                            .foregroundStyle(settings.accentColor)
                        Spacer()
                        Image(systemName: "lightbulb")
                            .foregroundStyle(settings.accentColor)
                    }
                }
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .tint(settings.accentColor)
        .sheet(isPresented: $showingCustomWasteReasons) {
            CustomWasteReasonsView()
        }
        .sheet(isPresented: $showingDepartmentManagement) {
            DepartmentManagementView()
        }
        .sheet(isPresented: $showingRewrapPricingManagement) {
            RewrapPricingSettingsView(organizationId: activeOrganizationId)
        }
        .sheet(isPresented: $showingFeatureRequestComposer) {
            FeatureRequestComposerView(organizationId: activeOrganizationId)
        }
        .onAppear {
            syncNotifications()
            Task {
                await FeatureRequestService.shared.flushPendingRequestsIfPossible()
            }
        }
        .onChange(of: settings.notificationsEnabled) { _, _ in syncNotifications() }
        .onChange(of: settings.expirationNotificationDays) { _, _ in syncNotifications() }
        .onChange(of: settings.lowStockNotifications) { _, _ in syncNotifications() }
        .onChange(of: settings.orderDayReminders) { _, _ in syncNotifications() }
        .onChange(of: vendors.count) { _, _ in syncNotifications() }
        .onChange(of: items.count) { _, _ in syncNotifications() }
    }
    
    private func syncNotifications() {
        NotificationManager.shared.syncNotifications(settings: settings, items: scopedItems, vendors: scopedVendors)
    }
}

struct CustomWasteReasonsView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var settings = AppSettings.shared
    
    @State private var rules: [WasteReasonRule] = []
    @State private var newReason = ""
    @State private var newReasonAffectsOrders = false
    
    var body: some View {
        NavigationStack {
            List {
                Section("Waste Types") {
                    if rules.isEmpty {
                        Text("No waste types configured yet")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(Array(rules.indices), id: \.self) { index in
                            HStack {
                                TextField(
                                    "Reason",
                                    text: Binding(
                                        get: { rules[index].name },
                                        set: { rules[index].name = $0 }
                                    )
                                )
                                .textInputAutocapitalization(.words)
                                
                                Toggle(
                                    "Affects",
                                    isOn: Binding(
                                        get: { rules[index].affectsOrders },
                                        set: { rules[index].affectsOrders = $0 }
                                    )
                                )
                                .labelsHidden()
                                
                                Button(role: .destructive) {
                                    rules.remove(at: index)
                                } label: {
                                    Image(systemName: "trash")
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                
                Section("Add New") {
                    HStack {
                        TextField("New waste type", text: $newReason)
                            .textInputAutocapitalization(.words)
                        Toggle("Affects", isOn: $newReasonAffectsOrders)
                            .labelsHidden()
                        Button("Add") {
                            let trimmed = newReason.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !trimmed.isEmpty else { return }
                            rules.append(
                                WasteReasonRule(
                                    name: trimmed,
                                    affectsOrders: newReasonAffectsOrders
                                )
                            )
                            newReason = ""
                            newReasonAffectsOrders = false
                        }
                        .disabled(newReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .navigationTitle("Waste Types")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        settings.wasteReasonRules = rules
                        dismiss()
                    }
                    .foregroundStyle(settings.accentColor)
                }
            }
            .onAppear {
                rules = settings.wasteReasonRules
            }
            .tint(settings.accentColor)
        }
    }
}

struct DepartmentManagementView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var settings = AppSettings.shared

    @State private var departments: [DepartmentConfig] = []
    @State private var newDepartmentName = ""
    @State private var hasLoaded = false

    var body: some View {
        NavigationStack {
            List {
                Section("Departments") {
                    if departments.isEmpty {
                        Text("No departments configured yet")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach($departments) { $department in
                            NavigationLink {
                                DepartmentLocationEditorView(department: $department)
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(department.name.isEmpty ? "Unnamed Department" : department.name)
                                        .font(.headline)
                                        .foregroundStyle(.primary)
                                    Text("\(department.locations.count) location(s)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .onDelete { offsets in
                            departments.remove(atOffsets: offsets)
                        }
                    }
                }

                Section("Add Department") {
                    HStack {
                        TextField("Department name", text: $newDepartmentName)
                            .textInputAutocapitalization(.words)
                        Button("Add") {
                            let trimmed = newDepartmentName.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !trimmed.isEmpty else { return }
                            departments.append(DepartmentConfig(name: trimmed))
                            newDepartmentName = ""
                        }
                        .disabled(newDepartmentName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .navigationTitle("Departments")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundStyle(settings.accentColor)
                }
            }
            .onAppear {
                guard !hasLoaded else { return }
                departments = settings.departmentConfigs
                hasLoaded = true
            }
            .onChange(of: departments) { _, newValue in
                settings.departmentConfigs = newValue
            }
            .tint(settings.accentColor)
        }
    }
}

private struct DepartmentLocationEditorView: View {
    @Binding var department: DepartmentConfig
    @State private var newLocation = ""
    @StateObject private var settings = AppSettings.shared

    var body: some View {
        List {
            Section("Department") {
                TextField("Department name", text: $department.name)
                    .textInputAutocapitalization(.words)
            }

            Section("Locations") {
                if department.locations.isEmpty {
                    Text("No locations yet")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(Array(department.locations.indices), id: \.self) { index in
                        HStack {
                            TextField(
                                "Location",
                                text: Binding(
                                    get: { department.locations[index] },
                                    set: { department.locations[index] = $0 }
                                )
                            )
                            .textInputAutocapitalization(.words)

                            Button(role: .destructive) {
                                department.locations.remove(at: index)
                            } label: {
                                Image(systemName: "trash")
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            Section("Add Location") {
                HStack {
                    TextField("Shelf, cooler, rack...", text: $newLocation)
                        .textInputAutocapitalization(.words)
                    Button("Add") {
                        let trimmed = newLocation.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !trimmed.isEmpty else { return }
                        department.locations.append(trimmed)
                        newLocation = ""
                    }
                    .disabled(newLocation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .navigationTitle(department.name.isEmpty ? "Department" : department.name)
        .navigationBarTitleDisplayMode(.inline)
        .tint(settings.accentColor)
    }
}

private struct RewrapPricingSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var settings = AppSettings.shared
    @Query(filter: #Predicate<InventoryItem> { !$0.isArchived }) private var items: [InventoryItem]

    let organizationId: String
    @State private var searchText = ""

    private var rewrappedItems: [InventoryItem] {
        items
            .filter {
                $0.organizationId == organizationId &&
                $0.rewrapsWithUniqueBarcode
            }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private var filteredItems: [InventoryItem] {
        let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return rewrappedItems }
        return rewrappedItems.filter {
            $0.name.localizedCaseInsensitiveContains(trimmed) ||
            ($0.upc?.localizedCaseInsensitiveContains(trimmed) ?? false)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Default Mode") {
                    Picker("Default", selection: $settings.rewrapPricingDefaultMode) {
                        ForEach(RewrapPricingMode.allCases) { mode in
                            Text(mode.title).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)

                    Text(settings.rewrapPricingDefaultMode.summary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Item Overrides") {
                    if rewrappedItems.isEmpty {
                        Text("No rewrapped items yet. Mark items as Rewrapped in item packaging to manage overrides.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else if filteredItems.isEmpty {
                        Text("No matching rewrapped items.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(filteredItems) { item in
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.name)
                                        .font(.subheadline.weight(.semibold))
                                    Text(itemModeSummary(item))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()

                                Menu {
                                    Button("Use Default (\(settings.rewrapPricingDefaultMode.shortTitle))") {
                                        settings.setRewrapPricingOverride(nil, forItemID: item.id, organizationId: organizationId)
                                    }
                                    ForEach(RewrapPricingMode.allCases) { mode in
                                        Button(mode.title) {
                                            settings.setRewrapPricingOverride(mode, forItemID: item.id, organizationId: organizationId)
                                        }
                                    }
                                } label: {
                                    Text(displayModeTitle(for: item))
                                        .font(.caption.weight(.semibold))
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 6)
                                        .background(settings.accentColor.opacity(0.12), in: Capsule())
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Rewrap Pricing")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundStyle(settings.accentColor)
                }
            }
            .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always), prompt: "Find rewrapped item")
            .tint(settings.accentColor)
        }
    }

    private func displayModeTitle(for item: InventoryItem) -> String {
        settings.rewrapPricingMode(forItemID: item.id, organizationId: organizationId).shortTitle
    }

    private func itemModeSummary(_ item: InventoryItem) -> String {
        if let override = settings.rewrapPricingOverride(forItemID: item.id, organizationId: organizationId) {
            return "Override: \(override.title)"
        }
        return "Using default: \(settings.rewrapPricingDefaultMode.title)"
    }
}

private struct FeatureRequestComposerView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: AccountSessionStore
    @StateObject private var settings = AppSettings.shared

    let organizationId: String

    @State private var title = ""
    @State private var details = ""
    @State private var category = "workflow"
    @State private var isSubmitting = false
    @State private var statusMessage: String?
    @State private var errorMessage: String?

    private let categories = ["workflow", "inventory", "analytics", "account", "other"]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ContextTipCard(context: .settings, accentColor: settings.accentColor, label: "Feedback Tip")
                }

                Section("Request") {
                    TextField("Short title", text: $title)
                    Picker("Category", selection: $category) {
                        ForEach(categories, id: \.self) { value in
                            Text(value.capitalized).tag(value)
                        }
                    }
                    TextField("Details", text: $details, axis: .vertical)
                        .lineLimit(4...8)
                }

                if let statusMessage {
                    Section {
                        Text(statusMessage)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Feature Request")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await submit() }
                    } label: {
                        if isSubmitting {
                            ProgressView()
                        } else {
                            Text("Send")
                        }
                    }
                    .disabled(isSubmitting || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .tint(settings.accentColor)
        }
    }

    private func submit() async {
        guard !isSubmitting else { return }
        isSubmitting = true
        errorMessage = nil
        statusMessage = nil

        do {
            try await FeatureRequestService.shared.submit(
                title: title,
                details: details,
                category: category,
                user: session.firebaseUser,
                organizationId: organizationId
            )
            statusMessage = "Feature request sent."
            title = ""
            details = ""
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
                dismiss()
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isSubmitting = false
    }
}

/// Vendor management screen
struct VendorManagementView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    @Query private var vendors: [Vendor]
    @StateObject private var settings = AppSettings.shared
    @State private var showingAddVendor = false

    private var activeOrganizationId: String {
        session.activeOrganizationId ?? "local-default"
    }

    private var scopedVendors: [Vendor] {
        vendors.filter { $0.organizationId == activeOrganizationId }
    }
    
    var body: some View {
        NavigationStack {
            List {
                ForEach(scopedVendors) { vendor in
                    NavigationLink(destination: VendorDetailView(vendor: vendor)) {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(vendor.name)
                                    .font(.headline)
                                if !vendor.isActive {
                                    Text("INACTIVE")
                                        .font(.caption2)
                                        .fontWeight(.bold)
                                        .foregroundStyle(.secondary)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(.gray.opacity(0.15), in: Capsule())
                                }
                            }
                            if !vendor.orderDays.isEmpty {
                                Text("Order days: \(vendor.orderDays.daySummary)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            if let start = vendor.orderWindowStart, let end = vendor.orderWindowEnd {
                                Text("Window: \(start.formatted(date: .omitted, time: .shortened)) - \(end.formatted(date: .omitted, time: .shortened))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .onDelete(perform: deleteVendors)
            }
            .navigationTitle("Vendors")
            .tint(settings.accentColor)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: { showingAddVendor = true }) {
                        Image(systemName: "plus")
                    }
                    .foregroundStyle(settings.accentColor)
                }
            }
            .sheet(isPresented: $showingAddVendor) {
                AddVendorView()
            }
        }
    }
    
    func deleteVendors(at offsets: IndexSet) {
        for index in offsets {
            modelContext.delete(scopedVendors[index])
        }
    }
}

struct VendorDetailView: View {
    @Bindable var vendor: Vendor
    @StateObject private var settings = AppSettings.shared
    
    var body: some View {
        Form {
            Section("Basic") {
                TextField("Name", text: $vendor.name)
                Toggle("Active", isOn: $vendor.isActive)
            }
            
            Section("Order Schedule") {
                WeekdaySelector(selection: $vendor.orderDays, accentColor: settings.accentColor)
                DatePicker("Window Starts", selection: orderWindowStartBinding, displayedComponents: .hourAndMinute)
                DatePicker("Window Ends", selection: orderWindowEndBinding, displayedComponents: .hourAndMinute)
            }
            
            Section("Delivery") {
                Stepper("Days from order to delivery: \(vendor.daysFromOrderToDelivery)",
                        value: $vendor.daysFromOrderToDelivery,
                        in: 1...30)
                
                VStack(alignment: .leading, spacing: 8) {
                    Text("Truck/Delivery Days")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    WeekdaySelector(selection: $vendor.truckDays, accentColor: settings.accentColor)
                }
            }
        }
        .navigationTitle(vendor.name)
        .tint(settings.accentColor)
    }
    
    private var orderWindowStartBinding: Binding<Date> {
        Binding(
            get: { vendor.orderWindowStart ?? defaultTime(hour: 5, minute: 0) },
            set: { vendor.orderWindowStart = $0 }
        )
    }
    
    private var orderWindowEndBinding: Binding<Date> {
        Binding(
            get: { vendor.orderWindowEnd ?? defaultTime(hour: 10, minute: 0) },
            set: { vendor.orderWindowEnd = $0 }
        )
    }
    
    private func defaultTime(hour: Int, minute: Int) -> Date {
        let now = Date()
        return Calendar.current.date(bySettingHour: hour, minute: minute, second: 0, of: now) ?? now
    }
}

struct AddVendorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var session: AccountSessionStore
    @StateObject private var settings = AppSettings.shared
    
    @State private var name = ""
    @State private var orderDays: [Int] = []
    @State private var truckDays: [Int] = []
    @State private var orderWindowStart = Calendar.current.date(bySettingHour: 5, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var orderWindowEnd = Calendar.current.date(bySettingHour: 10, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var daysFromOrderToDelivery = 2
    
    var body: some View {
        NavigationStack {
            Form {
                Section("Vendor") {
                    TextField("Vendor Name", text: $name)
                }
                
                Section("Order Schedule") {
                    WeekdaySelector(selection: $orderDays, accentColor: settings.accentColor)
                    DatePicker("Window Starts", selection: $orderWindowStart, displayedComponents: .hourAndMinute)
                    DatePicker("Window Ends", selection: $orderWindowEnd, displayedComponents: .hourAndMinute)
                }
                
                Section("Delivery") {
                    Stepper("Days from order to delivery: \(daysFromOrderToDelivery)",
                            value: $daysFromOrderToDelivery,
                            in: 1...30)
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Truck/Delivery Days")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        WeekdaySelector(selection: $truckDays, accentColor: settings.accentColor)
                    }
                }
            }
            .navigationTitle("New Vendor")
            .tint(settings.accentColor)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        let vendor = Vendor(
                            name: name,
                            truckDays: truckDays.sorted(),
                            orderDays: orderDays.sorted(),
                            daysFromOrderToDelivery: daysFromOrderToDelivery,
                            orderWindowStart: orderWindowStart,
                            orderWindowEnd: orderWindowEnd,
                            organizationId: session.activeOrganizationId ?? "local-default"
                        )
                        modelContext.insert(vendor)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

struct WeekdaySelector: View {
    @Binding var selection: [Int]
    let accentColor: Color
    
    private var dayNames: [String] {
        Calendar.current.shortWeekdaySymbols
    }
    
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
            ForEach(Array(dayNames.enumerated()), id: \.offset) { index, name in
                let isSelected = selection.contains(index)
                Button(action: { toggle(index) }) {
                    Text(name)
                        .font(.caption.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .foregroundStyle(isSelected ? .white : accentColor)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(isSelected ? accentColor : accentColor.opacity(0.12))
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }
    
    private func toggle(_ dayIndex: Int) {
        if let idx = selection.firstIndex(of: dayIndex) {
            selection.remove(at: idx)
        } else {
            selection.append(dayIndex)
        }
        selection.sort()
    }
}
