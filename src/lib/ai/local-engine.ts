import { buildImageCandidates } from "@/lib/ai/product-intelligence"
import { productHasKosherEvidence } from "@/lib/ai/external-sources"
import type {
  AiAnswer,
  AiOperationalContext,
  AssistantProductMemory,
  AiSource,
  ExternalProductMatch,
  NutritionFacts,
  NutritionValues,
  ProductEvidence,
  RecallMatch
} from "@/lib/ai/types"

function isProductEvidence(value: unknown): value is ProductEvidence {
  return Boolean(value && typeof value === "object" && "kosherStatus" in value && "productName" in value)
}

function localInventorySource(productName?: string): AiSource {
  return {
    id: productName ? `local-inventory-${productName.toLowerCase().replace(/\s+/g, "-")}` : "local-inventory",
    label: "Local inventory snapshot",
    type: "local_inventory",
    detail: productName ? `Current local stock and store-level fields for ${productName}.` : "Current local stock, par, reorder, and vendor data."
  }
}

function operationsSource(): AiSource {
  return {
    id: "local-operations",
    label: "Local operations context",
    type: "operations",
    detail: "Inventory, waste, reorder thresholds, and store signals from the active workspace."
  }
}

function assistantMemorySource(memory: AssistantProductMemory): AiSource {
  return {
    id: `assistant-memory-${memory.id}`,
    label: "Assistant product memory",
    type: "product_profile",
    detail: memory.summary
  }
}

function externalProductSource(match: ExternalProductMatch): AiSource {
  return {
    id: `open-food-facts-${match.barcode ?? match.name.toLowerCase().replace(/\s+/g, "-")}`,
    label: "Open Food Facts",
    type: "external_search",
    detail: match.brand ? `${match.name} by ${match.brand}` : match.name,
    url: match.sourceUrl
  }
}

function normalizeText(value: string | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function productMemoryMatches(memory: AssistantProductMemory, productName?: string, sku?: string) {
  const normalizedName = normalizeText(productName)
  const normalizedSku = normalizeText(sku)

  return Boolean(
    (normalizedSku && normalizeText(memory.sku) === normalizedSku) ||
      (normalizedName && normalizeText(memory.productName) === normalizedName) ||
      (normalizedName && normalizeText(memory.productName).includes(normalizedName)) ||
      (normalizedName && normalizedName.includes(normalizeText(memory.productName)))
  )
}

function findAssistantMemoryForProduct(
  context: AiOperationalContext,
  factType: AssistantProductMemory["factType"],
  productName?: string,
  sku?: string
) {
  return context.assistantMemory
    .filter((memory) => memory.factType === factType)
    .filter((memory) => productMemoryMatches(memory, productName, sku))
    .sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0))[0]
}

function kosherMemoryStatusLabel(value: string) {
  if (value === "verified") return "verified kosher"
  if (value === "not_verified") return "not verified kosher"
  if (value === "not_recorded") return "kosher certification not recorded"
  return "unknown kosher status"
}

function answerKosherFromMemory(
  memory: AssistantProductMemory,
  product: ProductEvidence | undefined,
  externalProducts: ExternalProductMatch[] = [],
  recallMatches: RecallMatch[] = []
): AiAnswer {
  const verified = memory.normalizedValue === "verified"

  return {
    mode: "local",
    answer: verified
      ? `${memory.productName} has stored product evidence for kosher status. I would still keep the certification source or package mark on file before using it in customer-facing material.`
      : `${memory.productName} is ${kosherMemoryStatusLabel(memory.normalizedValue)} in stored product evidence. I would not tell a customer it is kosher until a supplier record, package mark, or certification database confirms it.`,
    confidence: verified ? memory.confidence : "low",
    productName: memory.productName,
    quickFacts: [
      `Kosher status: ${memory.normalizedValue.replace("_", " ")}`,
      ...memory.evidence.slice(0, 4),
      product?.allergens.length ? `Allergens: ${product.allergens.join(", ")}` : undefined
    ].filter((fact): fact is string => Boolean(fact)),
    recommendedActions: verified
      ? ["Confirm the certification source is still current", "Keep the source and approval date attached to the product record"]
      : ["Check the package for a kosher mark", "Ask the supplier for certification", "Update product evidence after verification"],
    sources: [assistantMemorySource(memory), ...(product?.sources ?? []), ...externalProducts.map(externalProductSource), ...recallMatches.map(recallSource)],
    imageCandidates: [...imageCandidatesFromExternal(externalProducts), ...buildImageCandidates(memory.productName, memory.sku)],
    externalProducts,
    recallMatches
  }
}

function recallSource(match: RecallMatch): AiSource {
  return {
    id: `open-fda-${match.reportDate ?? match.productDescription.slice(0, 24)}`,
    label: "openFDA food enforcement",
    type: "national_signal",
    detail: match.classification ? `${match.classification}: ${match.productDescription}` : match.productDescription,
    url: match.sourceUrl
  }
}

function imageCandidatesFromExternal(matches: ExternalProductMatch[]) {
  return matches
    .filter((match) => match.imageUrl)
    .map((match) => ({
      title: match.brand ? `${match.name} by ${match.brand}` : match.name,
      query: [match.name, match.barcode].filter(Boolean).join(" "),
      reason: "Image URL found in Open Food Facts and should be reviewed before becoming the official product image.",
      source: "open_food_facts" as const,
      imageUrl: match.imageUrl,
      sourceUrl: match.sourceUrl
    }))
}

function formatNutritionValues(values: NutritionValues | undefined) {
  if (!values) return undefined

  return [
    typeof values.caloriesKcal === "number" ? `${values.caloriesKcal} kcal` : undefined,
    typeof values.fatG === "number" ? `${values.fatG}g fat` : undefined,
    typeof values.carbohydratesG === "number" ? `${values.carbohydratesG}g carbs` : undefined,
    typeof values.sugarsG === "number" ? `${values.sugarsG}g sugars` : undefined,
    typeof values.proteinG === "number" ? `${values.proteinG}g protein` : undefined,
    typeof values.sodiumMg === "number" ? `${values.sodiumMg}mg sodium` : undefined
  ]
    .filter((value): value is string => Boolean(value))
    .join(", ")
}

function nutritionFactsSummary(nutrition: NutritionFacts | undefined) {
  if (!nutrition) return undefined

  const perServing = formatNutritionValues(nutrition.perServing)
  const per100g = formatNutritionValues(nutrition.per100g)

  if (perServing && nutrition.servingSize) return `Per ${nutrition.servingSize}: ${perServing}`
  if (perServing) return `Per serving: ${perServing}`
  if (per100g) return `Per 100g: ${per100g}`
  return undefined
}

function questionIsNutritionRelated(question: string) {
  const normalized = question.toLowerCase()
  return [
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
    "ingredient",
    "ingredients",
    "allergen",
    "allergens"
  ].some((term) => normalized.includes(term))
}

function answerNutritionQuestion(
  product: ProductEvidence | undefined,
  externalProducts: ExternalProductMatch[] = [],
  recallMatches: RecallMatch[] = []
): AiAnswer {
  const externalWithNutrition = externalProducts.filter((match) => match.nutrition)
  const bestExternal = externalWithNutrition[0]
  const storedNutritionSummary = nutritionFactsSummary(product?.nutrition)
  const externalNutritionSummary = nutritionFactsSummary(bestExternal?.nutrition)
  const ingredients = bestExternal?.ingredientsText
  const allergens = bestExternal?.allergens ?? product?.allergens ?? []

  if (storedNutritionSummary || externalNutritionSummary || ingredients || allergens.length > 0) {
    return {
      mode: "local",
      answer: externalNutritionSummary
        ? `${bestExternal?.name ?? product?.productName ?? "This product"} has public nutrition data available from Open Food Facts. Treat it as an assistant autofill candidate until a permitted user verifies the label against the package or supplier record.`
        : `${product?.productName ?? "This product"} has partial product detail evidence, but the nutrition label is not complete yet. Any missing values should stay pending until reviewed.`,
      confidence: externalNutritionSummary ? "medium" : "low",
      productName: product?.productName ?? bestExternal?.name,
      quickFacts: [
        externalNutritionSummary ?? storedNutritionSummary,
        bestExternal?.nutrition?.nutriScoreGrade ? `Nutri-Score: ${bestExternal.nutrition.nutriScoreGrade.toUpperCase()}` : undefined,
        bestExternal?.nutrition?.novaGroup ? `NOVA group: ${bestExternal.nutrition.novaGroup}` : undefined,
        ingredients ? `Ingredients: ${ingredients.slice(0, 180)}${ingredients.length > 180 ? "..." : ""}` : undefined,
        allergens.length > 0 ? `Allergens listed: ${allergens.join(", ")}` : "No allergens listed in matched sources"
      ].filter((fact): fact is string => Boolean(fact)),
      recommendedActions: [
        "Send nutrition, ingredients, allergens, and image fields to Pending review",
        "Compare the proposed values against the product label or supplier sheet",
        "Only approve customer-facing nutrition facts after a permitted reviewer verifies them"
      ],
      sources: [
        ...(product?.sources ?? []),
        ...externalProducts.map(externalProductSource),
        ...recallMatches.map(recallSource)
      ],
      imageCandidates: [...imageCandidatesFromExternal(externalProducts), ...buildImageCandidates(bestExternal?.name ?? product?.productName ?? "product", bestExternal?.barcode ?? product?.sku)],
      externalProducts,
      recallMatches
    }
  }

  return {
    mode: "local",
    answer:
      "I could not find enough nutrition, ingredient, or allergen data for that product yet. I can still create a pending autofill request once you provide a stronger product name or barcode.",
    confidence: "low",
    productName: product?.productName,
    quickFacts: ["No nutrition label returned", "Nutrition values must be verified before saving"],
    recommendedActions: ["Ask again with the barcode or exact package name", "Upload a package label or supplier sheet", "Keep the product in Pending until reviewed"],
    sources: [...(product?.sources ?? [operationsSource()]), ...externalProducts.map(externalProductSource), ...recallMatches.map(recallSource)],
    imageCandidates: imageCandidatesFromExternal(externalProducts),
    externalProducts,
    recallMatches
  }
}

function answerKosherQuestion(
  product: ProductEvidence | undefined,
  externalProducts: ExternalProductMatch[] = [],
  recallMatches: RecallMatch[] = [],
  context?: AiOperationalContext,
  resolvedProductName?: string,
  resolvedSku?: string
): AiAnswer {
  const kosherExternalMatches = externalProducts.filter(productHasKosherEvidence)

  if (kosherExternalMatches.length > 0) {
    const bestMatch = kosherExternalMatches[0]
    const externalFacts = [
      bestMatch.brand ? `Brand: ${bestMatch.brand}` : undefined,
      bestMatch.barcode ? `Barcode: ${bestMatch.barcode}` : undefined,
      bestMatch.labels.length > 0 ? `Labels include: ${bestMatch.labels.slice(0, 6).join(", ")}` : undefined,
      bestMatch.allergens.length > 0 ? `Allergens: ${bestMatch.allergens.join(", ")}` : undefined
    ].filter((fact): fact is string => Boolean(fact))

    return {
      mode: "local",
      answer: `${bestMatch.name} has external product evidence that includes a kosher label. I would treat this as a strong lead, but I would still store the package mark, supplier sheet, or certification agency before making customer-facing claims.`,
      confidence: "medium",
      productName: product?.productName ?? bestMatch.name,
      quickFacts: ["Kosher evidence found externally", ...externalFacts],
      recommendedActions: [
        "Review the product image or package label",
        "Store certification source and date on the product record",
        "Ask a manager to approve the compliance claim before publishing it"
      ],
      sources: [...(product?.sources ?? []), ...kosherExternalMatches.map(externalProductSource), ...recallMatches.map(recallSource)],
      imageCandidates: [...imageCandidatesFromExternal(externalProducts), ...buildImageCandidates(bestMatch.name, bestMatch.barcode)],
      externalProducts,
      recallMatches
    }
  }

  const memory = context
    ? findAssistantMemoryForProduct(context, "kosher_status", product?.productName ?? resolvedProductName, product?.sku ?? resolvedSku)
    : undefined

  if (memory) {
    return answerKosherFromMemory(memory, product, externalProducts, recallMatches)
  }

  if (!product) {
    return {
      mode: "local",
      answer: externalProducts.length > 0
        ? "I found external product matches, but none of the matched records include kosher evidence. That means kosher status is not verified here, not that the product is definitely not kosher."
        : "I do not have a matching local or external product record yet, so I cannot verify whether that product is kosher. Add the product, supplier, SKU/barcode, and certification source first, then I can answer with evidence.",
      confidence: "low",
      quickFacts: [
        externalProducts.length > 0 ? `${externalProducts.length} external product match${externalProducts.length === 1 ? "" : "es"} checked` : "No product match",
        "Kosher answers require supplier, package, or certification evidence"
      ],
      recommendedActions: ["Add the product to the catalog", "Attach supplier data or a certification source", "Re-run the product check"],
      sources: [operationsSource(), ...externalProducts.map(externalProductSource), ...recallMatches.map(recallSource)],
      imageCandidates: imageCandidatesFromExternal(externalProducts),
      externalProducts,
      recallMatches
    }
  }

  const statusMessage = {
    verified: `${product.productName} is marked kosher in the local product evidence record.`,
    not_verified: `${product.productName} is marked as not verified for kosher status in the local product evidence record.`,
    not_recorded: `${product.productName} does not have kosher certification recorded yet. I would not tell a customer it is kosher until a supplier record, package mark, or certification database confirms it.`,
    not_applicable: `${product.productName} does not have an applicable kosher status in the local product evidence record.`
  }[product.kosherStatus]

  return {
    mode: "local",
    answer: statusMessage,
    confidence: product.kosherStatus === "verified" ? "high" : "low",
    productName: product.productName,
    quickFacts: [
      `Kosher status: ${product.kosherStatus.replace("_", " ")}`,
      product.allergens.length > 0 ? `Allergens: ${product.allergens.join(", ")}` : "No allergens recorded",
      ...product.dietaryNotes.slice(0, 2)
    ],
    recommendedActions: [
      "Store certification source, certifying agency, and package photo on the product record",
      "Require source-backed verification before customer-facing dietary claims",
      "Review national product matches before approving customer-facing claims"
    ],
    sources: [...product.sources, ...externalProducts.map(externalProductSource), ...recallMatches.map(recallSource)],
    imageCandidates: [...imageCandidatesFromExternal(externalProducts), ...buildImageCandidates(product.productName, product.sku)],
    externalProducts,
    recallMatches
  }
}

function questionIsBroadKosherSearch(normalized: string) {
  if (!normalized.includes("kosher")) return false
  if (normalized.startsWith("is ")) return false
  if (normalized.includes("product selected:")) return false

  return [
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
}

function inventoryItemMatchesBroadQuery(item: AiOperationalContext["inventory"][number], normalized: string) {
  const haystack = normalizeText([item.name, item.sku, item.department, item.category, item.vendor].join(" "))

  if (normalized.includes("wine")) {
    return haystack.includes("wine") || haystack.includes("cabernet") || haystack.includes("pinot") || haystack.includes("chardonnay")
  }

  if (normalized.includes("beer")) return haystack.includes("beer") || haystack.includes("ipa") || haystack.includes("lager") || haystack.includes("ale")
  if (normalized.includes("bakery") || normalized.includes("baker")) return haystack.includes("bakery") || haystack.includes("bread") || haystack.includes("cookie")
  if (normalized.includes("produce")) return haystack.includes("produce") || haystack.includes("fruit") || haystack.includes("vegetable")
  if (normalized.includes("grocery")) return haystack.includes("grocery")

  return true
}

function answerKosherInventorySearch(context: AiOperationalContext, normalized: string): AiAnswer {
  const scopedInventory = context.inventory.filter((item) => item.status !== "Archived" && inventoryItemMatchesBroadQuery(item, normalized))
  const rows = scopedInventory.map((item) => ({
    item,
    memory: findAssistantMemoryForProduct(context, "kosher_status", item.name, item.sku)
  }))
  const verified = rows.filter((row) => row.memory?.normalizedValue === "verified")
  const notVerified = rows.filter((row) => row.memory && row.memory.normalizedValue !== "verified")
  const unknown = rows.filter((row) => !row.memory)
  const memorySources = rows.flatMap((row) => (row.memory ? [assistantMemorySource(row.memory)] : []))
  const dedupedMemorySources = Array.from(new Map(memorySources.map((source) => [source.id, source])).values())

  return {
    mode: "local",
    answer:
      verified.length > 0
        ? `I found ${verified.length} active item${verified.length === 1 ? "" : "s"} with stored kosher evidence: ${verified.map((row) => row.item.name).join(", ")}.`
        : scopedInventory.length > 0
          ? `I do not have any active matching item marked as verified kosher yet. I checked ${scopedInventory.length} matching item${scopedInventory.length === 1 ? "" : "s"} and found ${notVerified.length} not verified plus ${unknown.length} still unknown.`
          : "I could not find matching active inventory for that kosher search.",
    confidence: verified.length > 0 ? "medium" : "low",
    quickFacts: [
      `${scopedInventory.length} matching active inventory item${scopedInventory.length === 1 ? "" : "s"}`,
      `${verified.length} verified kosher from stored product evidence`,
      `${notVerified.length} not verified or not recorded`,
      `${unknown.length} without assistant memory yet`,
      notVerified.length > 0
        ? `Not verified: ${notVerified
            .slice(0, 5)
            .map((row) => row.item.name)
            .join(", ")}`
        : undefined,
      unknown.length > 0
        ? `Needs verification: ${unknown
            .slice(0, 5)
            .map((row) => row.item.name)
            .join(", ")}`
        : undefined
    ].filter((fact): fact is string => Boolean(fact)),
    recommendedActions: [
      "Verify unknown items by supplier sheet, package mark, or certification source",
      "Ask the assistant about an exact product to refresh its product memory",
      "Attach approved certification evidence before using kosher claims publicly"
    ],
    sources: [operationsSource(), localInventorySource(), ...dedupedMemorySources],
    imageCandidates: [],
    externalProducts: [],
    recallMatches: []
  }
}

function answerInventoryQuestion(context: AiOperationalContext, recallMatches: RecallMatch[] = []): AiAnswer {
  const lowStock = context.inventory.filter((item) => item.onHand <= item.reorderPoint)
  const wasteLines = context.waste.map((item) => `${item.quantity} ${item.unit} ${item.productName} (${item.reason})`)
  const awareness = context.orderingAwareness
  const weatherFacts =
    awareness?.weather.slice(0, 3).map((day) => {
      const pieces = [
        day.temperatureMaxF ? `${Math.round(day.temperatureMaxF)}F high` : undefined,
        typeof day.precipitationIn === "number" ? `${day.precipitationIn.toFixed(2)}in precip` : undefined
      ].filter(Boolean)
      return `${day.date}: ${pieces.join(", ")}`
    }) ?? []
  const holidayFacts = awareness?.holidays.map((holiday) => `${holiday.date}: ${holiday.localName}`) ?? []

  return {
    mode: "local",
    answer:
      lowStock.length === 0
        ? "Local inventory does not currently show any items below reorder point. Waste should still be reviewed before placing orders."
        : `Local inventory shows ${lowStock.length} item${lowStock.length === 1 ? "" : "s"} at or below reorder point. The strongest action right now is to review ${lowStock.map((item) => item.name).join(", ")} before drafting orders, then adjust quantities using post-delivery weather, holiday, traffic, waste, and event signals.`,
    confidence: "medium",
    quickFacts: [
      `${context.centralCatalog.length} central catalog records loaded`,
      `${context.organizationProducts.length} organization product references loaded`,
      `${context.inventory.length} inventory records loaded`,
      `${lowStock.length} low-stock records`,
      wasteLines.length > 0 ? `Recent waste: ${wasteLines.join("; ")}` : "No recent waste records loaded",
      awareness ? `Ordering window: ${awareness.forecastWindow.start} through ${awareness.forecastWindow.end}` : "Ordering awareness was not available",
      ...weatherFacts,
      holidayFacts.length > 0 ? `Holidays: ${holidayFacts.join("; ")}` : "No public holidays found in the post-delivery window"
    ],
    recommendedActions: [
      "Compare low-stock items against waste before ordering",
      "Prioritize items below reorder point with low back stock",
      ...(awareness?.trafficHeuristics ?? []),
      "Check nearby events through the web-search/event connector before finalizing high-volume fresh, beverage, and ready-to-eat orders",
      "Save ordering decisions and outcomes so future recommendations can learn from what happened"
    ],
    sources: [localInventorySource(), operationsSource(), ...recallMatches.map(recallSource)],
    imageCandidates: [],
    recallMatches
  }
}

function answerImageQuestion(product: ProductEvidence | undefined, question: string, externalProducts: ExternalProductMatch[] = []): AiAnswer {
  const questionName = question.replace(/image|photo|picture|find|sku/gi, "").trim()
  const name = product?.productName ?? (questionName || "product")
  const externalImages = imageCandidatesFromExternal(externalProducts)

  return {
    mode: "local",
    answer: externalImages.length > 0
      ? "I found external product image candidates. Review the image before saving it as the official product photo."
      : "I prepared product-image search candidates. The next step is to connect an external image/search provider or supplier source so the system can fetch and store reviewed product images automatically.",
    confidence: externalImages.length > 0 || product ? "medium" : "low",
    productName: product?.productName,
    quickFacts: [
      product?.sku ? `SKU hint: ${product.sku}` : "No SKU matched from local catalog",
      externalImages.length > 0 ? `${externalImages.length} external image candidate${externalImages.length === 1 ? "" : "s"} found` : "No external image URL found yet",
      "Image candidates should be reviewed before becoming the official product image"
    ],
    recommendedActions: [
      "Search exact product name plus SKU first",
      "Store the approved image URL on the product record",
      "Keep supplier images preferred over generic marketplace images"
    ],
    sources: [...(product?.sources ?? [operationsSource()]), ...externalProducts.map(externalProductSource)],
    imageCandidates: [...externalImages, ...buildImageCandidates(name, product?.sku)],
    externalProducts
  }
}

export function answerWithLocalEngine(
  question: string,
  context: AiOperationalContext,
  externalProducts: ExternalProductMatch[] = [],
  recallMatches: RecallMatch[] = [],
  resolvedProductName?: string
): AiAnswer {
  const normalized = question.toLowerCase()
  const productMatch = context.products.find(
    (product) => normalized.includes(product.productName.toLowerCase()) || product.productName === resolvedProductName
  )
  const inventoryMatch = context.inventory.find((item) => normalized.includes(item.name.toLowerCase()) || item.name === resolvedProductName)
  const product = productMatch ?? context.products.find((candidate) => candidate.productName === inventoryMatch?.name)
  const productNameForMemory = product?.productName ?? inventoryMatch?.name ?? resolvedProductName
  const skuForMemory = product?.sku ?? inventoryMatch?.sku

  if (normalized.includes("kosher")) {
    if (questionIsBroadKosherSearch(normalized) && !productMatch && !inventoryMatch) {
      return answerKosherInventorySearch(context, normalized)
    }

    return answerKosherQuestion(product, externalProducts, recallMatches, context, productNameForMemory, skuForMemory)
  }

  if (questionIsNutritionRelated(question)) {
    return answerNutritionQuestion(product, externalProducts, recallMatches)
  }

  if (normalized.includes("image") || normalized.includes("photo") || normalized.includes("picture")) {
    return answerImageQuestion(product, question, externalProducts)
  }

  if (normalized.includes("recall") || normalized.includes("recalled") || normalized.includes("safety")) {
    return {
      mode: "local",
      answer:
        recallMatches.length > 0
          ? `I found ${recallMatches.length} possible recall or enforcement match${recallMatches.length === 1 ? "" : "es"}. Review the openFDA details before making a stock or customer decision.`
          : "I did not find recall matches from the current openFDA lookup. That is not a guarantee of safety; it means no matching enforcement record was returned for this query.",
      confidence: recallMatches.length > 0 ? "medium" : "low",
      productName: product?.productName,
      quickFacts:
        recallMatches.length > 0
          ? recallMatches.map((match) => `${match.classification ?? "Recall"}: ${match.productDescription}`)
          : ["No openFDA enforcement match returned", "Recall checks should be reviewed against official sources"],
      recommendedActions: [
        "Review openFDA source details",
        "Check supplier recall notices",
        "If a match looks relevant, hold affected inventory until a manager reviews it"
      ],
      sources: [...(product?.sources ?? []), ...externalProducts.map(externalProductSource), ...recallMatches.map(recallSource)],
      imageCandidates: imageCandidatesFromExternal(externalProducts),
      externalProducts,
      recallMatches
    }
  }

  if (
    normalized.includes("inventory") ||
    normalized.includes("stock") ||
    normalized.includes("waste") ||
    normalized.includes("order") ||
    normalized.includes("reorder")
  ) {
    return answerInventoryQuestion(context, recallMatches)
  }

  if (isProductEvidence(product)) {
    return {
      mode: "local",
      answer: `${product.productName} is in the local product intelligence record. I can answer from stored catalog, allergen, handling, compliance, and external product evidence when a question needs national context.`,
      confidence: "medium",
      productName: product.productName,
      quickFacts: [
        `Kosher status: ${product.kosherStatus.replace("_", " ")}`,
        product.allergens.length > 0 ? `Allergens: ${product.allergens.join(", ")}` : "No allergens recorded",
        product.handlingNotes[0] ?? "No handling notes recorded"
      ],
      recommendedActions: ["Add supplier documents", "Attach product image", "Review product details before customer-facing answers"],
      sources: [...product.sources, ...externalProducts.map(externalProductSource), ...recallMatches.map(recallSource)],
      imageCandidates: [...imageCandidatesFromExternal(externalProducts), ...buildImageCandidates(product.productName, product.sku)],
      externalProducts,
      recallMatches
    }
  }

  return {
    mode: "local",
    answer:
      "I can help with product details, dietary/compliance checks, inventory, waste, reorder decisions, and image discovery. I need a matching product record or an external search connector for nationwide answers.",
    confidence: "low",
    quickFacts: [
      `${context.products.length} product evidence records loaded`,
      `${context.inventory.length} inventory records loaded`,
      `${context.nationalSignals.length} national-awareness hooks reserved`
    ],
    recommendedActions: [
      "Ask about a specific product by name or SKU",
      "Ask what is low in stock or what waste should change ordering",
      "Connect OpenAI/search credentials for nationwide source-backed answers"
    ],
    sources: [operationsSource()],
    imageCandidates: imageCandidatesFromExternal(externalProducts),
    externalProducts,
    recallMatches
  }
}
