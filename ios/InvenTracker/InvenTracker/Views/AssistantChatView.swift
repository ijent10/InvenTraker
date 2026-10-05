import SwiftUI

struct AssistantChatView: View {
    @EnvironmentObject private var session: AppSession
    @State private var selectedId: String?
    @State private var search = ""
    @State private var draft = ""
    @State private var isSending = false

    private var selected: AssistantChat? { session.assistantChats.first { $0.id == selectedId } }
    private var filtered: [AssistantChat] {
        guard !search.isEmpty else { return session.assistantChats }
        let needle = search.lowercased()
        return session.assistantChats.filter { chat in
            ([chat.title, formatted(chat.createdAt), formatted(chat.updatedAt)] + chat.messages.flatMap { [$0.text, formatted($0.createdAt)] }).joined(separator: " ").lowercased().contains(needle)
        }
    }

    var body: some View {
        Group {
            if let selected { conversation(selected) }
            else { history }
        }
        .navigationTitle(selected == nil ? "Assistant" : selected?.title ?? "Assistant")
        .toolbar {
            if selected != nil { ToolbarItem(placement: .topBarLeading) { Button { selectedId = nil } label: { Label("Chats", systemImage: "chevron.left") } } }
            ToolbarItem(placement: .topBarTrailing) { Button { selectedId = nil; draft = "" } label: { Image(systemName: "square.and.pencil") } }
        }
        .task { await session.loadAssistantChats() }
    }

    private var history: some View {
        List {
            if filtered.isEmpty { ContentUnavailableView("No chats found", systemImage: "bubble.left.and.text.bubble.right", description: Text("Start a conversation or search another date.")) }
            ForEach(filtered) { chat in
                Button { selectedId = chat.id } label: {
                    VStack(alignment: .leading, spacing: 5) { Text(chat.title).font(.headline).lineLimit(1); Text(formatted(chat.updatedAt)).font(.caption).foregroundStyle(session.theme.mutedColor); Text(chat.messages.last?.text ?? "New chat").font(.subheadline).foregroundStyle(session.theme.mutedColor).lineLimit(2) }
                }
                .swipeActions { Button(role: .destructive) { Task { await session.deleteAssistantChat(chat) } } label: { Label("Delete", systemImage: "trash") } }
            }
        }
        .searchable(text: $search, prompt: "Search chats, messages, or dates")
        .safeAreaInset(edge: .bottom) { composer }
    }

    private func conversation(_ chat: AssistantChat) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 20) {
                    ForEach(chat.messages) { message in
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: message.role == "assistant" ? "sparkles" : "person.fill").frame(width: 28, height: 28).background(message.role == "assistant" ? session.theme.accentColor : session.theme.controlBackgroundColor, in: Circle()).foregroundStyle(message.role == "assistant" ? session.theme.buttonTextColor : session.theme.textColor)
                            VStack(alignment: .leading, spacing: 6) { HStack { Text(message.role == "assistant" ? "InvenTracker" : "You").font(.subheadline.bold()); Text(formatted(message.createdAt)).font(.caption2).foregroundStyle(session.theme.subtleColor) }; Text(message.text).frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled) }
                        }.id(message.id)
                    }
                    if isSending { HStack { ProgressView(); Text("Thinking with store data…").foregroundStyle(session.theme.mutedColor); Spacer() } }
                }.padding()
            }
            .onChange(of: chat.messages.count) { _, _ in if let last = chat.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } } }
            .safeAreaInset(edge: .bottom) { composer }
        }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("Message InvenTracker", text: $draft, axis: .vertical).lineLimit(1...5).textFieldStyle(.roundedBorder)
            Button { send() } label: { Image(systemName: "arrow.up").font(.headline).frame(width: 36, height: 36).background(session.theme.accentColor, in: Circle()).foregroundStyle(session.theme.buttonTextColor) }.disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
        }.padding().background(.ultraThinMaterial)
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines); guard !text.isEmpty else { return }
        draft = ""; isSending = true
        Task { defer { isSending = false }; do { selectedId = try await session.askAssistant(chatId: selectedId, text: text) } catch { session.toast = error.localizedDescription } }
    }

    private func formatted(_ value: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: value) else { return value }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
