"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  ExternalLink,
  Eye,
  GripVertical,
  MessageSquare,
  Plus,
  Power,
  Rocket,
  Save,
  Star,
  Trash2,
  Upload
} from "lucide-react"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  fetchOrganizationWebsiteConfig,
  fetchWebsiteSubmissions,
  saveOrganizationWebsiteConfig,
  uploadMediaAsset,
  type PublicWebsiteConfigRecord,
  type PublicWebsiteMenuItemRecord,
  type PublicWebsiteQuestionRecord,
  type PublicWebsiteQuestionType,
  type PublicWebsiteSectionRecord,
  type PublicWebsiteSectionType
} from "@/lib/data/firestore"
import { AppButton, AppCard, AppCheckbox, AppInput, AppSelect, AppTextarea, appButtonClass } from "@inventracker/ui"

const sectionTypes: Array<{ value: PublicWebsiteSectionType; label: string }> = [
  { value: "hero", label: "Hero" },
  { value: "content", label: "Content" },
  { value: "menu", label: "Menu" },
  { value: "questionnaire", label: "Questionnaire" },
  { value: "feedback", label: "Feedback" }
]

const questionTypes: Array<{ value: PublicWebsiteQuestionType; label: string }> = [
  { value: "short_text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "select", label: "Dropdown" },
  { value: "rating", label: "Rating" }
]

const fontOptions = ["Inter", "Georgia", "Arial", "Trebuchet MS", "Verdana", "Times New Roman"]

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}

function formatDate(value: unknown): string {
  if (!value) return "New"
  if (value instanceof Date) return value.toLocaleString()
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate().toLocaleString()
    } catch {
      return "Submitted"
    }
  }
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? "Submitted" : parsed.toLocaleString()
}

function timestampToDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate()
    } catch {
      return null
    }
  }
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatLiveDuration(value: unknown, now: Date): string {
  const publishedAt = timestampToDate(value)
  if (!publishedAt) return "Live"
  const totalMinutes = Math.max(0, Math.floor((now.getTime() - publishedAt.getTime()) / 60000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `Live for ${days}d ${hours}h`
  if (hours > 0) return `Live for ${hours}h ${minutes}m`
  return `Live for ${minutes}m`
}

function moveInArray<T>(rows: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return rows
  const next = [...rows]
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return rows
  next.splice(toIndex, 0, moved)
  return next
}

export default function WebsiteBuilderPage() {
  const queryClient = useQueryClient()
  const { user } = useAuthUser()
  const { activeOrg, activeOrgId, effectivePermissions } = useOrgContext()
  const [config, setConfig] = useState<PublicWebsiteConfigRecord | null>(null)
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingHero, setUploadingHero] = useState(false)
  const [uploadingFont, setUploadingFont] = useState(false)
  const [now, setNow] = useState(() => new Date())

  const { data: websiteConfig, isLoading } = useQuery({
    queryKey: ["organization-website-config", activeOrgId],
    queryFn: () => fetchOrganizationWebsiteConfig(activeOrgId, activeOrg?.organizationName ?? "Customer Website"),
    enabled: Boolean(activeOrgId)
  })

  const { data: submissions = [] } = useQuery({
    queryKey: ["organization-website-submissions", activeOrgId],
    queryFn: () => fetchWebsiteSubmissions(activeOrgId),
    enabled: Boolean(activeOrgId && effectivePermissions.manageWebsite),
    staleTime: 30_000
  })

  useEffect(() => {
    if (!websiteConfig) return
    setConfig(websiteConfig)
  }, [websiteConfig])

  useEffect(() => {
    if (!config?.published) return
    const interval = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(interval)
  }, [config?.published])

  const saveMutation = useMutation({
    mutationFn: async (input: { nextConfig: PublicWebsiteConfigRecord; mode: "draft" | "publish" | "unpublish" }) =>
      saveOrganizationWebsiteConfig(activeOrgId, input.nextConfig, user?.uid, input.mode),
    onSuccess: (saved, input) => {
      setConfig(saved)
      setStatusMessage(
        input.mode === "publish"
          ? "Website is live."
          : input.mode === "unpublish"
            ? "Website unpublished."
            : saved.published
              ? "Draft saved and live site updated."
              : "Draft saved."
      )
      setErrorMessage(null)
      void queryClient.invalidateQueries({ queryKey: ["organization-website-config", activeOrgId] })
      void queryClient.invalidateQueries({ queryKey: ["organization-website-submissions", activeOrgId] })
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Could not save website.")
      setStatusMessage(null)
    }
  })

  const sectionMap = useMemo(() => new Map((config?.questions ?? []).map((question) => [question.id, question.label])), [config?.questions])
  const publicUrl =
    config?.slug && typeof window !== "undefined"
      ? `${window.location.origin}/${config.slug}`
      : config?.slug
        ? `/${config.slug}`
        : ""
  const previewUrl = "/app/website/preview"
  const liveStatus = config?.published ? formatLiveDuration(config.publishedAt, now) : "Draft"

  const saveConfig = (mode: "draft" | "publish" | "unpublish") => {
    if (!config) return
    const nextConfig =
      mode === "publish" && !config.slug
        ? { ...config, slug: slugify(config.siteName || activeOrg?.organizationName || "site") }
        : config
    saveMutation.mutate({ nextConfig, mode })
  }

  const updateConfig = (patch: Partial<PublicWebsiteConfigRecord>) => {
    setConfig((current) => (current ? { ...current, ...patch } : current))
  }

  const updateSections = (sections: PublicWebsiteSectionRecord[]) => {
    updateConfig({ sections: sections.map((section, index) => ({ ...section, order: index })) })
  }

  const addSection = () => {
    if (!config) return
    updateSections([
      ...config.sections,
      {
        id: makeId("section"),
        type: "content",
        title: "New Section",
        body: "",
        enabled: true,
        order: config.sections.length
      }
    ])
  }

  const updateSection = (sectionId: string, patch: Partial<PublicWebsiteSectionRecord>) => {
    if (!config) return
    updateSections(config.sections.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)))
  }

  const removeSection = (sectionId: string) => {
    if (!config) return
    updateSections(config.sections.filter((section) => section.id !== sectionId))
  }

  const addMenuItem = () => {
    if (!config) return
    updateConfig({
      menuItems: [
        ...config.menuItems,
        {
          id: makeId("menu"),
          name: "New item",
          description: "",
          price: "",
          category: "",
          enabled: true
        }
      ]
    })
  }

  const updateMenuItem = (itemId: string, patch: Partial<PublicWebsiteMenuItemRecord>) => {
    if (!config) return
    updateConfig({ menuItems: config.menuItems.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) })
  }

  const removeMenuItem = (itemId: string) => {
    if (!config) return
    updateConfig({ menuItems: config.menuItems.filter((item) => item.id !== itemId) })
  }

  const addQuestion = () => {
    if (!config) return
    updateConfig({
      questions: [
        ...config.questions,
        {
          id: makeId("question"),
          label: "New question",
          type: "short_text",
          required: false,
          options: [],
          enabled: true
        }
      ]
    })
  }

  const updateQuestion = (questionId: string, patch: Partial<PublicWebsiteQuestionRecord>) => {
    if (!config) return
    updateConfig({
      questions: config.questions.map((question) => (question.id === questionId ? { ...question, ...patch } : question))
    })
  }

  const removeQuestion = (questionId: string) => {
    if (!config) return
    updateConfig({ questions: config.questions.filter((question) => question.id !== questionId) })
  }

  const uploadImage = async (file: File, target: "logo" | "hero") => {
    if (!activeOrgId || !user) return
    if (target === "logo") setUploadingLogo(true)
    if (target === "hero") setUploadingHero(true)
    try {
      const uploaded = await uploadMediaAsset({ file, orgId: activeOrgId, userId: user.uid, type: "image" })
      if (!uploaded?.downloadUrl) throw new Error("Upload failed.")
      updateConfig(target === "logo" ? { logoUrl: uploaded.downloadUrl } : { heroImageUrl: uploaded.downloadUrl })
      setStatusMessage(`${target === "logo" ? "Logo" : "Hero image"} uploaded.`)
      setErrorMessage(null)
    } catch {
      setErrorMessage("Could not upload image.")
    } finally {
      setUploadingLogo(false)
      setUploadingHero(false)
    }
  }

  const uploadFont = async (file: File) => {
    if (!activeOrgId || !user) return
    setUploadingFont(true)
    try {
      const uploaded = await uploadMediaAsset({ file, orgId: activeOrgId, userId: user.uid, type: "file" })
      if (!uploaded?.downloadUrl) throw new Error("Upload failed.")
      const family = file.name
        .replace(/\.(woff2?|ttf|otf)$/i, "")
        .replace(/[_-]+/g, " ")
        .trim() || "Custom Font"
      updateConfig({
        fontFamily: family,
        fontAssetId: uploaded.id,
        fontFileUrl: uploaded.downloadUrl,
        fontFileName: file.name
      })
      setStatusMessage("Font uploaded. Save draft to apply it to the website.")
      setErrorMessage(null)
    } catch {
      setErrorMessage("Could not upload font.")
    } finally {
      setUploadingFont(false)
    }
  }

  if (!effectivePermissions.manageWebsite) {
    return <PageHead title="Website" subtitle="You do not have access to manage the customer website." />
  }

  if (isLoading || !config) {
    return <PageHead title="Website" subtitle="Loading website builder..." />
  }

  return (
    <div>
      <PageHead
        title="Website"
        subtitle="Customer-facing site, form builder, menu, and feedback inbox."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={previewUrl} target="_blank" rel="noreferrer" className={appButtonClass("secondary", "gap-2")}>
              <Eye className="h-4 w-4" />
              Preview Draft
            </Link>
            {config.published && publicUrl ? (
              <Link href={publicUrl} target="_blank" rel="noreferrer" className={appButtonClass("secondary", "gap-2")}>
                <ExternalLink className="h-4 w-4" />
                Live Site
              </Link>
            ) : null}
            <AppButton variant="secondary" onClick={() => saveConfig("draft")} disabled={saveMutation.isPending}>
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save Draft"}
            </AppButton>
            {config.published ? (
              <AppButton onClick={() => saveConfig("unpublish")} disabled={saveMutation.isPending} className="gap-2 !bg-red-600 hover:!brightness-110">
                <Power className="h-4 w-4" />
                Unpublish
              </AppButton>
            ) : (
              <AppButton onClick={() => saveConfig("publish")} disabled={saveMutation.isPending} className="gap-2">
                <Rocket className="h-4 w-4" />
                Publish
              </AppButton>
            )}
          </div>
        }
      />

      {statusMessage ? <p className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{statusMessage}</p> : null}
      {errorMessage ? <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">{errorMessage}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <AppCard>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="card-title">Publishing</h2>
                <p className="secondary-text mt-1">
                  Preview works any time. Publishing makes the site public at the path below.
                </p>
              </div>
              <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${config.published ? "bg-emerald-500/15 text-emerald-700" : "bg-slate-500/10 text-app-muted"}`}>
                <Clock3 className="h-3.5 w-3.5" />
                {liveStatus}
              </div>
            </div>

            <div className="mt-4 grid gap-3 rounded-2xl border border-app-border bg-app-surface-soft p-4 md:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase text-app-muted">Status</p>
                <p className="mt-1 text-sm font-semibold">{config.published ? "Public website is live" : "Draft only"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-app-muted">Public URL</p>
                <p className="mt-1 truncate text-sm font-semibold">{publicUrl || "Add a path to publish"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-app-muted">Last published</p>
                <p className="mt-1 text-sm font-semibold">{config.publishedAt ? formatDate(config.publishedAt) : "Not published yet"}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <AppInput
                value={config.siteName}
                onChange={(event) => {
                  const siteName = event.target.value
                  updateConfig({
                    siteName,
                    slug: config.slug || slugify(siteName)
                  })
                }}
                placeholder="Site name"
              />
              <AppInput
                value={config.slug}
                onChange={(event) => updateConfig({ slug: slugify(event.target.value) })}
                placeholder="Public path (example: tfm)"
              />
              <AppInput
                value={config.tagline ?? ""}
                onChange={(event) => updateConfig({ tagline: event.target.value })}
                placeholder="Tagline"
              />
              <AppSelect
                value={config.fontFamily}
                onChange={(event) =>
                  updateConfig({
                    fontFamily: event.target.value,
                    fontAssetId: fontOptions.includes(event.target.value) ? "" : config.fontAssetId,
                    fontFileUrl: fontOptions.includes(event.target.value) ? "" : config.fontFileUrl,
                    fontFileName: fontOptions.includes(event.target.value) ? "" : config.fontFileName
                  })
                }
              >
                {!fontOptions.includes(config.fontFamily) ? (
                  <option value={config.fontFamily}>{config.fontFamily}</option>
                ) : null}
                {fontOptions.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </AppSelect>
              <div className="grid gap-1">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase text-app-muted">
                  <Upload className="h-3.5 w-3.5" />
                  {uploadingFont ? "Uploading font..." : "Upload custom font"}
                </p>
                <AppInput
                  type="file"
                  accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void uploadFont(file)
                  }}
                />
                {config.fontFileName ? (
                  <p className="secondary-text text-xs">Using {config.fontFileName}</p>
                ) : null}
              </div>
              <AppInput
                value={config.logoUrl ?? ""}
                onChange={(event) => updateConfig({ logoUrl: event.target.value })}
                placeholder="Logo URL"
              />
              <div className="grid gap-1">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase text-app-muted">
                  <Upload className="h-3.5 w-3.5" />
                  {uploadingLogo ? "Uploading logo..." : "Upload logo"}
                </p>
                <AppInput
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void uploadImage(file, "logo")
                  }}
                />
              </div>
              <AppInput
                value={config.heroImageUrl ?? ""}
                onChange={(event) => updateConfig({ heroImageUrl: event.target.value })}
                placeholder="Hero image URL"
              />
              <div className="grid gap-1">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase text-app-muted">
                  <Upload className="h-3.5 w-3.5" />
                  {uploadingHero ? "Uploading hero..." : "Upload hero image"}
                </p>
                <AppInput
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void uploadImage(file, "hero")
                  }}
                />
              </div>
              <label className="grid gap-1 text-xs font-semibold uppercase text-app-muted">
                Accent
                <AppInput type="color" value={config.accentColor} onChange={(event) => updateConfig({ accentColor: event.target.value })} />
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase text-app-muted">
                Background
                <AppInput type="color" value={config.backgroundColor} onChange={(event) => updateConfig({ backgroundColor: event.target.value })} />
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase text-app-muted">
                Text
                <AppInput type="color" value={config.textColor} onChange={(event) => updateConfig({ textColor: event.target.value })} />
              </label>
            </div>
          </AppCard>

          <AppCard>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="card-title">Sections</h2>
              <AppButton variant="secondary" onClick={addSection}>
                <Plus className="h-4 w-4" />
                Add Section
              </AppButton>
            </div>
            <div className="space-y-3">
              {config.sections.map((section, index) => (
                <div
                  key={section.id}
                  draggable
                  onDragStart={() => setDraggedSectionId(section.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (!draggedSectionId || draggedSectionId === section.id) return
                    const fromIndex = config.sections.findIndex((entry) => entry.id === draggedSectionId)
                    updateSections(moveInArray(config.sections, fromIndex, index))
                    setDraggedSectionId(null)
                  }}
                  className="rounded-2xl border border-app-border bg-app-surface p-3"
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <GripVertical className="h-4 w-4 text-app-muted" />
                    <AppSelect
                      value={section.type}
                      className="max-w-[180px]"
                      onChange={(event) => updateSection(section.id, { type: event.target.value as PublicWebsiteSectionType })}
                    >
                      {sectionTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </AppSelect>
                    <AppCheckbox
                      checked={section.enabled}
                      onChange={(event) => updateSection(section.id, { enabled: event.target.checked })}
                      label="Enabled"
                    />
                    <div className="ml-auto flex gap-2">
                      <AppButton variant="secondary" disabled={index === 0} onClick={() => updateSections(moveInArray(config.sections, index, index - 1))}>
                        <ArrowUp className="h-4 w-4" />
                      </AppButton>
                      <AppButton variant="secondary" disabled={index === config.sections.length - 1} onClick={() => updateSections(moveInArray(config.sections, index, index + 1))}>
                        <ArrowDown className="h-4 w-4" />
                      </AppButton>
                      <AppButton variant="secondary" onClick={() => removeSection(section.id)}>
                        <Trash2 className="h-4 w-4" />
                      </AppButton>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <AppInput
                      value={section.title}
                      onChange={(event) => updateSection(section.id, { title: event.target.value })}
                      placeholder="Section title"
                    />
                    <AppTextarea
                      value={section.body ?? ""}
                      onChange={(event) => updateSection(section.id, { body: event.target.value })}
                      placeholder="Section text"
                    />
                  </div>
                </div>
              ))}
            </div>
          </AppCard>

          <AppCard>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="card-title">Menu + Prices</h2>
              <AppButton variant="secondary" onClick={addMenuItem}>
                <Plus className="h-4 w-4" />
                Add Item
              </AppButton>
            </div>
            <div className="space-y-3">
              {config.menuItems.length === 0 ? (
                <p className="secondary-text rounded-xl border border-app-border px-3 py-2 text-sm">No menu items yet.</p>
              ) : null}
              {config.menuItems.map((item) => (
                <div key={item.id} className="grid gap-2 rounded-2xl border border-app-border bg-app-surface p-3 md:grid-cols-[1fr_1fr_120px_auto]">
                  <AppInput value={item.name} onChange={(event) => updateMenuItem(item.id, { name: event.target.value })} placeholder="Item name" />
                  <AppInput value={item.category ?? ""} onChange={(event) => updateMenuItem(item.id, { category: event.target.value })} placeholder="Category" />
                  <AppInput value={item.price ?? ""} onChange={(event) => updateMenuItem(item.id, { price: event.target.value })} placeholder="Price" />
                  <AppButton variant="secondary" onClick={() => removeMenuItem(item.id)}>
                    <Trash2 className="h-4 w-4" />
                  </AppButton>
                  <AppTextarea
                    className="md:col-span-4"
                    value={item.description ?? ""}
                    onChange={(event) => updateMenuItem(item.id, { description: event.target.value })}
                    placeholder="Description"
                  />
                  <AppCheckbox
                    checked={item.enabled}
                    onChange={(event) => updateMenuItem(item.id, { enabled: event.target.checked })}
                    label="Enabled"
                  />
                </div>
              ))}
            </div>
          </AppCard>

          <AppCard>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="card-title">Questionnaire</h2>
              <AppButton variant="secondary" onClick={addQuestion}>
                <Plus className="h-4 w-4" />
                Add Question
              </AppButton>
            </div>
            <div className="space-y-3">
              {config.questions.length === 0 ? (
                <p className="secondary-text rounded-xl border border-app-border px-3 py-2 text-sm">No questions yet.</p>
              ) : null}
              {config.questions.map((question) => (
                <div key={question.id} className="grid gap-2 rounded-2xl border border-app-border bg-app-surface p-3 md:grid-cols-[1fr_180px_auto]">
                  <AppInput
                    value={question.label}
                    onChange={(event) => updateQuestion(question.id, { label: event.target.value })}
                    placeholder="Question"
                  />
                  <AppSelect
                    value={question.type}
                    onChange={(event) => updateQuestion(question.id, { type: event.target.value as PublicWebsiteQuestionType })}
                  >
                    {questionTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </AppSelect>
                  <AppButton variant="secondary" onClick={() => removeQuestion(question.id)}>
                    <Trash2 className="h-4 w-4" />
                  </AppButton>
                  {question.type === "select" ? (
                    <AppInput
                      className="md:col-span-3"
                      value={question.options.join(", ")}
                      onChange={(event) =>
                        updateQuestion(question.id, {
                          options: event.target.value
                            .split(",")
                            .map((option) => option.trim())
                            .filter(Boolean)
                        })
                      }
                      placeholder="Options separated by commas"
                    />
                  ) : null}
                  <div className="flex flex-wrap gap-4 md:col-span-3">
                    <AppCheckbox
                      checked={question.required}
                      onChange={(event) => updateQuestion(question.id, { required: event.target.checked })}
                      label="Required"
                    />
                    <AppCheckbox
                      checked={question.enabled}
                      onChange={(event) => updateQuestion(question.id, { enabled: event.target.checked })}
                      label="Enabled"
                    />
                  </div>
                </div>
              ))}
            </div>
          </AppCard>
        </div>

        <div className="space-y-4">
          <AppCard>
            <h2 className="card-title">Preview</h2>
            {config.fontFileUrl ? (
              <style>{`@font-face{font-family:${JSON.stringify(config.fontFamily)};src:url(${JSON.stringify(config.fontFileUrl)});font-display:swap;}`}</style>
            ) : null}
            <div
              className="mt-4 overflow-hidden rounded-2xl border border-app-border"
              style={{ backgroundColor: config.backgroundColor, color: config.textColor, fontFamily: config.fontFamily }}
            >
              {config.heroImageUrl ? (
                <div className="h-32 bg-cover bg-center" style={{ backgroundImage: `url(${config.heroImageUrl})` }} />
              ) : null}
              <div className="p-4">
                {config.logoUrl ? <img src={config.logoUrl} alt="" className="mb-4 max-h-14 max-w-[180px] object-contain" /> : null}
                <p className="text-2xl font-semibold">{config.siteName}</p>
                {config.tagline ? <p className="mt-2 text-sm opacity-80">{config.tagline}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {config.sections.filter((section) => section.enabled).map((section) => (
                    <span key={section.id} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: config.accentColor, color: "#fff" }}>
                      {section.title}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <AppCheckbox
                checked={config.feedbackEnabled}
                onChange={(event) => updateConfig({ feedbackEnabled: event.target.checked })}
                label="Feedback form"
              />
              <AppCheckbox
                checked={config.ratingsEnabled}
                onChange={(event) => updateConfig({ ratingsEnabled: event.target.checked })}
                label="Ratings"
              />
            </div>
          </AppCard>

          <AppCard>
            <div className="mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[color:var(--accent)]" />
              <h2 className="card-title">Submissions</h2>
            </div>
            <div className="space-y-3">
              {submissions.length === 0 ? (
                <p className="secondary-text rounded-xl border border-app-border px-3 py-2 text-sm">No customer submissions yet.</p>
              ) : null}
              {submissions.slice(0, 12).map((submission) => (
                <div key={submission.id} className="rounded-2xl border border-app-border bg-app-surface p-3">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{submission.customerName ?? submission.customerEmail ?? "Website visitor"}</p>
                      <p className="secondary-text text-xs">{formatDate(submission.createdAt)}</p>
                    </div>
                    {submission.rating ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-app-border px-2 py-1 text-xs font-semibold">
                        <Star className="h-3 w-3 fill-current" />
                        {submission.rating}
                      </span>
                    ) : null}
                  </div>
                  {submission.feedback ? <p className="mb-2 text-sm">{submission.feedback}</p> : null}
                  <div className="space-y-1">
                    {Object.entries(submission.answers).slice(0, 5).map(([questionId, answer]) => (
                      <p key={questionId} className="text-xs text-app-muted">
                        <span className="font-semibold text-app-text">{sectionMap.get(questionId) ?? questionId}:</span> {answer}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </AppCard>

          {config.published && publicUrl ? (
            <Link href={publicUrl} target="_blank" rel="noreferrer" className={appButtonClass("secondary", "w-full gap-2")}>
              <ExternalLink className="h-4 w-4" />
              Open Customer Site
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
