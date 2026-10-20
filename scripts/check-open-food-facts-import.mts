import assert from "node:assert/strict"

import { mergeDuplicateProduct, normalizeGtin, normalizeOpenFoodFactsProduct } from "../src/lib/open-food-facts-import.ts"

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
  selected_images: { ingredients: { display: { en: "https://images.openfoodfacts.org/ingredients.jpg" } } },
  last_modified_t: 1_700_000_000
}, importedAt)
assert.ok("record" in normalized)
if ("record" in normalized) {
  assert.equal(normalized.record.normalizedGtin, "00737628064502")
  assert.equal(normalized.stagingId, "gtin-00737628064502")
  assert.equal(normalized.record.marketPriority, 100)
  assert.equal(normalized.record.importedAt, importedAt)
  assert.equal((normalized.record.nutrition as { per100gOr100ml: { sodiumG: number } }).per100gOr100ml.sodiumG, 0.2)
  assert.deepEqual(normalized.record.imageUrls, ["https://images.openfoodfacts.org/test.jpg", "https://images.openfoodfacts.org/ingredients.jpg"])
  assert.equal("price" in normalized.record, false)
}

const nonfood = normalizeOpenFoodFactsProduct({ _id: "x", product_name: "Shampoo", categories_tags: ["en:cosmetics"] }, importedAt)
assert.equal("rejection" in nonfood && nonfood.rejection, "excluded:cosmetics")
const missingUpc = normalizeOpenFoodFactsProduct({ _id: "source-only", product_name: "Unidentified Soup" }, importedAt)
assert.equal("rejection" in missingUpc && missingUpc.rejection, "invalid_or_missing_upc")

const merged = mergeDuplicateProduct(
  { normalizedGtin: "00012345678905", productName: "Oat Cereal", ingredients: "", imageUrls: ["https://images.example/front.jpg"], nutrition: { per100gOr100ml: { proteinG: 4 } } },
  { normalizedGtin: "00012345678905", productName: "Oat Cereal New Name", ingredients: "Oats, salt", imageUrls: ["https://images.example/front.jpg", "https://images.example/label.jpg"], nutrition: { per100gOr100ml: { proteinG: 5, fiberG: 8 }, perServing: { proteinG: 2 } } }
)
assert.equal(merged.productName, undefined)
assert.equal(merged.ingredients, "Oats, salt")
assert.deepEqual(merged.imageUrls, ["https://images.example/front.jpg", "https://images.example/label.jpg"])
assert.deepEqual(merged.nutrition, { per100gOr100ml: { proteinG: 4, fiberG: 8 }, perServing: { proteinG: 2 } })

console.log("Open Food Facts normalization checks passed.")
