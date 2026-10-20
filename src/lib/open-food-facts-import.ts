import { createHash, randomUUID } from "node:crypto"
import { createGunzip } from "node:zlib"
import { Readable } from "node:stream"
import { deserialize } from "bson"

export const OPEN_FOOD_FACTS_SOURCE = "https://static.openfoodfacts.org/data/openfoodfacts-mongodbdump.gz"
const ATTRIBUTION = "Product data from Open Food Facts, licensed under ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/)."
const GTIN_LENGTHS = new Set([8, 12, 13, 14])
const HOT_OR_NONFOOD = ["non-food-products", "beauty", "cosmetics", "pet-food", "cleaning-products", "hot-prepared-foods", "restaurant-foods"]

type FirestoreDatabase = FirebaseFirestore.Firestore
type SourceProduct = Record<string, unknown>

export type ImportOptions = {
  mode: "probe" | "validation" | "full" | "incremental"
  maxAccepted?: number
  maxScanned?: number
  runId?: string
  resumeAfter?: number
  modifiedAfter?: number
  sourceUrl?: string
}

export type ImportResult = {
  runId: string
  archiveFormat: string
  source: { url: string; contentLength: number | null; lastModified: string | null; etag: string | null }
  scanned: number
  staged: number
  rejected: number
  skipped: number
  resumableFrom: number
  sampleIds: string[]
}

function cleanString(value: unknown) {
  const text = typeof value === "string" ? value.trim() : ""
  return text || undefined
}

function strings(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((entry) => entry.trim()).filter(Boolean)
  const text = cleanString(value)
  return text ? text.split(",").map((entry) => entry.trim()).filter(Boolean) : []
}

export function normalizeGtin(value: unknown) {
  const raw = String(value ?? "").trim()
  if (!/^\d+$/.test(raw) || !GTIN_LENGTHS.has(raw.length)) return null
  const digits = raw.split("").map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  if ((10 - (sum % 10)) % 10 !== check) return null
  return raw.padStart(14, "0")
}

function normalizedName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function compact<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== "")) as Partial<T>
}

function nutritionValues(nutriments: SourceProduct, suffix: "100g" | "serving") {
  const mappings = {
    energyKcal: [`energy-kcal_${suffix}`, `energy-kcal_${suffix}`],
    energyKj: [`energy-kj_${suffix}`, `energy_${suffix}`],
    fatG: [`fat_${suffix}`], saturatedFatG: [`saturated-fat_${suffix}`], carbohydratesG: [`carbohydrates_${suffix}`],
    sugarsG: [`sugars_${suffix}`], fiberG: [`fiber_${suffix}`], proteinG: [`proteins_${suffix}`], sodiumG: [`sodium_${suffix}`], saltG: [`salt_${suffix}`]
  }
  return compact(Object.fromEntries(Object.entries(mappings).map(([target, keys]) => [target, keys.map((key) => number(nutriments[key])).find((value) => value !== undefined)])))
}

function excluded(tags: string[]) {
  const joined = tags.join(" ").toLowerCase()
  return HOT_OR_NONFOOD.find((tag) => joined.includes(tag))
}

export function normalizeOpenFoodFactsProduct(source: SourceProduct, importedAt: string) {
  const sourceId = cleanString(source._id) ?? cleanString(source.code)
  if (!sourceId) return { rejection: "missing_source_identifier" as const }
  const productName = cleanString(source.product_name_en) ?? cleanString(source.product_name)
  if (!productName) return { rejection: "missing_product_name" as const, sourceId }
  const categoryTags = strings(source.categories_tags)
  const excludedTag = excluded([...categoryTags, ...strings(source.product_type), ...strings(source.pnns_groups_1_tags)])
  if (excludedTag) return { rejection: `excluded:${excludedTag}` as const, sourceId }
  const sourceBarcode = cleanString(source.code)
  const normalizedGtin = normalizeGtin(sourceBarcode)
  const countries = strings(source.countries_tags)
  const isUsMarket = countries.some((country) => /(^|:)united-states$/.test(country.toLowerCase()))
  const nutriments = source.nutriments && typeof source.nutriments === "object" ? source.nutriments as SourceProduct : {}
  const modifiedTimestamp = number(source.last_modified_t)
  const stagingId = createHash("sha256").update(`openfoodfacts:${sourceId}`).digest("hex")
  const quantity = cleanString(source.quantity)
  const record = compact({
    id: stagingId,
    status: "pending_review",
    source: "open_food_facts",
    sourceId,
    sourceUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(sourceBarcode ?? sourceId)}`,
    sourceBarcode,
    normalizedGtin: normalizedGtin ?? undefined,
    identifierStatus: sourceBarcode ? (normalizedGtin ? "valid_gtin" : "invalid_barcode_source_id_retained") : "source_id_only",
    productName,
    normalizedName: normalizedName(productName),
    brands: strings(source.brands_tags).length ? strings(source.brands_tags) : strings(source.brands),
    manufacturer: cleanString(source.manufacturing_places),
    description: cleanString(source.generic_name_en) ?? cleanString(source.generic_name),
    categories: categoryTags,
    category: categoryTags[0],
    subcategory: categoryTags[1],
    ingredients: cleanString(source.ingredients_text_en) ?? cleanString(source.ingredients_text),
    allergens: strings(source.allergens_tags),
    nutrition: compact({
      per100gOr100ml: nutritionValues(nutriments, "100g"),
      perServing: nutritionValues(nutriments, "serving"),
      servingSize: cleanString(source.serving_size),
      servingQuantity: number(source.serving_quantity),
      servingQuantityUnit: cleanString(source.serving_quantity_unit),
      basis: cleanString(source.nutrition_data_per),
      productBasis: cleanString(source.product_quantity_unit)
    }),
    sourceNutrition: nutriments,
    servingSize: cleanString(source.serving_size),
    netQuantity: quantity,
    productQuantity: number(source.product_quantity),
    productQuantityUnit: cleanString(source.product_quantity_unit),
    packageQuantity: cleanString(source.packaging_quantity),
    imageUrls: Array.from(new Set([source.image_front_url, source.image_url, source.image_nutrition_url, source.image_ingredients_url].map(cleanString).filter(Boolean))),
    packaging: cleanString(source.packaging_text_en) ?? cleanString(source.packaging_text) ?? cleanString(source.packaging),
    packagingTags: strings(source.packaging_tags),
    countries,
    markets: strings(source.stores_tags).length ? strings(source.stores_tags) : strings(source.stores),
    marketPriority: isUsMarket ? 100 : 0,
    sourceModifiedAt: modifiedTimestamp ? new Date(modifiedTimestamp * 1000).toISOString() : undefined,
    sourceModifiedTimestamp: modifiedTimestamp,
    importedAt,
    attribution: ATTRIBUTION,
    license: "ODbL-1.0",
    schemaVersion: 1
  })
  return { record, sourceId, stagingId, modifiedTimestamp }
}

async function sourceMetadata(sourceUrl: string) {
  const response = await fetch(sourceUrl, { method: "HEAD", redirect: "follow", headers: { "user-agent": "InvenTraker/1.0 (product catalog import)" } })
  if (!response.ok) throw new Error(`Open Food Facts metadata request failed (${response.status}).`)
  return {
    url: sourceUrl,
    contentLength: number(response.headers.get("content-length")) ?? null,
    lastModified: response.headers.get("last-modified"),
    etag: response.headers.get("etag")
  }
}

async function *bsonDocuments(sourceUrl: string) {
  const response = await fetch(sourceUrl, { redirect: "follow", headers: { "user-agent": "InvenTraker/1.0 (product catalog import)" } })
  if (!response.ok || !response.body) throw new Error(`Open Food Facts source request failed (${response.status}).`)
  const gunzip = createGunzip()
  Readable.fromWeb(response.body as never).pipe(gunzip)
  let pending = Buffer.alloc(0)
  for await (const chunk of gunzip) {
    pending = Buffer.concat([pending, Buffer.from(chunk)])
    while (pending.length >= 4) {
      const documentLength = pending.readInt32LE(0)
      if (documentLength < 5 || documentLength > 64 * 1024 * 1024) throw new Error(`Decompressed source is not a BSON document stream (next length ${documentLength}).`)
      if (pending.length < documentLength) break
      const rawDocument = pending.subarray(0, documentLength)
      pending = pending.subarray(documentLength)
      yield deserialize(rawDocument, { promoteLongs: true, promoteValues: true }) as SourceProduct
    }
  }
  if (pending.length) throw new Error(`Truncated BSON stream (${pending.length} trailing bytes).`)
}

async function flush(db: FirestoreDatabase, collection: string, rows: Array<{ id: string; data: Record<string, unknown> }>) {
  if (!rows.length) return
  const batch = db.batch()
  rows.forEach(({ id, data }) => batch.set(db.collection(collection).doc(id), data, { merge: true }))
  await batch.commit()
  rows.length = 0
}

export async function runOpenFoodFactsImport(db: FirestoreDatabase, options: ImportOptions): Promise<ImportResult> {
  const sourceUrl = options.sourceUrl ?? OPEN_FOOD_FACTS_SOURCE
  const runId = options.runId ?? `off-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`
  const maxAccepted = options.mode === "probe" ? 1 : options.maxAccepted ?? (options.mode === "validation" ? 25 : Number.POSITIVE_INFINITY)
  const maxScanned = options.maxScanned ?? (options.mode === "probe" ? 1 : options.mode === "validation" ? 25_000 : Number.POSITIVE_INFINITY)
  const resumeAfter = Math.max(0, options.resumeAfter ?? 0)
  const importedAt = new Date().toISOString()
  const source = await sourceMetadata(sourceUrl)
  const run = db.collection("openFoodFactsImportRuns").doc(runId)
  await run.set({ runId, mode: options.mode, status: "running", source, importedAt, resumeAfter, scanned: 0, staged: 0, rejected: 0, skipped: 0, architectureVersion: 1 }, { merge: true })
  let scanned = 0, staged = 0, rejected = 0, skipped = 0
  const stageRows: Array<{ id: string; data: Record<string, unknown> }> = []
  const rejectRows: Array<{ id: string; data: Record<string, unknown> }> = []
  const sampleIds: string[] = []
  try {
    for await (const sourceProduct of bsonDocuments(sourceUrl)) {
      scanned += 1
      if (scanned <= resumeAfter) { skipped += 1; continue }
      const normalized = normalizeOpenFoodFactsProduct(sourceProduct, importedAt)
      if ("rejection" in normalized) {
        rejected += 1
        const sourceId = normalized.sourceId ?? `position-${scanned}`
        rejectRows.push({ id: createHash("sha256").update(`${runId}:${sourceId}`).digest("hex"), data: { runId, source: "open_food_facts", sourceId, sourcePosition: scanned, reason: normalized.rejection, rejectedAt: importedAt } })
      } else if (options.modifiedAfter && normalized.modifiedTimestamp && normalized.modifiedTimestamp <= options.modifiedAfter) {
        skipped += 1
      } else if (normalized.record.marketPriority !== 100 && options.mode !== "full") {
        skipped += 1
      } else {
        staged += 1
        stageRows.push({ id: normalized.stagingId, data: { ...normalized.record, importRunId: runId, sourcePosition: scanned } as Record<string, unknown> })
        if (sampleIds.length < 10) sampleIds.push(normalized.stagingId)
      }
      if (stageRows.length >= 350) await flush(db, "openFoodFactsStaging", stageRows)
      if (rejectRows.length >= 350) await flush(db, "openFoodFactsRejects", rejectRows)
      if (scanned % 1000 === 0) await run.set({ scanned, staged, rejected, skipped, checkpointPosition: scanned, updatedAt: new Date().toISOString() }, { merge: true })
      if (staged >= maxAccepted || scanned >= maxScanned) break
    }
    await flush(db, "openFoodFactsStaging", stageRows)
    await flush(db, "openFoodFactsRejects", rejectRows)
    await run.set({ status: "completed", scanned, staged, rejected, skipped, checkpointPosition: scanned, completedAt: new Date().toISOString() }, { merge: true })
    return { runId, archiveFormat: "gzip-compressed concatenated BSON document stream (mongodump collection payload)", source, scanned, staged, rejected, skipped, resumableFrom: scanned, sampleIds }
  } catch (error) {
    await run.set({ status: "failed", scanned, staged, rejected, skipped, checkpointPosition: scanned, error: error instanceof Error ? error.message : String(error), failedAt: new Date().toISOString() }, { merge: true })
    throw error
  }
}

export async function promoteOpenFoodFactsStaging(db: FirestoreDatabase, stagingId: string, reviewerUid: string) {
  const stagingRef = db.collection("openFoodFactsStaging").doc(stagingId)
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(stagingRef)
    if (!snapshot.exists) throw new Error("Staged product was not found.")
    const staged = snapshot.data()!
    if (staged.status !== "approved") throw new Error("Staged product must be reviewed and marked approved before promotion.")
    const normalizedGtin = cleanString(staged.normalizedGtin)
    if (normalizedGtin) {
      const existing = await transaction.get(db.collection("centralCatalog").where("normalizedGtin", "==", normalizedGtin).limit(1))
      if (!existing.empty) throw new Error(`A central catalog product already uses GTIN ${normalizedGtin}.`)
    }
    const centralId = normalizedGtin ? `gtin-${normalizedGtin}` : `off-${staged.sourceId}`
    const centralRef = db.collection("centralCatalog").doc(centralId)
    const existingCentral = await transaction.get(centralRef)
    if (existingCentral.exists) throw new Error("The central catalog target already exists; no record was changed.")
    const promotedAt = new Date().toISOString()
    transaction.create(centralRef, {
      name: staged.productName,
      normalizedName: staged.normalizedName,
      sku: staged.sourceBarcode ?? "",
      barcode: staged.sourceBarcode ?? "",
      normalizedGtin: normalizedGtin ?? null,
      brand: Array.isArray(staged.brands) ? staged.brands.join(", ") : "",
      manufacturer: staged.manufacturer ?? "",
      description: staged.description ?? "",
      category: staged.category ?? "",
      subcategory: staged.subcategory ?? "",
      ingredients: staged.ingredients ?? "",
      allergens: staged.allergens ?? [],
      nutrition: staged.nutrition ?? {},
      images: staged.imageUrls ?? [],
      packaging: staged.packaging ?? "",
      countries: staged.countries ?? [],
      markets: staged.markets ?? [],
      sourceId: staged.sourceId,
      sourceUrl: staged.sourceUrl,
      sourceModifiedAt: staged.sourceModifiedAt ?? null,
      importedAt: staged.importedAt,
      promotedAt,
      promotedByUid: reviewerUid,
      attribution: staged.attribution,
      license: staged.license,
      schemaVersion: 1
    })
    transaction.update(stagingRef, { status: "promoted", centralProductId: centralId, promotedAt, promotedByUid: reviewerUid })
    return { centralProductId: centralId, promotedAt }
  })
}
