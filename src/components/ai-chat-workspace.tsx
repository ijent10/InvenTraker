"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore"
import { Bot, Loader2, Menu, MessageSquarePlus, Search, Send, Trash2, User, X } from "lucide-react"
import { useAuthSession } from "@/lib/auth-session"
import { db } from "@/lib/firebase"
import type { AiAnswer } from "@/lib/ai/types"

type ChatMessage = { id: string; role: "user" | "assistant"; text: string; createdAt: string; answer?: AiAnswer }
type Chat = { id: string; title: string; createdAt: string; updatedAt: string; messages: ChatMessage[]; experienceVersion: 2 }
const localKey = "inventracker-assistant-chats-v2"
const legacyLocalKey = "inventracker-assistant-chats-v1"
const now = () => new Date().toISOString()
const dateLabel = (value: string) => new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
function newChat(): Chat { const createdAt = now(); return { id: crypto.randomUUID(), title: "New chat", createdAt, updatedAt: createdAt, messages: [], experienceVersion: 2 } }

export function AiChatWorkspace() {
  const session = useAuthSession()
  const [chats, setChats] = useState<Chat[]>([]), [activeId, setActiveId] = useState(""), [search, setSearch] = useState(""), [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(false), [sidebarOpen, setSidebarOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const active = chats.find((chat) => chat.id === activeId)

  useEffect(() => {
    if (db && session.user && session.orgId && session.status === "ready") return onSnapshot(query(collection(db, "orgs", session.orgId, "assistantChats"), where("ownerId", "==", session.user.uid)), (snapshot) => {
      const records = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() } as Chat))
        .filter((chat) => chat.experienceVersion === 2)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      setChats(records); setActiveId((current) => current && records.some((chat) => chat.id === current) ? current : records[0]?.id ?? "")
    })
    localStorage.removeItem(legacyLocalKey)
    const saved = JSON.parse(localStorage.getItem(localKey) || "[]") as Chat[]; setChats(saved); setActiveId(saved[0]?.id ?? "")
  }, [session.orgId, session.status, session.user])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [active?.messages.length, loading])

  async function save(chat: Chat) {
    setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    if (db && session.user && session.status === "ready") await setDoc(doc(db, "orgs", session.orgId, "assistantChats", chat.id), { ...chat, experienceVersion: 2, ownerId: session.user.uid, serverUpdatedAt: serverTimestamp() }, { merge: true })
    else localStorage.setItem(localKey, JSON.stringify([chat, ...chats.filter((item) => item.id !== chat.id)].slice(0, 100)))
  }
  function startChat() { const chat = newChat(); setChats((current) => [chat, ...current]); setActiveId(chat.id); setSidebarOpen(false) }
  async function removeChat(chat: Chat) {
    if (db && session.user && session.status === "ready") await deleteDoc(doc(db, "orgs", session.orgId, "assistantChats", chat.id))
    const next = chats.filter((item) => item.id !== chat.id); setChats(next); localStorage.setItem(localKey, JSON.stringify(next)); if (activeId === chat.id) setActiveId(next[0]?.id ?? "")
  }
  async function send() {
    const question = draft.trim(); if (!question || loading) return
    const chat = active ?? newChat(), createdAt = now(); const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text: question, createdAt }
    const pending = { ...chat, title: chat.messages.length ? chat.title : question.slice(0, 54), updatedAt: createdAt, messages: [...chat.messages, userMessage] }
    setActiveId(pending.id); setDraft(""); setLoading(true); await save(pending)
    try {
      const token = await session.user?.getIdToken()
      const response = await fetch("/api/ai/ask", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}`, "x-inventracker-org": session.orgId } : {}) }, body: JSON.stringify({ question, history: pending.messages.slice(-12).map(({ role, text }) => ({ role, text })) }) })
      const answer = await response.json() as AiAnswer
      const reply: ChatMessage = { id: crypto.randomUUID(), role: "assistant", text: answer.answer, answer, createdAt: now() }
      await save({ ...pending, updatedAt: reply.createdAt, messages: [...pending.messages, reply] })
    } catch { const reply: ChatMessage = { id: crypto.randomUUID(), role: "assistant", text: "I could not reach the shared assistant. Please try again.", createdAt: now() }; await save({ ...pending, updatedAt: reply.createdAt, messages: [...pending.messages, reply] }) }
    finally { setLoading(false) }
  }
  const filtered = useMemo(() => { const needle = search.trim().toLowerCase(); return needle ? chats.filter((chat) => [chat.title, dateLabel(chat.createdAt), dateLabel(chat.updatedAt), ...chat.messages.map((message) => `${message.text} ${dateLabel(message.createdAt)}`)].join(" ").toLowerCase().includes(needle)) : chats }, [chats, search])

  return <div className="-mx-4 -my-5 flex h-[calc(100vh-4rem)] min-h-[620px] overflow-hidden bg-[var(--app-bg)] sm:-mx-6 lg:-mx-8">
    <aside className={`${sidebarOpen ? "flex" : "hidden"} absolute inset-y-0 left-0 z-30 w-80 flex-col border-r border-[var(--app-border)] bg-[var(--app-panel)] lg:relative lg:flex`}>
      <div className="flex items-center gap-2 p-3"><button onClick={startChat} className="flex min-h-11 flex-1 items-center gap-2 rounded-lg border border-[var(--app-control-border)] px-3 text-sm font-semibold"><MessageSquarePlus className="h-4 w-4"/>New chat</button><button className="p-2 lg:hidden" onClick={() => setSidebarOpen(false)}><X/></button></div>
      <div className="relative px-3 pb-3"><Search className="absolute left-6 top-3 h-4 w-4 text-[var(--app-subtle)]"/><input aria-label="Search chats and timestamps" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats or dates" className="min-h-10 w-full rounded-lg border border-[var(--app-control-border)] bg-[var(--app-control-bg)] pl-9 pr-3 text-sm"/></div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">{filtered.map((chat) => <button key={chat.id} onClick={() => { setActiveId(chat.id); setSidebarOpen(false) }} className={`group mb-1 w-full rounded-lg p-3 text-left ${chat.id === activeId ? "bg-[var(--app-control-bg)]" : "hover:bg-[var(--app-control-bg)]"}`}><div className="flex gap-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{chat.title}</p><p className="mt-1 text-xs text-[var(--app-subtle)]">{dateLabel(chat.updatedAt)}</p></div><span onClick={(event) => { event.stopPropagation(); void removeChat(chat) }} className="invisible p-1 group-hover:visible"><Trash2 className="h-4 w-4"/></span></div></button>)}</div>
    </aside>
    <main className="flex min-w-0 flex-1 flex-col"><header className="flex h-16 items-center border-b border-[var(--app-border)] bg-[var(--app-panel)]/90 px-4 backdrop-blur"><button className="mr-3 lg:hidden" onClick={() => setSidebarOpen(true)}><Menu/></button><div><h1 className="font-semibold">{active?.title ?? "InvenTracker Assistant"}</h1><p className="text-xs text-[var(--app-subtle)]">Business-aware assistant · private employee identity</p></div></header>
      <div className="flex-1 overflow-y-auto px-4 py-6"><div className="mx-auto max-w-3xl space-y-4">{!active?.messages.length ? <div className="pt-[12vh] text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--app-accent)] text-[var(--app-on-accent)] shadow-lg"><Bot className="h-8 w-8"/></span><h2 className="mt-5 text-2xl font-semibold">How can I help with the business?</h2><p className="mx-auto mt-2 max-w-lg text-[var(--app-muted)]">Ask about inventory, ordering, vendors, waste, health checks, products, trends, settings, or approved documents.</p></div> : active.messages.map((message) => {
        const isUser = message.role === "user"
        return <article key={message.id} className={`flex w-full items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
          {!isUser ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--app-secondary)] text-[var(--app-on-accent)]"><Bot className="h-4 w-4"/></span> : null}
          <div className={`max-w-[min(82%,42rem)] ${isUser ? "text-right" : "text-left"}`}>
            <div className={`rounded-2xl px-4 py-3 text-left shadow-sm ${isUser ? "rounded-br-md bg-[var(--app-accent)] text-[var(--app-on-accent)]" : "rounded-bl-md border border-[var(--app-control-border)] bg-[var(--app-panel-strong)] text-[var(--app-text)]"}`}>
              <p className="whitespace-pre-wrap leading-7">{message.text}</p>
              {message.answer?.recommendedActions?.length ? <div className="mt-3 border-t border-current/15 pt-3">{message.answer.recommendedActions.slice(0,3).map((action) => <p key={action} className="mt-1 text-sm">• {action}</p>)}</div> : null}
            </div>
            <time className="mt-1 inline-block px-1 text-xs text-[var(--app-subtle)]">{dateLabel(message.createdAt)}</time>
          </div>
          {isUser ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--app-control-bg)]"><User className="h-4 w-4"/></span> : null}
        </article>
      })}{loading ? <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--app-secondary)] text-[var(--app-on-accent)]"><Bot className="h-4 w-4"/></span><div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-[var(--app-control-border)] bg-[var(--app-panel-strong)] px-4 py-3 text-sm text-[var(--app-muted)]"><Loader2 className="h-4 w-4 animate-spin"/>Thinking with business data…</div></div> : null}<div ref={bottomRef}/></div></div>
      <div className="border-t border-[var(--app-border)] bg-[var(--app-panel)]/95 px-4 pb-4 pt-3 backdrop-blur"><div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[1.6rem] border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-2 pl-3 shadow-xl"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if(event.key === "Enter" && !event.shiftKey){event.preventDefault();void send()} }} placeholder="Message InvenTracker…" rows={1} className="max-h-44 min-h-12 flex-1 resize-none bg-transparent px-2 py-3 leading-6 outline-none"/><button aria-label="Send message" onClick={() => void send()} disabled={!draft.trim() || loading} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--app-accent)] text-[var(--app-on-accent)] transition hover:brightness-110 disabled:opacity-35"><Send className="h-4 w-4"/></button></div><p className="mt-2 text-center text-xs text-[var(--app-subtle)]">Verified business records guide answers. Employee identity stays private.</p></div>
    </main>
  </div>
}
