"use client"

import { useMemo, useState, type ComponentType } from "react"
import { CheckCircle2, Loader2, Plus, Share2, Trash2, X } from "lucide-react"

import { Button, Field, SelectInput, StatusPill, TextArea, TextInput } from "@/components/ui"
import { writeOrgRecord } from "@/lib/cloud-records"
import type { ShiftNote } from "@/lib/demo-data"

type DashboardWidgetShape = {
  id: string
  title: string
  value: string
  detail: string
  icon: ComponentType<{ className?: string }>
  type: string
  size: string
}

const emptyNote: ShiftNote = {
  id: "new-note",
  title: "",
  body: "",
  visibility: "Personal",
  audience: "Only me",
  author: "Ian Jenkins",
  authorId: "emp-001",
  updatedAt: "Draft"
}

function summarizeNotes(notes: ShiftNote[]) {
  if (notes.length === 0) return "No notes yet. Add one for yourself, a department, or the organization."

  return notes
    .slice(0, 3)
    .map((note) => `${note.title}: ${note.body}`)
    .join(" • ")
}

function noteAudienceLabel(note: ShiftNote) {
  if (note.visibility === "Personal") return "Only me"
  return note.audience || note.visibility
}

export function ShiftNotesWidget({
  widget,
  notes,
  className = ""
}: {
  widget: DashboardWidgetShape
  notes: ShiftNote[]
  className?: string
}) {
  const [noteList, setNoteList] = useState(() => notes.filter((note) => !note.deleted))
  const [modal, setModal] = useState<"closed" | "list" | "new" | "detail">("closed")
  const [selectedNoteId, setSelectedNoteId] = useState(noteList[0]?.id ?? "")
  const [draft, setDraft] = useState<ShiftNote>(emptyNote)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const Icon = widget.icon

  const selectedNote = useMemo(() => noteList.find((note) => note.id === selectedNoteId), [noteList, selectedNoteId])
  const noteSummary = summarizeNotes(noteList)

  function resetFeedback() {
    setMessage("")
    setError("")
  }

  function openList() {
    resetFeedback()
    setModal("list")
  }

  function openNewNote() {
    resetFeedback()
    setDraft({ ...emptyNote, id: crypto.randomUUID(), title: "", body: "" })
    setEditing(true)
    setModal("new")
  }

  function openNote(note: ShiftNote) {
    resetFeedback()
    setSelectedNoteId(note.id)
    setDraft(note)
    setEditing(false)
    setModal("detail")
  }

  function closeModal() {
    resetFeedback()
    setModal("closed")
    setEditing(false)
  }

  function updateDraft(nextFields: Partial<ShiftNote>) {
    setDraft((current) => ({ ...current, ...nextFields }))
  }

  async function saveNote(action: "created" | "saved" | "shared") {
    setSaving(true)
    resetFeedback()

    const noteToSave: ShiftNote = {
      ...draft,
      title: draft.title.trim() || "Untitled note",
      body: draft.body.trim(),
      audience: draft.visibility === "Personal" ? "Only me" : draft.audience.trim() || draft.visibility,
      author: draft.author || "Ian Jenkins",
      authorId: draft.authorId || "emp-001",
      updatedAt: "Just now"
    }

    try {
      await writeOrgRecord("shiftNotes", noteToSave.id, { ...noteToSave, source: "web" })
      setNoteList((current) => {
        const exists = current.some((note) => note.id === noteToSave.id)
        return exists ? current.map((note) => (note.id === noteToSave.id ? noteToSave : note)) : [noteToSave, ...current]
      })
      setSelectedNoteId(noteToSave.id)
      setDraft(noteToSave)
      setEditing(false)
      setModal(action === "created" ? "list" : "detail")
      setMessage(action === "shared" ? "Note shared." : action === "created" ? "Note created." : "Note saved.")
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Note could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  async function deleteNote() {
    if (!selectedNote) return
    setSaving(true)
    resetFeedback()

    try {
      await writeOrgRecord("shiftNotes", selectedNote.id, {
        ...selectedNote,
        deleted: true,
        deletedAt: new Date().toISOString(),
        source: "web"
      })
      setNoteList((current) => current.filter((note) => note.id !== selectedNote.id))
      setSelectedNoteId("")
      setDraft(emptyNote)
      setEditing(false)
      setModal("list")
      setMessage("Note deleted.")
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Note could not be deleted.")
    } finally {
      setSaving(false)
    }
  }

  const card = (
    <button
      type="button"
      onClick={openList}
      className={`group relative block min-h-36 overflow-hidden rounded-md border border-[var(--app-control-border)] bg-gradient-to-br from-fuchsia-500/15 via-[var(--app-control-bg)] to-[var(--app-control-bg)] p-4 text-left shadow-lg shadow-black/10 transition hover:border-[var(--app-accent)] hover:shadow-xl hover:shadow-black/20 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-subtle)]">{widget.type}</p>
          <h2 className="mt-1 text-sm font-semibold text-[var(--app-muted)]">{widget.title}</h2>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-text)]">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-normal text-[var(--app-text)]">
        {noteList.length} note{noteList.length === 1 ? "" : "s"}
      </p>
      <p className="mt-3 line-clamp-3 max-w-lg text-sm leading-5 text-[var(--app-muted)]">{noteSummary}</p>
      <span className="absolute bottom-4 right-4 text-xs font-semibold text-[var(--app-accent)] transition group-hover:translate-x-0.5">
        Open
      </span>
    </button>
  )

  return (
    <>
      {card}

      {modal !== "closed" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-panel border border-[var(--app-border)] bg-[var(--app-panel-strong)] shadow-2xl shadow-black/35">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3">
              <div>
                <h2 className="font-semibold text-[var(--app-text)]">
                  {modal === "new" ? "New note" : modal === "detail" ? selectedNote?.title || "Note" : "Shift notes"}
                </h2>
                <p className="app-tip mt-1 text-sm text-[var(--app-muted)]">
                  {modal === "new"
                    ? "Create a personal, department, people, or organization note."
                    : modal === "detail"
                      ? "Edit, share, or delete this note."
                      : "Review all current notes or create a new one."}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close notes"
                onClick={closeModal}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--app-control-border)] text-[var(--app-muted)] transition hover:bg-[var(--app-control-bg-hover)] hover:text-[var(--app-text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {modal === "list" ? (
              <div className="max-h-[72vh] overflow-y-auto p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-[var(--app-muted)]">{noteSummary}</p>
                  <Button onClick={openNewNote} icon={<Plus className="h-4 w-4" />}>
                    New note
                  </Button>
                </div>

                {noteList.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[var(--app-control-border)] p-8 text-center">
                    <p className="font-semibold text-[var(--app-text)]">No notes yet</p>
                    <p className="mt-1 text-sm text-[var(--app-muted)]">Create the first note for yourself, a department, or the whole organization.</p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {noteList.map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => openNote(note)}
                        className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3 text-left transition hover:border-[var(--app-accent)] hover:bg-[var(--app-control-bg-hover)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-[var(--app-text)]">{note.title || "Untitled note"}</p>
                            <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--app-muted)]">{note.body || "No note body yet."}</p>
                          </div>
                          <StatusPill tone={note.visibility === "Personal" ? "neutral" : "blue"}>{note.visibility}</StatusPill>
                        </div>
                        <p className="mt-2 text-xs text-[var(--app-subtle)]">
                          {noteAudienceLabel(note)} - {note.updatedAt}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {message ? <p className="mt-3 text-sm font-semibold text-emerald-300">{message}</p> : null}
              </div>
            ) : null}

            {modal === "new" || modal === "detail" ? (
              <div className="max-h-[72vh] overflow-y-auto p-4">
                {modal === "detail" && selectedNote && !editing ? (
                  <div className="mb-4 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={selectedNote.visibility === "Personal" ? "neutral" : "blue"}>{selectedNote.visibility}</StatusPill>
                      <span className="text-sm text-[var(--app-muted)]">{noteAudienceLabel(selectedNote)}</span>
                    </div>
                    <p className="mt-4 whitespace-pre-line text-sm leading-6 text-[var(--app-text)]">{selectedNote.body || "No note body yet."}</p>
                    <p className="mt-4 text-xs text-[var(--app-subtle)]">
                      {selectedNote.author} - {selectedNote.updatedAt}
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-4">
                  <Field label="Note title">
                    <TextInput value={draft.title} disabled={modal === "detail" && !editing} onChange={(event) => updateDraft({ title: event.target.value })} />
                  </Field>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Share with">
                      <SelectInput
                        value={draft.visibility}
                        disabled={modal === "detail" && !editing}
                        onChange={(event) => {
                          const visibility = event.target.value as ShiftNote["visibility"]
                          updateDraft({
                            visibility,
                            audience: visibility === "Personal" ? "Only me" : visibility === "Organization" ? "All stores" : draft.audience
                          })
                        }}
                      >
                        <option>Personal</option>
                        <option>Organization</option>
                        <option>Department</option>
                        <option>People</option>
                      </SelectInput>
                    </Field>
                    <Field label={draft.visibility === "People" ? "People" : draft.visibility === "Department" ? "Department" : "Audience"}>
                      <TextInput
                        value={draft.audience}
                        disabled={modal === "detail" && !editing}
                        onChange={(event) => updateDraft({ audience: event.target.value })}
                        placeholder="Beer & Wine, Maya Lopez, All stores..."
                      />
                    </Field>
                  </div>
                  <Field label="Note">
                    <TextArea
                      value={draft.body}
                      disabled={modal === "detail" && !editing}
                      onChange={(event) => updateDraft({ body: event.target.value })}
                      className="min-h-40"
                    />
                  </Field>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => setModal("list")}>
                      Back
                    </Button>
                    {modal === "detail" ? (
                      <Button variant="secondary" onClick={() => setEditing((current) => !current)}>
                        {editing ? "Stop editing" : "Edit"}
                      </Button>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {modal === "detail" ? (
                      <Button variant="ghost" onClick={deleteNote} disabled={saving} icon={<Trash2 className="h-4 w-4" />}>
                        Delete
                      </Button>
                    ) : null}
                    {modal === "detail" ? (
                      <Button variant="secondary" onClick={() => saveNote("shared")} disabled={saving} icon={<Share2 className="h-4 w-4" />}>
                        Share
                      </Button>
                    ) : null}
                    <Button
                      onClick={() => saveNote(modal === "new" ? "created" : "saved")}
                      disabled={saving || (modal === "detail" && !editing)}
                      icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    >
                      {modal === "new" ? "Create note" : "Save changes"}
                    </Button>
                  </div>
                </div>

                {message ? <p className="mt-3 text-sm font-semibold text-emerald-300">{message}</p> : null}
                {error ? <p className="mt-3 text-sm font-semibold text-rose-300">{error}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
