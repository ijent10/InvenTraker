"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { Button, StatusPill } from "@/components/ui"
import { readCloudWorkspacePreferences, writeCloudWorkspacePreferences } from "@/lib/cloud-preferences"
import {
  APP_THEME_EVENT,
  applyAndStoreAppTheme,
  readSavedAppThemes,
  readStoredAppTheme,
  storeSavedAppThemes,
  type AppTheme,
  type ThemeMode
} from "@/lib/theme"

type ThemePreset = Partial<Omit<AppTheme, "mode">> & {
  name: string
  mode: string
  accent: string
  secondary?: string
  background?: string
  backgroundSoft?: string
  surface: string
  panelStrong?: string
  controlBg?: string
  controlHover?: string
  controlBorder?: string
  text?: string
  muted?: string
  subtle?: string
  buttonText?: string
  detail: string
}

type ThemeCard = ThemePreset & {
  source: "Preset" | "Saved"
}

function safeMode(mode: string): ThemeMode {
  return mode === "Light" || mode === "Dark" || mode === "System" ? mode : "Dark"
}

function savedThemeToPreset(theme: AppTheme): ThemeCard {
  return {
    ...theme,
    name: theme.name ?? "Saved theme",
    mode: theme.mode,
    accent: theme.accent,
    secondary: theme.secondary,
    background: theme.background,
    backgroundSoft: theme.backgroundSoft,
    surface: theme.panel ?? theme.background ?? theme.accent,
    panelStrong: theme.panelStrong,
    controlBg: theme.controlBg,
    controlHover: theme.controlHover,
    controlBorder: theme.controlBorder,
    text: theme.text,
    muted: theme.muted,
    subtle: theme.subtle,
    buttonText: theme.buttonText,
    detail: "Saved personal theme. Use it now or edit it in the builder.",
    source: "Saved"
  }
}

function presetToTheme(preset: ThemePreset, currentTheme: AppTheme): AppTheme {
  return {
    name: preset.name,
    accent: preset.accent,
    secondary: preset.secondary ?? currentTheme.secondary,
    background: preset.background,
    backgroundSoft: preset.backgroundSoft,
    panel: preset.surface,
    panelStrong: preset.panelStrong,
    controlBg: preset.controlBg,
    controlHover: preset.controlHover,
    controlBorder: preset.controlBorder,
    text: preset.text,
    muted: preset.muted,
    subtle: preset.subtle,
    buttonText: preset.buttonText,
    mode: safeMode(preset.mode),
    dense: currentTheme.dense
  }
}

export function ThemePresetGrid({
  presets,
  defaultThemeName
}: {
  presets: ThemePreset[]
  defaultThemeName: string
}) {
  const [selectedTheme, setSelectedTheme] = useState(defaultThemeName)
  const [savedThemeCards, setSavedThemeCards] = useState<ThemeCard[]>([])

  useEffect(() => {
    function syncThemeSelection() {
      const storedTheme = readStoredAppTheme()
      if (storedTheme.name) setSelectedTheme(storedTheme.name)
      setSavedThemeCards(readSavedAppThemes().map(savedThemeToPreset))
    }

    syncThemeSelection()
    readCloudWorkspacePreferences()
      .then((preferences) => {
        if (!preferences?.savedThemes) return
        storeSavedAppThemes(preferences.savedThemes)
        setSavedThemeCards(preferences.savedThemes.map(savedThemeToPreset))
      })
      .catch(() => {
        setSavedThemeCards(readSavedAppThemes().map(savedThemeToPreset))
      })
    window.addEventListener(APP_THEME_EVENT, syncThemeSelection)
    return () => window.removeEventListener(APP_THEME_EVENT, syncThemeSelection)
  }, [])

  function choosePreset(preset: ThemePreset) {
    const currentTheme = readStoredAppTheme()
    setSelectedTheme(preset.name)
    const nextTheme = presetToTheme(preset, currentTheme)
    applyAndStoreAppTheme(nextTheme)
    void writeCloudWorkspacePreferences({ theme: nextTheme })
  }

  const savedThemeNames = new Set(savedThemeCards.map((theme) => theme.name))
  const allThemes: ThemeCard[] = [
    ...savedThemeCards,
    ...presets
      .filter((theme) => !savedThemeNames.has(theme.name))
      .map((theme) => ({
        ...theme,
        source: "Preset" as const
      }))
  ]

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {allThemes.map((theme) => {
        const selected = selectedTheme === theme.name

        return (
          <div
            key={theme.name}
            className={`rounded-md border p-4 text-left transition hover:border-[var(--app-accent)] hover:bg-[var(--app-control-bg-hover)] ${
              selected
                ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)]"
                : "border-[var(--app-control-border)] bg-[var(--app-control-bg)]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[var(--app-text)]">{theme.name}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusPill tone={theme.source === "Saved" ? "green" : "blue"}>{theme.source}</StatusPill>
                  <StatusPill>{theme.mode}</StatusPill>
                </div>
              </div>
              <span
                className={`mt-1 h-4 w-4 rounded-full border ${
                  selected ? "border-[var(--app-accent)] bg-[var(--app-accent)]" : "border-[var(--app-control-border)]"
                }`}
              />
            </div>
            <div className="mt-4 flex gap-2">
              <span className="h-8 w-8 rounded-md border border-[var(--app-control-border)]" style={{ backgroundColor: theme.accent }} />
              <span
                className="h-8 w-8 rounded-md border border-[var(--app-control-border)]"
                style={{ backgroundColor: theme.secondary ?? theme.accent }}
              />
              <span
                className="h-8 w-8 rounded-md border border-[var(--app-control-border)]"
                style={{ backgroundColor: theme.background ?? theme.surface }}
              />
              <span className="h-8 w-8 rounded-md border border-[var(--app-control-border)]" style={{ backgroundColor: theme.surface }} />
            </div>
            <p className="app-tip mt-3 text-sm leading-5 text-[var(--app-muted)]">{theme.detail}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button className="px-3" onClick={() => choosePreset(theme)}>
                Use theme
              </Button>
              <Link
                href="/account/theme-builder"
                onClick={() => choosePreset(theme)}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] px-3 text-sm font-semibold text-[var(--app-control-text)] transition hover:bg-[var(--app-control-bg-hover)]"
              >
                Edit
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}
