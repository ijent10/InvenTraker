"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, Loader2, Plus, Share2 } from "lucide-react"

import { Button, Field, Panel, SelectInput, StatusPill, TextArea, TextInput } from "@/components/ui"
import { writeOrgRecord } from "@/lib/cloud-records"
import type { ShiftNote } from "@/lib/demo-data"

const emptyNote: ShiftNote = {
  id: "new-note",
  title: "",
  body: "",
  visibility: "Personal",
  audience: "Only me",
  author: "Ian Jenkins",
  updatedAt: "Draft"
}

export function ShiftNotesPanel({ notes }: { notes: ShiftNote[] }) {
  const [noteList, setNoteList] = useState(notes)
  const [selectedNoteId, setSelectedNoteId] = useState(notes[0]?.id ?? emptyNote.id)
  const selectedNote = useMemo(() => noteList.find((note) => note.id === selectedNoteId) ?? emptyNote, [noteList, selectedNoteId])
  const [draft, setDraft] = useState<ShiftNote>(selectedNote)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  function selectNote(note: ShiftNote) {
    setSelectedNoteId(note.id)
    setDraft(note)
    setMessage("")
    setError("")
  }

  function newNote() {
    const nextNote = { ...emptyNote, id: crypto.randomUUID(), title: "New shift note" }
    setNoteList((current) => [nextNote, ...current])
    selectNote(nextNote)
  }

  function updateDraft(nextFields: Partial<ShiftNote>) {
    setDraft((current) => ({ ...current, ...nextFields }))
  }

  async function saveNote(action: "saved" | "shared") {
    setSaving(true)
    setMessage("")
    setError("")

    const noteToSave = {
      ...draft,
      updatedAt: "Just now",
      source: "web"
    }

    try {
      await writeOrgRecord("shiftNotes", noteToSave.id, noteToSave)
      setNoteList((current) => current.map((note) => (note.id === noteToSave.id ? noteToSave : note)))
      setMessage(action === "shared" ? "Note shared and saved." : "Note saved.")
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Note could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel className="mt-6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--app-text)]">Shift notes</h2>
          <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">
            Keep personal reminders or share notes with the organization, departments, or specific people.
          </p>
        </div>
        <Button variant="secondary" onClick={newNote} icon={<Plus className="h-4 w-4" />}>
          New note
        </Button>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          {noteList.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => selectNote(note)}
              className={`w-full rounded-md border p-3 text-left transition ${
                note.id === selectedNoteId
                  ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)]"
                  : "border-[var(--app-control-border)] bg-[var(--app-control-bg)] hover:bg-[var(--app-control-bg-hover)]"
              }`}
            >
              <span className="block text-sm font-semibold text-[var(--app-text)]">{note.title || "Untitled note"}</span>
              <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[var(--app-muted)]">{note.body || "No note body yet."}</span>
              <span className="mt-2 flex flex-wrap items-center gap-2">
                <StatusPill tone={note.visibility === "Personal" ? "neutral" : "blue"}>{note.visibility}</StatusPill>
                <span className="text-xs text-[var(--app-subtle)]">{note.updatedAt}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Note title">
              <TextInput value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} />
            </Field>
            <Field label="Share with">
              <SelectInput
                value={draft.visibility}
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
          </div>

          <Field label={draft.visibility === "People" ? "People" : draft.visibility === "Department" ? "Department" : "Audience"}>
            <TextInput
              value={draft.audience}
              onChange={(event) => updateDraft({ audience: event.target.value })}
              placeholder="Beer & Wine, Maya Lopez, All stores..."
            />
          </Field>

          <Field label="Note">
            <TextArea value={draft.body} onChange={(event) => updateDraft({ body: event.target.value })} className="min-h-40" />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => saveNote("saved")}
              disabled={saving}
              icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            >
              Save note
            </Button>
            <Button variant="secondary" onClick={() => saveNote("shared")} disabled={saving} icon={<Share2 className="h-4 w-4" />}>
              Share note
            </Button>
            {message ? <span className="text-sm font-semibold text-emerald-300">{message}</span> : null}
            {error ? <span className="text-sm font-semibold text-rose-300">{error}</span> : null}
          </div>
        </div>
      </div>
    </Panel>
  )
}
