import { describe, expect, it } from "vitest"
import { filterSafePatch } from "../src/utils/admin-safe-edit.js"

describe("admin safe edit whitelist", () => {
  it("keeps allowed item fields only", () => {
    const out = filterSafePatch("item", { upc: "01234", role: "Owner", price: 10 })
    expect(out).toEqual({ upc: "01234", price: 10 })
  })

  it("keeps allowed member fields only", () => {
    const out = filterSafePatch("member", { storeIds: ["store-1"], platformAdmin: true })
    expect(out).toEqual({ storeIds: ["store-1"] })
  })
})
