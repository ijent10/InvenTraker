"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, ExternalLink, Loader2, Save, XCircle } from "lucide-react"

import { Button, Panel, StatusPill, TextArea, TextInput } from "@/components/ui"
import type { AiConfidence, PendingAutofillBatch, PendingAutofillField } from "@/lib/ai/types"

function confidenceTone(confidence: AiConfidence) {
  if (confidence === "high") return "green"
  if (confidence === "medium") return "amber"
  return "neutral"
}

function fieldKey(field: PendingAutofillField, index: number) {
  return `${index}:${field.field}`
}

function editableFieldIsLong(field: PendingAutofillField) {
  return field.proposedValue.length > 90 || field.field.toLowerCase().includes("ingredients") || field.field.toLowerCase().includes("notes")
}

type ReviewResponse = {
  message?: string
  error?: string
}

export function PendingAutofillReviewCard({ batch }: { batch: PendingAutofillBatch }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(batch.fields.map((field, index) => [fieldKey(field, index), field.proposedValue]))
  )
  const [isReviewing, setIsReviewing] = useState<"save" | "approve" | "reject" | null>(null)
  const [message, setMessage] = useState("")

  const editedFields = useMemo(
    () =>
      batch.fields.map((field, index) => ({
        ...field,
        proposedValue: values[fieldKey(field, index)] ?? field.proposedValue
      })),
    [batch.fields, values]
  )

  function updateValue(key: string, value: string) {
    setValues((currentValues) => ({ ...currentValues, [key]: value }))
    setMessage("")
  }

  async function review(action: "save" | "approve" | "reject") {
    setIsReviewing(action)
    setMessage("")

    try {
      const response = await fetch("/api/ai/autofill/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: batch.id,
          productId: batch.productId,
          action,
          fields: editedFields
        })
      })
      const payload = (await response.json()) as ReviewResponse

      if (!response.ok) throw new Error(payload.error ?? "Review failed.")

      setMessage(payload.message ?? "Review saved.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review failed.")
    } finally {
      setIsReviewing(null)
    }
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-[var(--app-text)]">{batch.productName}</h2>
            <StatusPill tone={batch.status === "approved" ? "green" : batch.status === "rejected" ? "red" : "amber"}>{batch.status}</StatusPill>
            {batch.sku ? <StatusPill>{batch.sku}</StatusPill> : null}
          </div>
          <p className="app-tip mt-2 text-sm leading-6 text-[var(--app-muted)]">{batch.reason}</p>
          <p className="app-tip mt-1 text-xs text-[var(--app-subtle)]">{batch.sourceSummary}</p>
        </div>

        <div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => void review("reject")}
              disabled={isReviewing !== null}
              icon={isReviewing === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            >
              Reject
            </Button>
            <Button
              variant="secondary"
              onClick={() => void review("save")}
              disabled={isReviewing !== null}
              icon={isReviewing === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            >
              Save edits
            </Button>
            <Button
              onClick={() => void review("approve")}
              disabled={isReviewing !== null}
              icon={isReviewing === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            >
              Approve verified fields
            </Button>
          </div>
          {message ? <p className="mt-2 max-w-md text-xs leading-5 text-[var(--app-muted)]">{message}</p> : null}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-md border border-[var(--app-border)]">
        <div className="min-w-[880px]">
          <div className="grid grid-cols-[1fr_1.6fr_0.6fr_0.8fr] gap-0 border-b border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--app-subtle)]">
            <span>Field</span>
            <span>Editable proposed value</span>
            <span>Confidence</span>
            <span>Source</span>
          </div>
          {batch.fields.map((field, index) => {
            const key = fieldKey(field, index)
            const editedValue = values[key] ?? field.proposedValue

            return (
              <div
                key={`${batch.id}-${key}`}
                className="grid grid-cols-[1fr_1.6fr_0.6fr_0.8fr] gap-0 border-b border-[var(--app-border)] px-3 py-3 last:border-b-0"
              >
                <div className="pr-3">
                  <p className="text-sm font-semibold text-[var(--app-text)]">{field.label}</p>
                  <p className="mt-1 break-all text-xs text-[var(--app-subtle)]">{field.field}</p>
                  {field.currentValue ? <p className="mt-2 text-xs text-[var(--app-muted)]">Current: {field.currentValue}</p> : null}
                </div>
                <div className="pr-4">
                  {field.field.toLowerCase().includes("imageurl") && editedValue.startsWith("http") ? (
                    <div className="mb-2 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={editedValue} alt="" className="h-14 w-14 rounded-md border border-[var(--app-border)] bg-white object-contain" />
                      <p className="break-all text-xs text-[var(--app-muted)]">{editedValue}</p>
                    </div>
                  ) : null}
                  {editableFieldIsLong(field) ? (
                    <TextArea value={editedValue} onChange={(event) => updateValue(key, event.target.value)} />
                  ) : (
                    <TextInput value={editedValue} onChange={(event) => updateValue(key, event.target.value)} />
                  )}
                </div>
                <div>
                  <StatusPill tone={confidenceTone(field.confidence)}>{field.confidence}</StatusPill>
                </div>
                <div>
                  {field.sourceUrl ? (
                    <a
                      href={field.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--app-accent)] hover:opacity-80"
                    >
                      {field.sourceLabel} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-sm text-[var(--app-muted)]">{field.sourceLabel}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Panel>
  )
}
