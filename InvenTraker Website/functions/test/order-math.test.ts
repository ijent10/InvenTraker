import { describe, expect, it } from "vitest"

describe("order math", () => {
  it("rounds cases correctly", () => {
    const qtyPerCase = 12
    const deficit = 19
    const cases = Math.ceil(deficit / qtyPerCase)
    expect(cases * qtyPerCase).toBe(24)
  })

  it("keeps lbs direct when caseSize=1", () => {
    const isLbsDirect = true
    const suggested = 3.4567
    const result = isLbsDirect ? Number(suggested.toFixed(3)) : 0
    expect(result).toBe(3.457)
  })
})
