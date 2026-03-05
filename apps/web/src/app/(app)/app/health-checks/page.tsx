"use client"

import { useEffect, useMemo, useState } from "react"
import { AppButton, AppCard, AppCheckbox, AppInput, AppSelect, AppTextarea, TipBanner } from "@inventracker/ui"
import { useQuery } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  deleteHealthCheckForm,
  fetchHealthCheckResponses,
  fetchHealthChecks,
  fetchOrgSettings,
  fetchStoreSettings,
  saveHealthCheckForm,
  type HealthCheckFormRecord,
  type HealthCheckQuestionRecord,
  type HealthCheckQuestionType
} from "@/lib/data/firestore"

const inputTypeOptions: Array<{ value: HealthCheckQuestionType; label: string; helper: string }> = [
  { value: "text", label: "Text", helper: "Free-form text answer." },
  { value: "number", label: "Number", helper: "Numeric answer for counts/temps/value." },
  { value: "true_false", label: "True / False", helper: "Yes/No style safety checks." },
  { value: "multiple_choice", label: "Multiple Choice", helper: "Single choice from options." },
  { value: "multiple_select", label: "Multiple Select", helper: "Select one or more options." },
  { value: "insights_metric", label: "Import from Insights", helper: "Prefill from insights metrics." },
  { value: "expiration_metric", label: "Import from Expiration", helper: "Prefill from expiration data." },
  { value: "transfer_metric", label: "Import from Transfers", helper: "Prefill from transfer records." }
]

const insightsMetricOptions = [
  { value: "inventory_value", label: "Inventory Value" },
  { value: "waste_total_value_7d", label: "Waste Value (7d)" },
  { value: "waste_total_quantity_7d", label: "Waste Quantity (7d)" },
  { value: "expiring_soon_count", label: "Expiring Soon Count" }
]

const expirationMetricOptions = [
  { value: "expired_not_marked_waste_count", label: "Expired Not Marked Waste" },
  { value: "expiring_soon_count", label: "Expiring Soon Count" },
  { value: "mold_check_random_4", label: "Mold Check Candidates (4)" }
]

const transferMetricOptions = [
  { value: "transfer_count_7d", label: "Transfers Count (7d)" },
  { value: "transfer_quantity_7d", label: "Transferred Quantity (7d)" }
]

function metricOptionsForType(type: HealthCheckQuestionType) {
  switch (type) {
    case "insights_metric":
      return insightsMetricOptions
    case "expiration_metric":
      return expirationMetricOptions
    case "transfer_metric":
      return transferMetricOptions
    default:
      return []
  }
}

function blankQuestion(index: number): HealthCheckQuestionRecord {
  return {
    id: crypto.randomUUID(),
    prompt: index === 0 ? "" : `Question ${index + 1}`,
    inputType: "text",
    required: true,
    options: [],
    metricKey: ""
  }
}

function blankForm(scopeStoreId?: string): Omit<HealthCheckFormRecord, "id" | "organizationId"> {
  return {
    title: "",
    description: "",
    scope: scopeStoreId ? "store" : "organization",
    storeId: scopeStoreId,
    roleTargets: [],
    departmentTargets: [],
    questions: [blankQuestion(0)],
    isActive: true,
    createdAt: undefined,
    createdBy: undefined,
    updatedAt: undefined,
    updatedBy: undefined
  }
}

function answerPreview(answers: Record<string, unknown>) {
  return Object.entries(answers)
    .slice(0, 3)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: ${value.join(", ")}`
      }
      if (value && typeof value === "object") {
        return `${key}: ${JSON.stringify(value)}`
      }
      return `${key}: ${String(value ?? "")}`
    })
}

export default function HealthChecksPage() {
  const { user } = useAuthUser()
  const { activeOrgId, activeStore, activeStoreId, effectivePermissions, stores } = useOrgContext()

  const [selectedFormId, setSelectedFormId] = useState<string>("")
  const [draft, setDraft] = useState<Omit<HealthCheckFormRecord, "id" | "organizationId">>(
    blankForm(activeStoreId || undefined)
  )
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const canManageForms =
    Boolean(effectivePermissions.manageHealthChecks) ||
    Boolean(effectivePermissions.manageOrgSettings) ||
    Boolean(effectivePermissions.manageStoreSettings)

  const { data: forms = [], refetch: refetchForms } = useQuery({
    queryKey: ["health-check-forms", activeOrgId],
    queryFn: () => fetchHealthChecks(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const { data: responses = [] } = useQuery({
    queryKey: ["health-check-responses", activeOrgId, activeStoreId],
    queryFn: () => fetchHealthCheckResponses(activeOrgId, activeStoreId || undefined),
    enabled: Boolean(activeOrgId && activeStoreId)
  })
  const { data: completionHistory = [] } = useQuery({
    queryKey: ["health-check-history", activeOrgId],
    queryFn: () => fetchHealthCheckResponses(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const { data: orgSettings } = useQuery({
    queryKey: ["health-check-org-settings", activeOrgId],
    queryFn: () => fetchOrgSettings(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const { data: storeSettings } = useQuery({
    queryKey: ["health-check-store-settings", activeOrgId, activeStore?.id],
    queryFn: () => fetchStoreSettings(activeOrgId, activeStore!),
    enabled: Boolean(activeOrgId && activeStore)
  })

  const roleOptions = useMemo(() => {
    const rows = ["Owner", ...(orgSettings?.jobTitles ?? []).map((entry) => entry.title), ...(storeSettings?.jobTitles ?? []).map((entry) => entry.title)]
    return Array.from(new Set(rows.map((entry) => entry.trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    )
  }, [orgSettings?.jobTitles, storeSettings?.jobTitles])

  const departmentOptions = useMemo(() => {
    const rows = [...(orgSettings?.departments ?? []), ...(storeSettings?.departments ?? [])]
    return Array.from(new Set(rows.map((entry) => entry.trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    )
  }, [orgSettings?.departments, storeSettings?.departments])

  const storeLabelById = useMemo(() => {
    const rows = new Map<string, string>()
    for (const store of stores) {
      const label = store.title?.trim()
        ? store.storeNumber?.trim()
          ? `${store.title.trim()} (${store.storeNumber.trim()})`
          : store.title.trim()
        : store.storeNumber?.trim()
          ? `${store.name} (${store.storeNumber.trim()})`
          : store.name
      rows.set(store.id, label)
    }
    return rows
  }, [stores])

  const formatSubmittedAt = (raw: unknown) => {
    const maybeDate =
      raw instanceof Date
        ? raw
        : raw && typeof raw === "object" && "toDate" in raw && typeof (raw as { toDate: () => Date }).toDate === "function"
          ? (raw as { toDate: () => Date }).toDate()
          : raw && typeof raw === "object" && "seconds" in raw
            ? new Date(Number((raw as { seconds: number }).seconds) * 1000)
            : null
    if (!maybeDate || Number.isNaN(maybeDate.getTime())) return "Unknown time"
    return maybeDate.toLocaleString()
  }

  useEffect(() => {
    if (selectedFormId && forms.some((entry) => entry.id === selectedFormId)) return
    if (forms.length === 0) {
      setSelectedFormId("")
      setDraft(blankForm(activeStoreId || undefined))
      return
    }
    const first = forms[0]
    if (!first) return
    setSelectedFormId(first.id)
    setDraft({
      title: first.title,
      description: first.description ?? "",
      scope: first.scope,
      storeId: first.storeId,
      roleTargets: first.roleTargets,
      departmentTargets: first.departmentTargets,
      questions: first.questions.length > 0 ? first.questions : [blankQuestion(0)],
      isActive: first.isActive,
      createdAt: first.createdAt,
      createdBy: first.createdBy,
      updatedAt: first.updatedAt,
      updatedBy: first.updatedBy
    })
  }, [activeStoreId, forms, selectedFormId])

  const resetDraft = () => {
    setSelectedFormId("")
    setDraft(blankForm(activeStoreId || undefined))
    setStatusMessage(null)
    setErrorMessage(null)
  }

  const loadForm = (form: HealthCheckFormRecord) => {
    setSelectedFormId(form.id)
    setDraft({
      title: form.title,
      description: form.description ?? "",
      scope: form.scope,
      storeId: form.storeId,
      roleTargets: form.roleTargets,
      departmentTargets: form.departmentTargets,
      questions: form.questions.length > 0 ? form.questions : [blankQuestion(0)],
      isActive: form.isActive,
      createdAt: form.createdAt,
      createdBy: form.createdBy,
      updatedAt: form.updatedAt,
      updatedBy: form.updatedBy
    })
    setStatusMessage(null)
    setErrorMessage(null)
  }

  const save = async () => {
    if (!activeOrgId || !user?.uid) return
    setStatusMessage(null)
    setErrorMessage(null)

    const trimmedTitle = draft.title.trim()
    if (!trimmedTitle) {
      setErrorMessage("Form title is required.")
      return
    }
    const validQuestions = draft.questions
      .map((question) => ({
        ...question,
        prompt: question.prompt.trim(),
        options: question.options.map((entry) => entry.trim()).filter(Boolean),
        metricKey: question.metricKey?.trim() || ""
      }))
      .filter((question) => question.prompt.length > 0)

    if (validQuestions.length === 0) {
      setErrorMessage("Add at least one question.")
      return
    }

    try {
      const id = await saveHealthCheckForm(activeOrgId, {
        id: selectedFormId || undefined,
        title: trimmedTitle,
        description: draft.description?.trim() || "",
        scope: draft.scope,
        storeId: draft.scope === "store" ? (draft.storeId || activeStoreId || undefined) : undefined,
        roleTargets: draft.roleTargets,
        departmentTargets: draft.departmentTargets,
        questions: validQuestions,
        isActive: draft.isActive,
        actorUid: user.uid
      })
      await refetchForms()
      setSelectedFormId(id)
      setStatusMessage("Health check saved.")
    } catch {
      setErrorMessage("Could not save health check.")
    }
  }

  const remove = async () => {
    if (!activeOrgId || !selectedFormId) return
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      await deleteHealthCheckForm(activeOrgId, selectedFormId)
      await refetchForms()
      resetDraft()
      setStatusMessage("Health check removed.")
    } catch {
      setErrorMessage("Could not delete health check.")
    }
  }

  const toggleRole = (roleTitle: string, checked: boolean) => {
    setDraft((prev) => ({
      ...prev,
      roleTargets: checked
        ? Array.from(new Set([...prev.roleTargets, roleTitle]))
        : prev.roleTargets.filter((entry) => entry !== roleTitle)
    }))
  }

  const toggleDepartment = (department: string, checked: boolean) => {
    setDraft((prev) => ({
      ...prev,
      departmentTargets: checked
        ? Array.from(new Set([...prev.departmentTargets, department]))
        : prev.departmentTargets.filter((entry) => entry !== department)
    }))
  }

  const addQuestion = () => {
    setDraft((prev) => ({
      ...prev,
      questions: [...prev.questions, blankQuestion(prev.questions.length)]
    }))
  }

  const updateQuestion = (index: number, patch: Partial<HealthCheckQuestionRecord>) => {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((entry, currentIndex) =>
        currentIndex === index ? { ...entry, ...patch } : entry
      )
    }))
  }

  const removeQuestion = (index: number) => {
    setDraft((prev) => {
      if (prev.questions.length <= 1) return prev
      return {
        ...prev,
        questions: prev.questions.filter((_, currentIndex) => currentIndex !== index)
      }
    })
  }

  return (
    <div>
      <PageHead
        title="Health Checks"
        subtitle="Create role-aware checklists and push them to the app for daily execution."
        actions={
          <div className="flex gap-2">
            <AppButton variant="secondary" onClick={resetDraft}>New Form</AppButton>
            {canManageForms ? <AppButton onClick={() => void save()}>Save Form</AppButton> : null}
          </div>
        }
      />

      <TipBanner
        title="Health Check Coverage"
        message="Use import-type questions to auto-fill metrics like expiring risk, transfer totals, and inventory value before users answer manual checks."
        accentColor="#0EA5E9"
      />

      {canManageForms ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_1fr]">
          <AppCard>
            <h2 className="card-title">Form Builder</h2>
            <div className="mt-4 grid gap-3">
              <AppInput
                placeholder="Form title"
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              />
              <AppTextarea
                className="min-h-[92px]"
                placeholder="Description (optional)"
                value={draft.description ?? ""}
                onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
              />

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <p className="secondary-text mb-1 text-xs">Scope</p>
                  <AppSelect
                    value={draft.scope}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        scope: event.target.value === "store" ? "store" : "organization",
                        storeId:
                          event.target.value === "store"
                            ? activeStoreId || prev.storeId || undefined
                            : undefined
                      }))
                    }
                  >
                    <option value="organization">Organization-wide</option>
                    <option value="store">Store-specific</option>
                  </AppSelect>
                </div>
                <div>
                  <p className="secondary-text mb-1 text-xs">Active</p>
                  <AppCheckbox
                    checked={draft.isActive}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, isActive: event.target.checked }))
                    }
                    label="Form is active"
                  />
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Assign Roles</p>
                {roleOptions.length === 0 ? (
                  <p className="secondary-text text-xs">No roles configured yet in settings.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {roleOptions.map((roleTitle) => (
                      <AppCheckbox
                        key={roleTitle}
                        checked={draft.roleTargets.includes(roleTitle)}
                        onChange={(event) => toggleRole(roleTitle, event.target.checked)}
                        label={roleTitle}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Assign Departments</p>
                {departmentOptions.length === 0 ? (
                  <p className="secondary-text text-xs">No department templates found yet.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {departmentOptions.map((department) => (
                      <AppCheckbox
                        key={department}
                        checked={draft.departmentTargets.includes(department)}
                        onChange={(event) => toggleDepartment(department, event.target.checked)}
                        label={department}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-app-border p-3">
                <h3 className="text-sm font-semibold">Questions</h3>
                <p className="secondary-text mt-1 text-xs">Form creation starts with one blank question. Use + to add more.</p>
                <div className="mt-3 space-y-3">
                  {draft.questions.map((question, index) => {
                    const selectedType = inputTypeOptions.find((entry) => entry.value === question.inputType)
                    const metricOptions = metricOptionsForType(question.inputType)
                    return (
                      <div key={question.id} className="rounded-xl border border-app-border bg-app-surface-soft p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">Question {index + 1}</p>
                          <AppButton
                            variant="secondary"
                            className="!h-8 !border-rose-500/40 !px-3 !text-xs !text-rose-300"
                            onClick={() => removeQuestion(index)}
                          >
                            Remove
                          </AppButton>
                        </div>
                        <div className="grid gap-2">
                          <AppInput
                            placeholder="Question prompt"
                            value={question.prompt}
                            onChange={(event) =>
                              updateQuestion(index, { prompt: event.target.value })
                            }
                          />
                          <div>
                            <p className="secondary-text mb-1 text-xs">Input type</p>
                            <AppSelect
                              value={question.inputType}
                              onChange={(event) =>
                                updateQuestion(index, {
                                  inputType: event.target.value as HealthCheckQuestionType,
                                  options:
                                    event.target.value === "multiple_choice" || event.target.value === "multiple_select"
                                      ? question.options
                                      : [],
                                  metricKey:
                                    event.target.value === "insights_metric" ||
                                    event.target.value === "expiration_metric" ||
                                    event.target.value === "transfer_metric"
                                      ? question.metricKey ?? ""
                                      : ""
                                })
                              }
                            >
                              {inputTypeOptions.map((entry) => (
                                <option key={entry.value} value={entry.value}>
                                  {entry.label}
                                </option>
                              ))}
                            </AppSelect>
                            <p className="secondary-text mt-1 text-xs">{selectedType?.helper}</p>
                          </div>

                          {(question.inputType === "multiple_choice" || question.inputType === "multiple_select") ? (
                            <AppTextarea
                              className="min-h-[74px]"
                              placeholder="Options (comma-separated)"
                              value={question.options.join(", ")}
                              onChange={(event) =>
                                updateQuestion(index, {
                                  options: event.target.value
                                    .split(",")
                                    .map((entry) => entry.trim())
                                    .filter(Boolean)
                                })
                              }
                            />
                          ) : null}

                          {(question.inputType === "insights_metric" ||
                            question.inputType === "expiration_metric" ||
                            question.inputType === "transfer_metric") ? (
                            <div className="grid gap-2">
                              <AppSelect
                                value={question.metricKey ?? ""}
                                onChange={(event) =>
                                  updateQuestion(index, { metricKey: event.target.value })
                                }
                              >
                                <option value="">Select metric</option>
                                {metricOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </AppSelect>
                              <AppInput
                                placeholder="Or enter custom metric key"
                                value={question.metricKey ?? ""}
                                onChange={(event) =>
                                  updateQuestion(index, { metricKey: event.target.value })
                                }
                              />
                            </div>
                          ) : null}

                          <AppCheckbox
                            checked={question.required}
                            onChange={(event) => updateQuestion(index, { required: event.target.checked })}
                            label="Required"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <AppButton variant="secondary" className="mt-3 w-full" onClick={addQuestion}>
                  + Add Question
                </AppButton>
              </div>
            </div>
          </AppCard>

          <div className="space-y-4">
            <AppCard>
              <h2 className="card-title">Saved Forms</h2>
              <div className="mt-3 space-y-2">
                {forms.length === 0 ? (
                  <p className="secondary-text">No forms created yet.</p>
                ) : (
                  forms.map((form) => {
                    const selected = selectedFormId === form.id
                    const scopeLabel = form.scope === "store" ? `Store (${form.storeId ?? "n/a"})` : "Organization"
                    return (
                      <AppButton
                        key={form.id}
                        type="button"
                        variant="secondary"
                        onClick={() => loadForm(form)}
                        className={`h-auto w-full rounded-xl px-3 py-2 text-left transition ${
                          selected
                            ? "!border-[color:var(--accent)] !bg-app-surface-soft"
                            : "!border-app-border !bg-app-surface"
                        }`}
                      >
                        <p className="text-sm font-semibold">{form.title}</p>
                        <p className="secondary-text mt-1 text-xs">
                          {scopeLabel} · {form.questions.length} question(s) · {form.isActive ? "Active" : "Inactive"}
                        </p>
                      </AppButton>
                    )
                  })
                )}
              </div>

              <div className="mt-3 flex gap-2">
                <AppButton variant="secondary" onClick={resetDraft}>Clear</AppButton>
                {selectedFormId ? (
                  <AppButton
                    variant="secondary"
                    className="!border-rose-500/40 !text-rose-300"
                    onClick={() => void remove()}
                  >
                    Delete
                  </AppButton>
                ) : null}
              </div>
            </AppCard>

            <AppCard>
              <h2 className="card-title">Recent Submissions</h2>
              <div className="mt-3 space-y-2">
                {responses.length === 0 ? (
                  <p className="secondary-text">No submissions yet for this store.</p>
                ) : (
                  responses.slice(0, 12).map((response) => (
                    <div key={response.id} className="rounded-xl border border-app-border p-3">
                      <p className="text-sm font-semibold">{response.healthCheckTitle}</p>
                      <p className="secondary-text mt-1 text-xs">
                        {response.submittedByName || response.submittedByUid || "Unknown"}
                        {response.roleTitle ? ` · ${response.roleTitle}` : ""}
                      </p>
                      <div className="mt-2 space-y-1">
                        {answerPreview(response.answers).map((row) => (
                          <p key={`${response.id}-${row}`} className="secondary-text text-xs">{row}</p>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </AppCard>

            <AppCard>
              <h2 className="card-title">Completion History (All)</h2>
              <p className="secondary-text mt-1 text-xs">
                Full history of completed health checks and who completed them.
              </p>
              <div className="mt-3 max-h-[430px] space-y-2 overflow-y-auto pr-1">
                {completionHistory.length === 0 ? (
                  <p className="secondary-text">No health check submissions yet.</p>
                ) : (
                  completionHistory.map((response) => (
                    <div key={`history-${response.id}`} className="rounded-xl border border-app-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold">{response.healthCheckTitle}</p>
                        <p className="secondary-text shrink-0 text-xs">{formatSubmittedAt(response.submittedAt)}</p>
                      </div>
                      <p className="secondary-text mt-1 text-xs">
                        Completed by {response.submittedByName || response.submittedByUid || "Unknown"}
                        {response.roleTitle ? ` · ${response.roleTitle}` : ""}
                      </p>
                      <p className="secondary-text mt-1 text-xs">
                        Store: {storeLabelById.get(response.storeId) ?? response.storeId}
                      </p>
                      <div className="mt-2 space-y-1">
                        {answerPreview(response.answers).map((row) => (
                          <p key={`history-${response.id}-${row}`} className="secondary-text text-xs">{row}</p>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </AppCard>
          </div>
        </div>
      ) : (
        <AppCard className="mt-4">
          <p className="secondary-text">You can complete assigned health checks in the app, but you do not have permission to create forms.</p>
        </AppCard>
      )}

      {statusMessage ? <p className="mt-4 text-sm text-emerald-300">{statusMessage}</p> : null}
      {errorMessage ? <p className="mt-4 text-sm text-rose-300">{errorMessage}</p> : null}
    </div>
  )
}
