import assert from "node:assert/strict"

import { normalizeGtin, normalizeOpenFoodFactsProduct } from "../src/lib/open-food-facts-import.ts"

assert.equal(normalizeGtin("0737628064502"), "00737628064502")
assert.equal(normalizeGtin("737628064502"), "00737628064502")
assert.equal(normalizeGtin("737628064503"), null)
assert.equal(normalizeGtin(737628064502), "00737628064502")

const importedAt = "2026-10-19T12:00:00.000Z"
const normalized = normalizeOpenFoodFactsProduct({
  _id: "0737628064502",
  code: "0737628064502",
  product_name: "Test Soup",
  brands: "Example Foods",
  countries_tags: ["en:united-states"],
  categories_tags: ["en:soups", "en:canned-foods"],
  ingredients_text: "Water, beans, salt",
  allergens_tags: ["en:celery"],
  serving_size: "1 cup (240 ml)",
  nutriments: { "energy-kcal_100g": 44, "sodium_100g": 0.2, "energy-kcal_serving": 106 },
  image_front_url: "https://images.openfoodfacts.org/test.jpg",
  last_modified_t: 1_700_000_000
}, importedAt)
assert.ok("record" in normalized)
if ("record" in normalized) {
  assert.equal(normalized.record.normalizedGtin, "00737628064502")
  assert.equal(normalized.record.marketPriority, 100)
  assert.equal(normalized.record.importedAt, importedAt)
  assert.equal((normalized.record.nutrition as { per100gOr100ml: { sodiumG: number } }).per100gOr100ml.sodiumG, 0.2)
  assert.equal("price" in normalized.record, false)
}

const nonfood = normalizeOpenFoodFactsProduct({ _id: "x", product_name: "Shampoo", categories_tags: ["en:cosmetics"] }, importedAt)
assert.equal("rejection" in nonfood && nonfood.rejection, "excluded:cosmetics")

console.log("Open Food Facts normalization checks passed.")
