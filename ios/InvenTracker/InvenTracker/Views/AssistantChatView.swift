import SwiftUI

struct AssistantChatView: View {
    @EnvironmentObject private var session: AppSession
    @State private var search = ""

    private var filtered: [AssistantChat] {
        guard !search.isEmpty else { return session.assistantChats }
        let needle = search.lowercased()
        return session.assistantChats.filter { chat in
            ([chat.title, formatChatDate(chat.createdAt), formatChatDate(chat.updatedAt)] + chat.messages.flatMap { [$0.text, formatChatDate($0.createdAt)] })
                .joined(separator: " ").lowercased().contains(needle)
        }
    }

    var body: some View {
        List {
            Section {
                NavigationLink {
                    AssistantConversationView(chatId: nil)
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("New conversation").font(.headline)
                            Text("Ask about inventory, orders, vendors, trends, or operations")
                                .font(.caption).foregroundStyle(session.theme.mutedColor)
                        }
                    } icon: {
                        Image(systemName: "square.and.pencil")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(session.theme.buttonTextColor)
                            .frame(width: 42, height: 42)
                            .background(session.theme.accentColor, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                    }
                }
                .padding(.vertical, 4)
            }

            Section("Conversations") {
                if filtered.isEmpty {
                    ContentUnavailableView(
                        search.isEmpty ? "No conversations yet" : "No chats found",
                        systemImage: "bubble.left.and.text.bubble.right",
                        description: Text(search.isEmpty ? "Start a conversation with your business assistant." : "Try a message, title, date, or time.")
                    )
                    .listRowBackground(Color.clear)
                }
                ForEach(filtered) { chat in
                    NavigationLink {
                        AssistantConversationView(chatId: chat.id)
                    } label: {
                        VStack(alignment: .leading, spacing: 7) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(chat.title).font(.headline).lineLimit(1)
                                Spacer()
                                Text(relativeDate(chat.updatedAt)).font(.caption2).foregroundStyle(session.theme.subtleColor)
                            }
                            Text(chat.messages.last?.text ?? "New conversation")
                                .font(.subheadline).foregroundStyle(session.theme.mutedColor).lineLimit(2)
                            Text(formatChatDate(chat.updatedAt))
                                .font(.caption2).foregroundStyle(session.theme.subtleColor)
                        }
                        .padding(.vertical, 5)
                    }
                    .swipeActions {
                        Button(role: .destructive) { Task { await session.deleteAssistantChat(chat) } } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(session.theme.backgroundColor)
        .searchable(text: $search, prompt: "Search chats, messages, dates, or times")
        .navigationTitle("Assistant")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink { AssistantConversationView(chatId: nil) } label: { Image(systemName: "square.and.pencil") }
            }
        }
        .task {
            await session.loadAssistantChats()
            await session.onDeviceAssistant.prepare()
        }
    }
}

private struct AssistantConversationView: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var activeChatId: String?
    @State private var draft = ""
    @State private var isSending = false
    @FocusState private var composerFocused: Bool

    init(chatId: String?) { _activeChatId = State(initialValue: chatId) }

    private var chat: AssistantChat? { session.assistantChats.first { $0.id == activeChatId } }
    private var messages: [AssistantMessage] { chat?.messages ?? [] }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 14) {
                    if messages.isEmpty {
                        welcome
                    } else {
                        ForEach(messages) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }
                    }
                    if isSending {
                        HStack(alignment: .bottom, spacing: 8) {
                            ThinkingBubble()
                            Spacer(minLength: 54)
                        }
                        .id("thinking")
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 18)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(session.theme.backgroundColor)
            .safeAreaInset(edge: .bottom, spacing: 0) { composer }
            .onChange(of: messages.count) { _, _ in scrollToBottom(proxy) }
            .onChange(of: isSending) { _, _ in scrollToBottom(proxy) }
        }
        .navigationTitle(chat?.title ?? "New conversation")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button(role: .destructive) {
                        guard let chat else { return }
                        Task { await session.deleteAssistantChat(chat); dismiss() }
                    } label: { Label("Delete conversation", systemImage: "trash") }
                } label: { Image(systemName: "ellipsis.circle") }
                .disabled(chat == nil)
            }
        }
        .task { await session.onDeviceAssistant.prepare() }
    }

    private var welcome: some View {
        VStack(spacing: 14) {
            Image(systemName: "sparkles")
                .font(.system(size: 32, weight: .semibold))
                .foregroundStyle(session.theme.buttonTextColor)
                .frame(width: 64, height: 64)
                .background(session.theme.accentColor, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            Text("How can I help?").font(.title2.bold()).foregroundStyle(session.theme.textColor)
            Text("Ask about anything in the business. Employee identity and personal account details stay private.")
                .font(.subheadline).foregroundStyle(session.theme.mutedColor).multilineTextAlignment(.center)
            AssistantStatusView(assistant: session.onDeviceAssistant)
        }
        .frame(maxWidth: 420)
        .padding(.horizontal, 30)
        .padding(.top, 54)
        .frame(maxWidth: .infinity)
    }

    private var composer: some View {
        VStack(spacing: 8) {
            AssistantStatusView(assistant: session.onDeviceAssistant, compact: true)
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Message InvenTracker…", text: $draft, axis: .vertical)
                    .focused($composerFocused)
                    .lineLimit(1...6)
                    .font(.body)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(session.theme.controlBackgroundColor, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .stroke(session.theme.controlBorderColor, lineWidth: 1)
                    }
                    .submitLabel(.send)
                    .onSubmit { send() }

                Button(action: send) {
                    Image(systemName: "arrow.up")
                        .font(.body.bold())
                        .frame(width: 44, height: 44)
                        .background(canSend ? session.theme.accentColor : session.theme.controlHoverColor, in: Circle())
                        .foregroundStyle(canSend ? session.theme.buttonTextColor : session.theme.subtleColor)
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
                .accessibilityLabel("Send message")
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 9)
        .padding(.bottom, 8)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Divider().opacity(0.45) }
    }

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSending && session.onDeviceAssistant.state == .ready
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return }
        draft = ""
        isSending = true
        Task {
            defer { isSending = false }
            do { activeChatId = try await session.askAssistant(chatId: activeChatId, text: text) }
            catch { session.toast = error.localizedDescription; draft = text }
        }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        Task { @MainActor in
            await Task.yield()
            withAnimation(.easeOut(duration: 0.25)) {
                if isSending { proxy.scrollTo("thinking", anchor: .bottom) }
                else if let last = messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
            }
        }
    }
}

private struct MessageBubble: View {
    @EnvironmentObject private var session: AppSession
    let message: AssistantMessage
    private var isUser: Bool { message.role == "user" }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if isUser { Spacer(minLength: 54) }
            if !isUser {
                Image(systemName: "sparkles")
                    .font(.caption.bold())
                    .foregroundStyle(session.theme.buttonTextColor)
                    .frame(width: 28, height: 28)
                    .background(session.theme.secondaryColor, in: Circle())
            }
            VStack(alignment: isUser ? .trailing : .leading, spacing: 5) {
                Text(message.text)
                    .font(.body)
                    .foregroundStyle(isUser ? session.theme.buttonTextColor : session.theme.textColor)
                    .textSelection(.enabled)
                    .padding(.horizontal, 15)
                    .padding(.vertical, 11)
                    .background(isUser ? session.theme.accentColor : session.theme.panelStrongColor, in: RoundedRectangle(cornerRadius: 19, style: .continuous))
                    .overlay {
                        if !isUser {
                            RoundedRectangle(cornerRadius: 19, style: .continuous)
                                .stroke(session.theme.controlBorderColor, lineWidth: 1)
                        }
                    }
                Text(formatMessageTime(message.createdAt))
                    .font(.caption2).foregroundStyle(session.theme.subtleColor).padding(.horizontal, 5)
            }
            if !isUser { Spacer(minLength: 54) }
        }
        .frame(maxWidth: .infinity)
    }
}

private struct ThinkingBubble: View {
    @EnvironmentObject private var session: AppSession
    var body: some View {
        HStack(spacing: 7) {
            ProgressView().controlSize(.small).tint(session.theme.secondaryColor)
            Text("Thinking on this iPhone…").font(.subheadline).foregroundStyle(session.theme.mutedColor)
        }
        .padding(.horizontal, 15).padding(.vertical, 11)
        .background(session.theme.panelStrongColor, in: RoundedRectangle(cornerRadius: 19, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 19).stroke(session.theme.controlBorderColor, lineWidth: 1) }
    }
}

private struct AssistantStatusView: View {
    @EnvironmentObject private var session: AppSession
    @ObservedObject var assistant: OnDeviceAssistant
    var compact = false

    var body: some View {
        HStack(spacing: 6) {
            if assistant.state != .ready { ProgressView().controlSize(.mini) }
            Circle().fill(assistant.state == .ready ? Color.green : session.theme.secondaryColor).frame(width: 7, height: 7)
            Text(assistant.state.label)
                .font(compact ? .caption2 : .caption)
                .foregroundStyle(session.theme.mutedColor)
                .lineLimit(1)
        }
    }
}

private func parseChatDate(_ value: String) -> Date? {
    ISO8601DateFormatter().date(from: value)
}
private func formatChatDate(_ value: String) -> String {
    parseChatDate(value)?.formatted(date: .abbreviated, time: .shortened) ?? value
}
private func formatMessageTime(_ value: String) -> String {
    parseChatDate(value)?.formatted(date: .omitted, time: .shortened) ?? value
}
private func relativeDate(_ value: String) -> String {
    guard let date = parseChatDate(value) else { return value }
    return date.formatted(.relative(presentation: .named, unitsStyle: .abbreviated))
}
