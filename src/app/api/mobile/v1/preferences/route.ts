import { z } from "zod"

import { adminFieldValue } from "@/lib/firebase-admin"
import { userPreferencesPath } from "@/lib/firestore-schema"
import { canUseMobileWorkShortcut, MOBILE_WORK_SHORTCUTS, MobileApiError, mobileEnvelope, mobileError, requireMobilePrincipal } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const workShortcutSchema = z.enum(MOBILE_WORK_SHORTCUTS)
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const themeSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  accent: colorSchema,
  secondary: colorSchema,
  background: colorSchema.optional(),
  backgroundSoft: colorSchema.optional(),
  panel: colorSchema.optional(),
  panelStrong: colorSchema.optional(),
  controlBg: colorSchema.optional(),
  controlHover: colorSchema.optional(),
  controlBorder: colorSchema.optional(),
  text: colorSchema.optional(),
  muted: colorSchema.optional(),
  subtle: colorSchema.optional(),
  buttonText: colorSchema.optional(),
  mode: z.enum(["Dark", "Light", "System"]),
  dense: z.boolean()
}).strict()
const savedThemesSchema = z.array(themeSchema).max(40)
const updateSchema = z.object({
  workShortcut: workShortcutSchema.optional(),
  theme: themeSchema.optional(),
  savedThemes: savedThemesSchema.optional()
}).refine((value) => value.workShortcut || value.theme || value.savedThemes, { message: "A preference update is required." })

function preferencesFrom(data: Record<string, unknown> | undefined) {
  const candidate = String(data?.mobileWorkShortcut ?? "")
  const parsed = workShortcutSchema.safeParse(candidate)
  const theme = themeSchema.safeParse(data?.theme)
  const savedThemes = savedThemesSchema.safeParse(data?.savedThemes)
  return {
    workShortcut: parsed.success ? parsed.data : "work",
    ...(theme.success ? { theme: theme.data } : {}),
    ...(savedThemes.success ? { savedThemes: savedThemes.data } : {})
  }
}

export async function GET(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    const snapshot = await principal.db.doc(userPreferencesPath(principal.uid)).get()
    return Response.json(mobileEnvelope(preferencesFrom(snapshot.data())))
  } catch (error) {
    return mobileError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request)
    const parsed = updateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return Response.json(
        { error: { code: "invalid_request", message: "Send a valid InvenTracker preference update." } },
        { status: 400 }
      )
    }

    const preferenceRef = principal.db.doc(userPreferencesPath(principal.uid))
    const preferenceSnapshot = await preferenceRef.get()
    if (parsed.data.workShortcut && !canUseMobileWorkShortcut(principal, parsed.data.workShortcut)) {
      throw new MobileApiError("You do not have access to that Work shortcut.", 403, "permission_denied")
    }
    const existingPreferences = preferencesFrom(preferenceSnapshot.data())
    const FieldValue = await adminFieldValue()
    const update: Record<string, unknown> = {
      schemaVersion: 1,
      updatedAt: FieldValue.serverTimestamp()
    }
    if (parsed.data.workShortcut) update.mobileWorkShortcut = parsed.data.workShortcut
    if (parsed.data.theme) update.theme = parsed.data.theme
    if (parsed.data.savedThemes) update.savedThemes = parsed.data.savedThemes
    if (!preferenceSnapshot.exists) {
      update.createdAt = FieldValue.serverTimestamp()
      update.mobileWorkShortcut = parsed.data.workShortcut ?? "work"
      await preferenceRef.set(update)
    } else {
      await preferenceRef.update(update)
    }

    return Response.json(mobileEnvelope({
      workShortcut: parsed.data.workShortcut ?? existingPreferences.workShortcut,
      ...(parsed.data.theme ? { theme: parsed.data.theme } : existingPreferences.theme ? { theme: existingPreferences.theme } : {}),
      ...(parsed.data.savedThemes ? { savedThemes: parsed.data.savedThemes } : existingPreferences.savedThemes ? { savedThemes: existingPreferences.savedThemes } : {})
    }))
  } catch (error) {
    return mobileError(error)
  }
}
