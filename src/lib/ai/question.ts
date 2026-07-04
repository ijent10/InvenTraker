const QUESTION_STOP_WORDS = [
  "is",
  "this",
  "it",
  "that",
  "item",
  "thing",
  "product",
  "kosher",
  "halal",
  "organic",
  "gluten",
  "free",
  "allergen",
  "allergens",
  "calorie",
  "calories",
  "nutrition",
  "nutritional",
  "protein",
  "carb",
  "carbs",
  "sodium",
  "salt",
  "fat",
  "sugar",
  "ingredients",
  "recall",
  "recalled",
  "safe",
  "image",
  "photo",
  "picture",
  "find",
  "show",
  "me",
  "what",
  "how",
  "many",
  "much",
  "does",
  "have",
  "where",
  "can",
  "you",
  "the",
  "a",
  "an",
  "for",
  "of",
  "about",
  "tell",
  "details",
  "facts"
]

export function extractProductQuery(question: string, fallback?: string) {
  if (fallback) return fallback

  const selected = question.match(/product selected:\s*([^\n(]+)/i)
  if (selected?.[1]) return selected[1].trim()

  const quoted = question.match(/["“](.+?)["”]/)
  if (quoted?.[1]) return quoted[1].trim()

  const words = question
    .replace(/[?.,:;!()]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !QUESTION_STOP_WORDS.includes(word.toLowerCase()))

  return words.join(" ").trim()
}

export function questionNeedsExternalProductLookup(question: string) {
  const normalized = question.toLowerCase()
  if (questionIsBroadProductFactSearch(question)) return false

  return [
    "kosher",
    "halal",
    "organic",
    "gluten",
    "allergen",
    "ingredients",
    "nutrition",
    "nutritional",
    "calorie",
    "calories",
    "protein",
    "carb",
    "carbs",
    "sodium",
    "salt",
    "fat",
    "sugar",
    "recall",
    "recalled",
    "image",
    "photo",
    "picture",
    "nation",
    "national",
    "supplier"
  ].some((term) => normalized.includes(term))
}

export function questionNeedsRecallLookup(question: string) {
  const normalized = question.toLowerCase()
  return ["recall", "recalled", "safety", "unsafe", "nationwide", "national"].some((term) => normalized.includes(term))
}

export const INVALID_ASSISTANT_RESPONSE = "Sorry, I can not help you with that. If you need help with your store, i can help."

export function isUnsafePersonalAssistantQuestion(question: string) {
  const normalized = question.toLowerCase()
  const asksForPerson = /\b(who|whose|sarah|employee|user|person|people|staff|worker|manager|cashier|clerk|ian)\b/.test(normalized)
  const identityField = /\b(employee id|employee number|email|phone|password|address|personal|identity|account|login)\b/.test(normalized)
  const taskOwner = /\b(who|whose)\b/.test(normalized) && /\b(ordered|submitted|completed|did|performed|received|wasted|restocked|checked)\b/.test(normalized)

  return identityField || (asksForPerson && taskOwner)
}

const STORE_ASSISTANT_TERMS = [
  "allergen",
  "allergens",
  "barcode",
  "back stock",
  "backstock",
  "category",
  "categories",
  "calorie",
  "calories",
  "carb",
  "carbs",
  "cost",
  "department",
  "display",
  "delivery",
  "expiration",
  "expire",
  "expired",
  "event",
  "events",
  "front stock",
  "frontstock",
  "gluten",
  "halal",
  "health check",
  "image",
  "ingredient",
  "ingredients",
  "inventory",
  "kosher",
  "label",
  "location",
  "menu",
  "nutrition",
  "nutritional",
  "order",
  "ordering",
  "organic",
  "par",
  "photo",
  "picture",
  "price",
  "protein",
  "product",
  "recall",
  "receive",
  "receiving",
  "reorder",
  "restock",
  "sales",
  "safety",
  "shrink",
  "sku",
  "sodium",
  "stock",
  "store",
  "sugar",
  "supplier",
  "traffic",
  "vendor",
  "waste",
  "weather",
  "holiday",
  "holidays",
  "file",
  "files",
  "document",
  "documents",
  "policy",
  "policies",
  "handbook",
  "dress code",
  "hoodie",
  "procedure",
  "procedures",
  "sop",
  "guide",
  "training",
  "safety sheet",
  "vendor sheet",
  "checklist",
  "summarize",
  "summary",
  "simplify",
  "simpler",
  "reword",
  "rewrite"
]

const HELP_TERMS = ["help", "what can you do", "how can you help", "what do you do"]

export function isStoreAssistantQuestion(question: string) {
  const normalized = question.toLowerCase().trim()
  if (!normalized) return false
  if (HELP_TERMS.some((term) => normalized.includes(term))) return true
  return STORE_ASSISTANT_TERMS.some((term) => normalized.includes(term))
}

export function questionNeedsProductIdentity(question: string) {
  const normalized = question.toLowerCase()
  if (questionIsBroadProductFactSearch(question)) return false

  const broadOperationsQuestion = [
    "what inventory",
    "which inventory",
    "low stock",
    "needs attention",
    "what stock",
    "what waste",
    "how should waste",
    "next order",
    "reorder today",
    "delivery",
    "weather",
    "holiday",
    "event"
  ].some((phrase) => normalized.includes(phrase))

  if (broadOperationsQuestion) return false

  return questionNeedsExternalProductLookup(question) || questionNeedsRecallLookup(question)
}

export function questionIsBroadProductFactSearch(question: string) {
  const normalized = question.toLowerCase()
  const asksForSet = [
    "what wine",
    "which wine",
    "kosher wine",
    "what product",
    "which product",
    "what item",
    "which item",
    "what inventory",
    "which inventory",
    "show me",
    "list",
    "do i have",
    "any kosher"
  ].some((phrase) => normalized.includes(phrase))

  const factSearch = ["kosher", "halal", "organic", "gluten free", "allergen"].some((term) => normalized.includes(term))

  return asksForSet && factSearch && !normalized.startsWith("is ")
}

export function extractBarcode(question: string) {
  return question.match(/\b\d{8,14}\b/)?.[0]
}
