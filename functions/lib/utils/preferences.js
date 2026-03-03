export function resolvePreferenceProfile(other) {
    return {
        theme: other?.theme ?? "dark",
        accentColor: other?.accentColor ?? "#2563EB",
        boldText: other?.boldText ?? false,
        showTips: other?.showTips ?? true
    };
}
