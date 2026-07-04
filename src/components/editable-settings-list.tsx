"use client"

import { useEffect, useMemo, useState } from "react"
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore"
import { CheckCircle2, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react"

import { Button, TextInput } from "@/components/ui"
import { useAuthSession } from "@/lib/auth-session"
import { db } from "@/lib/firebase"

type EditableSettingsListProps = {
  title: string
  description?: string
  initialItems: string[]
  settingId: string
  field: string
  scope?: "organization" | "store"
  storeId?: string
  addLabel?: string
  placeholder?: string
}

function cleanItems(items: string[]) {
  const seen = new Set<string>()
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function EditableSettingsList({
  title,
  description,
  initialItems,
  settingId,
  field,
  scope = "organization",
  storeId,
  addLabel = "Add",
  placeholder = "New item"
}: EditableSettingsListProps) {
  const session = useAuthSession()
  const storageKey = useMemo(
    () => `inventracker.settings.${session.orgId}.${scope}.${storeId ?? "org"}.${settingId}.${field}`,
    [field, scope, session.orgId, settingId, storeId]
  )
  const [items, setItems] = useState(() => cleanItems(initialItems))
  const [newItem, setNewItem] = useState("")
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) setItems(cleanItems(parsed.map(String)))
      } catch {
        setItems(cleanItems(initialItems))
      }
    } else {
      setItems(cleanItems(initialItems))
    }
  }, [initialItems, storageKey])

  useEffect(() => {
    if (!db || !session.orgId) return undefined
    if (scope === "store" && !storeId) return undefined

    const ref =
      scope === "store" && storeId
        ? doc(db, "orgs", session.orgId, "stores", storeId, "settings", settingId)
        : doc(db, "orgs", session.orgId, "settings", settingId)

    return onSnapshot(ref, (snapshot) => {
      const savedItems = snapshot.exists() ? snapshot.data()[field] : undefined
      if (Array.isArray(savedItems)) setItems(cleanItems(savedItems.map(String)))
    })
  }, [field, scope, session.orgId, settingId, storeId])

  function remember(nextItems: string[]) {
    const cleaned = cleanItems(nextItems)
    setItems(cleaned)
    window.localStorage.setItem(storageKey, JSON.stringify(cleaned))
    setMessage("")
  }

  function addItem() {
    if (!newItem.trim()) return
    remember([...items, newItem])
    setNewItem("")
  }

  function startEdit(index: number) {
    setEditingIndex(index)
    setEditingValue(items[index] ?? "")
  }

  function applyEdit() {
    if (editingIndex === null) return
    const nextItems = [...items]
    nextItems[editingIndex] = editingValue
    remember(nextItems)
    setEditingIndex(null)
    setEditingValue("")
  }

  function deleteItem(index: number) {
    remember(items.filter((_, itemIndex) => itemIndex !== index))
  }

  async function saveItems() {
    setBusy(true)
    setMessage("")

    try {
      const cleaned = cleanItems(items)
      window.localStorage.setItem(storageKey, JSON.stringify(cleaned))

      if (db && session.orgId && (scope !== "store" || storeId)) {
        const ref =
          scope === "store" && storeId
            ? doc(db, "orgs", session.orgId, "stores", storeId, "settings", settingId)
            : doc(db, "orgs", session.orgId, "settings", settingId)

        await setDoc(
          ref,
          {
            [field]: cleaned,
            updatedAt: serverTimestamp(),
            updatedBy: session.user?.uid ?? "demo"
          },
          { merge: true }
        )
        setMessage("Saved to database.")
      } else {
        setMessage("Saved locally. Firebase is not configured yet.")
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this list.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--app-text)]">{title}</h2>
          {description ? <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">{description}</p> : null}
        </div>
        <Button onClick={() => void saveItems()} disabled={busy} icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}>
          Save
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {items.map((item, index) => (
          <div key={`${item}-${index}`} className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-2">
            {editingIndex === index ? (
              <>
                <TextInput value={editingValue} onChange={(event) => setEditingValue(event.target.value)} className="min-w-56 flex-1" autoFocus />
                <button
                  type="button"
                  onClick={applyEdit}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--app-control-border)] text-emerald-300 hover:bg-[var(--app-control-bg-hover)]"
                  aria-label={`Save ${item}`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingIndex(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--app-control-border)] text-[var(--app-muted)] hover:bg-[var(--app-control-bg-hover)]"
                  aria-label={`Cancel editing ${item}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate px-2 text-sm font-semibold text-[var(--app-text)]">{item}</span>
                <button
                  type="button"
                  onClick={() => startEdit(index)}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--app-control-border)] text-[var(--app-muted)] hover:bg-[var(--app-control-bg-hover)] hover:text-[var(--app-text)]"
                  aria-label={`Edit ${item}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteItem(index)}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--app-control-border)] text-rose-300 hover:bg-rose-500/10"
                  aria-label={`Delete ${item}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <TextInput
          value={newItem}
          onChange={(event) => setNewItem(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              addItem()
            }
          }}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button variant="secondary" onClick={addItem} icon={<Plus className="h-4 w-4" />}>
          {addLabel}
        </Button>
      </div>

      {message ? <p className="mt-3 text-sm font-semibold text-[var(--app-muted)]">{message}</p> : null}
    </div>
  )
}
