export type ThemeMode = "Dark" | "Light" | "System"

export type AppTheme = {
  name?: string
  accent: string
  secondary: string
  background?: string
  backgroundSoft?: string
  panel?: string
  panelStrong?: string
  controlBg?: string
  controlHover?: string
  controlBorder?: string
  text?: string
  muted?: string
  subtle?: string
  buttonText?: string
  mode: ThemeMode
  dense: boolean
}

export const APP_THEME_STORAGE_KEY = "inventracker.personalTheme"
export const APP_SAVED_THEMES_STORAGE_KEY = "inventracker.savedThemes"
export const APP_THEME_EVENT = "inventracker-theme-change"

export const defaultAppTheme: AppTheme = {
  name: "Blue steel",
  accent: "#2563eb",
  secondary: "#14b8a6",
  background: "#020617",
  backgroundSoft: "#0f172a",
  panel: "#0f172a",
  panelStrong: "#111827",
  controlBg: "#020617",
  controlHover: "#172033",
  controlBorder: "#334155",
  text: "#f8fafc",
  muted: "#94a3b8",
  subtle: "#64748b",
  buttonText: "#ffffff",
  mode: "Dark",
  dense: false
}

export function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

function normalizeHex(value: string, fallback: string) {
  return isHexColor(value) ? value : fallback
}

export function darken(hex: string, amount: number) {
  const normalized = hex.replace("#", "")
  if (normalized.length !== 6) return hex
  const parts = [0, 2, 4].map((start) => Number.parseInt(normalized.slice(start, start + 2), 16))
  const darkened = parts.map((part) => Math.max(0, Math.round(part * (1 - amount))))
  return `#${darkened.map((part) => part.toString(16).padStart(2, "0")).join("")}`
}

export function hexToSoft(hex: string, opacity: number) {
  const normalized = hex.replace("#", "")
  if (normalized.length !== 6) return `rgba(37, 99, 235, ${opacity})`
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

export function mixHex(hex: string, target: string, amount: number) {
  const source = normalizeHex(hex, defaultAppTheme.accent).replace("#", "")
  const destination = normalizeHex(target, "#ffffff").replace("#", "")
  const mixed = [0, 2, 4].map((start) => {
    const sourcePart = Number.parseInt(source.slice(start, start + 2), 16)
    const destinationPart = Number.parseInt(destination.slice(start, start + 2), 16)
    return Math.round(sourcePart * (1 - amount) + destinationPart * amount)
  })

  return `#${mixed.map((part) => part.toString(16).padStart(2, "0")).join("")}`
}

export function contrastTextFor(hex: string) {
  const normalized = normalizeHex(hex, defaultAppTheme.accent).replace("#", "")
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.58 ? "#0f172a" : "#ffffff"
}

export function deriveThemePalette(theme: AppTheme, mode: ThemeMode = theme.mode === "System" ? "Dark" : theme.mode): AppTheme {
  const accent = normalizeHex(theme.accent, defaultAppTheme.accent)
  const secondary = normalizeHex(theme.secondary, defaultAppTheme.secondary)

  if (mode === "Light") {
    return {
      ...theme,
      mode,
      background: mixHex(accent, "#ffffff", 0.94),
      backgroundSoft: mixHex(secondary, "#ffffff", 0.86),
      panel: "#ffffff",
      panelStrong: mixHex(accent, "#ffffff", 0.98),
      controlBg: "#ffffff",
      controlHover: mixHex(accent, "#ffffff", 0.9),
      controlBorder: mixHex(accent, "#cbd5e1", 0.68),
      text: "#0f172a",
      muted: "#475569",
      subtle: "#64748b",
      buttonText: contrastTextFor(accent)
    }
  }

  return {
    ...theme,
    mode,
    background: darken(accent, 0.91),
    backgroundSoft: darken(secondary, 0.78),
    panel: darken(accent, 0.8),
    panelStrong: darken(accent, 0.72),
    controlBg: darken(accent, 0.87),
    controlHover: darken(secondary, 0.72),
    controlBorder: mixHex(accent, "#ffffff", 0.22),
    text: "#f8fafc",
    muted: mixHex(secondary, "#ffffff", 0.58),
    subtle: mixHex(accent, "#ffffff", 0.42),
    buttonText: contrastTextFor(accent)
  }
}

function resolveMode(mode: ThemeMode) {
  if (mode !== "System") return mode
  if (typeof window === "undefined") return "Dark"
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "Light" : "Dark"
}

function coerceTheme(theme: Partial<AppTheme> | undefined, fallback = defaultAppTheme): AppTheme {
  const optionalColor = (value: string | undefined, fallbackValue: string | undefined) =>
    value === undefined ? fallbackValue : normalizeHex(value, fallbackValue ?? defaultAppTheme.accent)

  return {
    name: theme?.name ?? fallback.name,
    accent: normalizeHex(theme?.accent ?? fallback.accent, fallback.accent),
    secondary: normalizeHex(theme?.secondary ?? fallback.secondary, fallback.secondary),
    background: optionalColor(theme?.background, fallback.background),
    backgroundSoft: optionalColor(theme?.backgroundSoft, fallback.backgroundSoft),
    panel: optionalColor(theme?.panel, fallback.panel),
    panelStrong: optionalColor(theme?.panelStrong, fallback.panelStrong),
    controlBg: optionalColor(theme?.controlBg, fallback.controlBg),
    controlHover: optionalColor(theme?.controlHover, fallback.controlHover),
    controlBorder: optionalColor(theme?.controlBorder, fallback.controlBorder),
    text: optionalColor(theme?.text, fallback.text),
    muted: optionalColor(theme?.muted, fallback.muted),
    subtle: optionalColor(theme?.subtle, fallback.subtle),
    buttonText: optionalColor(theme?.buttonText, fallback.buttonText),
    mode: theme?.mode === "Light" || theme?.mode === "Dark" || theme?.mode === "System" ? theme.mode : fallback.mode,
    dense: Boolean(theme?.dense ?? fallback.dense)
  }
}

export function readStoredAppTheme(fallback = defaultAppTheme): AppTheme {
  if (typeof window === "undefined") return fallback

  try {
    const raw = window.localStorage.getItem(APP_THEME_STORAGE_KEY)
    if (!raw) return fallback
    return coerceTheme(JSON.parse(raw) as Partial<AppTheme>, fallback)
  } catch {
    return fallback
  }
}

export function storeAppTheme(theme: AppTheme) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(APP_THEME_STORAGE_KEY, JSON.stringify(coerceTheme(theme)))
}

export function readSavedAppThemes(): AppTheme[] {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(APP_SAVED_THEMES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((theme) => coerceTheme(theme as Partial<AppTheme>))
  } catch {
    return []
  }
}

export function storeSavedAppThemes(themes: AppTheme[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(APP_SAVED_THEMES_STORAGE_KEY, JSON.stringify(themes.map((theme) => coerceTheme(theme))))
}

export function saveNamedAppTheme(theme: AppTheme) {
  const safeTheme = coerceTheme(theme)
  const existingThemes = readSavedAppThemes()
  const nextThemes = [safeTheme, ...existingThemes.filter((candidate) => candidate.name !== safeTheme.name)].slice(0, 24)
  storeSavedAppThemes(nextThemes)
  return nextThemes
}

export function applyAppTheme(theme: AppTheme) {
  if (typeof document === "undefined") return

  const safeTheme = coerceTheme(theme)
  const mode = resolveMode(safeTheme.mode)
  const root = document.documentElement
  const accent = mode === "Dark" ? darken(safeTheme.accent, 0.08) : safeTheme.accent
  const accentStrong = mode === "Dark" ? darken(safeTheme.accent, 0.26) : darken(safeTheme.accent, 0.12)
  const soft = hexToSoft(safeTheme.accent, mode === "Dark" ? 0.22 : 0.14)

  root.style.setProperty("--app-accent", accent)
  root.style.setProperty("--app-accent-strong", accentStrong)
  root.style.setProperty("--app-accent-soft", soft)
  root.style.setProperty("--app-secondary", safeTheme.secondary)

  if (mode === "Light") {
    root.style.setProperty("--app-bg", safeTheme.background ?? "#f8fafc")
    root.style.setProperty("--app-bg-soft", safeTheme.backgroundSoft ?? mixHex(safeTheme.accent, "#ffffff", 0.9))
    root.style.setProperty("--app-panel", hexToSoft(safeTheme.panel ?? "#ffffff", 0.9))
    root.style.setProperty("--app-panel-strong", hexToSoft(safeTheme.panelStrong ?? safeTheme.panel ?? "#ffffff", 0.98))
    root.style.setProperty("--app-border", safeTheme.controlBorder ?? mixHex(safeTheme.accent, "#cbd5e1", 0.82))
    root.style.setProperty("--app-control-bg", safeTheme.controlBg ?? "#ffffff")
    root.style.setProperty("--app-control-bg-hover", safeTheme.controlHover ?? mixHex(safeTheme.accent, "#ffffff", 0.93))
    root.style.setProperty("--app-control-border", safeTheme.controlBorder ?? mixHex(safeTheme.accent, "#cbd5e1", 0.72))
    root.style.setProperty("--app-control-text", safeTheme.text ?? "#0f172a")
    root.style.setProperty("--app-text", safeTheme.text ?? "#0f172a")
    root.style.setProperty("--app-muted", safeTheme.muted ?? "#475569")
    root.style.setProperty("--app-subtle", safeTheme.subtle ?? "#64748b")
    root.style.setProperty("--app-on-accent", safeTheme.buttonText ?? "#ffffff")
    root.dataset.themeMode = "light"
  } else {
    root.style.setProperty("--app-bg", safeTheme.background ?? darken(safeTheme.accent, 0.91))
    root.style.setProperty("--app-bg-soft", safeTheme.backgroundSoft ?? darken(safeTheme.accent, 0.78))
    root.style.setProperty("--app-panel", hexToSoft(safeTheme.panel ?? "#0f172a", 0.78))
    root.style.setProperty("--app-panel-strong", hexToSoft(safeTheme.panelStrong ?? safeTheme.panel ?? "#0f172a", 0.94))
    root.style.setProperty("--app-border", safeTheme.controlBorder ?? darken(safeTheme.accent, 0.62))
    root.style.setProperty("--app-control-bg", safeTheme.controlBg ?? "rgba(2, 6, 23, 0.72)")
    root.style.setProperty("--app-control-bg-hover", safeTheme.controlHover ?? "rgba(15, 23, 42, 0.92)")
    root.style.setProperty("--app-control-border", safeTheme.controlBorder ?? darken(safeTheme.accent, 0.56))
    root.style.setProperty("--app-control-text", safeTheme.text ?? "#f8fafc")
    root.style.setProperty("--app-text", safeTheme.text ?? "#f8fafc")
    root.style.setProperty("--app-muted", safeTheme.muted ?? "#94a3b8")
    root.style.setProperty("--app-subtle", safeTheme.subtle ?? "#64748b")
    root.style.setProperty("--app-on-accent", safeTheme.buttonText ?? "#ffffff")
    root.dataset.themeMode = "dark"
  }

  root.dataset.themePreference = safeTheme.mode.toLowerCase()
  root.dataset.density = safeTheme.dense ? "compact" : "comfortable"
}

export function applyAndStoreAppTheme(theme: AppTheme) {
  const safeTheme = coerceTheme(theme)
  applyAppTheme(safeTheme)
  storeAppTheme(safeTheme)
  window.dispatchEvent(new CustomEvent(APP_THEME_EVENT, { detail: safeTheme }))
}
