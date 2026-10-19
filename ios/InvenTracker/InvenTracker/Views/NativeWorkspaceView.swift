import SwiftUI
import UIKit

struct NativeWorkspaceView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.openURL) private var openURL
    @EnvironmentObject private var session: AppSession
    @StateObject private var model: NativeWorkspaceStore
    @Binding var editing: Bool
    @State private var catalogVisible = false
    @State private var configuredWidget: WorkspaceWidget?
    let storeId: String
    let openModule: (WorkShortcut) -> Void
    let useStandardHome: () -> Void
    private let gap: CGFloat = 12
    private var rowHeight: CGFloat { typeSize.isAccessibilitySize ? 104 : 64 }

    init(api: APIClient, uid: String, orgId: String, storeId: String, device: WorkspaceDevice, editing: Binding<Bool>, openModule: @escaping (WorkShortcut) -> Void, useStandardHome: @escaping () -> Void) {
        _model = StateObject(wrappedValue: NativeWorkspaceStore(api: api, uid: uid, orgId: orgId, device: device))
        _editing = editing; self.storeId = storeId; self.openModule = openModule; self.useStandardHome = useStandardHome
    }
    private var refreshIdentity: String { "\(storeId):\(scenePhase):\(model.layout?.widgets.map(\.widgetDefinitionId).sorted().joined(separator: ",") ?? "loading")" }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if model.layout != nil { editorControls }
            if !model.message.isEmpty { Text(model.message).font(.subheadline).accessibilityAddTraits(.updatesFrequently) }
            if model.loading { ProgressView("Loading your home…").frame(maxWidth: .infinity).padding() }
            if model.layout == nil && !model.loading {
                VStack(spacing: 12) {
                    Button("Retry home") { Task { await model.load() } }
                    Button("Use standard home", action: useStandardHome)
                }.frame(maxWidth: .infinity)
            }
            if model.recovery != nil {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Unfinished home edits are saved on this device.").font(.subheadline)
                    HStack {
                        Button("Restore edits") { model.restoreDraft(); editing = true }
                        Button("Discard edits") { model.discardDraft() }
                    }.buttonStyle(.bordered)
                }.padding().appSurface()
            }
            if model.conflict != nil {
                VStack(alignment: .leading, spacing: 10) {
                    Button("Load saved home") { model.useRemote(); editing = false }
                    Button("Keep my edits as a new revision") { Task { if await model.save(keepingLocal: true) { editing = false } } }
                }.buttonStyle(.bordered).disabled(model.saving)
            }
            if let layout = model.layout {
                if model.factsAreStale && model.data != nil { Label("Last saved snapshot · reconnect to refresh", systemImage: "wifi.exclamationmark").font(.caption).foregroundStyle(session.theme.mutedColor) }
                if layout.widgets.isEmpty { Text("Your home is empty. Choose Customize, then Add Widget.").font(.subheadline).padding() }
                workspaceGrid(layout)
            }
        }
        .disabled(model.saving || model.loading)
        .task { await model.load() }
        .task(id: refreshIdentity) {
            // Leaving Home or changing store cancels this task; old facts are scoped and discarded.
            guard scenePhase == .active, model.layout != nil else { return }
            await model.refresh(storeId: storeId, force: true)
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(15)) } catch { return }
                await model.refresh(storeId: storeId)
            }
        }
        .onChange(of: storeId) { _, _ in model.invalidateVisibleData() }
        .onDisappear { model.invalidateVisibleData() }
        .sensoryFeedback(.selection, trigger: model.activeGestureId)
        .sheet(isPresented: $catalogVisible) { widgetCatalog }
        .sheet(item: $configuredWidget) { widget in configuration(widget) }
    }
    private var editorControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(editing ? "Edit your home" : "Your workspace").font(.headline)
                Spacer()
                if editing {
                    Button("Cancel") { model.cancel(); editing = false }.disabled(model.saving)
                    Button(model.saving ? "Saving…" : "Done") { Task { if await model.save() { editing = false } } }.fontWeight(.semibold).disabled(model.saving)
                } else { Button("Customize") { editing = true }.accessibilityLabel("Customize your home screen") }
            }
            if editing {
                ViewThatFits(in: .horizontal) {
                    HStack { editActions }
                    VStack(alignment: .leading, spacing: 10) { editActions }
                }
                Picker("Widget shape", selection: Binding(get: { model.layout?.shapePreference ?? .roundedSquare }, set: model.setShape)) {
                    ForEach(WorkspaceShape.allCases, id: \.self) { Text($0.title).tag($0) }
                }.pickerStyle(.menu).disabled(model.saving)
                Text("Hold a move handle, then drag. Drag the lower corner to resize. Widget options also provide accessible move and size buttons.")
                    .font(.caption).foregroundStyle(session.theme.mutedColor)
            }
        }
    }
    @ViewBuilder private var editActions: some View {
        Button { catalogVisible = true } label: { Label("Add Widget", systemImage: "plus") }.disabled(model.saving || (model.layout?.widgets.count ?? 0) >= 60)
        Button { model.undo() } label: { Label("Undo", systemImage: "arrow.uturn.backward") }.disabled(model.saving || model.history.isEmpty)
        Button("Reset layout") { model.reset() }.disabled(model.saving)
    }
    private func workspaceGrid(_ layout: WorkspaceLayout) -> some View {
        let maxRow = layout.widgets.map { $0.gridY + $0.gridHeight }.max() ?? 0
        return GeometryReader { geometry in
            let column = (geometry.size.width - gap * CGFloat(layout.deviceClass.columns - 1)) / CGFloat(layout.deviceClass.columns)
            ZStack(alignment: .topLeading) {
                if let origin = model.gestureOrigin {
                    RoundedRectangle(cornerRadius: 16).stroke(session.theme.accentColor, style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                        .frame(width: CGFloat(origin.gridWidth) * (column + gap) - gap, height: CGFloat(origin.gridHeight) * (rowHeight + gap) - gap)
                        .offset(x: CGFloat(origin.gridX) * (column + gap), y: CGFloat(origin.gridY) * (rowHeight + gap))
                        .accessibilityHidden(true)
                }
                ForEach(layout.widgets) { widget in
                    let width = CGFloat(widget.gridWidth) * (column + gap) - gap
                    let height = CGFloat(widget.gridHeight) * (rowHeight + gap) - gap
                    widgetSurface(widget, layout: layout)
                        .frame(width: max(1, width), height: height)
                        .overlay(alignment: .topLeading) { if editing { moveHandle(widget, column: column) } }
                        .overlay(alignment: .bottomTrailing) { if editing { resizeHandle(widget, column: column) } }
                        .offset(x: CGFloat(widget.gridX) * (column + gap), y: CGFloat(widget.gridY) * (rowHeight + gap))
                        .scaleEffect(model.activeGestureId == widget.id ? 1.02 : 1)
                        .shadow(color: .black.opacity(model.activeGestureId == widget.id ? 0.2 : 0), radius: 10)
                        .zIndex(model.activeGestureId == widget.id ? 1 : 0)
                        .accessibilityElement(children: .contain)
                        .accessibilityActions {
                            if editing {
                                Button("Move left") { model.move(widget, x: -1, y: 0) }
                                Button("Move right") { model.move(widget, x: 1, y: 0) }
                                Button("Move up") { model.move(widget, x: 0, y: -1) }
                                Button("Move down") { model.move(widget, x: 0, y: 1) }
                                Button("Make larger") { model.resize(widget, larger: true) }
                                Button("Make smaller") { model.resize(widget, larger: false) }
                                Button("Remove widget") { model.remove(widget.id) }
                            }
                        }
                }
            }
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.22), value: layout.widgets)
        }
        .frame(height: max(1, CGFloat(maxRow) * (rowHeight + gap) - gap))
    }
    private func widgetSurface(_ widget: WorkspaceWidget, layout: WorkspaceLayout) -> some View {
        let definition = model.definitions.first { $0.id == widget.widgetDefinitionId }
        let shape = widget.shapeOverride ?? layout.shapePreference
        let summary = model.data?.storeId == storeId ? model.data?.widgets[widget.widgetDefinitionId] : nil
        let navigationOnly = definition?.dataSource.hasPrefix("navigation:") == true
        let candidates = model.factsAreStale ? [] : WorkspaceGeometry.candidates(summary?.candidates ?? [], widget: widget)
        return Button {
            if editing { configuredWidget = widget } else if let definition { navigate(definition) }
        } label: {
            VStack(alignment: shape == .circle ? .center : .leading, spacing: 8) {
                Image(systemName: symbol(widget.widgetDefinitionId)).font(.title3).foregroundStyle(session.theme.accentColor)
                Text(definition?.title ?? "Widget unavailable").font(.headline).lineLimit(2)
                Text(definition == nil ? "Access unavailable" : navigationOnly ? "Open" : summary?.value ?? (model.stale ? "Offline" : "Loading…"))
                    .font(widget.size == .small ? .title3.bold() : .title.bold()).lineLimit(2).minimumScaleFactor(0.7)
                if widget.size != .small && shape != .circle {
                    Text(summary?.detail ?? definition?.description ?? "Your role does not include this widget.").font(.caption).foregroundStyle(session.theme.mutedColor).lineLimit(3)
                    if summary?.partial == true { Text("Partial coverage").font(.caption2).foregroundStyle(AppTheme.amber) }
                    if widget.size == .large || widget.size == .extraLarge {
                        ForEach(candidates) { candidate in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(candidate.title).font(.caption.weight(.semibold)).foregroundStyle(candidate.severity == "critical" ? AppTheme.danger : session.theme.textColor).lineLimit(2)
                                Text(candidate.summary).font(.caption2).foregroundStyle(session.theme.mutedColor).lineLimit(2)
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: shape == .circle ? .center : .topLeading)
            .padding(editing ? 32 : 16)
            .foregroundStyle(session.theme.textColor)
            .background(session.theme.backgroundSoftColor)
            .clipShape(WorkspaceSurfaceShape(shape: shape))
            .overlay(WorkspaceSurfaceShape(shape: shape).stroke(session.theme.controlBorderColor, lineWidth: 1))
            .contentShape(WorkspaceSurfaceShape(shape: shape))
        }
        .buttonStyle(.plain)
        .disabled(model.saving || (!editing && (definition == nil || summary?.state == "permission-denied")))
        .accessibilityLabel("\(definition?.title ?? "Unavailable widget"), \(summary?.value ?? (navigationOnly ? "Open" : "Unavailable"))\(model.factsAreStale && !navigationOnly ? ", stale" : "")")
        .accessibilityHint(editing ? "Open widget options. Move and resize actions are also available." : "Open this workspace module.")
    }
    private func moveHandle(_ widget: WorkspaceWidget, column: CGFloat) -> some View {
        Image(systemName: "arrow.up.and.down.and.arrow.left.and.right")
            .frame(width: 44, height: 44).background(.ultraThinMaterial, in: Circle())
            .accessibilityLabel("Move widget. Hold then drag.")
            .gesture(LongPressGesture(minimumDuration: 0.35).sequenced(before: DragGesture(coordinateSpace: .global)).onChanged { value in
                if case .second(true, let drag?) = value { model.previewGesture(id: widget.id, dx: drag.translation.width / (column + gap), dy: drag.translation.height / (rowHeight + gap), resize: false) }
            }.onEnded { _ in model.finishGesture(); UISelectionFeedbackGenerator().selectionChanged() })
            .allowsHitTesting(!model.saving)
    }
    private func resizeHandle(_ widget: WorkspaceWidget, column: CGFloat) -> some View {
        Image(systemName: "arrow.down.right.and.arrow.up.left")
            .frame(width: 44, height: 44).background(.ultraThinMaterial, in: Circle())
            .accessibilityLabel("Resize widget. Drag the corner.")
            .gesture(DragGesture(minimumDistance: 1, coordinateSpace: .global).onChanged { drag in
                model.previewGesture(id: widget.id, dx: drag.translation.width / (column + gap), dy: drag.translation.height / (rowHeight + gap), resize: true)
            }.onEnded { _ in model.finishGesture(); UISelectionFeedbackGenerator().selectionChanged() })
            .allowsHitTesting(!model.saving)
    }
    private var widgetCatalog: some View {
        NavigationStack {
            List(model.definitions.filter { definition in !(model.layout?.widgets.contains { $0.widgetDefinitionId == definition.id } ?? false) }) { definition in
                Button { model.add(definition); catalogVisible = false } label: {
                    VStack(alignment: .leading, spacing: 4) { Text(definition.title).font(.headline); Text(definition.description).font(.caption).foregroundStyle(.secondary) }
                }
            }.navigationTitle("Add Widget").toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { catalogVisible = false } } }
        }
    }
    private func configuration(_ original: WorkspaceWidget) -> some View {
        let widget = model.layout?.widgets.first { $0.id == original.id } ?? original
        let summary = model.data?.storeId == storeId ? model.data?.widgets[widget.widgetDefinitionId] : nil
        return NavigationStack {
            Form {
                Section("Position") {
                    Button("Move left") { model.move(widget, x: -1, y: 0) }
                    Button("Move right") { model.move(widget, x: 1, y: 0) }
                    Button("Move up") { model.move(widget, x: 0, y: -1) }
                    Button("Move down") { model.move(widget, x: 0, y: 1) }
                }
                Section("Size") {
                    Text(widget.size.title)
                    Button("Make larger") { model.resize(widget, larger: true) }
                    Button("Make smaller") { model.resize(widget, larger: false) }
                }
                Section("Shape") {
                    Button("Use home shape") { var next = widget; next.shapeOverride = nil; model.configure(next) }
                    ForEach(WorkspaceShape.allCases, id: \.self) { shape in
                        Button(shape.title) { var next = widget; next.shapeOverride = shape; model.configure(next) }
                    }
                }
                Section("Content") {
                    Picker("Content mode", selection: Binding(get: { widget.mode }, set: { var next = widget; next.mode = $0; if $0 != .pinned { next.pinnedContentId = nil }; model.configure(next) })) {
                        Text("Summary").tag(WorkspaceContentMode.fixed)
                        Text("Automatic priorities").tag(WorkspaceContentMode.automatic)
                        Text("Pinned priority").tag(WorkspaceContentMode.pinned)
                    }
                    if widget.mode == .pinned {
                        Text("Expired or unavailable pins fall back to the summary.").font(.caption)
                        if !model.factsAreStale {
                            ForEach((summary?.candidates ?? []).filter { $0.engineId == widget.engineId && $0.supportedSizes.contains(widget.size) && ($0.expiration == nil || (workspaceDate($0.expiration!) ?? .distantPast) > Date()) }) { candidate in
                                Button { var next = widget; next.pinnedContentId = candidate.id; model.configure(next) } label: {
                                    Label(candidate.title, systemImage: widget.pinnedContentId == candidate.id ? "pin.fill" : "pin")
                                }
                            }
                        }
                    }
                }
                Section { Button("Remove widget", role: .destructive) { model.remove(widget.id); configuredWidget = nil } }
            }
            .disabled(model.saving)
            .navigationTitle("Widget options")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { configuredWidget = nil } } }
        }
    }
    private func navigate(_ definition: NativeWidgetDefinition) {
        let module: WorkShortcut? = ["inventory": .inventory, "products": .inventory, "low-stock": .inventory, "expiration": .inventory, "orders": .orders, "health": .healthChecks, "spot-check": .spotCheck, "restocks": .restock, "receiving": .receiving, "transfers": .transfer, "production": .portion, "waste": .waste, "insights": .insights, "assistant": .assistant][definition.id]
        if let module, session.availableWorkShortcuts.contains(module) { openModule(module) }
        else if definition.href.hasPrefix("/"), !definition.href.hasPrefix("//"), let url = URL(string: definition.href, relativeTo: AppConfig.baseURL)?.absoluteURL { openURL(url) }
    }
    private func symbol(_ id: String) -> String {
        ["inventory": "shippingbox", "orders": "cart", "health": "checklist", "spot-check": "checkmark.viewfinder", "restocks": "arrow.triangle.2.circlepath", "receiving": "shippingbox.and.arrow.backward", "transfers": "arrow.left.arrow.right", "production": "scissors", "waste": "trash", "insights": "chart.line.uptrend.xyaxis", "assistant": "sparkles", "notes": "note.text", "expiration": "calendar.badge.exclamationmark", "low-stock": "exclamationmark.triangle"] [id] ?? "square.grid.2x2"
    }
}
private struct WorkspaceSurfaceShape: Shape {
    let shape: WorkspaceShape
    func path(in rect: CGRect) -> Path {
        if shape == .circle {
            let side = min(rect.width, rect.height)
            return Circle().path(in: CGRect(x: rect.midX - side / 2, y: rect.midY - side / 2, width: side, height: side))
        }
        return RoundedRectangle(cornerRadius: shape == .square ? 0 : 22, style: .continuous).path(in: rect)
    }
}
