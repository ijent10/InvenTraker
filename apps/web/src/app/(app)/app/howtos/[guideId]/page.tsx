"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AppButton, AppCard, AppCheckbox, AppInput, AppTextarea, Modal } from "@inventracker/ui"
import { useQuery } from "@tanstack/react-query"

import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import { PageHead } from "@/components/page-head"
import {
  deleteHowToGuide,
  fetchHowToGuide,
  fetchMediaAssetsByIds,
  saveHowToGuide,
  uploadMediaAsset,
  type HowToStep
} from "@/lib/data/firestore"
import { parsePdfToHowto } from "@/lib/firebase/functions"

type BlockType = "text" | "photo" | "video"
type DraftStepPayload = {
  stepNumber: number
  title?: string
  blocks: Array<{ type: "text" | "photo" | "video"; text?: string; mediaAssetId?: string }>
}
type LocalParseResult =
  | { ok: true; suggestedTitle?: string; steps: DraftStepPayload[] }
  | { ok: false; reason: string }

function defaultStep(stepNumber = 1): HowToStep {
  return { id: crypto.randomUUID(), stepNumber, title: `Step ${stepNumber}`, blocks: [] }
}

export default function HowToGuideEditorPage({ params }: { params: { guideId: string } }) {
  const router = useRouter()
  const { user } = useAuthUser()
  const { activeOrgId, activeStoreId } = useOrgContext()

  const isNewGuide = params.guideId === "new"

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [steps, setSteps] = useState<HowToStep[]>([defaultStep()])

  const [modalOpen, setModalOpen] = useState(false)
  const [targetStepId, setTargetStepId] = useState<string>("")
  const [selectedBlockTypes, setSelectedBlockTypes] = useState<BlockType[]>([])

  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isImportingPdf, setIsImportingPdf] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!activeOrgId || isNewGuide) return
      const guide = await fetchHowToGuide(activeOrgId, params.guideId)
      if (!guide) return
      setTitle(guide.title)
      setDescription(guide.description)
      setSteps(guide.steps.length ? guide.steps : [defaultStep()])
    }
    void load()
  }, [activeOrgId, isNewGuide, params.guideId])

  const sortedSteps = useMemo(() => [...steps].sort((a, b) => a.stepNumber - b.stepNumber), [steps])

  const mediaAssetIds = useMemo(
    () =>
      sortedSteps
        .flatMap((step) => step.blocks)
        .map((block) => block.mediaAssetId)
        .filter((value): value is string => Boolean(value)),
    [sortedSteps]
  )

  const { data: mediaById = {} } = useQuery({
    queryKey: ["howto-media", ...mediaAssetIds],
    queryFn: () => fetchMediaAssetsByIds(mediaAssetIds),
    enabled: mediaAssetIds.length > 0
  })

  const openAddContent = (stepId: string) => {
    setTargetStepId(stepId)
    setSelectedBlockTypes([])
    setModalOpen(true)
  }

  const applyAddContent = () => {
    if (!targetStepId || selectedBlockTypes.length === 0) {
      setModalOpen(false)
      return
    }

    setSteps((previous) =>
      previous.map((step) => {
        if (step.id !== targetStepId) return step
        const startIndex = step.blocks.length
        const newBlocks = selectedBlockTypes.map((type, index) => ({
          id: crypto.randomUUID(),
          type,
          text: type === "text" ? "" : undefined,
          mediaAssetId: undefined,
          orderIndex: startIndex + index
        }))
        return { ...step, blocks: [...step.blocks, ...newBlocks] }
      })
    )
    setModalOpen(false)
  }

  const addStep = () => {
    setSteps((previous) => {
      const nextStepNumber = previous.length + 1
      return [...previous, defaultStep(nextStepNumber)]
    })
  }

  const removeStep = (stepId: string) => {
    setSteps((previous) => {
      const filtered = previous.filter((entry) => entry.id !== stepId)
      const normalized = filtered.length ? filtered : [defaultStep()]
      return normalized.map((step, index) => ({
        ...step,
        stepNumber: index + 1,
        title: step.title?.trim() ? step.title : `Step ${index + 1}`
      }))
    })
  }

  const removeBlock = (stepId: string, blockId: string) => {
    setSteps((previous) =>
      previous.map((step) => {
        if (step.id !== stepId) return step
        const nextBlocks = step.blocks
          .filter((block) => block.id !== blockId)
          .map((block, index) => ({ ...block, orderIndex: index }))
        return { ...step, blocks: nextBlocks }
      })
    )
  }

  const reorderStep = (stepId: string, direction: -1 | 1) => {
    setSteps((previous) => {
      const index = previous.findIndex((step) => step.id === stepId)
      if (index < 0) return previous
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= previous.length) return previous
      const copy = [...previous]
      const [removed] = copy.splice(index, 1)
      if (!removed) return previous
      copy.splice(nextIndex, 0, removed)
      return copy.map((step, i) => ({ ...step, stepNumber: i + 1 }))
    })
  }

  const reorderBlock = (stepId: string, blockId: string, direction: -1 | 1) => {
    setSteps((previous) =>
      previous.map((step) => {
        if (step.id !== stepId) return step
        const index = step.blocks.findIndex((block) => block.id === blockId)
        if (index < 0) return step
        const nextIndex = index + direction
        if (nextIndex < 0 || nextIndex >= step.blocks.length) return step
        const copy = [...step.blocks]
        const [removed] = copy.splice(index, 1)
        if (!removed) return step
        copy.splice(nextIndex, 0, removed)
        return { ...step, blocks: copy.map((block, i) => ({ ...block, orderIndex: i })) }
      })
    )
  }

  const uploadBlockFile = async (stepId: string, blockId: string, file: File, type: "image" | "video") => {
    if (!activeOrgId || !user) return
    setStatusMessage(null)
    setErrorMessage(null)

    const asset = await uploadMediaAsset({ file, orgId: activeOrgId, storeId: activeStoreId, userId: user.uid, type })
    if (!asset) {
      setErrorMessage("Could not upload media.")
      return
    }

    setSteps((previous) =>
      previous.map((step) => {
        if (step.id !== stepId) return step
        return {
          ...step,
          blocks: step.blocks.map((block) =>
            block.id === blockId ? { ...block, mediaAssetId: asset.id, text: asset.originalName } : block
          )
        }
      })
    )
    setStatusMessage(`${type === "image" ? "Photo" : "Video"} attached.`)
  }

  const applyParsedDraft = (parsed: { suggestedTitle?: string; steps: DraftStepPayload[] }) => {
    if (parsed.suggestedTitle?.trim()) setTitle(parsed.suggestedTitle.trim())
    setSteps(
      parsed.steps.map((step) => ({
        id: crypto.randomUUID(),
        stepNumber: step.stepNumber,
        title: step.title?.trim() || `Step ${step.stepNumber}`,
        blocks: step.blocks.map((block, idx) => ({
          id: crypto.randomUUID(),
          type: block.type,
          text: block.text,
          mediaAssetId: block.mediaAssetId,
          orderIndex: idx
        }))
      }))
    )
  }

  const parsePdfWithLocalApi = async (file: File): Promise<LocalParseResult> => {
    const body = new FormData()
    body.append("file", file)
    const response = await fetch("/api/howtos/parse-pdf", {
      method: "POST",
      body
    })
    const payload = (await response.json().catch(() => null)) as
      | {
          ok?: boolean
          fallback?: boolean
          reason?: string
          suggestedTitle?: string
          steps?: DraftStepPayload[]
        }
      | null

    if (!payload || !payload.ok || payload.fallback || !payload.steps?.length) {
      return {
        ok: false,
        reason: payload?.reason ?? "Couldn’t parse PDF—create manually."
      }
    }

    return {
      ok: true,
      suggestedTitle: payload.suggestedTitle,
      steps: payload.steps
    }
  }

  const importPdfDraft = async () => {
    if (!pdfFile || !activeOrgId || !user) return
    setStatusMessage(null)
    setErrorMessage(null)
    setIsImportingPdf(true)

    try {
      const localParsed = await parsePdfWithLocalApi(pdfFile)
      if (localParsed.ok) {
        applyParsedDraft(localParsed)
        setStatusMessage(`Imported ${localParsed.steps.length} step(s) from PDF.`)
        setPdfFile(null)
        return
      }

      const asset = await uploadMediaAsset({
        file: pdfFile,
        orgId: activeOrgId,
        storeId: activeStoreId,
        userId: user.uid,
        type: "pdf"
      })
      if (!asset) {
        setErrorMessage("Could not upload PDF.")
        return
      }

      const parsed = await parsePdfToHowto({ orgId: activeOrgId, storeId: activeStoreId, pdfAssetId: asset.id })
      if (!parsed || !parsed.ok || parsed.fallback || parsed.steps.length === 0) {
        setErrorMessage(parsed?.reason ?? localParsed.reason ?? "Couldn’t parse PDF—create manually.")
        return
      }

      applyParsedDraft(parsed)
      setStatusMessage(`Imported ${parsed.steps.length} step(s) from PDF.`)
      setPdfFile(null)
    } catch (error) {
      const fallbackMessage =
        error instanceof Error && error.message.trim().length > 0
          ? `Couldn’t parse PDF: ${error.message}`
          : "Couldn’t parse PDF—create manually."
      setErrorMessage(fallbackMessage)
    } finally {
      setIsImportingPdf(false)
    }
  }

  const saveGuide = async () => {
    if (!activeOrgId || !user || !title.trim()) {
      setErrorMessage("Guide title is required.")
      return
    }

    setStatusMessage(null)
    setErrorMessage(null)
    setIsSaving(true)
    try {
      const guideId = await saveHowToGuide(activeOrgId, user.uid, {
        id: isNewGuide ? undefined : params.guideId,
        title: title.trim(),
        description,
        tags: [],
        scope: activeStoreId ? "store" : "org",
        storeId: activeStoreId || null,
        steps: sortedSteps.map((step) => ({
          stepNumber: step.stepNumber,
          title: step.title,
          blocks: step.blocks.map((block) => ({
            type: block.type,
            text: block.text,
            mediaAssetId: block.mediaAssetId,
            orderIndex: block.orderIndex
          }))
        }))
      })

      if (isNewGuide && guideId) {
        router.replace(`/app/howtos/${guideId}`)
      }
      setStatusMessage("Guide saved.")
    } catch {
      setErrorMessage("Could not save guide.")
    } finally {
      setIsSaving(false)
    }
  }

  const removeGuide = async () => {
    if (isNewGuide || !activeOrgId || !user) return
    const confirmed = window.confirm("Delete this guide? This cannot be undone.")
    if (!confirmed) return

    setStatusMessage(null)
    setErrorMessage(null)
    setIsDeleting(true)
    try {
      await deleteHowToGuide(activeOrgId, params.guideId, user.uid)
      router.push("/app/howtos")
    } catch {
      setErrorMessage("Could not delete guide.")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div>
      <PageHead
        title={isNewGuide ? "New Guide" : "Edit Guide"}
        subtitle="Step-by-step how-to authoring with text, photo, and video blocks."
        actions={
          <div className="flex flex-wrap gap-2">
            <AppButton variant="secondary" onClick={addStep}>
              Add Step
            </AppButton>
            {!isNewGuide ? (
              <AppButton
                variant="secondary"
                className="!border-rose-500/50 !text-rose-300"
                onClick={() => void removeGuide()}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete Guide"}
              </AppButton>
            ) : null}
            <AppButton onClick={() => void saveGuide()} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save guide"}
            </AppButton>
          </div>
        }
      />

      <AppCard className="mb-4">
        <div className="grid gap-3">
          <AppInput
            placeholder="Guide title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <AppTextarea
            className="min-h-[90px]"
            placeholder="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <AppInput
              type="file"
              className="h-auto"
              accept="application/pdf"
              onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
            />
            <AppButton variant="secondary" onClick={() => void importPdfDraft()} disabled={!pdfFile || isImportingPdf}>
              {isImportingPdf ? "Importing..." : "Import PDF"}
            </AppButton>
          </div>
        </div>
      </AppCard>

      <div className="space-y-4">
        {sortedSteps.map((step) => (
          <AppCard key={step.id}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="card-title">Step {step.stepNumber}</p>
                <AppInput
                  className="mt-2 text-sm"
                  placeholder="Step title"
                  value={step.title ?? ""}
                  onChange={(event) =>
                    setSteps((prev) =>
                      prev.map((entry) => (entry.id === step.id ? { ...entry, title: event.target.value } : entry))
                    )
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <AppButton variant="secondary" className="!px-3 !py-2" onClick={() => reorderStep(step.id, -1)}>
                  Up
                </AppButton>
                <AppButton variant="secondary" className="!px-3 !py-2" onClick={() => reorderStep(step.id, 1)}>
                  Down
                </AppButton>
                <AppButton
                  variant="secondary"
                  className="!border-rose-500/50 !px-3 !py-2 !text-rose-300"
                  onClick={() => removeStep(step.id)}
                >
                  Delete Step
                </AppButton>
                <AppButton className="!px-3 !py-2" onClick={() => openAddContent(step.id)}>
                  Add content
                </AppButton>
              </div>
            </div>

            <div className="space-y-3">
              {step.blocks.length === 0 ? <p className="secondary-text">No blocks yet.</p> : null}
              {step.blocks.map((block) => {
                const media = block.mediaAssetId ? mediaById[block.mediaAssetId] : undefined
                const mediaUrl = media?.downloadUrl

                return (
                  <div key={block.id} className="rounded-2xl border border-app-border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold uppercase">{block.type}</p>
                      <div className="flex gap-2">
                        <AppButton variant="secondary" className="!h-8 !px-3 !py-1" onClick={() => reorderBlock(step.id, block.id, -1)}>
                          Up
                        </AppButton>
                        <AppButton variant="secondary" className="!h-8 !px-3 !py-1" onClick={() => reorderBlock(step.id, block.id, 1)}>
                          Down
                        </AppButton>
                        <AppButton
                          variant="secondary"
                          className="!h-8 !border-rose-500/50 !px-3 !py-1 !text-rose-300"
                          onClick={() => removeBlock(step.id, block.id)}
                        >
                          Delete
                        </AppButton>
                      </div>
                    </div>

                    {block.type === "text" ? (
                      <AppTextarea
                        className="w-full min-h-[96px]"
                        value={block.text ?? ""}
                        onChange={(event) =>
                          setSteps((prev) =>
                            prev.map((entry) =>
                              entry.id === step.id
                                ? {
                                    ...entry,
                                    blocks: entry.blocks.map((inner) =>
                                      inner.id === block.id ? { ...inner, text: event.target.value } : inner
                                    )
                                  }
                                : entry
                            )
                          )
                        }
                      />
                    ) : (
                      <div className="space-y-2">
                        <AppInput
                          type="file"
                          className="h-auto"
                          accept={block.type === "photo" ? "image/*" : "video/*"}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (!file) return
                            void uploadBlockFile(step.id, block.id, file, block.type === "photo" ? "image" : "video")
                          }}
                        />

                        {block.type === "photo" && mediaUrl ? (
                          <img src={mediaUrl} alt={block.text ?? "Guide photo"} className="max-h-48 rounded-xl border border-app-border object-contain" />
                        ) : null}
                        {block.type === "video" && mediaUrl ? (
                          <video src={mediaUrl} controls className="max-h-56 rounded-xl border border-app-border" />
                        ) : null}
                        <p className="secondary-text">{block.text ?? media?.originalName ?? "No media selected."}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </AppCard>
        ))}
      </div>

      {statusMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      <Modal
        open={modalOpen}
        title="Add content"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <AppButton variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </AppButton>
            <AppButton onClick={applyAddContent}>
              Add blocks
            </AppButton>
          </>
        }
      >
        <p className="secondary-text">Select one or more block types.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["text", "photo", "video"] as const).map((type) => (
            <AppCheckbox
              key={type}
              checked={selectedBlockTypes.includes(type)}
              onChange={(event) => {
                setSelectedBlockTypes((prev) => {
                  if (event.target.checked) return [...prev, type]
                  return prev.filter((entry) => entry !== type)
                })
              }}
              label={type}
            />
          ))}
        </div>
      </Modal>
    </div>
  )
}
