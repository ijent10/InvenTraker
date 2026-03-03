import { describe, expect, it } from "vitest"
import { getModuleAccent } from "./theme.js"

describe("getModuleAccent", () => {
  it("locks semantic colors", () => {
    expect(getModuleAccent("waste", "#2563EB")).toBe("#EF4444")
    expect(getModuleAccent("received", "#2563EB")).toBe("#22C55E")
    expect(getModuleAccent("expiration", "#2563EB")).toBe("#F97316")
  })

  it("uses user accent for non-semantic modules", () => {
    expect(getModuleAccent("inventory", "#2563EB")).toBe("#2563EB")
  })
})
