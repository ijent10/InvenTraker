"use client"

import { useEffect, useMemo, useState } from "react"

import { Button, Field, TextInput, ToggleRow } from "@/components/ui"
import { readCloudWorkspacePreferences, writeCloudWorkspacePreferences } from "@/lib/cloud-preferences"
import {
  APP_THEME_EVENT,
  applyAndStoreAppTheme,
  darken,
  deriveThemePalette,
  defaultAppTheme,
  isHexColor,
  readSavedAppThemes,
  readStoredAppTheme,
  saveNamedAppTheme,
  storeSavedAppThemes,
  type AppTheme,
  type ThemeMode
} from "@/lib/theme"

type ColorThemeField = Extract<
  keyof AppTheme,
  "accent" | "secondary" | "background" | "backgroundSoft" | "panel" | "controlBg" | "controlHover" | "controlBorder" | "text" | "muted" | "buttonText"
>

function themeSignature(theme: AppTheme) {
  return JSON.stringify(theme)
}

function normalizeHexInput(value: string) {
  const trimmed = value.trim()
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`
  return trimmed
}

export function ThemeControls({
  defaultAccent = "#2563eb",
  defaultSecondary = "#14b8a6",
  defaultMode = "Light"
}: {
  defaultAccent?: string
  defaultSecondary?: string
  defaultMode?: "Dark" | "Light" | "System"
}) {
  void defaultMode
  const fallbackTheme = useMemo<AppTheme>(
    () => ({
      accent: defaultAccent,
      secondary: defaultSecondary,
      mode: "Light",
      dense: false
    }),
    [defaultAccent, defaultSecondary]
  )
  const [theme, setTheme] = useState<AppTheme>(fallbackTheme)
  const [mounted, setMounted] = useState(false)
  const [savedThemes, setSavedThemes] = useState<AppTheme[]>([])
  const [saveMessage, setSaveMessage] = useState("")
  const [colorDrafts, setColorDrafts] = useState<Partial<Record<ColorThemeField, string>>>({})
  const [previewMode, setPreviewMode] = useState<"Light" | "Dark">("Light")

  function previewTheme(baseTheme = theme, mode = previewMode): AppTheme {
    const lightTheme = {
      ...baseTheme,
      mode: "Light" as ThemeMode
    }

    return mode === "Dark" ? deriveThemePalette(lightTheme, "Dark") : lightTheme
  }

  const preview = useMemo(
    () => ({
      accent: theme.accent,
      secondary: theme.secondary,
      surface: previewMode === "Light" ? theme.panel ?? "#ffffff" : darken(theme.accent, 0.76),
      background: previewMode === "Light" ? theme.background ?? "#f8fafc" : darken(theme.accent, 0.88)
    }),
    [previewMode, theme.accent, theme.background, theme.panel, theme.secondary]
  )

  function updateTheme(nextTheme: Partial<AppTheme>, clearDrafts: ColorThemeField[] = []) {
    const resolvedTheme = {
      ...theme,
      ...nextTheme,
      mode: "Light" as ThemeMode
    }
    setTheme((currentTheme) => ({
      ...currentTheme,
      ...nextTheme,
      mode: "Light"
    }))
    applyAndStoreAppTheme(previewTheme(resolvedTheme))
    if (clearDrafts.length > 0) {
      setColorDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts }
        clearDrafts.forEach((field) => {
          delete nextDrafts[field]
        })
        return nextDrafts
      })
    }
    setSaveMessage("")
  }

  function updateColor(field: ColorThemeField, value: string) {
    const normalized = normalizeHexInput(value)
    setColorDrafts((currentDrafts) => ({ ...currentDrafts, [field]: value }))
    if (isHexColor(normalized)) updateTheme({ [field]: normalized }, [field])
  }

  function colorValue(field: ColorThemeField, fallback: string) {
    const value = theme[field]
    return typeof value === "string" && isHexColor(value) ? value : fallback
  }

  function colorInputValue(field: ColorThemeField, fallback: string) {
    return colorDrafts[field] ?? colorValue(field, fallback)
  }

  function applyDerivedPalette(mode: ThemeMode) {
    const nextMode = mode === "Dark" ? "Dark" : "Light"
    setPreviewMode(nextMode)
    applyAndStoreAppTheme(previewTheme(theme, nextMode))
    setSaveMessage(`${nextMode} preview applied. Saved themes keep the light/base colors and generate dark automatically.`)
  }

  function resetTheme() {
    setColorDrafts({})
    const resetBaseTheme = { ...defaultAppTheme, mode: "Light" as ThemeMode }
    setTheme(resetBaseTheme)
    setPreviewMode("Light")
    applyAndStoreAppTheme(resetBaseTheme)
    setSaveMessage("Default theme applied.")
  }

  async function saveTheme() {
    const themeName = theme.name?.trim() || "My custom theme"
    const namedTheme = { ...theme, name: themeName, mode: "Light" as ThemeMode }
    const nextThemes = saveNamedAppTheme(namedTheme)
    setSavedThemes(nextThemes)
    setTheme(namedTheme)
    applyAndStoreAppTheme(previewTheme(namedTheme))
    const synced = await writeCloudWorkspacePreferences({ theme: namedTheme, savedThemes: nextThemes }).catch(() => false)
    setSaveMessage(synced ? `${themeName} saved to the database.` : `${themeName} saved in this browser. Sign in to sync it across devices.`)
  }

  function applySavedTheme(savedTheme: AppTheme) {
    setColorDrafts({})
    setTheme(savedTheme)
    const nextPreviewMode = savedTheme.mode === "Dark" ? "Dark" : "Light"
    setPreviewMode(nextPreviewMode)
    applyAndStoreAppTheme(previewTheme(savedTheme, nextPreviewMode))
    void writeCloudWorkspacePreferences({ theme: savedTheme })
  }

  function deleteSavedTheme(themeName?: string) {
    if (!themeName) return
    const nextThemes = savedThemes.filter((savedTheme) => savedTheme.name !== themeName)
    storeSavedAppThemes(nextThemes)
    setSavedThemes(nextThemes)
    void writeCloudWorkspacePreferences({ savedThemes: nextThemes })
    setSaveMessage(`${themeName} removed from saved themes.`)
  }

  useEffect(() => {
    setTheme((currentTheme) => {
      const storedTheme = readStoredAppTheme(fallbackTheme)
      return themeSignature(currentTheme) === themeSignature(storedTheme) ? currentTheme : storedTheme
    })
    setSavedThemes(readSavedAppThemes())
    readCloudWorkspacePreferences()
      .then((preferences) => {
        if (preferences?.theme) {
          setTheme(preferences.theme)
          setPreviewMode(preferences.theme.mode === "Dark" ? "Dark" : "Light")
        }
        if (preferences?.savedThemes) {
          setSavedThemes(preferences.savedThemes)
          storeSavedAppThemes(preferences.savedThemes)
        }
      })
      .catch(() => {
        setSavedThemes(readSavedAppThemes())
      })
    setMounted(true)

    function syncFromStorage() {
      setTheme((currentTheme) => {
        const storedTheme = readStoredAppTheme(fallbackTheme)
        setPreviewMode(storedTheme.mode === "Dark" ? "Dark" : "Light")
        return themeSignature(currentTheme) === themeSignature(storedTheme) ? currentTheme : storedTheme
      })
    }

    window.addEventListener(APP_THEME_EVENT, syncFromStorage)
    return () => window.removeEventListener(APP_THEME_EVENT, syncFromStorage)
  }, [fallbackTheme])

  useEffect(() => {
    if (!mounted) return
    applyAndStoreAppTheme(previewTheme(theme, previewMode))
    // previewTheme intentionally derives from the current theme and preview mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, previewMode, theme])

  return (
    <div className="grid gap-4">
      <Field label="Theme name">
        <TextInput value={theme.name ?? ""} onChange={(event) => updateTheme({ name: event.target.value })} placeholder="Weekend night shift" />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Button color">
          <div className="grid gap-2 sm:grid-cols-[64px_1fr]">
            <TextInput
              type="color"
              value={colorValue("accent", defaultAppTheme.accent)}
              onChange={(event) => updateTheme({ accent: event.target.value }, ["accent"])}
              className="p-1"
            />
            <TextInput
              aria-label="Button hex"
              value={colorInputValue("accent", defaultAppTheme.accent)}
              maxLength={7}
              onChange={(event) => updateColor("accent", event.target.value.trim())}
            />
          </div>
        </Field>
        <Field label="Button text">
          <div className="grid gap-2 sm:grid-cols-[64px_1fr]">
            <TextInput
              type="color"
              value={colorValue("buttonText", "#ffffff")}
              onChange={(event) => updateTheme({ buttonText: event.target.value }, ["buttonText"])}
              className="p-1"
            />
            <TextInput
              aria-label="Button text hex"
              value={colorInputValue("buttonText", "#ffffff")}
              maxLength={7}
              onChange={(event) => updateColor("buttonText", event.target.value.trim())}
            />
          </div>
        </Field>
        <Field label="Secondary color">
          <div className="grid gap-2 sm:grid-cols-[64px_1fr]">
            <TextInput
              type="color"
              value={colorValue("secondary", defaultAppTheme.secondary)}
              onChange={(event) => updateTheme({ secondary: event.target.value }, ["secondary"])}
              className="p-1"
            />
            <TextInput
              aria-label="Secondary hex"
              value={colorInputValue("secondary", defaultAppTheme.secondary)}
              maxLength={7}
              onChange={(event) => updateColor("secondary", event.target.value.trim())}
            />
          </div>
        </Field>
        <Field label="Background color">
          <div className="grid gap-2 sm:grid-cols-[64px_1fr]">
            <TextInput
              type="color"
              value={colorValue("background", defaultAppTheme.background ?? "#020617")}
              onChange={(event) => updateTheme({ background: event.target.value }, ["background"])}
              className="p-1"
            />
            <TextInput
              aria-label="Background hex"
              value={colorInputValue("background", defaultAppTheme.background ?? "#020617")}
              maxLength={7}
              onChange={(event) => updateColor("background", event.target.value.trim())}
            />
          </div>
        </Field>
        <Field label="Background glow">
          <div className="grid gap-2 sm:grid-cols-[64px_1fr]">
            <TextInput
              type="color"
              value={colorValue("backgroundSoft", defaultAppTheme.backgroundSoft ?? "#0f172a")}
              onChange={(event) => updateTheme({ backgroundSoft: event.target.value }, ["backgroundSoft"])}
              className="p-1"
            />
            <TextInput
              aria-label="Background glow hex"
              value={colorInputValue("backgroundSoft", defaultAppTheme.backgroundSoft ?? "#0f172a")}
              maxLength={7}
              onChange={(event) => updateColor("backgroundSoft", event.target.value.trim())}
            />
          </div>
        </Field>
        <Field label="Panel color">
          <div className="grid gap-2 sm:grid-cols-[64px_1fr]">
            <TextInput
              type="color"
              value={colorValue("panel", defaultAppTheme.panel ?? "#0f172a")}
              onChange={(event) => updateTheme({ panel: event.target.value }, ["panel"])}
              className="p-1"
            />
            <TextInput
              aria-label="Panel hex"
              value={colorInputValue("panel", defaultAppTheme.panel ?? "#0f172a")}
              maxLength={7}
              onChange={(event) => updateColor("panel", event.target.value.trim())}
            />
          </div>
        </Field>
        <Field label="Input color">
          <div className="grid gap-2 sm:grid-cols-[64px_1fr]">
            <TextInput
              type="color"
              value={colorValue("controlBg", defaultAppTheme.controlBg ?? "#020617")}
              onChange={(event) => updateTheme({ controlBg: event.target.value }, ["controlBg"])}
              className="p-1"
            />
            <TextInput
              aria-label="Input hex"
              value={colorInputValue("controlBg", defaultAppTheme.controlBg ?? "#020617")}
              maxLength={7}
              onChange={(event) => updateColor("controlBg", event.target.value.trim())}
            />
          </div>
        </Field>
        <Field label="Input hover color">
          <div className="grid gap-2 sm:grid-cols-[64px_1fr]">
            <TextInput
              type="color"
              value={colorValue("controlHover", defaultAppTheme.controlHover ?? "#172033")}
              onChange={(event) => updateTheme({ controlHover: event.target.value }, ["controlHover"])}
              className="p-1"
            />
            <TextInput
              aria-label="Input hover hex"
              value={colorInputValue("controlHover", defaultAppTheme.controlHover ?? "#172033")}
              maxLength={7}
              onChange={(event) => updateColor("controlHover", event.target.value.trim())}
            />
          </div>
        </Field>
        <Field label="Border color">
          <div className="grid gap-2 sm:grid-cols-[64px_1fr]">
            <TextInput
              type="color"
              value={colorValue("controlBorder", defaultAppTheme.controlBorder ?? "#334155")}
              onChange={(event) => updateTheme({ controlBorder: event.target.value }, ["controlBorder"])}
              className="p-1"
            />
            <TextInput
              aria-label="Border hex"
              value={colorInputValue("controlBorder", defaultAppTheme.controlBorder ?? "#334155")}
              maxLength={7}
              onChange={(event) => updateColor("controlBorder", event.target.value.trim())}
            />
          </div>
        </Field>
        <Field label="Text color">
          <div className="grid gap-2 sm:grid-cols-[64px_1fr]">
            <TextInput
              type="color"
              value={colorValue("text", defaultAppTheme.text ?? "#f8fafc")}
              onChange={(event) => updateTheme({ text: event.target.value }, ["text"])}
              className="p-1"
            />
            <TextInput
              aria-label="Text hex"
              value={colorInputValue("text", defaultAppTheme.text ?? "#f8fafc")}
              maxLength={7}
              onChange={(event) => updateColor("text", event.target.value.trim())}
            />
          </div>
        </Field>
        <Field label="Muted text color">
          <div className="grid gap-2 sm:grid-cols-[64px_1fr]">
            <TextInput
              type="color"
              value={colorValue("muted", defaultAppTheme.muted ?? "#94a3b8")}
              onChange={(event) => updateTheme({ muted: event.target.value }, ["muted"])}
              className="p-1"
            />
            <TextInput
              aria-label="Muted text hex"
              value={colorInputValue("muted", defaultAppTheme.muted ?? "#94a3b8")}
              maxLength={7}
              onChange={(event) => updateColor("muted", event.target.value.trim())}
            />
          </div>
        </Field>
      </div>
      <ToggleRow
        title="Compact layout"
        description="Use tighter spacing for dashboards, tables, and repeated daily workflows."
        checked={theme.dense}
        onChange={(event) => updateTheme({ dense: event.currentTarget.checked })}
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => applyDerivedPalette("Dark")}>
          Preview dark palette
        </Button>
        <Button variant="secondary" onClick={() => applyDerivedPalette("Light")}>
          Preview light palette
        </Button>
      </div>

      <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--app-text)]">Live preview</p>
            <p className="app-tip mt-1 text-xs leading-5 text-[var(--app-muted)]">Shows background, panels, inputs, buttons, and text together.</p>
          </div>
          <span className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] px-2 py-1 text-xs font-semibold text-[var(--app-muted)]">
            {previewMode} preview
          </span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[preview.accent, preview.secondary, preview.surface, preview.background].map((color) => (
            <span key={color} className="h-10 rounded-md border border-[var(--app-control-border)]" style={{ backgroundColor: color }} />
          ))}
        </div>
        <div className="mt-4 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
          <p className="text-sm font-semibold text-[var(--app-text)]">Inventory card</p>
          <p className="app-tip mt-1 text-sm leading-5 text-[var(--app-muted)]">Muted text, borders, and controls should stay readable.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex min-h-9 items-center rounded-md border border-[var(--app-accent)] bg-[var(--app-accent)] px-3 text-sm font-semibold text-[var(--app-on-accent)]">
              Primary action
            </span>
            <span className="inline-flex min-h-9 items-center rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg-hover)] px-3 text-sm font-semibold text-[var(--app-control-text)]">
              Secondary action
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void saveTheme()}>Save named theme</Button>
        <Button variant="secondary" onClick={resetTheme}>
          Reset to default theme
        </Button>
      </div>
      {saveMessage ? <p className="text-sm font-semibold text-[var(--app-muted)]">{saveMessage}</p> : null}
      {savedThemes.length > 0 ? (
        <div className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
          <p className="text-sm font-semibold text-[var(--app-text)]">Saved themes</p>
          <div className="mt-3 grid gap-2">
            {savedThemes.map((savedTheme) => (
              <div
                key={savedTheme.name}
                className="grid gap-2 rounded-md border border-[var(--app-control-border)] bg-[var(--app-panel)] p-3 sm:grid-cols-[1fr_auto]"
              >
                <button type="button" className="text-left" onClick={() => applySavedTheme(savedTheme)}>
                  <span className="block text-sm font-semibold text-[var(--app-text)]">{savedTheme.name}</span>
                  <span className="mt-2 flex gap-2">
                    {[savedTheme.accent, savedTheme.secondary, savedTheme.background, savedTheme.panel].filter(Boolean).map((color) => (
                      <span
                        key={color}
                        className="h-6 w-6 rounded-md border border-[var(--app-control-border)]"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                </button>
                <Button variant="ghost" className="px-3" onClick={() => deleteSavedTheme(savedTheme.name)}>
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
