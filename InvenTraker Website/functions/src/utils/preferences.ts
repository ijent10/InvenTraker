export type PreferenceProfile = {
  theme: "light" | "dark" | "system"
  accentColor: string
  boldText: boolean
  showTips: boolean
}

export function resolvePreferenceProfile(other?: Partial<PreferenceProfile> | null): PreferenceProfile {
  return {
    theme: (other?.theme as PreferenceProfile["theme"] | undefined) ?? "dark",
    accentColor: other?.accentColor ?? "#2563EB",
    boldText: other?.boldText ?? false,
    showTips: other?.showTips ?? true
  }
}
