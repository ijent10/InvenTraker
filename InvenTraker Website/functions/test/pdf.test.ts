import { describe, expect, it } from "vitest"
import { buildHowToDraftFromText, extractHowToDraftFromPdf } from "../src/utils/pdf.js"

describe("pdf draft pipeline", () => {
  it("creates numbered steps from structured text", () => {
    const text = `How To Prep\n1. Open package\n2. Slice product\n3. Label and date`
    const draft = buildHowToDraftFromText(text, "Prep Guide")
    expect(draft.steps.length).toBeGreaterThanOrEqual(3)
    expect(draft.steps[0]?.stepNumber).toBe(1)
  })

  it("throws for non-pdf input bytes", async () => {
    await expect(extractHowToDraftFromPdf(Buffer.from("not-pdf"))).rejects.toBeTruthy()
  })

  it("splits flattened numbered prep instructions into ordered steps", () => {
    const text =
      '1 lay out 7” Cardboard Round white side up 2 Place 7” Pizza Crust on top of cardboard round 3 Using 1 oz Spoodle place Take & Bake Pizza Sauce onto center crust and spread evenly across surface of crust leaving ½” edge 4 Sprinkle 2 oz of Shredded Whole Milk Mozzarella Cheese onto pizza 5 Carefully seal pizza using Wrap and Heat Sealer 6 Place Made Fresh In Store Sticker on top of pizza in center; place Scale Label so scan bar is on bottom of pizza and description shows on top edge of pizza'

    const draft = buildHowToDraftFromText(text, "Pizza")
    expect(draft.steps).toHaveLength(6)
    expect(draft.steps[0]?.blocks[0]?.text).toContain('lay out 7” Cardboard Round')
    expect(draft.steps[1]?.blocks[0]?.text).toContain('Place 7” Pizza Crust')
    expect(draft.steps[2]?.blocks[0]?.text).toContain("Using 1 oz Spoodle")
    expect(draft.steps[3]?.blocks[0]?.text).toContain("Sprinkle 2 oz")
    expect(draft.steps[4]?.blocks[0]?.text).toContain("Carefully seal pizza")
    expect(draft.steps[5]?.blocks[0]?.text).toContain("Place Made Fresh In Store Sticker")
  })
})
