import { onCall, HttpsError } from "firebase-functions/v2/https"
import { FieldValue } from "firebase-admin/firestore"
import { z } from "zod"

import { adminDb } from "./lib/firebase.js"
import { requireAuth, requireOrgMembership } from "./lib/auth.js"

const sectionTypeSchema = z.enum(["hero", "menu", "questionnaire", "feedback", "content"])
const questionTypeSchema = z.enum(["short_text", "long_text", "email", "phone", "select", "rating"])
const saveModeSchema = z.enum(["draft", "publish", "unpublish"]).default("draft")

const websiteSectionSchema = z.object({
  id: z.string().optional(),
  type: sectionTypeSchema.optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  enabled: z.boolean().optional(),
  order: z.number().optional()
})

const websiteMenuItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  price: z.string().optional(),
  category: z.string().optional(),
  enabled: z.boolean().optional()
})

const websiteQuestionSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  type: questionTypeSchema.optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  enabled: z.boolean().optional()
})

const websiteConfigSchema = z.object({
  id: z.string().optional(),
  organizationId: z.string().optional(),
  slug: z.string().optional(),
  published: z.boolean().optional(),
  siteName: z.string().optional(),
  tagline: z.string().optional(),
  logoUrl: z.string().optional(),
  heroImageUrl: z.string().optional(),
  fontFamily: z.string().optional(),
  fontAssetId: z.string().optional(),
  fontFileUrl: z.string().optional(),
  fontFileName: z.string().optional(),
  accentColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  sections: z.array(websiteSectionSchema).optional(),
  menuItems: z.array(websiteMenuItemSchema).optional(),
  questions: z.array(websiteQuestionSchema).optional(),
  feedbackEnabled: z.boolean().optional(),
  ratingsEnabled: z.boolean().optional(),
  publishedAt: z.unknown().optional(),
  unpublishedAt: z.unknown().optional(),
  createdAt: z.unknown().optional()
})

const saveOrganizationWebsiteConfigRequestSchema = z.object({
  orgId: z.string().min(1),
  config: websiteConfigSchema,
  mode: saveModeSchema
})

type WebsiteConfigInput = z.infer<typeof websiteConfigSchema>
type WebsiteSectionInput = z.infer<typeof websiteSectionSchema>
type WebsiteMenuItemInput = z.infer<typeof websiteMenuItemSchema>
type WebsiteQuestionInput = z.infer<typeof websiteQuestionSchema>
type SaveMode = z.infer<typeof saveModeSchema>

function normalizeString(value: unknown, fallback = "", maxLength = 4000): string {
  if (typeof value !== "string") return fallback
  return value.trim().slice(0, maxLength)
}

function normalizeWebsiteSlug(value: unknown): string {
  return normalizeString(value, "", 96)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}

function normalizeColor(value: unknown, fallback: string): string {
  const raw = normalizeString(value, fallback, 24)
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : fallback
}

function makeWebsiteId(prefix: string, index: number): string {
  return `${prefix}_${index + 1}`
}

function normalizeSections(input: WebsiteSectionInput[] | undefined, orgName: string) {
  const defaults = [
    { id: "section_hero", type: "hero" as const, title: orgName, body: "Fresh, local, and ready for your guests.", enabled: true, order: 0 },
    { id: "section_menu", type: "menu" as const, title: "Menu", body: "", enabled: true, order: 1 },
    { id: "section_questionnaire", type: "questionnaire" as const, title: "Request Information", body: "", enabled: true, order: 2 },
    { id: "section_feedback", type: "feedback" as const, title: "Feedback", body: "", enabled: true, order: 3 }
  ]
  const rows = Array.isArray(input) ? input : []
  const normalized = rows
    .slice(0, 60)
    .map((section, index) => {
      const type = section.type ?? "content"
      const title = normalizeString(section.title, type === "hero" ? orgName : "Section", 160)
      return {
        id: normalizeString(section.id, makeWebsiteId("section", index), 96),
        type,
        title,
        body: normalizeString(section.body, "", 8000),
        enabled: section.enabled === undefined ? true : Boolean(section.enabled),
        order: Math.max(0, Math.floor(Number(section.order ?? index)))
      }
    })
    .sort((left, right) => left.order - right.order)
    .map((section, index) => ({ ...section, order: index }))
  return normalized.length > 0 ? normalized : defaults
}

function normalizeMenuItems(input: WebsiteMenuItemInput[] | undefined) {
  return (Array.isArray(input) ? input : [])
    .slice(0, 300)
    .map((item, index) => {
      const name = normalizeString(item.name, "", 160)
      if (!name) return null
      return {
        id: normalizeString(item.id, makeWebsiteId("menu", index), 96),
        name,
        description: normalizeString(item.description, "", 2000),
        price: normalizeString(item.price, "", 80),
        category: normalizeString(item.category, "", 120),
        enabled: item.enabled === undefined ? true : Boolean(item.enabled)
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
}

function normalizeQuestions(input: WebsiteQuestionInput[] | undefined) {
  return (Array.isArray(input) ? input : [])
    .slice(0, 100)
    .map((question, index) => {
      const label = normalizeString(question.label, "", 240)
      if (!label) return null
      return {
        id: normalizeString(question.id, makeWebsiteId("question", index), 96),
        label,
        type: question.type ?? "short_text",
        required: Boolean(question.required),
        options: (question.options ?? []).map((option) => normalizeString(option, "", 160)).filter(Boolean).slice(0, 40),
        enabled: question.enabled === undefined ? true : Boolean(question.enabled)
      }
    })
    .filter((question): question is NonNullable<typeof question> => Boolean(question))
}

function normalizeWebsiteConfig(input: WebsiteConfigInput, orgId: string, orgName: string, mode: SaveMode) {
  const siteName = normalizeString(input.siteName, orgName || "Customer Website", 160) || "Customer Website"
  const slug =
    normalizeWebsiteSlug(input.slug) ||
    normalizeWebsiteSlug(siteName) ||
    normalizeWebsiteSlug(orgName) ||
    orgId.slice(0, 8)

  return {
    id: "config",
    organizationId: orgId,
    slug,
    published: mode === "publish" ? true : mode === "unpublish" ? false : Boolean(input.published),
    siteName,
    tagline: normalizeString(input.tagline, "", 300),
    logoUrl: normalizeString(input.logoUrl, "", 4000),
    heroImageUrl: normalizeString(input.heroImageUrl, "", 4000),
    fontFamily: normalizeString(input.fontFamily, "Inter", 160) || "Inter",
    fontAssetId: normalizeString(input.fontAssetId, "", 160),
    fontFileUrl: normalizeString(input.fontFileUrl, "", 4000),
    fontFileName: normalizeString(input.fontFileName, "", 240),
    accentColor: normalizeColor(input.accentColor, "#16A34A"),
    backgroundColor: normalizeColor(input.backgroundColor, "#F8FAFC"),
    textColor: normalizeColor(input.textColor, "#111827"),
    sections: normalizeSections(input.sections, siteName),
    menuItems: normalizeMenuItems(input.menuItems),
    questions: normalizeQuestions(input.questions),
    feedbackEnabled: input.feedbackEnabled === undefined ? true : Boolean(input.feedbackEnabled),
    ratingsEnabled: input.ratingsEnabled === undefined ? true : Boolean(input.ratingsEnabled)
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
}

function stripUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefinedDeep)
  if (!isPlainRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
  )
}

function timestampToResponse(value: unknown): unknown {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string" || typeof value === "number") return value
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString()
    } catch {
      return null
    }
  }
  return null
}

function canManageWebsite(member: Awaited<ReturnType<typeof requireOrgMembership>>): boolean {
  // Membership is already enforced by requireOrgMembership; website editing is available to org members.
  return Boolean(member)
}

export const saveOrganizationWebsiteConfig = onCall(async (request) => {
  const uid = requireAuth(request)
  const input = saveOrganizationWebsiteConfigRequestSchema.parse(request.data ?? {})
  const member = await requireOrgMembership(input.orgId, uid)
  if (!canManageWebsite(member)) {
    throw new HttpsError("permission-denied", "Missing permission to manage the customer website.")
  }

  const orgSnap = await adminDb.doc(`organizations/${input.orgId}`).get()
  const orgName = normalizeString(orgSnap.data()?.name, "Customer Website", 160)
  const configRef = adminDb.doc(`organizations/${input.orgId}/website/config`)
  const previousSnap = await configRef.get()
  const previous = previousSnap.exists ? (previousSnap.data() as Record<string, unknown>) : {}
  const normalized = normalizeWebsiteConfig(input.config, input.orgId, orgName, input.mode)

  if (input.mode === "publish" && !normalized.slug) {
    throw new HttpsError("failed-precondition", "A public website path is required before publishing.")
  }

  if (normalized.published && normalized.slug) {
    const existingPublicSnap = await adminDb.doc(`publicSites/${normalized.slug}`).get()
    const existingOrgId = normalizeString(existingPublicSnap.data()?.organizationId)
    if (existingPublicSnap.exists && existingOrgId && existingOrgId !== input.orgId) {
      throw new HttpsError("already-exists", "That website path is already in use.")
    }
  }

  const previousSlug = normalizeWebsiteSlug(previous.slug)
  const now = new Date()
  const isFreshPublish = input.mode === "publish" && previous.published !== true
  const publishedAt = isFreshPublish ? now.toISOString() : timestampToResponse(previous.publishedAt ?? input.config.publishedAt)
  const unpublishedAt =
    input.mode === "unpublish" ? now.toISOString() : timestampToResponse(input.config.unpublishedAt ?? previous.unpublishedAt)
  const payload = stripUndefinedDeep({
    ...normalized,
    createdAt: previous.createdAt ?? FieldValue.serverTimestamp(),
    publishedAt: normalized.published ? (isFreshPublish ? FieldValue.serverTimestamp() : previous.publishedAt ?? input.config.publishedAt ?? null) : previous.publishedAt ?? null,
    unpublishedAt: input.mode === "unpublish" ? FieldValue.serverTimestamp() : input.config.unpublishedAt ?? previous.unpublishedAt ?? null,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid
  }) as Record<string, unknown>

  const batch = adminDb.batch()
  batch.set(configRef, payload, { merge: true })

  if (previousSlug && previousSlug !== normalized.slug) {
    batch.delete(adminDb.doc(`publicSites/${previousSlug}`))
  }

  if (normalized.published && normalized.slug) {
    batch.set(
      adminDb.doc(`publicSites/${normalized.slug}`),
      stripUndefinedDeep({
        ...payload,
        organizationId: input.orgId,
        published: true,
        updatedAt: FieldValue.serverTimestamp()
      }) as Record<string, unknown>,
      { merge: true }
    )
  } else if (normalized.slug) {
    batch.delete(adminDb.doc(`publicSites/${normalized.slug}`))
  }

  batch.set(adminDb.collection("auditLogs").doc(), {
    actorUserId: uid,
    actorRoleSnapshot: member.role,
    organizationId: input.orgId,
    storeId: null,
    targetPath: configRef.path,
    action: previousSnap.exists ? "update" : "create",
    before: previousSnap.exists ? previous : null,
    after: {
      slug: normalized.slug,
      published: normalized.published,
      mode: input.mode
    },
    createdAt: FieldValue.serverTimestamp()
  })

  await batch.commit()

  return stripUndefinedDeep({
    ...normalized,
    publishedAt,
    unpublishedAt,
    createdAt: timestampToResponse(previous.createdAt),
    updatedAt: now.toISOString(),
    updatedBy: uid
  })
})
