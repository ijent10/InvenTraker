"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore"
import { Bot, Loader2, Menu, MessageSquarePlus, Search, Send, Trash2, User, X } from "lucide-react"
import { useAuthSession } from "@/lib/auth-session"
import { db } from "@/lib/firebase"
import type { AiAnswer } from "@/lib/ai/types"

type ChatMessage = { id: string; role: "user" | "assistant"; text: string; createdAt: string; answer?: AiAnswer }
type Chat = { id: string; title: string; createdAt: string; updatedAt: string; messages: ChatMessage[] }
const localKey = "inventracker-assistant-chats-v1"
const now = () => new Date().toISOString()
const dateLabel = (value: string) => new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
function newChat(): Chat { const createdAt = now(); return { id: crypto.randomUUID(), title: "New chat", createdAt, updatedAt: createdAt, messages: [] } }

export function AiChatWorkspace() {
  const session = useAuthSession()
  const [chats, setChats] = useState<Chat[]>([]), [activeId, setActiveId] = useState(""), [search, setSearch] = useState(""), [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(false), [sidebarOpen, setSidebarOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const active = chats.find((chat) => chat.id === activeId)

  useEffect(() => {
    if (db && session.user && session.orgId && session.status === "ready") return onSnapshot(query(collection(db, "orgs", session.orgId, "assistantChats"), where("ownerId", "==", session.user.uid)), (snapshot) => {
      const records = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Chat)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      setChats(records); setActiveId((current) => current && records.some((chat) => chat.id === current) ? current : records[0]?.id ?? "")
    })
    const saved = JSON.parse(localStorage.getItem(localKey) || "[]") as Chat[]; setChats(saved); setActiveId(saved[0]?.id ?? "")
  }, [session.orgId, session.status, session.user])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [active?.messages.length, loading])

  async function save(chat: Chat) {
    setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    if (db && session.user && session.status === "ready") await setDoc(doc(db, "orgs", session.orgId, "assistantChats", chat.id), { ...chat, ownerId: session.user.uid, serverUpdatedAt: serverTimestamp() }, { merge: true })
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
      const response = await fetch("/api/ai/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, history: pending.messages.slice(-12).map(({ role, text }) => ({ role, text })) }) })
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
    <main className="flex min-w-0 flex-1 flex-col"><header className="flex h-14 items-center border-b border-[var(--app-border)] px-4"><button className="mr-3 lg:hidden" onClick={() => setSidebarOpen(true)}><Menu/></button><div><h1 className="font-semibold">{active?.title ?? "InvenTracker Assistant"}</h1><p className="text-xs text-[var(--app-subtle)]">Shared operational AI · timestamped conversations</p></div></header>
      <div className="flex-1 overflow-y-auto px-4 py-8"><div className="mx-auto max-w-3xl space-y-7">{!active?.messages.length ? <div className="pt-[12vh] text-center"><Bot className="mx-auto h-10 w-10 text-[var(--app-accent)]"/><h2 className="mt-4 text-2xl font-semibold">How can I help with the store?</h2><p className="mt-2 text-[var(--app-muted)]">Ask about Today, inventory, ordering, waste, products, or approved documents.</p></div> : active.messages.map((message) => <article key={message.id} className="flex gap-4"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${message.role === "assistant" ? "bg-[var(--app-accent)] text-[var(--app-on-accent)]" : "bg-[var(--app-control-bg)]"}`}>{message.role === "assistant" ? <Bot className="h-4 w-4"/> : <User className="h-4 w-4"/>}</div><div className="min-w-0 flex-1"><div className="flex items-baseline gap-2"><strong>{message.role === "assistant" ? "InvenTracker" : "You"}</strong><time className="text-xs text-[var(--app-subtle)]">{dateLabel(message.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap leading-7">{message.text}</p>{message.answer?.recommendedActions?.length ? <div className="mt-3 rounded-lg border border-[var(--app-border)] p-3"><p className="text-xs font-semibold uppercase text-[var(--app-subtle)]">Suggested next steps</p>{message.answer.recommendedActions.slice(0,3).map((action) => <p key={action} className="mt-2 text-sm">• {action}</p>)}</div> : null}</div></article>)}{loading ? <div className="flex items-center gap-3 text-sm text-[var(--app-muted)]"><Loader2 className="h-5 w-5 animate-spin"/>Thinking with store data…</div> : null}<div ref={bottomRef}/></div></div>
      <div className="border-t border-[var(--app-border)] p-4"><div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-2 shadow-lg"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if(event.key === "Enter" && !event.shiftKey){event.preventDefault();void send()} }} placeholder="Message InvenTracker…" rows={1} className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-3 outline-none"/><button onClick={() => void send()} disabled={!draft.trim() || loading} className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--app-accent)] text-[var(--app-on-accent)] disabled:opacity-40"><Send className="h-4 w-4"/></button></div><p className="mt-2 text-center text-xs text-[var(--app-subtle)]">Recommendations use verified store data and still require normal order approval.</p></div>
    </main>
  </div>
}
