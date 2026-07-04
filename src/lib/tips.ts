export const TIPS_STORAGE_KEY = "inventracker.showTips"
export const TIPS_EVENT = "inventracker:tips"

export function readStoredTipsPreference() {
  if (typeof window === "undefined") return true
  return window.localStorage.getItem(TIPS_STORAGE_KEY) !== "false"
}

export function applyTipsPreference(showTips: boolean) {
  if (typeof document === "undefined") return
  document.documentElement.dataset.showTips = showTips ? "true" : "false"
}

export function storeTipsPreference(showTips: boolean) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(TIPS_STORAGE_KEY, showTips ? "true" : "false")
  applyTipsPreference(showTips)
  window.dispatchEvent(new CustomEvent(TIPS_EVENT, { detail: { showTips } }))
}
