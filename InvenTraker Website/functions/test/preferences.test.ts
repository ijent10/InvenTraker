import { describe, expect, it } from "vitest"
import { resolvePreferenceProfile } from "../src/utils/preferences.js"

describe("preference profile resolver", () => {
  it("uses defaults when no source exists", () => {
    expect(resolvePreferenceProfile()).toEqual({
      theme: "dark",
      accentColor: "#2563EB",
      boldText: false,
      showTips: true
    })
  })

  it("clones existing source values", () => {
    expect(resolvePreferenceProfile({ theme: "light", accentColor: "#A855F7", boldText: true, showTips: false })).toEqual(
      {
        theme: "light",
        accentColor: "#A855F7",
        boldText: true,
        showTips: false
      }
    )
  })
})
